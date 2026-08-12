import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpTrayIcon, XMarkIcon, VideoCameraIcon, LinkIcon } from "@heroicons/react/24/outline";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { UploadResult } from "@uppy/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function UploadForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const [uploadType, setUploadType] = useState<"file" | "url">("file");
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState("");

  const createVideoMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create video");
      return response.json();
    },
    onSuccess: (video: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Success!",
        description: "Your video has been uploaded successfully.",
      });
      setLocation(`/video/${video.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create video. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim())) {
      setTags([...tags, currentTag.trim()]);
      setCurrentTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleGetUploadURL = async () => {
    const response = await fetch("/api/videos/upload-url", {
      method: "POST",
    });
    const data = await response.json();
    setUploadedVideoId(data.videoId);
    return {
      method: "PUT" as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (uploadedVideoId) {
      toast({
        title: "Upload Complete",
        description: "Please fill in the video details and submit.",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in to upload videos",
        variant: "destructive",
      });
      setLocation("/sign-in");
      return;
    }
    
    const videoUrl = uploadType === "file" && uploadedVideoId
      ? `/videos/${uploadedVideoId}`
      : url;

    if (!videoUrl) {
      toast({
        title: "Error",
        description: uploadType === "file" 
          ? "Please upload a video file first" 
          : "Please provide a video URL",
        variant: "destructive",
      });
      return;
    }

    createVideoMutation.mutate({
      url: videoUrl,
      title,
      description: description || "",
      category,
      tags,
      thumbnail: null,
      duration: null,
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Upload Video</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as "file" | "url")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" data-testid="tab-file-upload">
              <VideoCameraIcon className="h-4 w-4 mr-2" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="url" data-testid="tab-url-embed">
              <LinkIcon className="h-4 w-4 mr-2" />
              Embed URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-8 text-center bg-muted/30">
              <VideoCameraIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload video from your computer or phone
              </p>
              <ObjectUploader
                maxNumberOfFiles={1}
                maxFileSize={524288000}
                allowedFileTypes={['video/*']}
                onGetUploadParameters={handleGetUploadURL}
                onComplete={handleUploadComplete}
              >
                <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                Choose Video File
              </ObjectUploader>
              {uploadedVideoId && (
                <p className="text-sm text-green-600 mt-4">
                  ✓ Video uploaded successfully! Fill in details below.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Video URL *</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required={uploadType === "url"}
                data-testid="input-url"
              />
              <p className="text-xs text-muted-foreground">
                Supports YouTube, Vimeo, and other embeddable video platforms
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            type="text"
            placeholder="e.g., Diagnosing P0300 Random Misfire Code - Ford F-150"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            data-testid="input-title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe what viewers will learn in this video..."
            className="h-32 resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="input-description"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select value={category} onValueChange={setCategory} required>
            <SelectTrigger id="category" data-testid="select-category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="engine-faults">Engine Faults</SelectItem>
              <SelectItem value="ignition">Ignition</SelectItem>
              <SelectItem value="cooling">Cooling System</SelectItem>
              <SelectItem value="sensors">Sensors</SelectItem>
              <SelectItem value="tools-tips">Tools & Tips</SelectItem>
              <SelectItem value="transmission">Transmission</SelectItem>
              <SelectItem value="electrical">Electrical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              type="text"
              placeholder="Add tags (e.g., P0300, misfire, Ford)"
              value={currentTag}
              onChange={(e) => setCurrentTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              data-testid="input-tags"
            />
            <Button type="button" onClick={handleAddTag} variant="secondary">
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover-elevate rounded-sm p-0.5"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button 
          type="submit" 
          size="lg" 
          className="w-full md:w-auto" 
          data-testid="button-submit-upload"
          disabled={createVideoMutation.isPending}
        >
          {createVideoMutation.isPending ? "Uploading..." : "Submit Video"}
        </Button>
      </form>
    </Card>
  );
}
