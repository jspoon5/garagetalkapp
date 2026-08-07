import { Card } from "@/components/ui/card";
import { VideoCameraIcon, MagnifyingGlassIcon, ChatBubbleLeftRightIcon, BookmarkIcon } from "@heroicons/react/24/outline";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  testId: string;
}

function StatCard({ icon, label, value, testId }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold mb-1" data-testid={testId}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

interface DashboardStatsProps {
  videosUploaded: number;
  searchesPerformed: number;
  activeChats: number;
  savedVideos: number;
}

export default function DashboardStats({
  videosUploaded,
  searchesPerformed,
  activeChats,
  savedVideos,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<VideoCameraIcon className="h-5 w-5" />}
        label="Videos Uploaded"
        value={videosUploaded}
        testId="stat-videos"
      />
      <StatCard
        icon={<MagnifyingGlassIcon className="h-5 w-5" />}
        label="Searches"
        value={searchesPerformed}
        testId="stat-searches"
      />
      <StatCard
        icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
        label="Active Chats"
        value={activeChats}
        testId="stat-chats"
      />
      <StatCard
        icon={<BookmarkIcon className="h-5 w-5" />}
        label="Saved Videos"
        value={savedVideos}
        testId="stat-saved"
      />
    </div>
  );
}
