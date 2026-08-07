import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Play, Pause, Heart, Eye, MessageSquare, Send, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { PodcastEpisode, PodcastThread, PodcastComment } from "@shared/schema";

export default function PodcastEpisodePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadContent, setNewThreadContent] = useState("");
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  const { data: episode, isLoading } = useQuery<PodcastEpisode>({
    queryKey: ["/api/podcasts", id],
    queryFn: async () => {
      const response = await fetch(`/api/podcasts/${id}`);
      if (!response.ok) throw new Error("Failed to fetch episode");
      return response.json();
    },
    enabled: !!id,
  });

  const { data: threads = [] } = useQuery<PodcastThread[]>({
    queryKey: ["/api/podcasts", id, "threads"],
    queryFn: async () => {
      const response = await fetch(`/api/podcasts/${id}/threads`);
      if (!response.ok) throw new Error("Failed to fetch threads");
      return response.json();
    },
    enabled: !!id,
  });

  const { data: comments = [] } = useQuery<PodcastComment[]>({
    queryKey: ["/api/podcasts/threads", selectedThread, "comments"],
    queryFn: async () => {
      const response = await fetch(`/api/podcasts/threads/${selectedThread}/comments`);
      if (!response.ok) throw new Error("Failed to fetch comments");
      return response.json();
    },
    enabled: !!selectedThread,
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/podcasts/${id}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts", id] });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return await apiRequest("POST", `/api/podcasts/${id}/threads`, {
        ...data,
        userId: "default-user-id",
        username: "MechnicPro",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts", id, "threads"] });
      setNewThreadTitle("");
      setNewThreadContent("");
      toast({
        title: "Thread created",
        description: "Your discussion thread has been posted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create thread",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { threadId: string; content: string }) => {
      return await apiRequest("POST", `/api/podcasts/threads/${data.threadId}/comments`, {
        content: data.content,
        userId: "default-user-id",
        username: "MechnicPro",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/threads", selectedThread, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts", id, "threads"] });
      setNewComment("");
      toast({
        title: "Comment posted",
        description: "Your comment has been added",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to post comment",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCreateThread = () => {
    if (!newThreadTitle.trim() || !newThreadContent.trim()) return;
    createThreadMutation.mutate({
      title: newThreadTitle,
      content: newThreadContent,
    });
  };

  const handleCreateComment = () => {
    if (!newComment.trim() || !selectedThread) return;
    createCommentMutation.mutate({
      threadId: selectedThread,
      content: newComment,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <Skeleton className="w-full h-64 mb-8" />
          <Skeleton className="w-3/4 h-8 mb-4" />
          <Skeleton className="w-1/2 h-4 mb-8" />
          <Skeleton className="w-full h-48" />
        </main>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Episode not found</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Audio Player */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2" data-testid="text-episode-title">
                  {episode.title}
                </CardTitle>
                <CardDescription>{episode.description}</CardDescription>
                
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <Badge variant="secondary">{episode.category}</Badge>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      <span data-testid="text-views">{episode.views}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Heart className="w-4 h-4" />
                      <span data-testid="text-likes">{episode.likes}</span>
                    </div>
                    <span>
                      {formatDistanceToNow(new Date(episode.createdAt!), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
              
              <Button
                data-testid="button-like"
                onClick={() => likeMutation.mutate()}
                variant="outline"
                size="lg"
              >
                <Heart className="w-5 h-5 mr-2" />
                Like
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <audio ref={audioRef} src={episode.audioUrl} preload="metadata" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button
                  data-testid="button-play-pause"
                  onClick={togglePlay}
                  size="lg"
                  className="rounded-full"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                
                <div className="flex-1">
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full"
                    data-testid="slider-progress"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
                
                <Button
                  data-testid="button-mute"
                  onClick={toggleMute}
                  variant="ghost"
                  size="icon"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Discussion Threads */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Discussion Forum</h2>
          
          {/* Create New Thread */}
          <Card>
            <CardHeader>
              <CardTitle>Start a Discussion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                data-testid="input-thread-title"
                placeholder="Thread title..."
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
              />
              <Textarea
                data-testid="input-thread-content"
                placeholder="Share your thoughts about this episode..."
                value={newThreadContent}
                onChange={(e) => setNewThreadContent(e.target.value)}
                rows={3}
              />
              <Button
                data-testid="button-create-thread"
                onClick={handleCreateThread}
                disabled={createThreadMutation.isPending || !newThreadTitle.trim() || !newThreadContent.trim()}
              >
                <Send className="w-4 h-4 mr-2" />
                Post Thread
              </Button>
            </CardContent>
          </Card>

          {/* Thread List */}
          <div className="space-y-4">
            {threads.map((thread) => (
              <Card key={thread.id} data-testid={`card-thread-${thread.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{thread.title}</CardTitle>
                      <CardDescription>
                        by {thread.username} • {formatDistanceToNow(new Date(thread.createdAt!), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {thread.commentCount}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">{thread.content}</p>
                  
                  <Button
                    data-testid={`button-view-thread-${thread.id}`}
                    variant={selectedThread === thread.id ? "default" : "outline"}
                    onClick={() => setSelectedThread(selectedThread === thread.id ? null : thread.id)}
                  >
                    {selectedThread === thread.id ? "Hide" : "View"} Comments
                  </Button>
                  
                  {selectedThread === thread.id && (
                    <div className="mt-6 space-y-4">
                      {/* Comments */}
                      <div className="space-y-3">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            data-testid={`comment-${comment.id}`}
                            className="border-l-2 border-primary/20 pl-4"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{comment.username}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(comment.createdAt!), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                      
                      {/* Add Comment */}
                      <div className="flex gap-2">
                        <Textarea
                          data-testid={`input-comment-${thread.id}`}
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                        <Button
                          data-testid={`button-add-comment-${thread.id}`}
                          onClick={handleCreateComment}
                          disabled={createCommentMutation.isPending || !newComment.trim()}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            
            {threads.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No discussions yet. Be the first to start one!
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
