import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoCameraIcon, MagnifyingGlassIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

interface Activity {
  id: string;
  type: "upload" | "search" | "chat";
  title: string;
  description: string;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons = {
  upload: <VideoCameraIcon className="h-4 w-4" />,
  search: <MagnifyingGlassIcon className="h-4 w-4" />,
  chat: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
};

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="p-6">
      <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, idx) => (
          <div key={activity.id} className="flex gap-3">
            <div className="relative">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {activityIcons[activity.type]}
              </div>
              {idx < activities.length - 1 && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px h-6 bg-border" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <p className="font-medium text-sm">{activity.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
              <p className="text-xs text-muted-foreground mt-2">{activity.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
