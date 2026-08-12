import { useState, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import AISearchResult from "@/components/AISearchResult";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search as SearchIcon, AlertCircle, Globe, ExternalLink, Video, BookOpen, Bot, Car, Battery, AlertTriangle, Mic, MicOff, Volume2, VolumeX, Sparkles, X, RotateCcw } from "lucide-react";
import { TierBasedAdSense } from "@/components/AdSense";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import RequireContactInfo from "@/components/RequireContactInfo";
import type { Vehicle } from "@shared/schema";

// Error Boundary to catch React rendering errors
class SearchErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[SearchErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8">
            <Card className="p-6 bg-destructive/10 border-destructive">
              <h2 className="text-xl font-semibold text-destructive mb-2">Something went wrong</h2>
              <p className="text-sm text-muted-foreground mb-4">Error: {this.state.error?.message}</p>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-48">
                {this.state.error?.stack}
              </pre>
              <Button 
                className="mt-4" 
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </Button>
            </Card>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface PartsRecommendation {
  name: string;
  description: string;
  retailers: Array<{
    name: string;
    searchUrl: string;
  }>;
}

interface AISearchResponse {
  query: string;
  vehicle?: {
    id: string;
    make: string;
    model: string;
    year: number | null;
    vehicleType: string;
    fuelType: string;
  } | null;
  diagnosis: string;
  possibleCauses: string[];
  recommendedVideos: Array<{
    id: string;
    title: string;
    thumbnail: string | null;
  }>;
  nextSteps: string[];
  partsRecommendations?: PartsRecommendation[];
  evSafetyNotes?: string[] | null;
}

interface WebSearchResponse {
  query: string;
  summary: string;
  videoSuggestions: Array<{
    title: string;
    description: string;
    searchTerm: string;
  }>;
  websites: Array<{
    name: string;
    url: string;
    description: string;
  }>;
  guides: Array<{
    title: string;
    description: string;
  }>;
  relatedSearches: string[];
}

type SearchMode = "agent" | "web";

function SearchContent() {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("web");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [aiSearchResult, setAiSearchResult] = useState<AISearchResponse | null>(null);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string>("");
  const { subscriptionTier, isLoading: isLoadingUser, user } = useCurrentUser();
  
  const voice = useVoiceInteraction({ voiceRate: 1.0, voicePitch: 1.0 });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: !!user,
  });

  const aiSearchMutation = useMutation({
    mutationFn: async ({ searchQuery, vehicleId }: { searchQuery: string; vehicleId?: string }) => {
      console.log("[Search] Starting AI search mutation for:", searchQuery);
      const response = await fetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: searchQuery, vehicleId: vehicleId || undefined }),
      });
      
      console.log("[Search] AI search response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log("[Search] AI search error data:", errorData);
        if (response.status === 401) {
          throw new Error("AUTH_REQUIRED");
        }
        const message = errorData.message || errorData.error || "Gearhead Agent search failed";
        throw new Error(message);
      }
      
      const data = await response.json();
      console.log("[Search] AI search mutation returning data:", JSON.stringify(data).slice(0, 200));
      return data as AISearchResponse;
    },
    onSuccess: (data) => {
      try {
        console.log("[Search] AI search onSuccess called with data type:", typeof data);
        console.log("[Search] AI search data keys:", data ? Object.keys(data) : 'null');
        
        // Normalize data to ensure arrays are always arrays (prevent render crashes)
        const normalizedData = {
          ...data,
          possibleCauses: Array.isArray(data?.possibleCauses) ? data.possibleCauses : [],
          recommendedVideos: Array.isArray(data?.recommendedVideos) ? data.recommendedVideos : [],
          nextSteps: Array.isArray(data?.nextSteps) ? data.nextSteps : [],
          partsRecommendations: Array.isArray(data?.partsRecommendations) ? data.partsRecommendations : [],
          evSafetyNotes: Array.isArray(data?.evSafetyNotes) ? data.evSafetyNotes : [],
        };
        
        console.log("[Search] Normalized data query:", normalizedData.query);
        console.log("[Search] Setting aiSearchResult now...");
        setAiSearchResult(normalizedData);
        setWebSearchResult(null);
        setErrorMessage(null);
        setLastSearchedQuery(normalizedData.query || "");
        console.log("[Search] State update functions called successfully");
      } catch (err) {
        console.error("[Search] ERROR in onSuccess handler:", err);
        setErrorMessage("Failed to process search results");
      }
    },
    onError: (error: Error) => {
      console.log("[Search] AI search error:", error.message);
      if (error.message === "AUTH_REQUIRED") {
        setErrorMessage("Please sign in to use the Gearhead Agent voice search.");
      } else {
        setErrorMessage(error.message);
      }
      setAiSearchResult(null);
    },
  });

  const webSearchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await fetch("/api/search/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: searchQuery }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("AUTH_REQUIRED");
        }
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.message || errorData.error || "Web search failed";
        throw new Error(message);
      }
      
      return response.json() as Promise<WebSearchResponse>;
    },
    onSuccess: (data) => {
      console.log("[Search] Web search success, data:", JSON.stringify(data, null, 2).slice(0, 500));
      setWebSearchResult(data);
      setAiSearchResult(null);
      setErrorMessage(null);
      setLastSearchedQuery(data.query || "");
      console.log("[Search] Web search state updated");
    },
    onError: (error: Error) => {
      console.log("[Search] Web search error:", error.message);
      if (error.message === "AUTH_REQUIRED") {
        setErrorMessage("Please sign in to use the search feature.");
      } else {
        setErrorMessage(error.message);
      }
      setWebSearchResult(null);
    },
  });

  // Check URL for query parameter and auto-search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get('q');
    const urlMode = params.get('mode') as SearchMode || "web";
    const urlVehicleId = params.get('vehicleId');
    
    if (urlQuery && urlQuery !== lastSearchedQuery) {
      setQuery(urlQuery);
      setSearchMode(urlMode);
      if (urlVehicleId) setSelectedVehicleId(urlVehicleId);
      
      if (urlMode === "agent") {
        aiSearchMutation.mutate({ searchQuery: urlQuery, vehicleId: urlVehicleId || undefined });
      } else if (urlMode === "web") {
        webSearchMutation.mutate(urlQuery);
      }
    }
  }, [location, lastSearchedQuery]);

  const handleAgentSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchMode("agent");
      aiSearchMutation.mutate({ searchQuery: query, vehicleId: selectedVehicleId || undefined });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      if (searchMode === "agent") {
        aiSearchMutation.mutate({ searchQuery: query, vehicleId: selectedVehicleId || undefined });
      } else {
        webSearchMutation.mutate(query);
      }
    }
  };

  const isLoading = aiSearchMutation.isPending || webSearchMutation.isPending;

  const handleVoiceToggle = useCallback(() => {
    if (voice.isSpeaking) {
      voice.stopSpeaking();
    }
    setVoiceEnabled(!voiceEnabled);
  }, [voiceEnabled, voice]);

  const handleClearSearch = useCallback(() => {
    voice.stopSpeaking();
    setQuery("");
    setAiSearchResult(null);
    setWebSearchResult(null);
    setErrorMessage(null);
    setSelectedVehicleId("");
  }, [voice]);

  const handleMicClick = useCallback(() => {
    if (voice.isListening) {
      voice.stopListening();
    } else {
      setSearchMode("agent");
      voice.startListening();
    }
  }, [voice]);

  useEffect(() => {
    if (voice.transcript && !voice.isListening) {
      setQuery(voice.transcript);
      if (voice.transcript.trim().length > 3) {
        setSearchMode("agent");
        aiSearchMutation.mutate({ searchQuery: voice.transcript, vehicleId: selectedVehicleId || undefined });
      }
    }
  }, [voice.transcript, voice.isListening]);

  useEffect(() => {
    if (voice.isListening) {
      setQuery(voice.transcript);
    }
  }, [voice.transcript, voice.isListening]);

  return (
    <RequireContactInfo user={user}>
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Search</h1>
          <p className="text-muted-foreground">Choose a search function below</p>
        </div>

        {/* Two Separate Search Functions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Web Search Function */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-blue-500/10">
                <Globe className="h-6 w-6 text-blue-500" />
              </div>
              <h2 className="text-xl font-semibold">Web Search</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Search the internet for videos, tutorials, repair guides, and automotive resources from across the web.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) { setSearchMode("web"); webSearchMutation.mutate(query); }}} className="space-y-3">
              <Input
                placeholder="e.g., How to replace brake pads on Honda Civic"
                value={query}
                onChange={(e) => { setSearchMode("web"); setQuery(e.target.value); }}
                onFocus={() => setSearchMode("web")}
                data-testid="input-web-search"
              />
              <Button
                type="submit"
                className="w-full"
                disabled={webSearchMutation.isPending || !query.trim()}
                data-testid="button-web-search"
              >
                {webSearchMutation.isPending && searchMode === "web" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching Web...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    Search Web
                  </>
                )}
              </Button>
            </form>
          </Card>

          {/* Gearhead AI Function */}
          <Card className="p-6 border-primary/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10 relative">
                  <Bot className="h-6 w-6 text-primary" />
                  <Sparkles className="h-3 w-3 text-primary absolute -top-1 -right-1" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Gearhead AI</h2>
                  <p className="text-xs text-muted-foreground">Your AI Companion</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant={voiceEnabled ? "default" : "outline"}
                  onClick={handleVoiceToggle}
                  title={voiceEnabled ? "Voice responses enabled" : "Voice responses disabled"}
                  data-testid="button-voice-toggle"
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              AI-powered diagnostics with voice interaction. Speak or type your problem and get expert diagnosis, parts recommendations, and fixes.
            </p>
            
            {voice.error && (
              <div className="text-xs text-destructive mb-3 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {voice.error}
              </div>
            )}
            <form onSubmit={handleAgentSearch} className="space-y-3">
              {vehicles.length > 0 && (
                <div className="space-y-1">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Select Vehicle (optional)
                  </label>
                  <Select value={selectedVehicleId || "none"} onValueChange={(val) => setSelectedVehicleId(val === "none" ? "" : val)}>
                    <SelectTrigger data-testid="select-vehicle-for-search">
                      <SelectValue placeholder="Select from My Garage..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific vehicle</SelectItem>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nickname || `${v.year || ""} ${v.make} ${v.model}`.trim()}
                          {v.isPrimary && " ⭐"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVehicleId && (() => {
                    const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
                    const isEV = selectedVehicle && ["battery_electric", "hydrogen", "plug_in_hybrid", "hybrid"].includes(selectedVehicle.fuelType);
                    return isEV ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <Battery className="h-3 w-3" />
                        EV/Hybrid detected - specialized diagnostics enabled
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder={voice.isListening ? "Listening..." : "e.g., Engine knocking at idle on Chevy 350"}
                  value={query}
                  onChange={(e) => { setSearchMode("agent"); setQuery(e.target.value); }}
                  onFocus={() => setSearchMode("agent")}
                  className={voice.isListening ? "border-primary animate-pulse" : ""}
                  data-testid="input-agent-search"
                />
                {voice.isSupported && (
                  <Button
                    type="button"
                    size="icon"
                    variant={voice.isListening ? "default" : "outline"}
                    onClick={handleMicClick}
                    disabled={aiSearchMutation.isPending}
                    className={voice.isListening ? "animate-pulse bg-red-500 hover:bg-red-600" : ""}
                    title={voice.isListening ? "Stop listening" : "Click to speak"}
                    data-testid="button-voice-input"
                  >
                    {voice.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              
              {voice.isListening && (
                <div className="text-xs text-primary animate-pulse flex items-center gap-1" data-testid="status-voice-listening">
                  <Mic className="h-3 w-3" />
                  Speak now... I'm listening
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={aiSearchMutation.isPending || !query.trim()}
                  data-testid="button-agent-search"
                >
                  {aiSearchMutation.isPending && searchMode === "agent" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Bot className="mr-2 h-4 w-4" />
                      Ask Gearhead AI
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {isLoading && (
          <Card className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">
              {searchMode === "web" 
                ? "Searching the internet for automotive resources..."
                : "Gearhead Agent is analyzing your query..."
              }
            </p>
          </Card>
        )}

        {errorMessage && (
          <Card className="p-6 bg-destructive/10 border-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive mb-1">Search Failed</p>
                <p className="text-sm text-destructive/90">{errorMessage}</p>
                {errorMessage.includes("sign in") && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <Link href="/signin" className="underline hover:text-primary">Sign in now</Link> to use the Gearhead Agent.
                  </p>
                )}
                {errorMessage.includes("limit") && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <a href="/subscription-tiers" className="underline hover:text-primary">View subscription tiers</a> to upgrade for unlimited searches.
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Web Search Results */}
        {webSearchResult && !isLoading && (
          <div className="space-y-6">
            {/* Summary */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-3">Summary</h2>
              <p className="text-muted-foreground">{webSearchResult.summary}</p>
            </Card>

            {/* Video Suggestions */}
            {webSearchResult.videoSuggestions && webSearchResult.videoSuggestions.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Video className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Recommended Videos</h2>
                </div>
                <div className="space-y-4">
                  {webSearchResult.videoSuggestions.map((video, i) => (
                    <a
                      key={i}
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(video.searchTerm)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 rounded-lg border hover-elevate active-elevate-2"
                      data-testid={`link-video-${i}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium mb-1">{video.title}</h3>
                          <p className="text-sm text-muted-foreground">{video.description}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {/* Websites */}
            {webSearchResult.websites && webSearchResult.websites.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Helpful Websites</h2>
                </div>
                <div className="space-y-3">
                  {webSearchResult.websites.map((site, i) => (
                    <a
                      key={i}
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border hover-elevate active-elevate-2"
                      data-testid={`link-website-${i}`}
                    >
                      <div>
                        <h3 className="font-medium">{site.name}</h3>
                        <p className="text-sm text-muted-foreground">{site.description}</p>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {/* Guides */}
            {webSearchResult.guides && webSearchResult.guides.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Repair Guides</h2>
                </div>
                <div className="space-y-3">
                  {webSearchResult.guides.map((guide, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50">
                      <h3 className="font-medium mb-1">{guide.title}</h3>
                      <p className="text-sm text-muted-foreground">{guide.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Related Searches */}
            {webSearchResult.relatedSearches && webSearchResult.relatedSearches.length > 0 && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-3">Related Searches</h2>
                <div className="flex flex-wrap gap-2">
                  {webSearchResult.relatedSearches.map((term, i) => (
                    <Badge 
                      key={i} 
                      variant="secondary" 
                      className="cursor-pointer"
                      onClick={() => {
                        setQuery(term);
                        webSearchMutation.mutate(term);
                      }}
                      data-testid={`badge-related-${i}`}
                    >
                      {term}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {!isLoadingUser && (
              <TierBasedAdSense 
                userTier={subscriptionTier}
                adPosition="middle"
                slot="1122334455"
                format="auto"
                className="my-6"
              />
            )}
          </div>
        )}

        {/* Floating Voice Control - appears when speaking */}
        {voice.isSpeaking && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5" data-testid="floating-voice-control">
            <Volume2 className="h-5 w-5 animate-pulse" />
            <span className="font-medium">Gearhead is speaking...</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                voice.stopSpeaking();
                setVoiceEnabled(false);
              }}
              className="gap-1"
              data-testid="button-mute-floating"
            >
              <VolumeX className="h-4 w-4" />
              Mute
            </Button>
          </div>
        )}

        {/* Results Header with Clear Button */}
        {(aiSearchResult || webSearchResult) && !isLoading && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {searchMode === "agent" ? "Gearhead AI Results" : "Web Search Results"}
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSearch}
              className="gap-2"
              data-testid="button-new-search"
            >
              <RotateCcw className="h-4 w-4" />
              New Search
            </Button>
          </div>
        )}

        {/* AI Agent Results */}
        {aiSearchResult && !isLoading && (
          <div className="mb-8">
            {aiSearchResult.vehicle && (
              <Card className="mb-4 p-4 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Diagnosis for: <span className="font-medium">{aiSearchResult.vehicle.year ? `${aiSearchResult.vehicle.year} ` : ""}{aiSearchResult.vehicle.make} {aiSearchResult.vehicle.model}</span>
                  </span>
                  {["battery_electric", "hydrogen", "plug_in_hybrid", "hybrid"].includes(aiSearchResult.vehicle.fuelType) && (
                    <Badge variant="outline" className="gap-1 ml-2">
                      <Battery className="h-3 w-3" />
                      EV/Hybrid
                    </Badge>
                  )}
                </div>
              </Card>
            )}

            <AISearchResult
              query={aiSearchResult.query}
              summary={aiSearchResult.diagnosis}
              suggestedFixes={aiSearchResult.possibleCauses}
              relatedVideos={aiSearchResult.recommendedVideos}
              suggestedRoom="Engine-Misfires"
            />

            {aiSearchResult.partsRecommendations && aiSearchResult.partsRecommendations.length > 0 && (
              <Card className="mt-6 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Recommended Parts & Accessories</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Based on your diagnosis, here are parts you might need from trusted retailers:
                </p>
                <div className="space-y-4">
                  {aiSearchResult.partsRecommendations.map((part, i) => (
                    <div key={i} className="p-4 rounded-lg border">
                      <h3 className="font-medium mb-1">{part.name}</h3>
                      <p className="text-sm text-muted-foreground mb-3">{part.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {part.retailers.map((retailer, j) => (
                          <a
                            key={j}
                            href={retailer.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                            data-testid={`link-parts-${i}-${j}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {retailer.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {aiSearchResult.evSafetyNotes && aiSearchResult.evSafetyNotes.length > 0 && (
              <Card className="mt-6 p-6 bg-amber-500/10 border-amber-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-amber-800 dark:text-amber-400">High-Voltage Safety Notes</h3>
                    <ul className="space-y-2">
                      {aiSearchResult.evSafetyNotes.map((note, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-amber-600 font-mono">!</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}
            
            {!isLoadingUser && (
              <TierBasedAdSense 
                userTier={subscriptionTier}
                adPosition="middle"
                slot="1122334455"
                format="auto"
                className="my-6"
              />
            )}

            {aiSearchResult.nextSteps && aiSearchResult.nextSteps.length > 0 && (
              <Card className="mt-6 p-6">
                <h3 className="text-lg font-semibold mb-3">Recommended Next Steps</h3>
                <ul className="space-y-2">
                  {aiSearchResult.nextSteps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary font-mono">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
    </RequireContactInfo>
  );
}

export default function Search() {
  return (
    <SearchErrorBoundary>
      <SearchContent />
    </SearchErrorBoundary>
  );
}
