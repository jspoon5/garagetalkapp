import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClockIcon, PlayIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  views: number;
  duration?: number;
}

interface VideoView {
  id: string;
  userId: string;
  videoId: string;
  viewedAt: string;
  playbackPosition?: number;
  video?: Video;
}

export function RecentlyWatchedCarousel() {
  const { t } = useTranslation();
  
  const { data: recentViews, isLoading, isError } = useQuery<VideoView[]>({
    queryKey: ['/api/users/me/recent-views'],
    retry: false,
  });

  if (isLoading) {
    return (
      <section className="py-12 px-4" data-testid="section-recently-watched">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <ClockIcon className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Recently Watched</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <CardContent className="p-3">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError || !recentViews || recentViews.length === 0) {
    return null;
  }

  return (
    <section className="py-12 px-4 bg-muted/20" data-testid="section-recently-watched">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Recently Watched</h2>
          </div>
          <Link href="/browse">
            <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid="link-view-all-videos">
              View all videos
            </Badge>
          </Link>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-muted scrollbar-thumb-muted-foreground/30">
          {recentViews.map((view) => {
            if (!view.video) return null;
            
            const video = view.video;
            const watchedTime = formatDistanceToNow(new Date(view.viewedAt), { addSuffix: true });
            
            return (
              <Link key={view.id} href={`/video/${video.id}`}>
                <Card 
                  className="overflow-hidden hover-elevate cursor-pointer flex-shrink-0 w-[200px] md:w-[240px]"
                  data-testid={`card-recent-video-${video.id}`}
                >
                  <div className="relative aspect-video bg-muted">
                    {video.thumbnailUrl ? (
                      <img 
                        src={video.thumbnailUrl} 
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PlayIcon className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                      <PlayIcon className="h-12 w-12 text-white" />
                    </div>
                    {view.playbackPosition && view.playbackPosition > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/30">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${Math.min((view.playbackPosition / (video.duration || 300)) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1" title={video.title}>
                      {video.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <EyeIcon className="h-3 w-3" />
                        <span>{video.views || 0}</span>
                      </div>
                      <span className="text-muted-foreground/50">•</span>
                      <span>{watchedTime}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
