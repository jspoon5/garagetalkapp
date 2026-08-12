import { useState, useRef, useCallback, useEffect } from 'react';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';

export interface VideoFilter {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  blur: number;
  hue: number;
}

export type BackgroundEffect = 'none' | 'blur' | 'virtual';

export interface VirtualBackground {
  id: string;
  name: string;
  type: 'image' | 'color';
  value: string;
  isCustom?: boolean;
}

export const DEFAULT_FILTER: VideoFilter = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  grayscale: 0,
  blur: 0,
  hue: 0,
};

export const PRESET_FILTERS: { name: string; filter: VideoFilter }[] = [
  { name: 'Normal', filter: DEFAULT_FILTER },
  { name: 'Warm', filter: { ...DEFAULT_FILTER, brightness: 105, saturation: 110, hue: 10 } },
  { name: 'Cool', filter: { ...DEFAULT_FILTER, brightness: 100, saturation: 90, hue: -10 } },
  { name: 'Vintage', filter: { ...DEFAULT_FILTER, sepia: 40, saturation: 80, contrast: 90 } },
  { name: 'Black & White', filter: { ...DEFAULT_FILTER, grayscale: 100 } },
  { name: 'High Contrast', filter: { ...DEFAULT_FILTER, contrast: 130, brightness: 105 } },
  { name: 'Soft', filter: { ...DEFAULT_FILTER, blur: 1, brightness: 105, contrast: 90 } },
  { name: 'Vivid', filter: { ...DEFAULT_FILTER, saturation: 130, contrast: 110 } },
];

export const VIRTUAL_BACKGROUNDS: VirtualBackground[] = [
  { id: 'blur-light', name: 'Light Blur', type: 'color', value: 'blur-light' },
  { id: 'blur-heavy', name: 'Heavy Blur', type: 'color', value: 'blur-heavy' },
  { id: 'garage', name: 'Garage', type: 'color', value: '#2a2a2a' },
  { id: 'office', name: 'Office', type: 'color', value: '#e8e4df' },
  { id: 'blue-gradient', name: 'Blue Gradient', type: 'color', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'green-screen', name: 'Green Screen', type: 'color', value: '#00ff00' },
];

