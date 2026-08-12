import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Search, MapPin, MessageCircle } from "lucide-react";

interface UserWithPresence {
  id: string;
  username: string;
  avatarUrl?: string | null;
  avatarType?: "color" | "image" | "animated" | null;
  avatarColor?: string | null;
  bio?: string | null;
  city?: string | null;
  subscriptionTier: string;
  isOnline: boolean;
  lastSeen?: string | null;
}

function getUserColor(username: string, avatarColor?: string | null): string {
  if (avatarColor) return avatarColor;
  const colors = [
    "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7",
    "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#06b6d4"
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function OnlineIndicator({ isOnline, size = "sm" }: { isOnline: boolean; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span 
      className={`absolute bottom-0 right-0 ${sizeClass} rounded-full border-2 border-background ${isOnline ? "bg-green-500" : "bg-muted-foreground"}`}
      data-testid={`status-indicator-${isOnline ? "online" : "offline"}`}
    />
  );
}

function getTierBadgeVariant(tier: string): "default" | "secondary" | "destructive" | "outline" {
  switch (tier) {
    case "pro": return "default";
    case "racing_pro": return "destructive";
    case "gearhead": return "secondary";
    default: return "outline";
  }
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case "pro": return "Pro";
    case "racing_pro": return "Racing Pro";
    case "gearhead": return "Gearhead";
    default: return "Amateur";
  }
}

export default function ChatUserList() {
  const [users, setUsers] = useState<UserWithPresence[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch all users with presence
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("/api/users/presence", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // WebSocket for real-time presence updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "getOnlineUsers" }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "presence") {
        setUsers(prev => prev.map(user => 
          user.id === data.userId 
            ? { ...user, isOnline: data.isOnline }
            : user
        ));
      } else if (data.type === "onlineUsers") {
        const onlineUserIds = new Set(data.users.map((u: any) => u.userId));
        setUsers(prev => prev.map(user => ({
          ...user,
          isOnline: onlineUserIds.has(user.id),
        })));
      }
    };

    wsRef.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  // Filter and sort users
  const filteredUsers = users
    .filter(user => 
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Online users first, then alphabetically
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.username.localeCompare(b.username);
    });

  const onlineCount = users.filter(u => u.isOnline).length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Members
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {onlineCount} online
          </Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search-members"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[450px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No members found
            </p>
          ) : (
            <div className="space-y-1 px-3 pb-3">
              {filteredUsers.map((user) => (
                <Popover key={user.id}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover-elevate text-left"
                      data-testid={`user-${user.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-9 w-9">
                          {user.avatarUrl && (user.avatarType === "image" || user.avatarType === "animated") ? (
                            <AvatarImage 
                              src={user.avatarUrl} 
                              alt={user.username}
                              className={user.avatarType === "animated" ? "object-cover" : ""}
                            />
                          ) : null}
                          <AvatarFallback 
                            className="text-white font-medium text-sm"
                            style={{ backgroundColor: getUserColor(user.username, user.avatarColor) }}
                          >
                            {user.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <OnlineIndicator isOnline={user.isOnline} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{user.username}</p>
                        <p className={`text-xs ${user.isOnline ? "text-green-500" : "text-muted-foreground"}`}>
                          {user.isOnline ? "Online" : "Offline"}
                        </p>
                      </div>
                      <Badge 
                        variant={getTierBadgeVariant(user.subscriptionTier)} 
                        className="text-xs shrink-0"
                      >
                        {getTierLabel(user.subscriptionTier)}
                      </Badge>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" side="left">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-14 w-14">
                            {user.avatarUrl && (user.avatarType === "image" || user.avatarType === "animated") ? (
                              <AvatarImage 
                                src={user.avatarUrl} 
                                alt={user.username}
                                className={user.avatarType === "animated" ? "object-cover" : ""}
                              />
                            ) : null}
                            <AvatarFallback 
                              className="text-lg text-white font-medium"
                              style={{ backgroundColor: getUserColor(user.username, user.avatarColor) }}
                            >
                              {user.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <OnlineIndicator isOnline={user.isOnline} size="md" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{user.username}</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${user.isOnline ? "text-green-500" : "text-muted-foreground"}`}>
                              {user.isOnline ? "Online" : "Offline"}
                            </span>
                            <Badge 
                              variant={getTierBadgeVariant(user.subscriptionTier)} 
                              className="text-xs"
                            >
                              {getTierLabel(user.subscriptionTier)}
                            </Badge>
                          </div>
                          {user.city && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {user.city}
                            </p>
                          )}
                        </div>
                      </div>
                      {user.bio && (
                        <p className="text-sm text-muted-foreground border-t pt-2">
                          {user.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        <span>Community member</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
