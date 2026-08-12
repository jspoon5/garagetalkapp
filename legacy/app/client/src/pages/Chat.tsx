import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import ChatRoomCard from "@/components/ChatRoomCard";
import SpatialChatRoom from "@/components/SpatialChatRoom";
import CreateChatRoomDialog from "@/components/CreateChatRoomDialog";
import ChatUserList from "@/components/ChatUserList";
import RequireContactInfo from "@/components/RequireContactInfo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ChatRoom as ChatRoomType } from "@shared/schema";

export default function Chat() {
  const { user } = useCurrentUser();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);

  const { data: chatRooms = [], isLoading } = useQuery<ChatRoomType[]>({
    queryKey: ["/api/chat-rooms"],
  });

  // Auto-select first room when data loads
  useEffect(() => {
    if (chatRooms.length > 0 && !selectedRoom) {
      setSelectedRoom(chatRooms[0].id);
    }
  }, [chatRooms, selectedRoom]);

  const selectedRoomData = chatRooms.find(room => room.id === selectedRoom);

  return (
    <RequireContactInfo user={user}>
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Virtual Chat Rooms</h1>
            <p className="text-muted-foreground">
              Move around and chat with mechanics in spatial virtual rooms
            </p>
          </div>
          <Button 
            className="gap-2" 
            onClick={() => setOpenCreateDialog(true)}
            data-testid="button-create-room"
          >
            <PlusIcon className="h-5 w-5" />
            Create Room
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {chatRooms.map((room) => (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={selectedRoom === room.id ? "ring-2 ring-primary rounded-full" : ""}
                  >
                    <ChatRoomCard
                      id={room.id}
                      name={room.name}
                      category={room.category}
                      activeUsers={Math.floor(Math.random() * 30) + 5}
                      lastMessage={`Latest discussion in ${room.name}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {selectedRoomData ? (
              <SpatialChatRoom
                roomId={selectedRoomData.id}
                roomName={selectedRoomData.name}
              />
            ) : (
              <div className="flex items-center justify-center h-[600px] border rounded-md bg-muted/30">
                <p className="text-muted-foreground">Select a room to start chatting</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <ChatUserList />
          </div>
        </div>

        <CreateChatRoomDialog 
          open={openCreateDialog}
          onOpenChange={setOpenCreateDialog}
        />
      </main>
    </div>
    </RequireContactInfo>
  );
}
