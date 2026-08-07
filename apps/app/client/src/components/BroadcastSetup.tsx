import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Mic, Monitor, Play, X, RefreshCw, Volume2, AlertCircle, CheckCircle, Camera, MicOff, VideoOff, VolumeX, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DEFAULT_FILTER, type VideoFilter, type BackgroundEffect, type VirtualBackground } from "@/hooks/useVideoEffects";
import VideoEffectsPanel from "@/components/VideoEffectsPanel";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

type PermissionStatus = 'pending' | 'granted' | 'denied' | 'prompt';

// Type for the video effects hook return value passed from parent
interface VideoEffectsController {
  filter: VideoFilter;
  updateFilter: (updates: Partial<VideoFilter>) => void;
  resetFilter: () => void;
  applyPreset: (preset: VideoFilter) => void;
  backgroundEffect: BackgroundEffect;
  setBackgroundEffect: (effect: BackgroundEffect) => void;
  selectedBackground: VirtualBackground | null;
  setSelectedBackground: (bg: VirtualBackground | null) => void;
  blurStrength: number;
  setBlurStrength: (strength: number) => void;
  edgeSmoothing: number;
  setEdgeSmoothing: (value: number) => void;
  maskThreshold: number;
  setMaskThreshold: (value: number) => void;
  isSegmentationReady: boolean;
  getFilterString: (filter: VideoFilter) => string;
  startProcessing: (input: HTMLVideoElement | MediaStream) => Promise<MediaStream | null>;
  stopProcessing: () => void;
  isProcessing: boolean;
  customBackgrounds: VirtualBackground[];
  addCustomBackground: (file: File) => Promise<VirtualBackground>;
  removeCustomBackground: (id: string) => void;
}

interface BroadcastSetupProps {
  streamType: 'camera' | 'screen';
  onStartBroadcast: (stream: MediaStream) => void;
  onCancel: () => void;
  username?: string;
  videoEffects: VideoEffectsController;
}

