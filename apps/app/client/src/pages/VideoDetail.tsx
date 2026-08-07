import { useRoute } from "wouter";
import Header from "@/components/Header";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { HeartIcon, BookmarkIcon, ShareIcon, EyeIcon } from "@heroicons/react/24/outline";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TierBasedAdSense } from "@/components/AdSense";
import type { Video, VideoComment } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function VideoDetail() {
  const [, params] = useRoute("/video/:id");
  const [comment, setComment] = useState("");
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { subscriptionTier, userId, isLoading: isLoadingUser } = useCurrentUser();
  const { toast } = useToast();

  const { data: video, isLoading } = useQuery<Video>({
    queryKey: ["/api/videos", params?.id],
    enabled: !!params?.id,
  });

  const { data: comments = [], isLoading: isLoadingComments } = useQuery<VideoComment[]>({
    queryKey: ["/api/videos", params?.id, "comments"],
    enabled: !!params?.id,
  });

  const postCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("POST", `/api/videos/${params?.id}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", params?.id, "comments"] });
      setComment("");
      toast({
        title: "Comment posted",
        description: "Your comment has been added successfully.",
      });
    },
    onError: (error: any) => {
      const message = error.message || "Failed to post comment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest("DELETE", `/api/videos/${params?.id}/comments/${commentId}`);
    },
    onSuccess: () => {
      // Invalidate video comments cache
      queryClient.invalidateQueries({ queryKey: ["/api/videos", params?.id, "comments"] });
      // Invalidate user comments cache so dashboard updates immediately
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "comments"] });
      }
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed successfully.",
      });
    },
    onError: (error: any) => {
      const message = error.message || "Failed to delete comment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const relatedVideos = [
    {
      id: "2",
      title: "How to Replace Spark Plugs - Complete Guide",
      thumbnail: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=400&h=225&fit=crop",
      uploader: "AutoPro Sarah",
      uploaderAvatar: "https://api.dicebear.com/7.x/initials/svg?seed=AS",
      views: 8200,
      uploadedAt: "5 days ago",
      category: "Ignition",
      duration: "12:20",
    },
    {
      id: "3",
      title: "Testing Ignition Coils with Multimeter",
      thumbnail: "https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=400&h=225&fit=crop",
      uploader: "TechMike",
      uploaderAvatar: "https://api.dicebear.com/7.x/initials/svg?seed=TM",
      views: 15600,
      uploadedAt: "1 week ago",
      category: "Ignition",
      duration: "6:30",
    },
  ];

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    postCommentMutation.mutate(comment.trim());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="aspect-video bg-muted rounded-md mb-4" />
            <div className="h-8 bg-muted rounded w-3/4 mb-4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </main>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Video not found</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <VideoPlayer url={video.url} title={video.title} />

            <div className="mb-6 mt-4">
              <h1 className="text-2xl font-bold mb-3">{video.title}</h1>
              
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${video.uploaderName}`} alt={video.uploaderName} />
                    <AvatarFallback>{video.uploaderName[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{video.uploaderName}</p>
                    <p className="text-sm text-muted-foreground">Mechanic</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" className="gap-2" data-testid="button-like">
                    <HeartIcon className="h-4 w-4" />
                    {video.likes}
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-2" data-testid="button-save">
                    <BookmarkIcon className="h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-2" data-testid="button-share">
                    <ShareIcon className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>

              <Card className="p-4 mb-6">
                <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
                  <div className="flex items-center gap-1">
                    <EyeIcon className="h-4 w-4" />
                    <span className="font-medium" data-testid="text-views">{video.views?.toLocaleString() || 0} views</span>
                  </div>
                  {video.createdAt && (
                    <span className="text-muted-foreground">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  <Badge variant="secondary">{video.category}</Badge>
                  {video.tags && video.tags.length > 0 && (
                    video.tags.map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))
                  )}
                </div>
                
                {video.description && (
                  <>
                    <div className={showFullDescription ? "" : "max-h-24 overflow-hidden"}>
                      <p className="text-sm">{video.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="mt-2 p-0 h-auto"
                      data-testid="button-toggle-description"
                    >
                      {showFullDescription ? "Show less" : "Show more"}
                    </Button>
                  </>
                )}
              </Card>

              <Card className="p-4 mb-6">
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">Video URL:</p>
                  <p className="break-all">{video.url}</p>
                </div>
              </Card>
              
              {!isLoadingUser && (
                <TierBasedAdSense 
                  userTier={subscriptionTier}
                  adPosition="middle"
                  slot="5566778899"
                  format="auto"
                  className="my-6"
                />
              )}

              <div>
                <h3 className="font-semibold text-lg mb-4">Comments ({comments.length})</h3>
                
                <form onSubmit={handlePostComment} className="mb-6">
                  <Textarea
                    placeholder={subscriptionTier === "amateur" ? "Upgrade to Gearhead or higher to comment..." : "Add a comment..."}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="mb-2 resize-none"
                    data-testid="input-comment"
                    disabled={subscriptionTier === "amateur" || postCommentMutation.isPending}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setComment("")}
                      disabled={postCommentMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      size="sm" 
                      disabled={!comment.trim() || subscriptionTier === "amateur" || postCommentMutation.isPending}
                      data-testid="button-post-comment"
                    >
                      {postCommentMutation.isPending ? "Posting..." : "Comment"}
                    </Button>
                  </div>
                </form>

                {isLoadingComments ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="h-9 w-9 rounded-full bg-muted" />
                        <div className="flex-1">
                          <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                          <div className="h-3 bg-muted rounded w-3/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length > 0 ? (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                        <Avatar className="h-9 w-9">
                          <AvatarImage 
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.username}`} 
                            alt={comment.username} 
                          />
                          <AvatarFallback>{comment.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{comment.username}</span>
                              <span className="text-xs text-muted-foreground">
                                {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                            {userId === comment.userId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                                disabled={deleteCommentMutation.isPending}
                                data-testid={`button-delete-comment-${comment.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No comments yet. Be the first to comment!
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            {!isLoadingUser && (
              <TierBasedAdSense 
                userTier={subscriptionTier}
                adPosition="sidebar"
                slot="9988776655"
                format="auto"
                className="mb-6"
              />
            )}
            
            <h3 className="font-semibold text-lg mb-4">Related Videos</h3>
            <div className="space-y-4">
              {relatedVideos.map((video) => (
                <VideoCard key={video.id} {...video} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
