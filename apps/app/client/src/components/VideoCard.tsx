import { type MouseEvent } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EyeIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Trash2 } from "lucide-react";

interface VideoCardProps {
  id: string;
  title: string;
  thumbnail: string;
  uploader: string;
  uploaderAvatar?: string;
  views: number;
  uploadedAt: string;
  category: string;
  duration?: string;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

export default function VideoCard({
  id,
  title,
  thumbnail,
  uploader,
  uploaderAvatar,
  views,
  uploadedAt,
  category,
  duration,
  onDelete,
  isDeleting,
}: VideoCardProps) {
  const handleDelete = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete(id);
    }
  };

  return (
    <Card className="overflow-visible hover-elevate active-elevate-2 cursor-pointer relative" data-testid={`card-video-${id}`}>
      <Link href={`/video/${id}`}>
        <div className="relative aspect-video bg-muted rounded-t-md overflow-hidden">
          <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
          {duration && (
            <Badge className="absolute bottom-2 right-2 bg-background/90 text-foreground">
              {duration}
            </Badge>
          )}
        </div>
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-9 w-9 mt-1">
              <AvatarImage src={uploaderAvatar} alt={uploader} />
              <AvatarFallback>{uploader[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-base line-clamp-2 mb-1" data-testid={`text-title-${id}`}>
                {title}
              </h3>
              <p className="text-sm text-muted-foreground mb-2">{uploader}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <EyeIcon className="h-4 w-4" />
                  <span>{views.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ClockIcon className="h-4 w-4" />
                  <span>{uploadedAt}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {category}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Link>
      {onDelete && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-2 right-2 z-10"
          onClick={handleDelete}
          disabled={isDeleting}
          data-testid={`button-delete-video-${id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </Card>
  );
}
