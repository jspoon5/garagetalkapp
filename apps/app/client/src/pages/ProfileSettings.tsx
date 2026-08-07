import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { Camera, ArrowLeft, Save, MapPin, Palette, Check, User } from "lucide-react";

const AVATAR_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
  { name: "Green", value: "#22c55e" },
  { name: "Yellow", value: "#eab308" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Lime", value: "#84cc16" },
  { name: "Rose", value: "#f43f5e" },
];

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  city: z.string().max(100, "City must be at most 100 characters").optional().or(z.literal("")),
  bio: z.string().max(200, "Bio must be at most 200 characters").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSettings() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useCurrentUser();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>("#3b82f6");
  const [isSavingColor, setIsSavingColor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      city: user?.city || "",
      bio: user?.bio || "",
    },
  });

  // Initialize selected color from user data
  useEffect(() => {
    if (user?.avatarColor) {
      setSelectedColor(user.avatarColor);
    }
  }, [user?.avatarColor]);

  const handleColorChange = async (color: string) => {
    if (!user) return;
    setSelectedColor(color);
    setIsSavingColor(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}`, { avatarColor: color });
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });
      toast({ title: "Success", description: "Avatar color updated" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update color",
        variant: "destructive",
      });
    } finally {
      setIsSavingColor(false);
    }
  };

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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/upload-avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const { url } = await response.json();

      await apiRequest("PATCH", `/api/users/${user.id}`, { avatarUrl: url });
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });

      toast({ title: "Success", description: "Avatar updated successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}`, values);
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });
      toast({ title: "Success", description: "Profile updated successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

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

        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
            <CardDescription>Manage your profile information and avatar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user.avatarUrl || undefined} alt={user.username} />
                  <AvatarFallback 
                    className="text-2xl font-semibold text-white"
                    style={{ backgroundColor: selectedColor }}
                  >
                    {user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-change-avatar"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  data-testid="input-avatar-file"
                />
              </div>
              {isUploading && (
                <p className="text-sm text-muted-foreground">Uploading...</p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Avatar Color
              </Label>
              <p className="text-xs text-muted-foreground">
                Choose a color for your avatar in chat rooms (used when no profile picture is set)
              </p>
              <div className="grid grid-cols-6 gap-2">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`h-10 w-10 rounded-full flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                      selectedColor === color.value ? "ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => handleColorChange(color.value)}
                    disabled={isSavingColor}
                    title={color.name}
                    data-testid={`button-color-${color.name.toLowerCase()}`}
                  >
                    {selectedColor === color.value && (
                      <Check className="h-5 w-5 text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
              {isSavingColor && (
                <p className="text-xs text-muted-foreground">Saving color...</p>
              )}
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        City
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Los Angeles, CA" {...field} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">Your city will be shown to other users in chat</p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Bio
                      </FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Tell other mechanics about yourself..."
                          className="resize-none"
                          maxLength={200}
                          {...field} 
                          data-testid="input-bio" 
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {(field.value?.length || 0)}/200 characters - Shows in your profile popup in chat
                      </p>
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input value={user.phone || "Not set"} disabled data-testid="input-phone" />
                  <p className="text-xs text-muted-foreground">Phone number cannot be changed after registration</p>
                </div>

                <div className="space-y-2">
                  <Label>Subscription Tier</Label>
                  <div className="flex items-center gap-2">
                    <Input value={user.subscriptionTier?.toUpperCase() || "AMATEUR"} disabled data-testid="input-tier" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation("/subscribe")}
                      data-testid="button-upgrade"
                    >
                      Upgrade
                    </Button>
                  </div>
                </div>

                <Button type="submit" disabled={isSaving} className="w-full" data-testid="button-save-profile">
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
