import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import VideoCard from "@/components/VideoCard";
import CategoryFilter from "@/components/CategoryFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBasedAdSense } from "@/components/AdSense";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Video } from "@shared/schema";

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { subscriptionTier, isLoading: isLoadingUser } = useCurrentUser();

  const categories = [
    "Engine Faults",
    "Ignition",
    "Cooling System",
    "Sensors",
    "Tools & Tips",
    "Transmission",
    "Electrical"
  ];

  // Check URL for search parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSearch = params.get('search');
    if (urlSearch) {
      setSearchQuery(urlSearch);
      setSelectedCategory(null); // Clear category filter when searching
    }
  }, []);

  const { data: videos = [], isLoading } = useQuery<Video[]>({
    queryKey: ["/api/videos", selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) {
        params.append("category", selectedCategory);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const response = await fetch(`/api/videos?${params}`);
      if (!response.ok) throw new Error("Failed to fetch videos");
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Automotive Repair Videos</h1>
          <p className="text-muted-foreground">
            Learn from experienced mechanics and troubleshoot engine problems
          </p>
        </div>

        <div className="mb-6">
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="w-full h-48 rounded-md" />
                <Skeleton className="w-3/4 h-4" />
                <Skeleton className="w-1/2 h-4" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {!isLoadingUser && (
              <TierBasedAdSense 
                userTier={subscriptionTier}
                adPosition="top"
                slot="1234567890"
                format="auto"
                className="mb-6"
              />
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((video, index) => (
                <VideoCard
                  key={video.id}
                  id={video.id}
                  title={video.title}
                  thumbnail={video.thumbnail || "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=225&fit=crop"}
                  uploader={video.uploaderName}
                  uploaderAvatar={`https://api.dicebear.com/7.x/initials/svg?seed=${video.uploaderName}`}
                  views={video.views || 0}
                  uploadedAt={formatTimeAgo(video.createdAt)}
                  category={video.category}
                  duration={video.duration || "0:00"}
                />
              ))}
              
              {videos.length >= 8 && !isLoadingUser && (
                <div className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                  <TierBasedAdSense 
                    userTier={subscriptionTier}
                    adPosition="middle"
                    slot="0987654321"
                    format="auto"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {!isLoading && videos.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No videos found {selectedCategory && `in ${selectedCategory}`}
          </div>
        )}
      </main>
    </div>
  );
}

function formatTimeAgo(date: Date | null | undefined): string {
  if (!date) return "Unknown";
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  return `${Math.floor(diffInSeconds / 2592000)} months ago`;
}
