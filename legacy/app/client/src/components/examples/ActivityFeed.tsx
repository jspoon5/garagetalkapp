import ActivityFeed from '../ActivityFeed';

export default function ActivityFeedExample() {
  const mockActivities = [
    {
      id: "1",
      type: "upload" as const,
      title: "Uploaded new video",
      description: "Diagnosing P0300 Random Misfire Code - Ford F-150",
      timestamp: "2 hours ago",
    },
    {
      id: "2",
      type: "search" as const,
      title: "Searched with AI",
      description: "Engine knocking at idle on Chevy 350",
      timestamp: "5 hours ago",
    },
    {
      id: "3",
      type: "chat" as const,
      title: "Joined chat room",
      description: "Started discussion in #Engine-Misfires",
      timestamp: "1 day ago",
    },
    {
      id: "4",
      type: "upload" as const,
      title: "Uploaded new video",
      description: "How to Test Ignition Coils with a Multimeter",
      timestamp: "2 days ago",
    },
  ];

  return (
    <div className="max-w-2xl">
      <ActivityFeed activities={mockActivities} />
    </div>
  );
}
