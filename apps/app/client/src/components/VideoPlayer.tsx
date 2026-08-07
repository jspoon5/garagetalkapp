interface VideoPlayerProps {
  url: string;
  title: string;
}

export default function VideoPlayer({ url, title }: VideoPlayerProps) {
  // Check if it's a YouTube URL and extract video ID
  const getYouTubeEmbedUrl = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    
    if (match && match[2] && match[2].length > 0) {
      return `https://www.youtube.com/embed/${match[2]}`;
    }
    return null;
  };

  // Check if it's a Vimeo URL and extract video ID
  const getVimeoEmbedUrl = (url: string): string | null => {
    const regExp = /(?:vimeo)\.com.*(?:videos|video|channels|)\/([\d]+)/i;
    const match = url.match(regExp);
    
    if (match) {
      return `https://player.vimeo.com/video/${match[1]}`;
    }
    return null;
  };

  // Determine the embed URL
  const getEmbedUrl = (): string | null => {
    // Check if it's an uploaded video (starts with /videos/)
    if (url.startsWith('/videos/')) {
      return url;
    }

    // Try YouTube
    const youtubeUrl = getYouTubeEmbedUrl(url);
    if (youtubeUrl) return youtubeUrl;

    // Try Vimeo
    const vimeoUrl = getVimeoEmbedUrl(url);
    if (vimeoUrl) return vimeoUrl;

    // If it's already an embed URL, use it
    if (url.includes('youtube.com/embed') || url.includes('player.vimeo.com')) {
      return url;
    }

    return null;
  };

  const embedUrl = getEmbedUrl();

  if (!embedUrl) {
    return (
      <div className="aspect-video bg-muted rounded-md flex items-center justify-center">
        <p className="text-muted-foreground">Unable to embed video. Invalid URL format.</p>
      </div>
    );
  }

  // For uploaded videos, use video element
  if (url.startsWith('/videos/')) {
    return (
      <div className="aspect-video bg-black rounded-md overflow-hidden">
        <video
          controls
          className="w-full h-full"
          src={embedUrl}
          title={title}
          data-testid="video-player"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // For embedded videos (YouTube, Vimeo), use iframe
  return (
    <div className="aspect-video bg-black rounded-md overflow-hidden">
      <iframe
        src={embedUrl}
        title={title}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        data-testid="video-player"
      />
    </div>
  );
}
