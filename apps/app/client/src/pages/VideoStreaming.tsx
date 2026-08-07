import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Video, Share2, Radio, Lock, ExternalLink, Key, Link as LinkIcon, Copy, Check } from "lucide-react";
import { Link } from "wouter";
import JitsiMeetingRoom from "@/components/JitsiMeetingRoom";
import QuickScreenShare from "@/components/QuickScreenShare";
import OBSStreamingGuide from "@/components/OBSStreamingGuide";
import { useToast } from "@/hooks/use-toast";

type VideoFeature = "screen_share" | "conferencing" | "live_streaming";

const TIER_FEATURES: Record<string, VideoFeature[]> = {
  // TESTING: amateur tier unlocked for device testing - revert before production
  amateur: ["screen_share", "conferencing", "live_streaming"],
  gearhead: ["screen_share"],
  racing_pro: ["screen_share", "conferencing"],
  pro: ["screen_share", "conferencing", "live_streaming"],
};

const FEATURE_CONFIG = {
  screen_share: {
    title: "Screen Sharing",
    description: "Share your diagnostic screens and repair manuals with others",
    icon: Share2,
    minTier: "Gearhead ($9.99/mo)",
  },
  conferencing: {
    title: "Video Conferencing",
    description: "Collaborate with up to 50 mechanics in real-time video calls",
    icon: Video,
    minTier: "Racing Pro ($19.99/mo)",
  },
  live_streaming: {
    title: "Live Broadcast Room",
    description: "Create a room where viewers can join and watch your camera/screen live. For streaming to YouTube/Twitch, use OBS with Occular above.",
    icon: Radio,
    minTier: "Pro ($29.99/mo)",
  },
};

