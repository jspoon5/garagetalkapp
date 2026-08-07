import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserGroupIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { MessageCircle, MapPin } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Message } from "@shared/schema";

// Extended message type with avatar info
interface ChatMessage extends Message {
  avatarUrl?: string | null;
  avatarColor?: string | null;
  bio?: string | null;
}

// Generate a consistent color based on username
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

interface ChatRoomProps {
  roomId: string;
  roomName: string;
  activeUsers: number;
}

// Track online users with their userId
interface OnlineUser {
  userId: string;
  username: string;
  isOnline: boolean;
}

// Online status indicator component
function OnlineIndicator({ isOnline, size = "sm" }: { isOnline: boolean; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span 
      className={`absolute bottom-0 right-0 ${sizeClass} rounded-full border-2 border-background ${isOnline ? "bg-green-500" : "bg-muted-foreground"}`}
      data-testid={`status-indicator-${isOnline ? "online" : "offline"}`}
    />
  );
}

export default function ChatRoom({ roomId, roomName, activeUsers }: ChatRoomProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isLoading: userLoading } = useCurrentUser();

  // Use authenticated user's data or fallback
  const username = user?.username || "Guest";
  const userAvatarUrl = user?.avatarUrl || null;
  const userAvatarColor = user?.avatarColor || null;
  const userCity = user?.city || null;
  const userBio = user?.bio || null;

  // Fetch initial message history
  const { data: initialMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat-rooms", roomId, "messages"],
    queryFn: async () => {
      const response = await fetch(`/api/chat-rooms/${roomId}/messages`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !userLoading,
  });

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // WebSocket connection
  useEffect(() => {
    // Wait for user data to load before connecting
    if (userLoading) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "join",
        roomId,
        username,
        userId: user?.id,
        avatarUrl: userAvatarUrl,
        avatarColor: userAvatarColor,
        city: userCity,
        bio: userBio,
      }));
      
      // Request list of online users
      socket.send(JSON.stringify({ type: "getOnlineUsers" }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "message") {
        setMessages(prev => [...prev, data.message]);
      } else if (data.type === "history") {
        setMessages(data.messages);
      } else if (data.type === "presence") {
        // Handle presence updates from other users
        setOnlineUsers(prev => {
          const next = new Map(prev);
          next.set(data.userId, {
            userId: data.userId,
            username: data.username,
            isOnline: data.isOnline,
          });
          return next;
        });
      } else if (data.type === "onlineUsers") {
        // Full list of online users
        const newOnlineUsers = new Map<string, OnlineUser>();
        data.users.forEach((u: OnlineUser) => {
          newOnlineUsers.set(u.userId, u);
        });
        setOnlineUsers(newOnlineUsers);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = socket;

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "leave" }));
      }
      socket.close();
    };
  }, [roomId, username, userLoading, user?.id, userAvatarUrl, userAvatarColor, userCity, userBio]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      type: "message",
      content: message,
    }));

    setMessage("");
  };

  if (userLoading) {
    return (
      <Card className="flex flex-col h-[600px] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-2 text-sm text-muted-foreground">Loading chat...</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">#{roomName}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <UserGroupIcon className="h-4 w-4" />
            <span>{activeUsers} active</span>
          </div>
        </div>
        <Badge variant="secondary">Live</Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.isSystem ? "text-center" : ""}>
            {msg.isSystem ? (
              <p className="text-xs text-muted-foreground">{msg.content}</p>
            ) : (
              <div className="flex gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      className="focus:outline-none focus:ring-2 focus:ring-primary rounded-full relative"
                      data-testid={`avatar-${msg.username}-${msg.id}`}
                    >
                      <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                        {msg.avatarUrl && (
                          <AvatarImage src={msg.avatarUrl} alt={msg.username} />
                        )}
                        <AvatarFallback 
                          className="text-white font-medium"
                          style={{ backgroundColor: getUserColor(msg.username, msg.avatarColor) }}
                        >
                          {msg.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <OnlineIndicator isOnline={msg.userId ? onlineUsers.get(msg.userId)?.isOnline === true : false} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" side="right">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-12 w-12">
                            {msg.avatarUrl && (
                              <AvatarImage src={msg.avatarUrl} alt={msg.username} />
                            )}
                            <AvatarFallback 
                              className="text-lg text-white font-medium"
                              style={{ backgroundColor: getUserColor(msg.username, msg.avatarColor) }}
                            >
                              {msg.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <OnlineIndicator isOnline={msg.userId ? onlineUsers.get(msg.userId)?.isOnline === true : false} size="md" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{msg.username}</p>
                            <span className={`text-xs ${msg.userId && onlineUsers.get(msg.userId)?.isOnline === true ? "text-green-500" : "text-muted-foreground"}`}>
                              {msg.userId && onlineUsers.get(msg.userId)?.isOnline === true ? "Online" : "Offline"}
                            </span>
                          </div>
                          {msg.userCity && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {msg.userCity}
                            </p>
                          )}
                        </div>
                      </div>
                      {msg.bio && (
                        <p className="text-sm text-muted-foreground border-t pt-2">
                          {msg.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        <span>Chat member</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">{msg.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{msg.content}</p>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1"
            data-testid="input-message"
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={!message.trim()}
            data-testid="button-send"
            aria-label="Send message"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </Card>
  );
}

function formatTime(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}
