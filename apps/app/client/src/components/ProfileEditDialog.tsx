import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Camera, Palette, Image, Film } from "lucide-react";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

type AvatarType = "color" | "image" | "animated";

interface UserData {
  username: string;
  avatarUrl?: string;
  avatarType?: AvatarType;
  avatarColor?: string;
}

const colorOptions = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7",
  "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#06b6d4"
];

export default function ProfileEditDialog({
  open,
  onOpenChange,
  userId,
}: ProfileEditDialogProps) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarType, setAvatarType] = useState<AvatarType>("color");
  const [avatarColor, setAvatarColor] = useState("#3b82f6");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current user data
  const { data: user, isLoading } = useQuery<UserData>({
    queryKey: ["/api/users", userId],
    enabled: open && !!userId,
  });

  // Set username and avatar when user data loads
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
    if (user?.avatarUrl) {
      setAvatarUrl(user.avatarUrl);
      setAvatarPreview(user.avatarUrl);
    } else {
      setAvatarUrl("");
      setAvatarPreview(null);
    }
    if (user?.avatarType) {
      setAvatarType(user.avatarType);
      setIsAnimated(user.avatarType === "animated");
    } else {
      setAvatarType("color");
    }
    if (user?.avatarColor) {
      setAvatarColor(user.avatarColor);
    }
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    // Check if it's an animated GIF
    const isGif = file.type === "image/gif";
    setIsAnimated(isGif);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to object storage
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "avatar");

      const response = await fetch("/api/upload-avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload avatar");
      }

      const data = await response.json();
      setAvatarUrl(data.url);
      // Set avatar type based on file type
      setAvatarType(isGif ? "animated" : "image");
      toast({
        title: isGif ? "Animated avatar uploaded" : "Avatar uploaded",
        description: isGif 
          ? "Your new animated profile picture has been uploaded." 
          : "Your new profile picture has been uploaded.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
      setAvatarPreview(user?.avatarUrl || null);
    } finally {
      setIsUploading(false);
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { 
      username: string; 
      avatarUrl?: string;
      avatarType?: AvatarType;
      avatarColor?: string;
    }) => {
      return await apiRequest("PATCH", `/api/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/presence"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAvatarTypeChange = (value: string) => {
    const newType = value as AvatarType;
    setAvatarType(newType);
    if (newType === "color") {
      setAvatarPreview(null);
      setIsAnimated(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast({
        title: "Username required",
        description: "Please enter a username.",
        variant: "destructive",
      });
      return;
    }
    updateProfileMutation.mutate({ 
      username: username.trim(),
      avatarUrl: avatarType === "color" ? undefined : avatarUrl,
      avatarType,
      avatarColor: avatarType === "color" ? avatarColor : undefined,
    });
  };

  const displayAvatar = avatarPreview || avatarUrl || undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-profile" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information and avatar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24 border-4 border-background shadow-lg" data-testid="avatar-preview">
                  {avatarType !== "color" && displayAvatar ? (
                    <AvatarImage src={displayAvatar} alt={username || "Profile"} />
                  ) : null}
                  <AvatarFallback 
                    className="text-white font-bold text-2xl"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {username?.slice(0, 2).toUpperCase() || "GT"}
                  </AvatarFallback>
                </Avatar>
                {isAnimated && avatarType !== "color" && (
                  <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <Film className="h-3 w-3" />
                    GIF
                  </span>
                )}
                {avatarType !== "color" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-change-avatar"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.gif"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-avatar-file"
                />
              </div>
              {isUploading && (
                <p className="text-sm text-muted-foreground">Uploading...</p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Avatar Style</Label>
              <RadioGroup 
                value={avatarType} 
                onValueChange={handleAvatarTypeChange}
                className="grid grid-cols-3 gap-2"
              >
                <Label 
                  htmlFor="avatar-color" 
                  className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-colors ${avatarType === "color" ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                >
                  <RadioGroupItem value="color" id="avatar-color" className="sr-only" />
                  <Palette className="h-5 w-5" />
                  <span className="text-xs font-medium">Color</span>
                </Label>
                <Label 
                  htmlFor="avatar-image" 
                  className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-colors ${avatarType === "image" ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                >
                  <RadioGroupItem value="image" id="avatar-image" className="sr-only" />
                  <Image className="h-5 w-5" />
                  <span className="text-xs font-medium">Picture</span>
                </Label>
                <Label 
                  htmlFor="avatar-animated" 
                  className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-colors ${avatarType === "animated" ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                >
                  <RadioGroupItem value="animated" id="avatar-animated" className="sr-only" />
                  <Film className="h-5 w-5" />
                  <span className="text-xs font-medium">Animated</span>
                </Label>
              </RadioGroup>
            </div>

            {avatarType === "color" && (
              <div className="space-y-3">
                <Label>Choose Color</Label>
                <div className="flex flex-wrap gap-2 justify-center">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      className={`h-8 w-8 rounded-full transition-all ${avatarColor === color ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110"}`}
                      style={{ backgroundColor: color }}
                      data-testid={`color-option-${color}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {avatarType !== "color" && (
              <div className="space-y-2 text-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                  data-testid="button-upload-avatar"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {avatarType === "animated" ? "Upload GIF Animation" : "Upload Picture"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {avatarType === "animated" 
                    ? "Upload a GIF for an animated avatar (max 5MB)" 
                    : "Upload JPG, PNG, or GIF (max 5MB)"}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                minLength={3}
                maxLength={50}
                data-testid="input-username"
              />
              <p className="text-xs text-muted-foreground">
                Must be between 3 and 50 characters
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateProfileMutation.isPending || isUploading}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProfileMutation.isPending || isUploading || !username.trim()}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