export default function VideoStreaming() {
  const { user: currentUser } = useCurrentUser();
  const [roomName, setRoomName] = useState("");
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<VideoFeature | null>(null);
  
  // Occular Streaming state
  const [occularStreamKey, setOccularStreamKey] = useState("");
  const [occularStreamUrl, setOccularStreamUrl] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const { toast } = useToast();

  const userTier = (currentUser?.subscriptionTier || "amateur").toLowerCase();
  
  const copyToClipboard = (text: string, type: 'key' | 'url') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
    toast({ title: "Copied to clipboard!" });
  };
  const availableFeatures = TIER_FEATURES[userTier] || [];

  const hasFeature = (feature: VideoFeature) => availableFeatures.includes(feature);

  const handleJoinRoom = (feature: VideoFeature) => {
    if (!roomName.trim()) return;
    setActiveFeature(feature);
    setActiveRoom(roomName.trim());
  };

  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setActiveFeature(null);
    setRoomName("");
  };

  if (activeRoom && activeFeature) {
    return (
      <JitsiMeetingRoom
        roomName={activeRoom}
        userName={currentUser?.username || "Mechanic"}
        feature={activeFeature}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Video Streaming</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Connect with mechanics worldwide through video. Your tier:</span>
          <Badge variant="secondary">{userTier}</Badge>
        </div>
      </div>

      {/* Occular Streaming Configuration - Top of page */}
      <Card className="mb-8" id="occular-streaming">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Occular Streaming
              </CardTitle>
              <CardDescription>
                Configure your Occular Streaming key and URL for live broadcasts
              </CardDescription>
            </div>
            <a 
              href="https://occular-stream--garagegrouphold.replit.app/dashboard" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="gap-2" data-testid="button-get-occular-key">
                <ExternalLink className="h-4 w-4" />
                Get Streaming Key
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="occular-stream-key" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Stream Key
            </Label>
            <div className="flex gap-2">
              <Input
                id="occular-stream-key"
                type="password"
                placeholder="Enter your Occular stream key"
                value={occularStreamKey}
                onChange={(e) => setOccularStreamKey(e.target.value)}
                data-testid="input-occular-stream-key"
              />
              {occularStreamKey && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(occularStreamKey, 'key')}
                  data-testid="button-copy-stream-key"
                >
                  {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="occular-stream-url" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Stream URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="occular-stream-url"
                type="url"
                placeholder="Enter your Occular stream URL (e.g., rtmp://...)"
                value={occularStreamUrl}
                onChange={(e) => setOccularStreamUrl(e.target.value)}
                data-testid="input-occular-stream-url"
              />
              {occularStreamUrl && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(occularStreamUrl, 'url')}
                  data-testid="button-copy-stream-url"
                >
                  {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">How to use Occular Streaming:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Click "Get Streaming Key" to open Occular Broadcaster Dashboard</li>
              <li>Copy the <strong>Server URL</strong> (e.g., rtmp://occular-stream--garagegrouphold.replit.app/live)</li>
              <li>Copy your <strong>Stream Key</strong> from the dashboard</li>
              <li>Paste these credentials into your streaming software (OBS, Streamlabs, etc.)</li>
              <li>In OBS: Go to Settings → Stream → Select "Custom" → Enter Server URL and Stream Key</li>
            </ol>
          </div>

          {occularStreamKey && occularStreamUrl && (
            <div className="pt-4">
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" />
                Streaming credentials configured
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Screen Share - Main Feature */}
      <div className="mb-8">
        <QuickScreenShare 
          userName={currentUser?.username || "Mechanic"} 
          userTier={userTier} 
        />
      </div>

      {availableFeatures.length === 0 && (
        <Card className="mb-8 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Upgrade to Access Video Features
            </CardTitle>
            <CardDescription>
              Video streaming features are available for paid subscribers starting at $9.99/month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/subscription-tiers">
              <Button data-testid="button-view-tiers">View Subscription Tiers</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {availableFeatures.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Advanced Room Options</CardTitle>
            <CardDescription>Create a named room or join an existing one</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter room name (e.g., engine-repair-123)"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && availableFeatures.length > 0) {
                    handleJoinRoom(availableFeatures[0]);
                  }
                }}
                data-testid="input-room-name"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(Object.keys(FEATURE_CONFIG) as VideoFeature[]).map((feature) => {
          const config = FEATURE_CONFIG[feature];
          const Icon = config.icon;
          const isAvailable = hasFeature(feature);

          return (
            <Card
              key={feature}
              className={!isAvailable ? "opacity-60" : ""}
              data-testid={`card-feature-${feature}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Icon className="h-8 w-8 text-primary" />
                  {isAvailable ? (
                    <Badge variant="default" data-testid={`badge-available-${feature}`}>Available</Badge>
                  ) : (
                    <Badge variant="secondary" data-testid={`badge-locked-${feature}`}>
                      <Lock className="h-3 w-3 mr-1" />
                      Locked
                    </Badge>
                  )}
                </div>
                <CardTitle className="mt-4">{config.title}</CardTitle>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {feature === "live_streaming" ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Use OBS Studio to stream your sessions
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => document.getElementById('obs-guide')?.scrollIntoView({ behavior: 'smooth' })}
                      data-testid="button-view-obs-guide"
                    >
                      View Streaming Guide
                    </Button>
                  </div>
                ) : isAvailable ? (
                  <Button
                    className="w-full"
                    onClick={() => handleJoinRoom(feature)}
                    disabled={!roomName.trim()}
                    data-testid={`button-join-${feature}`}
                  >
                    Start {config.title}
                  </Button>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Requires: {config.minTier}
                    </p>
                    <Link href="/subscription-tiers">
                      <Button variant="outline" className="w-full" data-testid={`button-upgrade-${feature}`}>
                        Upgrade Tier
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* OBS Streaming Guide for Pro users */}
      <div id="obs-guide" className="mt-8">
        <OBSStreamingGuide userTier={userTier} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Screen Sharing (Gearhead+)</h3>
              <p className="text-sm text-muted-foreground">
                Perfect for showing diagnostic screens, wiring diagrams, and repair manuals to other mechanics
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Video Conferencing (Racing Pro+)</h3>
              <p className="text-sm text-muted-foreground">
                Host small group troubleshooting sessions with up to 50 participants. Everyone can share video and audio
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Live Streaming with OBS (Pro)</h3>
              <p className="text-sm text-muted-foreground">
                Broadcast your Garage Talk sessions to YouTube, Twitch, or Facebook Live using OBS Studio. See the streaming guide above for step-by-step instructions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
