import { useEffect, useRef } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type VideoFeature = "screen_share" | "conferencing" | "live_streaming";

interface JitsiMeetingRoomProps {
  roomName: string;
  userName: string;
  feature: VideoFeature;
  onLeave: () => void;
}

const JITSI_DOMAIN = "meet.jit.si"; // Free public Jitsi server

export default function JitsiMeetingRoom({
  roomName,
  userName,
  feature,
  onLeave,
}: JitsiMeetingRoomProps) {
  const apiRef = useRef<any>(null);

  // Feature-specific configurations
  const getConfigOverwrite = () => {
    const baseConfig = {
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      disableDeepLinking: true,
      // Enable pre-join page so user can preview camera and grant permissions
      prejoinPageEnabled: true,
      enableWelcomePage: false,
      requireDisplayName: false,
      enableEmailInStats: false,
      // Allow third-party requests for proper functionality
      disableThirdPartyRequests: false,
      enableInsecureRoomNameWarning: false,
      // Screen sharing settings
      desktopSharingFrameRate: {
        min: 5,
        max: 30,
      },
      screenShareIndicatorPosition: "bottomright",
      enableLayerSuspension: true,
      // Video/audio constraints
      constraints: {
        video: {
          height: {
            ideal: 720,
            max: 1080,
            min: 180,
          },
          width: {
            ideal: 1280,
            max: 1920,
            min: 320,
          },
        },
        audio: true,
      },
      // P2P settings for better performance
      p2p: {
        enabled: true,
      },
    };

    switch (feature) {
      case "screen_share":
        return {
          ...baseConfig,
          // Focus on screen sharing
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
            "chat",
            "settings",
          ],
          // Enable desktop sharing
          disableScreenshareSelfie: false,
          enableScreenshotCapture: false,
        };

      case "conferencing":
        return {
          ...baseConfig,
          // Full conferencing features
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
            "chat",
            "raisehand",
            "videoquality",
            "filmstrip",
            "settings",
            "tileview",
          ],
        };

      case "live_streaming":
        return {
          ...baseConfig,
          // Live broadcast room - viewers can join and watch
          // Note: External streaming (YouTube/Twitch) requires OBS integration
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
            "chat",
            "settings",
            "stats",
            "tileview",
            "participants-pane",
            "videoquality",
          ],
          // Disable features not available on public server
          liveStreamingEnabled: false,
          fileRecordingsEnabled: false,
        };

      default:
        return baseConfig;
    }
  };

  const interfaceConfigOverwrite = {
    SHOW_JITSI_WATERMARK: false,
    SHOW_BRAND_WATERMARK: false,
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
    DEFAULT_BACKGROUND: "#1a1a1a",
    TOOLBAR_ALWAYS_VISIBLE: true,
    APP_NAME: "Garage Talk",
    // Ensure screen sharing button is visible
    SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'profile', 'calendar'],
    DESKTOP_SHARING_SOURCE_TYPES: ['screen', 'window'],
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (error) {
          console.error("Error disposing Jitsi API:", error);
        }
      }
    };
  }, []);

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onLeave}
            data-testid="button-leave-room"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold">
              {feature === "screen_share" && "Screen Sharing Session"}
              {feature === "conferencing" && "Video Conference"}
              {feature === "live_streaming" && "Live Stream"}
            </h2>
            <p className="text-sm text-muted-foreground">Room: {roomName}</p>
          </div>
        </div>
      </div>

      <div 
        className="flex-1 relative" 
        style={{ height: 'calc(100vh - 73px)', minHeight: '400px' }}
      >
        <JitsiMeeting
          domain={JITSI_DOMAIN}
          roomName={`garage-talk-${roomName}`} // Prefix to avoid conflicts
          configOverwrite={getConfigOverwrite()}
          interfaceConfigOverwrite={interfaceConfigOverwrite}
          userInfo={{
            displayName: userName,
            email: `${userName}@garagetalk.local`,
          }}
          onApiReady={(api) => {
            apiRef.current = api;
            console.log("Jitsi API ready");

            // Add event listeners
            api.addEventListener("videoConferenceJoined", () => {
              console.log("User joined the conference");
            });

            api.addEventListener("videoConferenceLeft", () => {
              console.log("User left the conference");
              onLeave();
            });

            api.addEventListener("participantJoined", () => {
              console.log("Participant joined");
            });
          }}
          getIFrameRef={(iframeRef) => {
            if (iframeRef) {
              // Set explicit dimensions on the container
              iframeRef.style.height = "100%";
              iframeRef.style.width = "100%";
              iframeRef.style.position = "absolute";
              iframeRef.style.top = "0";
              iframeRef.style.left = "0";
              
              // Find and configure the iframe element
              const iframe = iframeRef.tagName === 'IFRAME' 
                ? (iframeRef as HTMLIFrameElement)
                : iframeRef.querySelector('iframe');
              if (iframe) {
                iframe.allow = "camera; microphone; display-capture; fullscreen; autoplay; clipboard-write";
                iframe.style.height = "100%";
                iframe.style.width = "100%";
              }
            }
          }}
        />
      </div>
    </div>
  );
}
