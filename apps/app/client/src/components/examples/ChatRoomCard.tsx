import ChatRoomCard from '../ChatRoomCard';

export default function ChatRoomCardExample() {
  return (
    <div className="max-w-md space-y-3">
      <ChatRoomCard
        id="engine-misfires"
        name="Engine-Misfires"
        category="Engine Faults"
        activeUsers={24}
        unreadCount={3}
        lastMessage="AutoPro Sarah: You can swap coils between cylinders..."
      />
      <ChatRoomCard
        id="obd-codes"
        name="OBD-Code-Help"
        category="Diagnostics"
        activeUsers={18}
        lastMessage="Just got a P0420 code, anyone familiar with this?"
      />
    </div>
  );
}
