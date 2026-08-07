import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/Header";
import DashboardStats from "@/components/DashboardStats";
import ActivityFeed from "@/components/ActivityFeed";
import VideoCard from "@/components/VideoCard";
import ProfileEditDialog from "@/components/ProfileEditDialog";
import { ScheduleSessionDialog } from "@/components/ScheduleSessionDialog";
import { ScheduledSessionsList } from "@/components/ScheduledSessionsList";
import RequireContactInfo from "@/components/RequireContactInfo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Video, VideoComment } from "@shared/schema";
import { MessageSquare, LogOut, Calendar, Upload, Monitor, Zap, Check, Trash2, RotateCcw, Video as VideoIcon } from "lucide-react";
import ScreenShareDialog from "@/components/ScreenShareDialog";
import MyGarage from "@/components/MyGarage";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [showScreenShare, setShowScreenShare] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  
  const userTier = user?.subscriptionTier || "amateur";
  const canScreenShare = ["gearhead", "racing_pro", "pro"].includes(userTier);
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch("/api/auth/sign-out", { method: "POST" });
      toast({ title: "Signed out successfully" });
      setLocation("/sign-in");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Fetch dashboard stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!user,
  });

  // Fetch dashboard activity
  const { data: activity, isLoading: isLoadingActivity } = useQuery<{
    uploads: Video[];
    searches: Array<{ query: string; timestamp: string }>;
  }>({
    queryKey: ["/api/dashboard/activity"],
    enabled: !!user,
  });

  // Fetch user's comments
  const { data: userComments = [], isLoading: isLoadingComments } = useQuery<VideoComment[]>({
    queryKey: ["/api/users", user?.id, "comments"],
    enabled: !!user?.id,
  });

  // Fetch deleted videos (recycle bin)
  const { data: deletedVideos = [], isLoading: isLoadingDeleted } = useQuery<Video[]>({
    queryKey: ["/api/videos/recycle-bin"],
    enabled: !!user,
  });

  // Delete video mutation
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("DELETE", `/api/videos/${videoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/recycle-bin"] });
      toast({ title: "Video deleted successfully" });
      setDeletingVideoId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete video", variant: "destructive" });
      setDeletingVideoId(null);
    },
  });

  const handleDeleteVideo = (videoId: string) => {
    if (confirm("Are you sure you want to delete this video? The video will be moved to the recycle bin.")) {
      setDeletingVideoId(videoId);
      deleteVideoMutation.mutate(videoId);
    }
  };

  // Restore video mutation
  const [restoringVideoId, setRestoringVideoId] = useState<string | null>(null);
  const restoreVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("POST", `/api/videos/${videoId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos/recycle-bin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Video restored successfully" });
      setRestoringVideoId(null);
    },
    onError: () => {
      toast({ title: "Failed to restore video", variant: "destructive" });
      setRestoringVideoId(null);
    },
  });

  // Permanent delete mutation
  const [purgingVideoId, setPurgingVideoId] = useState<string | null>(null);
  const purgeVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("DELETE", `/api/videos/${videoId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos/recycle-bin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Video permanently deleted" });
      setPurgingVideoId(null);
    },
    onError: () => {
      toast({ title: "Failed to permanently delete video", variant: "destructive" });
      setPurgingVideoId(null);
    },
  });

  const handleRestoreVideo = (videoId: string) => {
    setRestoringVideoId(videoId);
    restoreVideoMutation.mutate(videoId);
  };

  const handlePurgeVideo = (videoId: string) => {
    if (confirm("Are you sure you want to PERMANENTLY delete this video? This action cannot be undone.")) {
      setPurgingVideoId(videoId);
      purgeVideoMutation.mutate(videoId);
    }
  };

  // Redirect to sign-in if not authenticated
  if (!isLoadingUser && !user) {
    setLocation("/sign-in");
    return null;
  }

  return (
    <RequireContactInfo user={user}>
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Profile Card */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username}`} alt={user?.username} />
                <AvatarFallback>{user?.username?.substring(0, 2).toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Your Dashboard</h1>
                <p className="text-muted-foreground">Welcome back, {user?.username}!</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/upload">
                  <Button 
                    variant="outline"
                    data-testid="button-upload"
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                </Link>
                <Button
                  onClick={() => setShowRecycleBin(true)}
                  className="gap-2 bg-black text-white hover:bg-black/90"
                  data-testid="button-recycle-bin"
                >
                  <Trash2 className="h-4 w-4 text-white" />
                  Recycle Bin {deletedVideos.length > 0 && `(${deletedVideos.length})`}
                </Button>
                {canScreenShare && (
                  <Button 
                    variant="outline"
                    onClick={() => setShowScreenShare(true)}
                    data-testid="button-share-screen"
                    className="gap-2"
                  >
                    <Monitor className="h-4 w-4" />
                    Share Screen
                  </Button>
                )}
                <a href="https://occular-stream--garagegrouphold.replit.app/dashboard" target="_blank" rel="noopener noreferrer">
                  <Button 
                    variant="outline"
                    data-testid="button-streaming-key"
                    className="gap-2"
                  >
                    <VideoIcon className="h-4 w-4" />
                    Live Streaming Key
                  </Button>
                </a>
                {user?.subscriptionTier !== "amateur" && (
                  <Button 
                    onClick={() => setScheduleDialogOpen(true)}
                    data-testid="button-schedule-session"
                    className="gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Schedule
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={() => setEditProfileOpen(true)}
                  data-testid="button-edit-profile"
                >
                  Edit Profile
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  data-testid="button-logout"
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <ProfileEditDialog
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
          userId={user?.id || ""}
        />
        
        <ScheduleSessionDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
        />
        
        <ScreenShareDialog
          open={showScreenShare}
          onOpenChange={setShowScreenShare}
          userName={user?.username || "Mechanic"}
        />

        {/* Recent Uploads and Recycle Bin - TOP OF PAGE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowRecycleBin(false)}
                  className={`text-2xl font-semibold transition-colors ${!showRecycleBin ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="tab-uploaded-videos"
                >
                  {showRecycleBin ? "← Back to Videos" : "Your Uploaded Videos"}
                </button>
              </div>
            </div>
            
            {!showRecycleBin ? (
              <>
                {isLoadingActivity ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-64" />
                    ))}
                  </div>
                ) : activity?.uploads && activity.uploads.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activity.uploads.map((video) => (
                      <VideoCard
                        key={video.id}
                        id={video.id}
                        title={video.title}
                        thumbnail={video.thumbnail || `https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=225&fit=crop`}
                        uploader={video.uploaderName}
                        uploaderAvatar={`https://api.dicebear.com/7.x/initials/svg?seed=${video.uploaderName}`}
                        views={video.views || 0}
                        uploadedAt={new Date(video.createdAt!).toLocaleDateString()}
                        category={video.category}
                        duration={video.duration || ""}
                        onDelete={handleDeleteVideo}
                        isDeleting={deletingVideoId === video.id}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="p-6">
                    <p className="text-muted-foreground text-center">No videos uploaded yet. <a href="/upload" className="text-primary hover:underline">Upload your first video!</a></p>
                  </Card>
                )}
              </>
            ) : (
              <>
                {isLoadingDeleted ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-64" />
                    ))}
                  </div>
                ) : deletedVideos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {deletedVideos.map((video) => (
                      <Card key={video.id} className="overflow-hidden" data-testid={`deleted-video-${video.id}`}>
                        <div className="aspect-video bg-muted relative">
                          <img
                            src={video.thumbnail || `https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=225&fit=crop`}
                            alt={video.title}
                            className="w-full h-full object-cover opacity-50"
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Trash2 className="h-12 w-12 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="font-medium line-clamp-1 mb-1">{video.title}</h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            Deleted {video.deletedAt ? new Date(video.deletedAt).toLocaleDateString() : "recently"}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleRestoreVideo(video.id)}
                              disabled={restoringVideoId === video.id || purgingVideoId === video.id}
                              data-testid={`button-restore-${video.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              {restoringVideoId === video.id ? "Restoring..." : "Restore"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handlePurgeVideo(video.id)}
                              disabled={restoringVideoId === video.id || purgingVideoId === video.id}
                              data-testid={`button-purge-${video.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {purgingVideoId === video.id ? "Deleting..." : "Delete Forever"}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-6">
                    <p className="text-muted-foreground text-center">Recycle bin is empty.</p>
                  </Card>
                )}
              </>
            )}
          </div>

          <div className="lg:col-span-1">
            {isLoadingActivity ? (
              <Skeleton className="h-96" />
            ) : (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                <div className="space-y-3">
                  {activity?.searches && activity.searches.length > 0 ? (
                    activity.searches.map((search: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-md bg-muted/50">
                        <p className="text-sm font-medium">Searched: {search.query}</p>
                        <p className="text-xs text-muted-foreground">{search.timestamp}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Upgrade Card - for free tier users */}
        {user?.subscriptionTier === "amateur" && (
          <div className="mb-8">
            <Card className="p-6 bg-gradient-to-r from-primary/10 via-background to-primary/5 border-primary/20">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Upgrade Your Plan</h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    Unlock unlimited Gearhead Agent queries, video uploads, live streaming, and start earning with profit sharing!
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-primary" />
                      Unlimited AI queries
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-primary" />
                      Video uploads
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-primary" />
                      Live streaming
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-primary" />
                      Profit sharing
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Link href="/subscription-tiers">
                    <Button variant="outline" data-testid="button-view-plans">
                      View Plans
                    </Button>
                  </Link>
                  <Link href="/subscribe?tier=gearhead">
                    <Button data-testid="button-upgrade-now">
                      Upgrade Now
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Scheduled Sessions Section - for paid tiers */}
        {user?.subscriptionTier !== "amateur" && (
          <div className="mb-8">
            <ScheduledSessionsList />
          </div>
        )}

        {/* Stats Section */}
        <div className="mb-8">
          {isLoadingStats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <DashboardStats
              videosUploaded={stats?.videosUploaded || 0}
              searchesPerformed={stats?.searchesPerformed || 0}
              activeChats={stats?.activeChats || 0}
              savedVideos={0}
            />
          )}
        </div>

        {/* My Garage Section */}
        <div className="mb-8">
          <MyGarage />
        </div>

        {/* User Comments Section */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5" />
              <h2 className="text-xl font-semibold">Your Comments</h2>
              <span className="text-sm text-muted-foreground">({userComments.length})</span>
            </div>
            {isLoadingComments ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : userComments.length > 0 ? (
              <div className="space-y-3" data-testid="user-comments-list">
                {userComments.slice(0, 10).map((comment) => (
                  <div key={comment.id} className="p-3 rounded-md bg-muted/50" data-testid={`user-comment-${comment.id}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link href={`/video/${comment.videoId}`}>
                        <a className="text-sm font-medium text-primary hover:underline">
                          View Video →
                        </a>
                      </Link>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                ))}
                {userComments.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing 10 most recent comments
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No comments yet. Visit videos and start commenting!
              </p>
            )}
          </Card>
        </div>
      </main>
    </div>
    </RequireContactInfo>
  );
}
