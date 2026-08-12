import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Sun, 
  Contrast, 
  Droplets, 
  Image as ImageIcon,
  RotateCcw,
  Check,
  Loader2,
  Paintbrush,
  Upload,
  X
} from "lucide-react";
import { 
  VideoFilter,
  BackgroundEffect,
  VirtualBackground,
  DEFAULT_FILTER,
  PRESET_FILTERS,
  VIRTUAL_BACKGROUNDS
} from "@/hooks/useVideoEffects";

interface VideoEffectsPanelProps {
  filter: VideoFilter;
  onFilterChange: (updates: Partial<VideoFilter>) => void;
  onFilterReset: () => void;
  onApplyPreset: (preset: VideoFilter) => void;
  backgroundEffect: BackgroundEffect;
  onBackgroundEffectChange: (effect: BackgroundEffect) => void;
  selectedBackground: VirtualBackground | null;
  onBackgroundSelect: (bg: VirtualBackground | null) => void;
  blurStrength: number;
  onBlurStrengthChange: (strength: number) => void;
  edgeSmoothing?: number;
  onEdgeSmoothingChange?: (value: number) => void;
  maskThreshold?: number;
  onMaskThresholdChange?: (value: number) => void;
  isSegmentationReady: boolean;
  isProcessing: boolean;
  customBackgrounds?: VirtualBackground[];
  onAddCustomBackground?: (file: File) => Promise<VirtualBackground>;
  onRemoveCustomBackground?: (id: string) => void;
}

