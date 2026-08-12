import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import CategoryFilter from "@/components/CategoryFilter";
import PodcastUpload from "@/components/PodcastUpload";
import PodcastCard from "@/components/PodcastCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TierBasedAdSense } from "@/components/AdSense";
import type { PodcastEpisode } from "@shared/schema";

import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function Podcasts() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { subscriptionTier, isLoading: isLoadingUser } = useCurrentUser();

  const categories = [
    "Engine Diagnostics",
    "Repair Techniques",
    "Shop Tips",
    "Tool Reviews",
    "Industry News",
    "Q&A Sessions",
    "Case Studies"
  ];

  const { data: episodes = [], isLoading, refetch } = useQuery<PodcastEpisode[]>({
    queryKey: ["/api/podcasts", selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) {
        params.append("category", selectedCategory);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const response = await fetch(`/api/podcasts?${params}`);
      if (!response.ok) throw new Error("Failed to fetch podcasts");
      return response.json();
    },
  });

  const handleUploadSuccess = () => {
    setIsUploadOpen(false);
    refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Mechanic Podcasts</h1>
            <p className="text-muted-foreground">
              Listen to expert mechanics discuss repairs, tips, and industry insights
            </p>
          </div>
          
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-upload-podcast" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Upload Podcast
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Upload Podcast Episode</DialogTitle>
              </DialogHeader>
              <PodcastUpload onSuccess={handleUploadSuccess} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="w-full h-32 rounded-md" />
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
                slot="6677889900"
                format="auto"
                className="mb-6"
              />
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {episodes.map((episode, index) => (
                <PodcastCard
                  key={episode.id}
                  id={episode.id}
                  title={episode.title}
                  description={episode.description || ""}
                  uploader={episode.uploaderName}
                  views={episode.views || 0}
                  likes={episode.likes || 0}
                  duration={episode.duration}
                  category={episode.category}
                  createdAt={episode.createdAt || new Date()}
                  isFeatured={episode.isFeatured || false}
                />
              ))}
              
              {episodes.length >= 6 && !isLoadingUser && (
                <div className="md:col-span-2 lg:col-span-3">
                  <TierBasedAdSense 
                    userTier={subscriptionTier}
                    adPosition="middle"
                    slot="7788990011"
                    format="auto"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {!isLoading && episodes.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-4">No podcasts found {selectedCategory && `in ${selectedCategory}`}</p>
            <Button onClick={() => setIsUploadOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Upload First Podcast
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
}
