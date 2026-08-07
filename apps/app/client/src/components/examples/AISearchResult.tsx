import AISearchResult from '../AISearchResult';

export default function AISearchResultExample() {
  return (
    <div className="max-w-4xl">
      <AISearchResult
        query="P0300 code on Ford F-150"
        summary="A P0300 code indicates a random/multiple cylinder misfire detected. This is a common issue in Ford F-150s and can be caused by several factors including faulty spark plugs, ignition coils, fuel injectors, or vacuum leaks."
        suggestedFixes={[
          "Check and replace spark plugs if worn (typically every 30-100k miles)",
          "Inspect ignition coils for cracks or damage - replace if necessary",
          "Test fuel pressure and check fuel injectors for clogs",
          "Inspect for vacuum leaks using smoke test or carburetor cleaner spray method"
        ]}
        relatedVideos={[
          {
            id: "1",
            title: "How to Replace Spark Plugs - Ford F-150",
            thumbnail: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=300&h=169&fit=crop"
          },
          {
            id: "2",
            title: "Testing Ignition Coils with Multimeter",
            thumbnail: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=300&h=169&fit=crop"
          },
          {
            id: "3",
            title: "Diagnosing Vacuum Leaks",
            thumbnail: "https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=300&h=169&fit=crop"
          }
        ]}
        suggestedRoom="Engine-Misfires"
      />
    </div>
  );
}
