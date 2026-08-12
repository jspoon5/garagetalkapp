import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Heart, Eye, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PodcastCardProps {
  id: string;
  title: string;
  description: string;
  uploader: string;
  views: number;
  likes: number;
  duration: number;
  category: string;
  createdAt: Date | string;
  isFeatured?: boolean;
}

export default function PodcastCard({
  id,
  title,
  description,
  uploader,
  views,
  likes,
  duration,
  category,
  createdAt,
  isFeatured,
}: PodcastCardProps) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Link href={`/podcast/${id}`}>
      <Card 
        data-testid={`card-podcast-${id}`}
        className="hover-elevate active-elevate-2 cursor-pointer transition-all h-full"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 text-primary rounded-full p-2">
                <Play className="w-4 h-4 fill-current" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {formatDuration(duration)}
              </span>
            </div>
            {isFeatured && (
              <Badge variant="default" className="gap-1">
                <Star className="w-3 h-3 fill-current" />
                Featured
              </Badge>
            )}
          </div>
          <CardTitle className="line-clamp-2 text-lg" data-testid={`text-title-${id}`}>
            {title}
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs font-medium">
                  {uploader.substring(0, 1).toUpperCase()}
                </span>
              </div>
              <span className="text-muted-foreground truncate" data-testid={`text-uploader-${id}`}>
                {uploader}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {category}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span data-testid={`text-views-${id}`}>{views.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
              <span data-testid={`text-likes-${id}`}>{likes.toLocaleString()}</span>
            </div>
            <span>
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
