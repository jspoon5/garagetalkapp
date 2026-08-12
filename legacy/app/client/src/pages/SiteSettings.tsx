import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, Monitor, Camera, Mic, Volume2, Bell, Shield, ArrowLeft, Settings, Video } from "lucide-react";

const DEVICE_SETTINGS_KEY = "garage-talk-device-settings";

interface DeviceSettings {
  cameraId: string;
  microphoneId: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  resolution: string;
  notifications: boolean;
  soundEffects: boolean;
}

function getDeviceSettings(): DeviceSettings {
  try {
    const stored = localStorage.getItem(DEVICE_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {
    cameraId: "default",
    microphoneId: "default",
    cameraEnabled: false,
    microphoneEnabled: false,
    resolution: "auto",
    notifications: true,
    soundEffects: true,
  };
}

function saveDeviceSettings(settings: DeviceSettings) {
  try {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export default function SiteSettings() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useCurrentUser();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [settings, setSettings] = useState<DeviceSettings>(getDeviceSettings);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);

  const updateSetting = useCallback(<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveDeviceSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    async function loadDevices() {
      if (!navigator.mediaDevices) {
        setMediaError("Media devices are not available in this browser.");
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter(d => d.kind === "videoinput"));
        setMicrophones(devices.filter(d => d.kind === "audioinput"));
        setMediaError(null);
      } catch {
        setMediaError("Could not access media devices. Please check browser permissions.");
      }
    }
    loadDevices();
  }, []);

  useEffect(() => {
    async function startCameraPreview() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (!settings.cameraEnabled) return;
      if (!navigator.mediaDevices) return;
      try {
        const constraints: MediaStreamConstraints = {
          video: settings.cameraId && settings.cameraId !== "default"
            ? { deviceId: { exact: settings.cameraId } }
            : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter(d => d.kind === "videoinput"));
        setMicrophones(devices.filter(d => d.kind === "audioinput"));
      } catch {
        setMediaError("Could not access camera. Please check browser permissions.");
      }
    }
    startCameraPreview();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [settings.cameraId, settings.cameraEnabled]);

  useEffect(() => {
    async function startMicMonitor() {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      cancelAnimationFrame(animationRef.current);
      setMicLevel(0);

      if (!settings.microphoneEnabled) return;
      if (!navigator.mediaDevices) return;

      try {
        const constraints: MediaStreamConstraints = {
          audio: settings.microphoneId && settings.microphoneId !== "default"
            ? { deviceId: { exact: settings.microphoneId } }
            : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter(d => d.kind === "videoinput"));
        setMicrophones(devices.filter(d => d.kind === "audioinput"));

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function tick() {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setMicLevel(Math.min(100, (avg / 128) * 100));
          animationRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        setMediaError("Could not access microphone. Please check browser permissions.");
      }
    }
    startMicMonitor();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [settings.microphoneId, settings.microphoneEnabled]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/sign-in");
    return null;
  }

  const themeOptions: { value: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const resolutionOptions = [
    { value: "auto", label: "Auto", description: "Automatically adjust based on connection" },
    { value: "1080p", label: "1080p (Full HD)", description: "Best quality, requires fast connection" },
    { value: "720p", label: "720p (HD)", description: "Good quality, moderate bandwidth" },
    { value: "480p", label: "480p (SD)", description: "Lower quality, saves bandwidth" },
    { value: "360p", label: "360p (Low)", description: "Minimal quality, lowest bandwidth" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Site Settings</h1>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5" />
                Display / Appearance
              </CardTitle>
              <CardDescription>Choose your preferred theme</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = theme === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      variant="outline"
                      onClick={() => setTheme(opt.value)}
                      className={`flex flex-col items-center gap-2 min-w-[100px] h-auto py-4 ${
                        isActive ? "toggle-elevate toggle-elevated" : ""
                      }`}
                      data-testid={`button-theme-${opt.value}`}
                    >
                      <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Camera
              </CardTitle>
              <CardDescription>Configure your camera for video calls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mediaError ? (
                <p className="text-sm text-destructive" data-testid="text-media-error">{mediaError}</p>
              ) : cameras.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-cameras">No cameras detected</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Camera Device</Label>
                    <Select
                      value={settings.cameraId}
                      onValueChange={(val) => updateSetting("cameraId", val)}
                    >
                      <SelectTrigger data-testid="select-camera">
                        <SelectValue placeholder="Select camera" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default Camera</SelectItem>
                        {cameras.map((cam, i) => (
                          <SelectItem key={cam.deviceId} value={cam.deviceId || `camera-${i}`}>
                            {cam.label || `Camera ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.cameraEnabled && (
                    <div className="rounded-md overflow-hidden bg-muted aspect-video max-w-xs">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        data-testid="video-camera-preview"
                      />
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <Label>Enable Camera by Default</Label>
                  <p className="text-sm text-muted-foreground">Start video calls with camera on</p>
                </div>
                <Switch
                  checked={settings.cameraEnabled}
                  onCheckedChange={(val) => updateSetting("cameraEnabled", val)}
                  data-testid="switch-camera-enabled"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Microphone
              </CardTitle>
              <CardDescription>Configure your microphone for video calls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mediaError ? (
                <p className="text-sm text-destructive" data-testid="text-mic-error">{mediaError}</p>
              ) : microphones.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-mics">No microphones detected</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Microphone Device</Label>
                    <Select
                      value={settings.microphoneId}
                      onValueChange={(val) => updateSetting("microphoneId", val)}
                    >
                      <SelectTrigger data-testid="select-microphone">
                        <SelectValue placeholder="Select microphone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default Microphone</SelectItem>
                        {microphones.map((mic, i) => (
                          <SelectItem key={mic.deviceId} value={mic.deviceId || `mic-${i}`}>
                            {mic.label || `Microphone ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.microphoneEnabled && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
                        Mic Level
                      </Label>
                      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-75"
                          style={{ width: `${micLevel}%` }}
                          data-testid="indicator-mic-level"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <Label>Enable Microphone by Default</Label>
                  <p className="text-sm text-muted-foreground">Start video calls with microphone on</p>
                </div>
                <Switch
                  checked={settings.microphoneEnabled}
                  onCheckedChange={(val) => updateSetting("microphoneEnabled", val)}
                  data-testid="switch-mic-enabled"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Display Resolution
              </CardTitle>
              <CardDescription>Set preferred video streaming quality</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Resolution Preset</Label>
                <Select
                  value={settings.resolution}
                  onValueChange={(val) => updateSetting("resolution", val)}
                >
                  <SelectTrigger data-testid="select-resolution">
                    <SelectValue placeholder="Select resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutionOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground" data-testid="text-resolution-description">
                  {resolutionOptions.find(o => o.value === settings.resolution)?.description}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>Manage how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <Label>Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications for new messages and updates</p>
                </div>
                <Switch
                  checked={settings.notifications}
                  onCheckedChange={(val) => updateSetting("notifications", val)}
                  data-testid="switch-notifications"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <Label>Sound Effects</Label>
                  <p className="text-sm text-muted-foreground">Play sounds for notifications and actions</p>
                </div>
                <Switch
                  checked={settings.soundEffects}
                  onCheckedChange={(val) => updateSetting("soundEffects", val)}
                  data-testid="switch-sounds"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Security
              </CardTitle>
              <CardDescription>Manage your privacy settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full" onClick={() => setLocation("/sign-in?reset=true")} data-testid="button-change-password">
                Change Password
              </Button>
              <Button variant="destructive" className="w-full" data-testid="button-delete-account">
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
