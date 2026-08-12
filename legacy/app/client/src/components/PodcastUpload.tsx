import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPodcastEpisodeSchema, type InsertPodcastEpisode } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PodcastUploadProps {
  onSuccess?: () => void;
}

export default function PodcastUpload({ onSuccess }: PodcastUploadProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const form = useForm<InsertPodcastEpisode>({
    resolver: zodResolver(insertPodcastEpisodeSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "Engine Diagnostics",
      tags: [],
      uploaderId: "default-user-id",
      uploaderName: "MechnicPro",
      uploaderTier: "amateur",
      audioUrl: "",
      duration: 0,
    },
  });

  const createPodcastMutation = useMutation({
    mutationFn: async (data: InsertPodcastEpisode) => {
      return await apiRequest("POST", "/api/podcasts", data);
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Podcast episode uploaded successfully",
      });
      form.reset();
      setAudioFile(null);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload podcast episode",
        variant: "destructive",
      });
    },
  });

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("audio/")) {
      setAudioFile(file);
      
      // Get audio duration
      const audio = new Audio(URL.createObjectURL(file));
      audio.addEventListener("loadedmetadata", () => {
        form.setValue("duration", Math.floor(audio.duration));
      });
    } else {
      toast({
        title: "Invalid file",
        description: "Please select an audio file (MP3, WAV, etc.)",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: InsertPodcastEpisode) => {
    if (!audioFile) {
      toast({
        title: "No audio file",
        description: "Please select an audio file to upload",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);

      // Get upload URL from backend
      const response = await fetch("/api/podcasts/upload-url");
      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }
      const { uploadURL, audioId } = await response.json();

      // Upload audio file to object storage
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": audioFile.type,
        },
        body: audioFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload audio file");
      }

      // Create podcast episode with audio URL
      const audioUrl = `/podcasts/${audioId}`;
      await createPodcastMutation.mutateAsync({
        ...data,
        audioUrl,
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload podcast",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Episode Title</FormLabel>
              <FormControl>
                <Input
                  data-testid="input-title"
                  placeholder="E.g., Diagnosing Check Engine Lights"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  data-testid="input-description"
                  placeholder="Describe what listeners will learn in this episode..."
                  rows={4}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Engine Diagnostics">Engine Diagnostics</SelectItem>
                  <SelectItem value="Repair Techniques">Repair Techniques</SelectItem>
                  <SelectItem value="Shop Tips">Shop Tips</SelectItem>
                  <SelectItem value="Tool Reviews">Tool Reviews</SelectItem>
                  <SelectItem value="Industry News">Industry News</SelectItem>
                  <SelectItem value="Q&A Sessions">Q&A Sessions</SelectItem>
                  <SelectItem value="Case Studies">Case Studies</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>Audio File</FormLabel>
          <div className="mt-2">
            <Input
              data-testid="input-audio"
              type="file"
              accept="audio/*"
              onChange={handleAudioChange}
              className="cursor-pointer"
            />
          </div>
          {audioFile && (
            <p className="text-sm text-muted-foreground mt-2">
              Selected: {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          <FormDescription>
            Upload MP3, WAV, or other audio formats
          </FormDescription>
        </div>

        <Button
          data-testid="button-submit"
          type="submit"
          disabled={uploading || createPodcastMutation.isPending}
          className="w-full"
          size="lg"
        >
          {uploading || createPodcastMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Podcast
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
