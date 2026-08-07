import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExclamationTriangleIcon, ChatBubbleLeftRightIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { Link } from "wouter";

interface AISearchResultProps {
  query: string;
  summary: string;
  suggestedFixes: string[];
  relatedVideos: Array<{
    id: string;
    title: string;
    thumbnail: string | null;
    url?: string;
    embedUrl?: string;
  }>;
  suggestedRoom?: string;
}

export default function AISearchResult({
  query,
  summary,
  suggestedFixes,
  relatedVideos,
  suggestedRoom,
}: AISearchResultProps) {
  // Ensure arrays are always safe to iterate
  const safeFixes = Array.isArray(suggestedFixes) ? suggestedFixes : [];
  const safeVideos = Array.isArray(relatedVideos) ? relatedVideos : [];

  return (
    <Card className="p-6" data-testid="card-ai-result">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-primary font-bold text-xs">GA</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-2">Gearhead Agent Diagnosis: {query}</h2>
          <p className="text-muted-foreground">{summary || "No diagnosis available."}</p>
        </div>
      </div>

      <div className="space-y-4">
        {safeFixes.length > 0 && (
          <div>
            <h3 className="font-medium mb-2">Suggested Fixes:</h3>
            <ul className="space-y-2">
              {safeFixes.map((fix, idx) => (
                <li key={idx} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">{idx + 1}.</span>
                  <span>{fix}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {suggestedRoom && (
          <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-md">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-accent-foreground" />
            <span className="text-sm flex-1">Discuss this issue in the chat room:</span>
            <Link href={`/chat/${suggestedRoom}`}>
              <Button size="sm" variant="default" data-testid="button-join-chat">
                Join #{suggestedRoom}
              </Button>
            </Link>
          </div>
        )}

        {safeVideos.length > 0 && (
          <div>
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <VideoCameraIcon className="h-5 w-5" />
              Related Videos from YouTube:
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {safeVideos.map((video) => (
                <div key={video.id} className="border rounded-md overflow-hidden">
                {video.embedUrl ? (
                  <div className="aspect-video">
                    <iframe
                      width="100%"
                      height="100%"
                      src={video.embedUrl}
                      title={video.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <Link href={`/video/${video.id}`}>
                    <div className="hover-elevate active-elevate-2 cursor-pointer">
                      <img 
                        src={video.thumbnail || "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=640&h=360&fit=crop"} 
                        alt={video.title} 
                        className="w-full aspect-video object-cover" 
                      />
                    </div>
                  </Link>
                )}
                <div className="p-3">
                  <p className="font-medium line-clamp-2">{video.title}</p>
                  {video.url && (
                    <a 
                      href={video.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      Watch on YouTube →
                    </a>
                  )}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border-l-4 border-destructive">
          <ExclamationTriangleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Disclaimer: AI-generated suggestions are for informational purposes only. Always consult a professional mechanic for accurate diagnosis and repairs.
          </p>
        </div>
      </div>
    </Card>
  );
}
