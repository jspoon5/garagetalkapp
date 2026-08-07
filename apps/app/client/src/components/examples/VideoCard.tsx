import VideoCard from '../VideoCard';

export default function VideoCardExample() {
  return (
    <div className="max-w-sm">
      <VideoCard
        id="1"
        title="Diagnosing P0300 Random Misfire Code - Ford F-150"
        thumbnail="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=225&fit=crop"
        uploader="Mike's Garage"
        uploaderAvatar="https://api.dicebear.com/7.x/initials/svg?seed=MG"
        views={12500}
        uploadedAt="2 days ago"
        category="Engine Faults"
        duration="8:45"
      />
    </div>
  );
}
