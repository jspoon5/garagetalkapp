import DashboardStats from '../DashboardStats';

export default function DashboardStatsExample() {
  return (
    <DashboardStats
      videosUploaded={12}
      searchesPerformed={87}
      activeChats={3}
      savedVideos={34}
    />
  );
}
