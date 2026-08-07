import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitorUp, Users, Phone, Copy, Check, Video, Lock, Hash } from "lucide-react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ScreenShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
}

const JITSI_DOMAIN = "meet.jit.si";

// Format meeting ID with dashes for display (e.g., 123-456-7890)
function formatMeetingId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export default function ScreenShareDialog({ open, onOpenChange, userName }: ScreenShareDialogProps) {
  const [activeTab, setActiveTab] = useState<"host" | "join">("host");
  const [sessionTitle, setSessionTitle] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false); // Show credentials before joining
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  
  // Session info from server
  const [meetingId, setMeetingId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [jitsiRoom, setJitsiRoom] = useState("");
  const [hostName, setHostName] = useState("");
  
  // Join form state
  const [joinMeetingId, setJoinMeetingId] = useState("");
  const [joinPasscode, setJoinPasscode] = useState("");
  
  const apiRef = useRef<any>(null);
  const { toast } = useToast();

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/screen-share/create", { title });
      return res.json();
    },
    onSuccess: (data) => {
      setMeetingId(data.meetingId);
      setPasscode(data.passcode);
      setJitsiRoom(data.jitsiRoom);
      setHostName(data.hostName);
      setShowCredentials(true); // Show credentials step instead of immediately starting
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start session",
        description: error.message || "Could not create screen share session",
        variant: "destructive",
      });
    },
  });

  // Join session mutation
  const joinSessionMutation = useMutation({
    mutationFn: async ({ meetingId, passcode }: { meetingId: string; passcode: string }) => {
      const res = await apiRequest("POST", "/api/screen-share/join", { meetingId, passcode });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setMeetingId(joinMeetingId.replace(/[-\s]/g, ""));
      setPasscode(joinPasscode);
      setJitsiRoom(data.jitsiRoom);
      setHostName(data.hostName);
      setIsSharing(true);
      onOpenChange(false);
      toast({
        title: "Joined session",
        description: `Connected to ${data.hostName}'s session`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to join",
        description: error.message || "Invalid meeting ID or passcode",
        variant: "destructive",
      });
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/screen-share/end", { meetingId });
      return res.json();
    },
  });

  const handleStartSharing = () => {
    createSessionMutation.mutate(sessionTitle);
  };

  const handleJoinSession = () => {
    if (!joinMeetingId.trim() || !joinPasscode.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter both meeting ID and passcode",
        variant: "destructive",
      });
      return;
    }
    joinSessionMutation.mutate({
      meetingId: joinMeetingId.replace(/[-\s]/g, ""),
      passcode: joinPasscode.toUpperCase(),
    });
  };

  const handleStopSharing = () => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('hangup');
      } catch (e) {
        console.error("Error hanging up:", e);
      }
    }
    apiRef.current = null;
    endSessionMutation.mutate();
    setIsSharing(false);
    setParticipantCount(1);
    setMeetingId("");
    setPasscode("");
    setJitsiRoom("");
    onOpenChange(false);
  };

  const copyMeetingId = () => {
    navigator.clipboard.writeText(formatMeetingId(meetingId));
    setCopied(true);
    toast({ title: "Meeting ID copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPasscode = () => {
    navigator.clipboard.writeText(passcode);
    setCopiedPasscode(true);
    toast({ title: "Passcode copied!" });
    setTimeout(() => setCopiedPasscode(false), 2000);
  };

  const configOverwrite = {
    startWithAudioMuted: true,
    startWithVideoMuted: true,
    disableDeepLinking: true,
    prejoinPageEnabled: false,
    enableWelcomePage: false,
    requireDisplayName: false,
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
  };

  const interfaceConfigOverwrite = {
    SHOW_JITSI_WATERMARK: false,
    SHOW_BRAND_WATERMARK: false,
    DEFAULT_BACKGROUND: "#1a1a1a",
    TOOLBAR_ALWAYS_VISIBLE: true,
    APP_NAME: "Garage Talk",
  };

  // Render fullscreen sharing view separately from dialog
  if (isSharing) {
    return (
      <div className="fixed inset-0 z-[100] bg-background" data-testid="screen-share-fullscreen">
        <div className="flex items-center justify-between p-3 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/10">
              <MonitorUp className="h-5 w-5 text-green-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Live Screen Sharing</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Meeting ID: {formatMeetingId(meetingId)}</span>
                <span>•</span>
                <span>Passcode: {passcode}</span>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {participantCount}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={copyMeetingId}
              className="gap-2"
              data-testid="button-copy-meeting-id"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy ID"}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={copyPasscode}
              className="gap-2"
              data-testid="button-copy-passcode"
            >
              {copiedPasscode ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {copiedPasscode ? "Copied!" : "Copy Passcode"}
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleStopSharing}
              className="gap-2"
              data-testid="button-end-screen-share"
            >
              <Phone className="h-4 w-4" />
              End Session
            </Button>
          </div>
        </div>
        
        <div className="h-[calc(100vh-57px)]">
          <JitsiMeeting
            domain={JITSI_DOMAIN}
            roomName={jitsiRoom}
            configOverwrite={configOverwrite}
            interfaceConfigOverwrite={interfaceConfigOverwrite}
            userInfo={{
              displayName: userName,
              email: `${userName}@garagetalk.local`,
            }}
            onApiReady={(api) => {
              apiRef.current = api;

              api.addEventListener("videoConferenceJoined", () => {
                setTimeout(() => {
                  try {
                    api.executeCommand('toggleShareScreen');
                  } catch (e) {
                    console.log("Could not auto-start screen share:", e);
                  }
                }, 1000);
              });

              api.addEventListener("videoConferenceLeft", () => {
                apiRef.current = null;
                setIsSharing(false);
                setParticipantCount(1);
                onOpenChange(false);
              });

              api.addEventListener("participantJoined", () => {
                setParticipantCount(prev => prev + 1);
              });

              api.addEventListener("participantLeft", () => {
                setParticipantCount(prev => Math.max(1, prev - 1));
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

  // Helper to start the Jitsi meeting after viewing credentials
  const handleStartMeeting = () => {
    setShowCredentials(false);
    setIsSharing(true);
    onOpenChange(false);
  };

  // Show credentials dialog before starting meeting
  if (showCredentials && meetingId && passcode) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setShowCredentials(false);
        }
        onOpenChange(isOpen);
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-credentials">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Session Created!
            </DialogTitle>
            <DialogDescription>
              Share these credentials with people you want to join your session
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Meeting ID</p>
                  <p className="text-lg font-mono font-semibold" data-testid="text-meeting-id">
                    {formatMeetingId(meetingId)}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyMeetingId}
                  className="gap-2"
                  data-testid="button-copy-meeting-id-credentials"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Passcode</p>
                  <p className="text-lg font-mono font-semibold" data-testid="text-passcode">
                    {passcode}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyPasscode}
                  className="gap-2"
                  data-testid="button-copy-passcode-credentials"
                >
                  {copiedPasscode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedPasscode ? "Copied!" : "Copy"}
                </Button>
              </div>
            </Card>

            <p className="text-sm text-muted-foreground text-center">
              You can also copy these from the meeting toolbar later
            </p>

            <Button 
              onClick={handleStartMeeting}
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              data-testid="button-start-meeting"
            >
              <Video className="h-4 w-4" />
              Start Screen Sharing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-screen-share">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-green-500" />
            Screen Sharing
          </DialogTitle>
          <DialogDescription>
            Start a new session or join an existing one with a meeting code
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "host" | "join")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="host" className="gap-2" data-testid="tab-host">
              <MonitorUp className="h-4 w-4" />
              Host
            </TabsTrigger>
            <TabsTrigger value="join" className="gap-2" data-testid="tab-join">
              <Users className="h-4 w-4" />
              Join
            </TabsTrigger>
          </TabsList>

          <TabsContent value="host" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="session-title">Session Title (optional)</Label>
              <Input
                id="session-title"
                placeholder="e.g., Engine Diagnostics Demo"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSharing()}
                data-testid="input-session-title"
              />
              <p className="text-xs text-muted-foreground">
                You'll receive a meeting ID and passcode to share with participants
              </p>
            </div>

            <Card className="p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Secure Sessions</p>
                  <p className="text-muted-foreground">
                    Each session gets a unique meeting ID and passcode. Share these with
                    people you want to join.
                  </p>
                </div>
              </div>
            </Card>

            <Button 
              onClick={handleStartSharing}
              disabled={createSessionMutation.isPending}
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              data-testid="button-start-hosting"
            >
              <MonitorUp className="h-4 w-4" />
              {createSessionMutation.isPending ? "Starting..." : "Start New Session"}
            </Button>
          </TabsContent>

          <TabsContent value="join" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="join-meeting-id">Meeting ID</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="join-meeting-id"
                  placeholder="123-456-7890"
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                  className="pl-10"
                  data-testid="input-join-meeting-id"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="join-passcode">Passcode</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="join-passcode"
                  placeholder="ABC123"
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value.toUpperCase())}
                  className="pl-10 uppercase"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                  data-testid="input-join-passcode"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Get the meeting ID and passcode from the host
              </p>
            </div>

            <Button 
              onClick={handleJoinSession}
              disabled={joinSessionMutation.isPending || !joinMeetingId.trim() || !joinPasscode.trim()}
              className="w-full gap-2"
              data-testid="button-join-session"
            >
              <Video className="h-4 w-4" />
              {joinSessionMutation.isPending ? "Joining..." : "Join Session"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