export function useVideoEffects() {
  const [filter, setFilter] = useState<VideoFilter>(DEFAULT_FILTER);
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundEffect>('none');
  const [selectedBackground, setSelectedBackground] = useState<VirtualBackground | null>(null);
  const [blurStrength, setBlurStrength] = useState(15);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSegmentationReady, setIsSegmentationReady] = useState(false);
  const [customBackgrounds, setCustomBackgrounds] = useState<VirtualBackground[]>([]);
  const [edgeSmoothing, setEdgeSmoothing] = useState(3); // Edge feathering amount (0-10)
  const [maskThreshold, setMaskThreshold] = useState(0.6); // Confidence threshold (0-1)

  const selfieSegmentationRef = useRef<SelfieSegmentation | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const refinedMaskCanvasRef = useRef<HTMLCanvasElement | null>(null); // Refined mask after post-processing
  const refinedMaskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null); // Internal video element for processing
  const outputStreamRef = useRef<MediaStream | null>(null);
  const lastSegmentationMaskRef = useRef<ImageBitmap | null>(null);
  const isLoopRunningRef = useRef<boolean>(false);
  const isLiveRef = useRef<boolean>(false); // Track if we're live to prevent cleanup on unmount
  const cleanupRef = useRef<(() => void) | null>(null); // Ref to hold cleanup function for external access
  const backgroundImageRef = useRef<HTMLImageElement | null>(null); // Loaded custom background image

  // Refine the segmentation mask to improve edge quality
  const refineMask = useCallback((
    rawMaskCanvas: HTMLCanvasElement,
    refinedCanvas: HTMLCanvasElement,
    refinedCtx: CanvasRenderingContext2D,
    threshold: number,
    smoothing: number
  ) => {
    const width = rawMaskCanvas.width;
    const height = rawMaskCanvas.height;
    
    refinedCanvas.width = width;
    refinedCanvas.height = height;
    
    // Get raw mask data
    const rawCtx = rawMaskCanvas.getContext('2d');
    if (!rawCtx) return;
    
    const rawImageData = rawCtx.getImageData(0, 0, width, height);
    const rawData = rawImageData.data;
    
    // Create output image data
    const outputImageData = refinedCtx.createImageData(width, height);
    const outputData = outputImageData.data;
    
    // Apply threshold to create cleaner edges
    // The mask from MediaPipe has alpha values - we threshold them for cleaner separation
    for (let i = 0; i < rawData.length; i += 4) {
      // MediaPipe mask stores confidence in the alpha channel or RGB channels
      // We use the first channel (R) which contains the mask value
      const maskValue = rawData[i] / 255;
      
      // Apply threshold with smooth transition near the edge
      let refinedValue: number;
      if (maskValue > threshold + 0.1) {
        refinedValue = 255;
      } else if (maskValue < threshold - 0.1) {
        refinedValue = 0;
      } else {
        // Smooth transition at edges
        refinedValue = ((maskValue - (threshold - 0.1)) / 0.2) * 255;
      }
      
      outputData[i] = refinedValue;     // R
      outputData[i + 1] = refinedValue; // G
      outputData[i + 2] = refinedValue; // B
      outputData[i + 3] = refinedValue; // A - this is what matters for masking
    }
    
    refinedCtx.putImageData(outputImageData, 0, 0);
    
    // Apply edge smoothing with a slight blur if smoothing > 0
    if (smoothing > 0) {
      // Use a temporary canvas to apply blur
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.filter = `blur(${smoothing}px)`;
        tempCtx.drawImage(refinedCanvas, 0, 0);
        
        // Copy back to refined canvas
        refinedCtx.filter = 'none';
        refinedCtx.clearRect(0, 0, width, height);
        refinedCtx.drawImage(tempCanvas, 0, 0);
      }
    }
  }, []);

  // Initialize selfie segmentation when background effects are enabled
  const initializeSegmentation = useCallback(async () => {
    if (selfieSegmentationRef.current) return;

    try {
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        },
      });

      selfieSegmentation.setOptions({
        modelSelection: 1,
        selfieMode: true,
      });

      selfieSegmentation.onResults((results: Results) => {
        if (!maskCanvasRef.current || !maskCtxRef.current) return;
        
        const mask = results.segmentationMask;
        maskCanvasRef.current.width = mask.width;
        maskCanvasRef.current.height = mask.height;
        maskCtxRef.current.drawImage(mask, 0, 0);
        
        if (mask instanceof ImageBitmap) {
          lastSegmentationMaskRef.current = mask;
        }
      });

      await selfieSegmentation.initialize();
      selfieSegmentationRef.current = selfieSegmentation;
      setIsSegmentationReady(true);
    } catch (err) {
      console.error('Failed to initialize selfie segmentation:', err);
      setIsSegmentationReady(false);
    }
  }, []);

  // Create CSS filter string from filter settings
  // Returns empty string when no filters are active (for easy concatenation)
  const getFilterString = useCallback((f: VideoFilter): string => {
    const filters: string[] = [];
    if (f.brightness !== 100) filters.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) filters.push(`contrast(${f.contrast}%)`);
    if (f.saturation !== 100) filters.push(`saturate(${f.saturation}%)`);
    if (f.sepia > 0) filters.push(`sepia(${f.sepia}%)`);
    if (f.grayscale > 0) filters.push(`grayscale(${f.grayscale}%)`);
    if (f.blur > 0) filters.push(`blur(${f.blur}px)`);
    if (f.hue !== 0) filters.push(`hue-rotate(${f.hue}deg)`);
    return filters.join(' ');
  }, []);

  // Process a single frame with effects (no self-scheduling - caller handles loop)
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !ctxRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (video.readyState < 2) {
      return; // Skip frame if video not ready
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const filterStr = getFilterString(filter);
    // Use 'none' for canvas filter when no filters are active
    const canvasFilter = filterStr || 'none';

    if (backgroundEffect === 'none') {
      // No background effect, just apply filters to the video
      ctx.filter = canvasFilter;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else if (selfieSegmentationRef.current && isSegmentationReady && maskCanvasRef.current) {
      try {
        await selfieSegmentationRef.current.send({ image: video });
        
        // Initialize refined mask canvas if needed
        if (!refinedMaskCanvasRef.current) {
          refinedMaskCanvasRef.current = document.createElement('canvas');
          refinedMaskCtxRef.current = refinedMaskCanvasRef.current.getContext('2d');
        }
        
        // Refine the mask with threshold and edge smoothing
        if (refinedMaskCanvasRef.current && refinedMaskCtxRef.current) {
          refineMask(
            maskCanvasRef.current,
            refinedMaskCanvasRef.current,
            refinedMaskCtxRef.current,
            maskThreshold,
            edgeSmoothing
          );
        }
        
        // Use refined mask if available, otherwise fall back to raw mask
        const maskToUse = refinedMaskCanvasRef.current || maskCanvasRef.current;
        
        ctx.save();
        
        if (backgroundEffect === 'blur') {
          // Step 1: Draw blurred background first
          // Combine blur with any active filters
          const blurFilter = filterStr ? `blur(${blurStrength}px) ${filterStr}` : `blur(${blurStrength}px)`;
          ctx.filter = blurFilter;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Step 2: Draw sharp foreground (person) on top using refined mask
          // Create temp canvas for masked foreground
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          if (tempCtx) {
            // Draw sharp video with filters (use canvasFilter which handles empty string)
            tempCtx.filter = canvasFilter;
            tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Apply refined mask (keep only person)
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(maskToUse, 0, 0, canvas.width, canvas.height);
            
            // Draw masked foreground on top of blurred background
            ctx.filter = 'none';
            ctx.drawImage(tempCanvas, 0, 0);
          }
        } else if (backgroundEffect === 'virtual' && selectedBackground) {
          // Step 1: Draw background (color, gradient, blur, or image)
          if (selectedBackground.type === 'image' && backgroundImageRef.current) {
            // Draw custom image background - cover the canvas while maintaining aspect ratio
            ctx.filter = 'none';
            const img = backgroundImageRef.current;
            const imgAspect = img.width / img.height;
            const canvasAspect = canvas.width / canvas.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            if (imgAspect > canvasAspect) {
              // Image is wider - fit by height
              drawHeight = canvas.height;
              drawWidth = drawHeight * imgAspect;
              drawX = (canvas.width - drawWidth) / 2;
              drawY = 0;
            } else {
              // Image is taller - fit by width
              drawWidth = canvas.width;
              drawHeight = drawWidth / imgAspect;
              drawX = 0;
              drawY = (canvas.height - drawHeight) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          } else if (selectedBackground.type === 'color') {
            if (selectedBackground.value.includes('blur')) {
              const blurAmount = selectedBackground.value === 'blur-heavy' ? 25 : 10;
              ctx.filter = `blur(${blurAmount}px)`;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            } else if (selectedBackground.value.startsWith('linear-gradient')) {
              ctx.filter = 'none';
              const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
              gradient.addColorStop(0, '#667eea');
              gradient.addColorStop(1, '#764ba2');
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
              ctx.filter = 'none';
              ctx.fillStyle = selectedBackground.value;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
          }
          
          // Step 2: Draw sharp foreground (person) on top using refined mask
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          if (tempCtx) {
            // Draw sharp video with filters (use canvasFilter which handles empty string)
            tempCtx.filter = canvasFilter;
            tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Apply refined mask (keep only person)
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(maskToUse, 0, 0, canvas.width, canvas.height);
            
            // Draw masked foreground on top of background
            ctx.filter = 'none';
            ctx.drawImage(tempCanvas, 0, 0);
          }
        }
        
        ctx.restore();
      } catch (err) {
        // Fallback: just draw video with filters
        ctx.filter = canvasFilter;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } else {
      // Segmentation not ready yet, just apply filters
      ctx.filter = canvasFilter;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  }, [filter, backgroundEffect, selectedBackground, blurStrength, getFilterString, isSegmentationReady, refineMask, maskThreshold, edgeSmoothing]);

  // Start processing with either a video element or a MediaStream
  // When passing a stream, creates an internal video element that survives component unmounts
  const startProcessing = useCallback(async (input: HTMLVideoElement | MediaStream): Promise<MediaStream | null> => {
    if (!input) return null;

    let videoToProcess: HTMLVideoElement;
    
    // If input is a MediaStream, create an internal video element
    if (input instanceof MediaStream) {
      // Create a detached video element that won't be affected by component unmounts
      const internalVideo = document.createElement('video');
      internalVideo.srcObject = input;
      internalVideo.muted = true;
      internalVideo.playsInline = true;
      internalVideo.autoplay = true;
      
      // Wait for video to be playable and have actual frame data
      await new Promise<void>((resolve, reject) => {
        const videoEl = internalVideo; // capture for closures
        
        const waitForFrame = () => {
          // Wait for an actual rendered frame using requestVideoFrameCallback if available
          // Otherwise poll currentTime to ensure video has advanced
          if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            (videoEl as any).requestVideoFrameCallback(() => resolve());
          } else {
            // Fallback: poll until currentTime > 0 or timeout
            const startTime = Date.now();
            const pollForFrame = () => {
              if (videoEl.currentTime > 0) {
                resolve();
              } else if (Date.now() - startTime > 2000) {
                // Timeout after 2 seconds, proceed anyway
                resolve();
              } else {
                requestAnimationFrame(pollForFrame);
              }
            };
            requestAnimationFrame(pollForFrame);
          }
        };
        
        const onCanPlay = () => {
          videoEl.removeEventListener('canplay', onCanPlay);
          videoEl.removeEventListener('error', onError);
          waitForFrame();
        };
        const onError = () => {
          videoEl.removeEventListener('canplay', onCanPlay);
          videoEl.removeEventListener('error', onError);
          reject(new Error('Failed to load video'));
        };
        videoEl.addEventListener('canplay', onCanPlay);
        videoEl.addEventListener('error', onError);
        videoEl.play().catch(reject);
      });
      
      internalVideoRef.current = internalVideo;
      videoToProcess = internalVideo;
      isLiveRef.current = true; // Mark as live when using stream input
    } else {
      videoToProcess = input;
      videoRef.current = input;
    }
    
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      ctxRef.current = canvasRef.current.getContext('2d');
    }
    
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
      maskCtxRef.current = maskCanvasRef.current.getContext('2d');
    }

    // Wait for segmentation to initialize if background effects are enabled
    if (backgroundEffect !== 'none' && !selfieSegmentationRef.current) {
      await initializeSegmentation();
    }

    // Wait for video to be ready before initializing canvas
    if (videoToProcess.readyState < 2) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          videoToProcess.removeEventListener('loadeddata', onReady);
          resolve();
        };
        videoToProcess.addEventListener('loadeddata', onReady);
        // Also resolve if already ready (race condition)
        if (videoToProcess.readyState >= 2) resolve();
      });
    }

    // Store the video reference for processing
    videoRef.current = videoToProcess;

    // Initialize canvas with video dimensions
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      canvas.width = videoToProcess.videoWidth || 640;
      canvas.height = videoToProcess.videoHeight || 480;
      
      // Draw initial frame to canvas before capturing stream
      // This ensures the stream doesn't start with a black frame
      ctx.drawImage(videoToProcess, 0, 0, canvas.width, canvas.height);
    }

    setIsProcessing(true);
    isLoopRunningRef.current = true;
    
    // Capture stream AFTER drawing initial frame
    outputStreamRef.current = canvasRef.current.captureStream(30);
    
    // Add track ended listener for automatic cleanup when stream is stopped
    outputStreamRef.current.getVideoTracks().forEach(track => {
      track.onended = () => {
        console.log("Video effects output track ended, triggering cleanup");
        // Call the full cleanup via the ref
        if (cleanupRef.current && isLiveRef.current) {
          cleanupRef.current();
        }
      };
    });
    
    // Start the processing loop with proper async handling
    const runLoop = async () => {
      if (!isLoopRunningRef.current) return;
      await processFrame();
      if (isLoopRunningRef.current) {
        animationFrameRef.current = requestAnimationFrame(runLoop);
      }
    };
    runLoop();
    
    return outputStreamRef.current;
  }, [backgroundEffect, initializeSegmentation, processFrame]);

  // Core cleanup logic - can be called from stopProcessing or track.onended
  const doCleanup = useCallback(() => {
    console.log("Video effects cleanup executing");
    setIsProcessing(false);
    isLoopRunningRef.current = false;
    isLiveRef.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (internalVideoRef.current) {
      internalVideoRef.current.srcObject = null;
      internalVideoRef.current = null;
    }
    
    // Stop output stream tracks
    outputStreamRef.current?.getTracks().forEach(track => track.stop());
    outputStreamRef.current = null;
    
    // Close MediaPipe segmentation
    if (selfieSegmentationRef.current) {
      selfieSegmentationRef.current.close();
      selfieSegmentationRef.current = null;
      setIsSegmentationReady(false);
    }
  }, []);

  const stopProcessing = useCallback(() => {
    doCleanup();
  }, [doCleanup]);
  
  // Store cleanup function in ref for external access (track.onended)
  cleanupRef.current = doCleanup;

  const updateFilter = useCallback((updates: Partial<VideoFilter>) => {
    setFilter(prev => ({ ...prev, ...updates }));
  }, []);

  const resetFilter = useCallback(() => {
    setFilter(DEFAULT_FILTER);
  }, []);

  const applyPreset = useCallback((preset: VideoFilter) => {
    setFilter(preset);
  }, []);

  // Add a custom background from a file
  const addCustomBackground = useCallback((file: File): Promise<VirtualBackground> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newBg: VirtualBackground = {
          id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name.split('.')[0].substring(0, 15),
          type: 'image',
          value: dataUrl,
          isCustom: true,
        };
        setCustomBackgrounds(prev => [...prev, newBg]);
        resolve(newBg);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove a custom background
  const removeCustomBackground = useCallback((id: string) => {
    setCustomBackgrounds(prev => prev.filter(bg => bg.id !== id));
    // If the removed background was selected, clear the selection
    if (selectedBackground?.id === id) {
      setSelectedBackground(null);
      backgroundImageRef.current = null;
    }
  }, [selectedBackground]);

  // Load background image when a custom image background is selected
  useEffect(() => {
    if (selectedBackground?.type === 'image') {
      const img = new Image();
      img.onload = () => {
        backgroundImageRef.current = img;
      };
      img.onerror = () => {
        console.error('Failed to load background image');
        backgroundImageRef.current = null;
      };
      img.src = selectedBackground.value;
    } else {
      backgroundImageRef.current = null;
    }
  }, [selectedBackground]);

  useEffect(() => {
    if (backgroundEffect !== 'none' && !selfieSegmentationRef.current) {
      initializeSegmentation();
    }
  }, [backgroundEffect, initializeSegmentation]);

  useEffect(() => {
    return () => {
      // Don't cleanup if we're live - the stream needs to continue
      // Cleanup will be called explicitly when the broadcast ends (via track.onended or manual stop)
      if (!isLiveRef.current) {
        doCleanup();
      }
    };
  }, [doCleanup]);

  return {
    filter,
    setFilter,
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
    isProcessing,
    isSegmentationReady,
    startProcessing,
    stopProcessing,
    getFilterString,
    canvasRef,
    PRESET_FILTERS,
    VIRTUAL_BACKGROUNDS,
    customBackgrounds,
    addCustomBackground,
    removeCustomBackground,
  };
}