export default function BroadcastSetup({ 
  streamType, 
  onStartBroadcast, 
  onCancel,
  videoEffects,
}: BroadcastSetupProps) {
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micVolume, setMicVolume] = useState(100);
  const [cameraPermission, setCameraPermission] = useState<PermissionStatus>('pending');
  const [micPermission, setMicPermission] = useState<PermissionStatus>('pending');
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [enableMicForScreen, setEnableMicForScreen] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isGoingLiveRef = useRef(false);
  const effectsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const effectsAnimationRef = useRef<number | null>(null);

  // Destructure video effects from the prop passed by NativeStreaming
  const {
    filter,
    updateFilter,
    resetFilter,
    applyPreset,
    backgroundEffect,
    setBackgroundEffect,
    selectedBackground,
    setSelectedBackground,
    blurStrength,
    setBlurStrength,
    edgeSmoothing,
    setEdgeSmoothing,
    maskThreshold,
    setMaskThreshold,
    isSegmentationReady,
    getFilterString,
    startProcessing,
    stopProcessing,
    isProcessing,
    customBackgrounds,
    addCustomBackground,
    removeCustomBackground,
  } = videoEffects;

  const hasActiveEffects = backgroundEffect !== 'none' || JSON.stringify(filter) !== JSON.stringify(DEFAULT_FILTER);

  // Check permission status using the Permissions API
  const checkPermissions = useCallback(async () => {
    try {
      if (navigator.permissions) {
        // Check camera permission
        if (streamType === 'camera') {
          try {
            const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
            setCameraPermission(camResult.state as PermissionStatus);
            camResult.onchange = () => setCameraPermission(camResult.state as PermissionStatus);
          } catch {
            // Some browsers don't support camera permission query
          }
        }
        
        // Check microphone permission
        try {
          const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(micResult.state as PermissionStatus);
          micResult.onchange = () => setMicPermission(micResult.state as PermissionStatus);
        } catch {
          // Some browsers don't support microphone permission query
        }
      }
    } catch (err) {
      console.error("Error checking permissions:", err);
    }
  }, [streamType]);

  const getPermissionErrorMessage = (err: unknown): string => {
    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return "Permission denied. Please allow camera and microphone access in your browser settings, then refresh the page.";
        case 'NotFoundError':
          return "No camera or microphone found. Please connect a device and try again.";
        case 'NotReadableError':
          return "Camera or microphone is already in use by another application. Please close other apps using the device.";
        case 'OverconstrainedError':
          return "The selected device could not satisfy the requested settings. Try a different device.";
        case 'SecurityError':
          return "Camera/microphone access requires HTTPS. If you're on HTTP, please access the site via HTTPS (the secure version) or open in a new browser tab if using a preview panel.";
        case 'AbortError':
          return "Device access was aborted. Please try again.";
        default:
          return `Could not access devices: ${err.message}`;
      }
    }
    return "Could not access camera/microphone. Please grant permission and try again.";
  };

  const enumerateDevices = useCallback(async () => {
    try {
      // Check if we're in a secure context (HTTPS or localhost)
      const isSecureContext = window.isSecureContext || 
        window.location.protocol === 'https:' || 
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      
      if (!isSecureContext) {
        throw new DOMException(
          "Camera and microphone access requires a secure connection (HTTPS). Please access this page via HTTPS.",
          "SecurityError"
        );
      }
      
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new DOMException(
          "Media devices not available. Please open this page in a new browser tab (not the preview panel).",
          "SecurityError"
        );
      }
      
      // First check current permission status
      await checkPermissions();
      
      // Request initial permission to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        video: streamType === 'camera', 
        audio: true 
      });
      
      // Mark permissions as granted
      if (streamType === 'camera') setCameraPermission('granted');
      setMicPermission('granted');
      
      // Log the tracks we got from getUserMedia for debugging
      console.log("getUserMedia tracks:", tempStream.getTracks().map(t => ({ kind: t.kind, label: t.label })));
      
      tempStream.getTracks().forEach(track => track.stop());
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Log all detected devices for debugging
      console.log("All detected devices:", devices.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId.slice(0, 8) })));
      
      const videoDevices = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
      
      const audioDevices = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
      
      console.log(`Found ${videoDevices.length} cameras:`, videoDevices.map(d => d.label));
      console.log(`Found ${audioDevices.length} microphones:`, audioDevices.map(d => d.label));
      
      setCameras(videoDevices);
      setMicrophones(audioDevices);
      
      if (videoDevices.length > 0) setSelectedCamera(videoDevices[0].deviceId);
      if (audioDevices.length > 0) setSelectedMicrophone(audioDevices[0].deviceId);
      
      // Check for missing devices
      if (streamType === 'camera' && videoDevices.length === 0) {
        setError("No cameras detected. Please connect a USB camera, ensure it's not in use by another app, and click 'Refresh Devices'. If using Replit preview, open in a new browser tab.");
      }
      if (audioDevices.length === 0) {
        setError("No microphones detected. Please connect a microphone and click 'Refresh Devices'.");
      }
      
      setIsLoading(false);
    } catch (err) {
      console.error("Error enumerating devices:", err);
      
      // Update permission status based on error
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        if (streamType === 'camera') setCameraPermission('denied');
        setMicPermission('denied');
      }
      
      setError(getPermissionErrorMessage(err));
      setIsLoading(false);
    }
  }, [streamType, checkPermissions]);

  const startPreview = useCallback(async () => {
    if (streamType === 'screen') {
      // For screen share, we don't preview until they click start
      setIsLoading(false);
      return;
    }
    
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const constraints: MediaStreamConstraints = {
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
        audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Setup audio level monitoring
      setupAudioMonitoring(stream);
      
      setError(null);
    } catch (err) {
      console.error("Error starting preview:", err);
      setError("Could not start camera preview. Please check your device selection.");
    }
  }, [selectedCamera, selectedMicrophone, streamType]);

  const setupAudioMonitoring = (stream: MediaStream) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      
      // Connect: source -> gain -> analyser
      source.connect(gainNode);
      gainNode.connect(analyser);
      
      // Set initial gain based on micVolume
      gainNode.gain.value = micVolume / 100;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      gainNodeRef.current = gainNode;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(Math.min(100, average * 1.5));
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (err) {
      console.error("Error setting up audio monitoring:", err);
    }
  };
  
  // Update gain when volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = micVolume / 100;
    }
  }, [micVolume]);

  // Shared teardown helper to release all resources
  const teardownResources = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (effectsAnimationRef.current) {
      cancelAnimationFrame(effectsAnimationRef.current);
      effectsAnimationRef.current = null;
    }
    stopProcessing();
  }, [stopProcessing]);

  useEffect(() => {
    enumerateDevices();
    
    // Listen for device changes (USB camera plug/unplug)
    const handleDeviceChange = async () => {
      console.log("Device change detected, re-enumerating devices...");
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
        
        const audioDevices = devices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
        
        setCameras(videoDevices);
        setMicrophones(audioDevices);
        
        // If no camera selected but cameras available, select first one
        if (!selectedCamera && videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
        // If selected camera no longer exists, select first available
        if (selectedCamera && !videoDevices.find(d => d.deviceId === selectedCamera) && videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
        
        // Same for microphone
        if (!selectedMicrophone && audioDevices.length > 0) {
          setSelectedMicrophone(audioDevices[0].deviceId);
        }
        if (selectedMicrophone && !audioDevices.find(d => d.deviceId === selectedMicrophone) && audioDevices.length > 0) {
          setSelectedMicrophone(audioDevices[0].deviceId);
        }
        
        console.log(`Detected ${videoDevices.length} cameras, ${audioDevices.length} microphones`);
      } catch (err) {
        console.error("Error re-enumerating devices:", err);
      }
    };
    
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    
    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      // Don't cleanup streams here - they're handled explicitly:
      // - When canceling: handleCancel calls teardownResources
      // - When going live: we stop preview and create new stream in handleStartBroadcast
      console.log("BroadcastSetup unmounting, isGoingLiveRef:", isGoingLiveRef.current);
    };
  }, [enumerateDevices, teardownResources, selectedCamera, selectedMicrophone]);

  useEffect(() => {
    if (selectedCamera || selectedMicrophone) {
      startPreview();
    }
  }, [selectedCamera, selectedMicrophone, startPreview]);

  // Apply video effects to a stream using canvas processing with the hook's processing
  // Now passes the MediaStream directly so the hook creates its own internal video element
  // that survives component unmount
  const applyVideoEffectsToStream = useCallback(async (inputStream: MediaStream): Promise<MediaStream> => {
    const videoTrack = inputStream.getVideoTracks()[0];
    if (!videoTrack || !hasActiveEffects) {
      return inputStream;
    }

    // Pass the MediaStream directly - the hook will create its own internal video element
    // that won't be affected when this component unmounts
    const processedStream = await startProcessing(inputStream);
    if (processedStream) {
      // Add audio tracks from original stream
      inputStream.getAudioTracks().forEach(track => {
        processedStream.addTrack(track);
      });
      console.log("Created effects-processed stream via hook:", processedStream.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState })));
      return processedStream;
    }

    // Fallback: return original stream if processing failed
    console.warn("Video effects processing failed, using original stream");
    return inputStream;
  }, [hasActiveEffects, startProcessing]);

  const handleStartBroadcast = async () => {
    let screenStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    
    try {
      let stream: MediaStream;
      
      if (streamType === 'screen') {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        stream = screenStream;
        
        // Add microphone audio if enabled and selected
        if (enableMicForScreen && selectedMicrophone) {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: selectedMicrophone } }
          });
          micStream.getAudioTracks().forEach(track => stream.addTrack(track));
          console.log("Added microphone to screen share:", selectedMicrophone);
        }
      } else {
        // Use the existing preview stream for broadcasting
        // Don't stop it - just pass it directly to the broadcaster
        if (streamRef.current) {
          stream = streamRef.current;
          // Clear the ref so cleanup won't stop it
          streamRef.current = null;
          console.log("Passing existing preview stream to broadcast:", stream.getTracks().map(t => ({ kind: t.kind, label: t.label, readyState: t.readyState })));
        } else {
          // No preview stream exists, create one
          const constraints: MediaStreamConstraints = {
            video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
            audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true,
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log("Created new broadcast stream:", stream.getTracks().map(t => ({ kind: t.kind, label: t.label, readyState: t.readyState })));
        }

        // Apply video effects if any are active (camera mode only)
        if (hasActiveEffects) {
          console.log("Applying video effects to stream");
          stream = await applyVideoEffectsToStream(stream);
        }
      }
      
      // Mark that we're going live so cleanup doesn't stop the stream
      // This must be set before calling onStartBroadcast since the parent
      // will immediately change mode and cause this component to unmount
      isGoingLiveRef.current = true;
      console.log("Going live - isGoingLiveRef set to true, passing stream to parent");
      
      // Await the callback to handle both sync and async errors
      await Promise.resolve(onStartBroadcast(stream));
      console.log("Stream passed to parent, tracks state:", stream.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState })));
    } catch (err) {
      // Cleanup any streams created during this attempt
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
      }
      isGoingLiveRef.current = false;
      console.error("Error starting broadcast:", err);
      setError("Could not start broadcast. Please try again.");
    }
  };

  const handleCancel = () => {
    // Explicitly release all resources before calling parent
    teardownResources();
    onCancel();
  };

  const refreshDevices = () => {
    setIsLoading(true);
    setError(null);
    setCameraPermission('pending');
    setMicPermission('pending');
    enumerateDevices();
  };
  
  const requestPermissions = async () => {
    setError(null);
    setCameraPermission('pending');
    setMicPermission('pending');
    setIsLoading(true);
    await enumerateDevices();
  };

  if (isLoading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading devices...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl mx-auto" data-testid="broadcast-setup">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {streamType === 'camera' ? <Video className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          Broadcast Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            {(cameraPermission === 'denied' || micPermission === 'denied') && (
              <div className="flex flex-col gap-2 pt-2 border-t border-destructive/20">
                <p className="text-xs text-muted-foreground">
                  To enable device access, click the camera/lock icon in your browser's address bar and allow permissions, then click the button below.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={requestPermissions}
                  className="w-fit"
                  data-testid="button-request-permissions"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Permission Status Indicators */}
        <div className="flex flex-wrap gap-3" data-testid="permission-status">
          {streamType === 'camera' && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              cameraPermission === 'granted' 
                ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                : cameraPermission === 'denied'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {cameraPermission === 'granted' ? (
                <CheckCircle className="h-4 w-4" />
              ) : cameraPermission === 'denied' ? (
                <VideoOff className="h-4 w-4" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <span>
                Camera: {cameraPermission === 'granted' ? 'Allowed' : cameraPermission === 'denied' ? 'Blocked' : 'Pending'}
              </span>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            micPermission === 'granted' 
              ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
              : micPermission === 'denied'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted text-muted-foreground'
          }`}>
            {micPermission === 'granted' ? (
              <CheckCircle className="h-4 w-4" />
            ) : micPermission === 'denied' ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            <span>
              Microphone: {micPermission === 'granted' ? 'Allowed' : micPermission === 'denied' ? 'Blocked' : 'Pending'}
            </span>
          </div>
          
          {/* Device Count */}
          {cameras.length > 0 && streamType === 'camera' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted text-muted-foreground">
              <Video className="h-4 w-4" />
              <span>{cameras.length} camera{cameras.length !== 1 ? 's' : ''} detected</span>
            </div>
          )}
          {microphones.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted text-muted-foreground">
              <Mic className="h-4 w-4" />
              <span>{microphones.length} mic{microphones.length !== 1 ? 's' : ''} detected</span>
            </div>
          )}
        </div>

        {/* Video Preview */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          {streamType === 'camera' ? (
            <>
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover transition-[filter] duration-200"
                style={{ filter: getFilterString(filter) }}
                data-testid="video-preview"
              />
              {!streamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center text-white/60">
                  <p>Camera preview will appear here</p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <div className="text-center">
                <Monitor className="h-16 w-16 mx-auto mb-2 opacity-50" />
                <p>Screen preview will start when you go live</p>
              </div>
            </div>
          )}
          
          {/* Audio Level Indicator */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-2 bg-black/50 rounded-lg p-2">
              <Volume2 className="h-4 w-4 text-white" />
              <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          </div>
          
          {/* Debug: Stream status */}
          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            Preview: {streamRef.current ? `${streamRef.current.getTracks().length} tracks` : 'No stream'}
          </div>
        </div>

        {/* Device Selection */}
        <div className="grid md:grid-cols-2 gap-4">
          {streamType === 'camera' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Camera
              </Label>
              <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                <SelectTrigger data-testid="select-camera">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map(cam => (
                    <SelectItem key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {enableMicForScreen || streamType === 'camera' ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
              Microphone
              {streamType === 'screen' && (
                <div className="flex items-center gap-2 ml-auto">
                  <Switch
                    checked={enableMicForScreen}
                    onCheckedChange={setEnableMicForScreen}
                    data-testid="switch-enable-mic-screen"
                  />
                  <span className="text-xs text-muted-foreground">
                    {enableMicForScreen ? 'On' : 'Off'}
                  </span>
                </div>
              )}
            </Label>
            <Select 
              value={selectedMicrophone} 
              onValueChange={setSelectedMicrophone}
              disabled={streamType === 'screen' && !enableMicForScreen}
            >
              <SelectTrigger data-testid="select-microphone">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {microphones.map(mic => (
                  <SelectItem key={mic.deviceId} value={mic.deviceId}>
                    {mic.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {streamType === 'screen' && enableMicForScreen && (
              <p className="text-xs text-muted-foreground">
                Your microphone audio will be included in the screen share
              </p>
            )}
          </div>
          
          {/* Volume Slider */}
          <div className="md:col-span-2 space-y-2">
            <Label className="flex items-center gap-2">
              {micVolume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              Microphone Volume: {micVolume}%
            </Label>
            <div className="flex items-center gap-3">
              <VolumeX className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[micVolume]}
                onValueChange={(value) => setMicVolume(value[0])}
                min={0}
                max={100}
                step={1}
                className="flex-1"
                data-testid="slider-mic-volume"
              />
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          
          <div className="md:col-span-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={refreshDevices}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Devices
            </Button>
          </div>
        </div>

        {/* Video Effects */}
        {streamType === 'camera' && (
          <Collapsible open={showEffectsPanel} onOpenChange={setShowEffectsPanel}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                data-testid="button-toggle-effects"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Video Effects
                  {hasActiveEffects && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </span>
                {showEffectsPanel ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <VideoEffectsPanel
                filter={filter}
                onFilterChange={updateFilter}
                onFilterReset={resetFilter}
                onApplyPreset={applyPreset}
                backgroundEffect={backgroundEffect}
                onBackgroundEffectChange={setBackgroundEffect}
                selectedBackground={selectedBackground}
                onBackgroundSelect={setSelectedBackground}
                blurStrength={blurStrength}
                onBlurStrengthChange={setBlurStrength}
                edgeSmoothing={edgeSmoothing}
                onEdgeSmoothingChange={setEdgeSmoothing}
                maskThreshold={maskThreshold}
                onMaskThresholdChange={setMaskThreshold}
                isSegmentationReady={isSegmentationReady}
                isProcessing={isProcessing}
                customBackgrounds={customBackgrounds}
                onAddCustomBackground={addCustomBackground}
                onRemoveCustomBackground={removeCustomBackground}
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-setup">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleStartBroadcast} data-testid="button-go-live">
            <Play className="h-4 w-4 mr-2" />
            Go Live
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
