import { Badge } from "@/components/ui/badge";
import { UserGroupIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { Link } from "wouter";

interface ChatRoomCardProps {
  id: string;
  name: string;
  category: string;
  activeUsers: number;
  unreadCount?: number;
  lastMessage?: string;
}

export default function ChatRoomCard({
  id,
  name,
  category,
  activeUsers,
  unreadCount = 0,
  lastMessage,
}: ChatRoomCardProps) {
  return (
    <Link href={`/chat/${id}`}>
      <div 
        className="flex items-center gap-3 px-4 py-2 rounded-full border bg-card hover-elevate active-elevate-2 cursor-pointer transition-all"
        data-testid={`card-room-${id}`}
      >
        <ChatBubbleLeftRightIcon className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="font-medium truncate" data-testid={`text-room-name-${id}`}>#{name}</h3>
          <Badge variant="secondary" className="text-xs shrink-0">{category}</Badge>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <UserGroupIcon className="h-4 w-4" />
            <span>{activeUsers}</span>
          </div>
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center text-xs rounded-full">
              {unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