export function VideoEffectsPanel({
  filter,
  onFilterChange,
  onFilterReset,
  onApplyPreset,
  backgroundEffect,
  onBackgroundEffectChange,
  selectedBackground,
  onBackgroundSelect,
  blurStrength,
  onBlurStrengthChange,
  edgeSmoothing = 3,
  onEdgeSmoothingChange,
  maskThreshold = 0.6,
  onMaskThresholdChange,
  isSegmentationReady,
  isProcessing,
  customBackgrounds = [],
  onAddCustomBackground,
  onRemoveCustomBackground,
}: VideoEffectsPanelProps) {
  const isFilterModified = JSON.stringify(filter) !== JSON.stringify(DEFAULT_FILTER);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onAddCustomBackground) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return;
    }
    
    try {
      const newBg = await onAddCustomBackground(file);
      onBackgroundSelect(newBg);
    } catch (err) {
      console.error('Failed to add custom background:', err);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const allBackgrounds = [...VIRTUAL_BACKGROUNDS, ...customBackgrounds];

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <Tabs defaultValue="filters" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="filters" className="text-xs gap-1" data-testid="tab-filters">
              <Sparkles className="h-3 w-3" />
              Filters
            </TabsTrigger>
            <TabsTrigger value="background" className="text-xs gap-1" data-testid="tab-background">
              <ImageIcon className="h-3 w-3" />
              Background
            </TabsTrigger>
            <TabsTrigger value="adjust" className="text-xs gap-1" data-testid="tab-adjust">
              <Paintbrush className="h-3 w-3" />
              Adjust
            </TabsTrigger>
          </TabsList>

          <TabsContent value="filters" className="mt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Presets</Label>
                {isFilterModified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onFilterReset}
                    className="h-6 px-2 text-xs"
                    data-testid="button-reset-filter"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_FILTERS.map((preset) => {
                  const isActive = JSON.stringify(filter) === JSON.stringify(preset.filter);
                  return (
                    <Button
                      key={preset.name}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => onApplyPreset(preset.filter)}
                      className="h-8 text-xs relative"
                      data-testid={`button-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {preset.name}
                      {isActive && (
                        <Check className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="background" className="mt-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Background Effect</Label>
                <div className="flex gap-2">
                  <Button
                    variant={backgroundEffect === 'none' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      onBackgroundEffectChange('none');
                      onBackgroundSelect(null);
                    }}
                    className="flex-1"
                    data-testid="button-bg-none"
                  >
                    None
                  </Button>
                  <Button
                    variant={backgroundEffect === 'blur' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onBackgroundEffectChange('blur')}
                    className="flex-1"
                    data-testid="button-bg-blur"
                  >
                    Blur
                    {backgroundEffect === 'blur' && !isSegmentationReady && (
                      <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                    )}
                  </Button>
                  <Button
                    variant={backgroundEffect === 'virtual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onBackgroundEffectChange('virtual')}
                    className="flex-1"
                    data-testid="button-bg-virtual"
                  >
                    Virtual
                    {backgroundEffect === 'virtual' && !isSegmentationReady && (
                      <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                    )}
                  </Button>
                </div>
              </div>

              {backgroundEffect === 'blur' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Blur Strength</Label>
                    <span className="text-xs text-muted-foreground">{blurStrength}px</span>
                  </div>
                  <Slider
                    value={[blurStrength]}
                    onValueChange={([value]) => onBlurStrengthChange(value)}
                    min={5}
                    max={40}
                    step={1}
                    className="w-full"
                    data-testid="slider-blur-strength"
                  />
                </div>
              )}

              {backgroundEffect === 'virtual' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Virtual Backgrounds</Label>
                    {onAddCustomBackground && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                          data-testid="input-upload-background"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-7 text-xs gap-1"
                          data-testid="button-upload-background"
                        >
                          <Upload className="h-3 w-3" />
                          Upload
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {allBackgrounds.map((bg) => {
                      const isSelected = selectedBackground?.id === bg.id;
                      let bgStyle: string = '';
                      let bgImageStyle: React.CSSProperties | undefined;
                      
                      if (bg.type === 'image') {
                        bgImageStyle = {
                          backgroundImage: `url(${bg.value})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        };
                      } else if (bg.value === 'blur-light') {
                        bgStyle = 'bg-gradient-to-br from-gray-200 to-gray-300';
                      } else if (bg.value === 'blur-heavy') {
                        bgStyle = 'bg-gradient-to-br from-gray-300 to-gray-400';
                      } else if (bg.value.startsWith('linear-gradient')) {
                        bgStyle = 'bg-gradient-to-br from-purple-500 to-indigo-600';
                      }
                      
                      return (
                        <div key={bg.id} className="relative group">
                          <button
                            onClick={() => onBackgroundSelect(bg)}
                            className={`
                              relative w-full h-16 rounded-md border-2 overflow-hidden transition-all
                              ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover-elevate'}
                              ${bgStyle}
                            `}
                            style={bgImageStyle || (!bgStyle && bg.type === 'color' ? { backgroundColor: bg.value } : undefined)}
                            data-testid={`button-virtual-bg-${bg.id}`}
                          >
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Badge 
                                variant={isSelected ? "default" : "secondary"} 
                                className="text-[10px] px-1 max-w-[90%] truncate"
                              >
                                {bg.name}
                              </Badge>
                            </span>
                            {isSelected && (
                              <div className="absolute top-1 right-1">
                                <Check className="h-3 w-3 text-primary" />
                              </div>
                            )}
                          </button>
                          {bg.isCustom && onRemoveCustomBackground && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveCustomBackground(bg.id);
                              }}
                              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              data-testid={`button-remove-bg-${bg.id}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {customBackgrounds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {customBackgrounds.length} custom background{customBackgrounds.length !== 1 ? 's' : ''} uploaded
                    </p>
                  )}
                </div>
              )}

              {backgroundEffect !== 'none' && isSegmentationReady && (
                <div className="space-y-3 pt-3 border-t">
                  <Label className="text-sm font-medium">Edge Quality</Label>
                  <p className="text-xs text-muted-foreground">
                    Adjust these settings to improve how well you are separated from the background.
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Edge Smoothing</Label>
                      <span className="text-xs text-muted-foreground">{edgeSmoothing}px</span>
                    </div>
                    <Slider
                      value={[edgeSmoothing]}
                      onValueChange={([value]) => onEdgeSmoothingChange?.(value)}
                      min={0}
                      max={10}
                      step={1}
                      className="w-full"
                      data-testid="slider-edge-smoothing"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Detection Sensitivity</Label>
                      <span className="text-xs text-muted-foreground">{Math.round(maskThreshold * 100)}%</span>
                    </div>
                    <Slider
                      value={[maskThreshold * 100]}
                      onValueChange={([value]) => onMaskThresholdChange?.(value / 100)}
                      min={30}
                      max={90}
                      step={5}
                      className="w-full"
                      data-testid="slider-mask-threshold"
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values = tighter outline. Lower values = include more of you.
                    </p>
                  </div>
                </div>
              )}

              {backgroundEffect !== 'none' && !isSegmentationReady && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded-md">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading AI model for background effects...
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="adjust" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Manual Adjustments</Label>
                {isFilterModified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onFilterReset}
                    className="h-6 px-2 text-xs"
                    data-testid="button-reset-adjustments"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Sun className="h-3 w-3" />
                      Brightness
                    </Label>
                    <span className="text-xs text-muted-foreground">{filter.brightness}%</span>
                  </div>
                  <Slider
                    value={[filter.brightness]}
                    onValueChange={([value]) => onFilterChange({ brightness: value })}
                    min={50}
                    max={150}
                    step={1}
                    className="w-full"
                    data-testid="slider-brightness"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Contrast className="h-3 w-3" />
                      Contrast
                    </Label>
                    <span className="text-xs text-muted-foreground">{filter.contrast}%</span>
                  </div>
                  <Slider
                    value={[filter.contrast]}
                    onValueChange={([value]) => onFilterChange({ contrast: value })}
                    min={50}
                    max={150}
                    step={1}
                    className="w-full"
                    data-testid="slider-contrast"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Droplets className="h-3 w-3" />
                      Saturation
                    </Label>
                    <span className="text-xs text-muted-foreground">{filter.saturation}%</span>
                  </div>
                  <Slider
                    value={[filter.saturation]}
                    onValueChange={([value]) => onFilterChange({ saturation: value })}
                    min={0}
                    max={200}
                    step={1}
                    className="w-full"
                    data-testid="slider-saturation"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Sepia</Label>
                    <span className="text-xs text-muted-foreground">{filter.sepia}%</span>
                  </div>
                  <Slider
                    value={[filter.sepia]}
                    onValueChange={([value]) => onFilterChange({ sepia: value })}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                    data-testid="slider-sepia"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Grayscale</Label>
                    <span className="text-xs text-muted-foreground">{filter.grayscale}%</span>
                  </div>
                  <Slider
                    value={[filter.grayscale]}
                    onValueChange={([value]) => onFilterChange({ grayscale: value })}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                    data-testid="slider-grayscale"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Hue Rotate</Label>
                    <span className="text-xs text-muted-foreground">{filter.hue}°</span>
                  </div>
                  <Slider
                    value={[filter.hue]}
                    onValueChange={([value]) => onFilterChange({ hue: value })}
                    min={-180}
                    max={180}
                    step={1}
                    className="w-full"
                    data-testid="slider-hue"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default VideoEffectsPanel;
