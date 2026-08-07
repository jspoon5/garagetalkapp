import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isPast, isFuture, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Calendar, 
  Clock, 
  MonitorPlay, 
  Video, 
  Radio, 
  Trash2, 
  Play,
  Users,
  Copy,
  Check
} from "lucide-react";
import { useState } from "react";

interface ScheduledSession {
  id: string;
  title: string;
  description: string | null;
  sessionType: "screen_share" | "video_call" | "livestream";
  status: string;
  hostId: string;
  hostName: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetingId?: string;
  passcode?: string;
  inviteeEmails: string[];
  confirmedAttendees: string[];
}

interface ScheduledSessionsListProps {
  onStartSession?: (session: ScheduledSession) => void;
}

export function ScheduledSessionsList({ onStartSession }: ScheduledSessionsListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: sessions = [], isLoading } = useQuery<ScheduledSession[]>({
    queryKey: ["/api/scheduled-sessions"],
  });
  
  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("DELETE", `/api/scheduled-sessions/${sessionId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Session Cancelled",
        description: "The scheduled session has been cancelled",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-sessions"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel session",
        variant: "destructive",
      });
    },
  });
  
  const getSessionIcon = (type: string) => {
    switch (type) {
      case "screen_share": return <MonitorPlay className="h-4 w-4" />;
      case "video_call": return <Video className="h-4 w-4" />;
      case "livestream": return <Radio className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };
  
  const getSessionTypeName = (type: string) => {
    switch (type) {
      case "screen_share": return "Screen Share";
      case "video_call": return "Video Call";
      case "livestream": return "Livestream";
      default: return type;
    }
  };
  
  const getStatusBadge = (session: ScheduledSession) => {
    const start = new Date(session.scheduledStart);
    const end = new Date(session.scheduledEnd);
    const now = new Date();
    
    if (session.status === "cancelled") {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (session.status === "completed") {
      return <Badge variant="secondary">Completed</Badge>;
    }
    if (now >= start && now <= end) {
      return <Badge className="bg-green-500 text-white">Live Now</Badge>;
    }
    if (isPast(end)) {
      return <Badge variant="secondary">Ended</Badge>;
    }
    if (isToday(start)) {
      return <Badge className="bg-yellow-500 text-white">Today</Badge>;
    }
    return <Badge variant="outline">Upcoming</Badge>;
  };
  
  const canStartSession = (session: ScheduledSession) => {
    const start = new Date(session.scheduledStart);
    const now = new Date();
    const fifteenMinutesBefore = new Date(start.getTime() - 15 * 60000);
    return now >= fifteenMinutesBefore && session.status !== "cancelled" && session.status !== "completed";
  };
  
  const copyCredentials = (session: ScheduledSession) => {
    if (session.meetingId && session.passcode) {
      const text = `Meeting ID: ${session.meetingId}\nPasscode: ${session.passcode}`;
      navigator.clipboard.writeText(text);
      setCopiedId(session.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Copied",
        description: "Meeting credentials copied to clipboard",
      });
    }
  };
  
  // Filter to only show upcoming and today's sessions
  const upcomingSessions = sessions.filter(s => {
    const end = new Date(s.scheduledEnd);
    return !isPast(end) || s.status === "in_progress";
  });
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Scheduled Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (upcomingSessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Scheduled Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mb-4 opacity-50" />
            <p>No upcoming sessions scheduled</p>
            <p className="text-sm mt-1">Use the Schedule button to plan your next session</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Scheduled Sessions
          <Badge variant="secondary" className="ml-2">{upcomingSessions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingSessions.map((session) => (
          <div
            key={session.id}
            className="flex items-start justify-between p-4 rounded-lg border bg-card"
            data-testid={`scheduled-session-${session.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getSessionIcon(session.sessionType)}
                <span className="font-medium truncate">{session.title}</span>
                {getStatusBadge(session)}
              </div>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(session.scheduledStart), "MMM d, h:mm a")}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                  {getSessionTypeName(session.sessionType)}
                </span>
              </div>
              
              {session.inviteeEmails && session.inviteeEmails.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                  <Users className="h-3 w-3" />
                  {session.inviteeEmails.length} invited
                </div>
              )}
              
              {session.meetingId && session.passcode && (
                <div className="mt-2 text-xs font-mono bg-muted px-2 py-1 rounded inline-flex items-center gap-2">
                  ID: {session.meetingId} | Pass: {session.passcode}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => copyCredentials(session)}
                    data-testid={`button-copy-credentials-${session.id}`}
                  >
                    {copiedId === session.id ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              {canStartSession(session) && onStartSession && (
                <Button
                  size="sm"
                  onClick={() => onStartSession(session)}
                  data-testid={`button-start-session-${session.id}`}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => cancelMutation.mutate(session.id)}
                disabled={cancelMutation.isPending}
                data-testid={`button-cancel-session-${session.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
