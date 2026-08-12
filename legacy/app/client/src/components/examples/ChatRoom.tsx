import ChatRoom from '../ChatRoom';

export default function ChatRoomExample() {
  const mockMessages = [
    {
      id: "1",
      user: "System",
      content: "TechMike joined the room",
      timestamp: "10:30 AM",
      isSystem: true,
    },
    {
      id: "2",
      user: "TechMike",
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=TM",
      content: "Hey everyone, I'm getting a P0300 code on my F-150. Already replaced spark plugs but still misfiring.",
      timestamp: "10:31 AM",
    },
    {
      id: "3",
      user: "JohnMechanic",
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=JM",
      content: "Have you checked the ignition coils? That's usually the next culprit after plugs.",
      timestamp: "10:32 AM",
    },
    {
      id: "4",
      user: "TechMike",
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=TM",
      content: "Not yet, how do I test them without buying new ones first?",
      timestamp: "10:33 AM",
    },
    {
      id: "5",
      user: "AutoPro Sarah",
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=AS",
      content: "You can swap coils between cylinders. If the misfire follows the coil, you found your problem. Check out the video on testing coils with a multimeter.",
      timestamp: "10:35 AM",
    },
  ];

  return (
    <div className="max-w-3xl">
      <ChatRoom
        roomName="Engine-Misfires"
        activeUsers={24}
        messages={mockMessages}
      />
    </div>
  );
}
