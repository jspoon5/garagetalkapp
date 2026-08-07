import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Monitor, 
  MonitorUp, 
  Users, 
  X, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff,
  Phone
} from "lucide-react";
import { JitsiMeeting } from "@jitsi/react-sdk";

interface QuickScreenShareProps {
  userName: string;
  userTier: string;
}

const JITSI_DOMAIN = "meet.jit.si";

export default function QuickScreenShare({ userName, userTier }: QuickScreenShareProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [showJitsi, setShowJitsi] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const apiRef = useRef<any>(null);

  const canUseScreenShare = ["gearhead", "racing_pro", "pro"].includes(userTier);

  const handleStartScreenShare = () => {
    if (!roomName.trim()) {
      const randomRoom = `garage-share-${Date.now().toString(36)}`;
      setRoomName(randomRoom);
    }
    setShowJitsi(true);
  };

  const handleStopSharing = (triggerHangup = true) => {
    if (triggerHangup && apiRef.current) {
      try {
        apiRef.current.executeCommand('hangup');
      } catch (e) {
        console.error("Error hanging up:", e);
      }
    }
    apiRef.current = null;
    setShowJitsi(false);
    setIsSharing(false);
    setParticipantCount(1);
  };

  const configOverwrite = {
    startWithAudioMuted: true,
    startWithVideoMuted: true,
    disableDeepLinking: true,
    prejoinPageEnabled: false,
    enableWelcomePage: false,
    requireDisplayName: false,
    enableEmailInStats: false,
    disableThirdPartyRequests: true,
    desktopSharingFrameRate: { min: 5, max: 30 },
    toolbarButtons: [
      "microphone",
      "camera", 
      "desktop",
      "fullscreen",
      "hangup",
      "chat",
      "participants-pane",
    ],
    // Start with screen share prompt
    startScreenSharing: true,
  };

  const interfaceConfigOverwrite = {
    SHOW_JITSI_WATERMARK: false,
    SHOW_BRAND_WATERMARK: false,
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
    DEFAULT_BACKGROUND: "#1a1a1a",
    TOOLBAR_ALWAYS_VISIBLE: true,
    APP_NAME: "Garage Talk Screen Share",
    FILM_STRIP_MAX_HEIGHT: 120,
  };

  if (!canUseScreenShare) {
    return (
      <Card className="border-dashed" data-testid="card-screen-share-locked">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 rounded-full bg-muted">
            <Monitor className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Screen Sharing</CardTitle>
          <CardDescription>
            Share your screen with other mechanics in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Badge variant="secondary" className="mb-4">Requires Gearhead tier or higher</Badge>
          <p className="text-sm text-muted-foreground">
            Upgrade your subscription to unlock screen sharing capabilities
          </p>
        </CardContent>
      </Card>
    );
  }

  if (showJitsi) {
    return (
      <div className="fixed inset-0 z-50 bg-background" data-testid="screen-share-active">
        <div className="flex items-center justify-between p-3 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/10">
              <MonitorUp className="h-5 w-5 text-red-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Live Screen Sharing</h3>
              <p className="text-xs text-muted-foreground">Room: {roomName}</p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {participantCount}
            </Badge>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => handleStopSharing(true)}
            className="gap-2"
            data-testid="button-stop-sharing"
          >
            <Phone className="h-4 w-4" />
            End Session
          </Button>
        </div>
        
        <div className="h-[calc(100vh-57px)]">
          <JitsiMeeting
            domain={JITSI_DOMAIN}
            roomName={`garage-talk-${roomName}`}
            configOverwrite={configOverwrite}
            interfaceConfigOverwrite={interfaceConfigOverwrite}
            userInfo={{
              displayName: userName,
              email: `${userName}@garagetalk.local`,
            }}
            onApiReady={(api) => {
              apiRef.current = api;
              console.log("Screen share Jitsi API ready");

              // Auto-trigger screen share after joining
              api.addEventListener("videoConferenceJoined", () => {
                console.log("Joined - triggering screen share");
                setIsSharing(true);
                // Trigger screen share dialog
                setTimeout(() => {
                  try {
                    api.executeCommand('toggleShareScreen');
                  } catch (e) {
                    console.log("Could not auto-start screen share:", e);
                  }
                }, 1000);
              });

              api.addEventListener("videoConferenceLeft", () => {
                // Don't trigger hangup again since user already left
                handleStopSharing(false);
              });

              api.addEventListener("participantJoined", () => {
                setParticipantCount(prev => prev + 1);
              });

              api.addEventListener("participantLeft", () => {
                setParticipantCount(prev => Math.max(1, prev - 1));
              });

              api.addEventListener("screenSharingStatusChanged", () => {
                // Toggle screen sharing state
                setIsSharing(prev => !prev);
              });
            }}
            getIFrameRef={(iframeRef) => {
              if (iframeRef) {
                iframeRef.style.height = "100%";
                iframeRef.style.width = "100%";
                const iframe = iframeRef.tagName === 'IFRAME' 
                  ? (iframeRef as HTMLIFrameElement)
                  : iframeRef.querySelector('iframe');
                if (iframe) {
                  iframe.allow = "camera; microphone; display-capture; fullscreen; autoplay; clipboard-write";
                }
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="card-quick-screen-share">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div 
            className="p-3 rounded-full bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={handleStartScreenShare}
            data-testid="icon-start-screen-share"
          >
            <MonitorUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Quick Screen Share</CardTitle>
            <CardDescription>Click the icon or button to start sharing instantly</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter room name (or leave blank for random)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStartScreenShare()}
            data-testid="input-screen-share-room"
          />
          <Button 
            onClick={handleStartScreenShare}
            className="gap-2 whitespace-nowrap"
            data-testid="button-start-screen-share"
          >
            <MonitorUp className="h-4 w-4" />
            Share Screen
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="text-xs">Your Tier: {userTier}</Badge>
          <span>Share diagnostic screens, repair manuals, and more</span>
        </div>
      </CardContent>
    </Card>
  );
}
