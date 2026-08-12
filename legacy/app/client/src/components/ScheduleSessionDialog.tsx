import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Clock, Users, Video, MonitorPlay, Radio } from "lucide-react";

interface ScheduleSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SessionType = "screen_share" | "video_call" | "livestream";

export function ScheduleSessionDialog({ open, onOpenChange }: ScheduleSessionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("screen_share");
  const [scheduledDate, setScheduledDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [inviteeEmails, setInviteeEmails] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      sessionType: SessionType;
      scheduledStart: string;
      scheduledEnd: string;
      inviteeEmails: string[];
    }) => {
      const response = await apiRequest("POST", "/api/scheduled-sessions", data);
      return response.json();
    },
    onSuccess: (data) => {
      const calendarMessage = data.calendarSynced 
        ? " Calendar invite sent!" 
        : data.calendarSyncFailed 
          ? " (Calendar sync unavailable)"
          : "";
      toast({
        title: "Session Scheduled",
        description: `Your ${sessionType.replace("_", " ")} has been scheduled for ${new Date(data.scheduledStart).toLocaleString()}.${calendarMessage}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-sessions"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Scheduling Failed",
        description: error.message || "Failed to schedule session",
        variant: "destructive",
      });
    },
  });
  
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSessionType("screen_share");
    setScheduledDate("");
    setStartTime("");
    setDuration("60");
    setInviteeEmails("");
  };
  
  const handleSubmit = () => {
    if (!title.trim()) {
      toast({
        title: "Missing Title",
        description: "Please enter a title for your session",
        variant: "destructive",
      });
      return;
    }
    
    if (!scheduledDate) {
      toast({
        title: "Missing Date",
        description: "Please select a date for your session",
        variant: "destructive",
      });
      return;
    }
    
    if (!startTime) {
      toast({
        title: "Missing Time",
        description: "Please select a start time for your session",
        variant: "destructive",
      });
      return;
    }
    
    const startDateTime = new Date(`${scheduledDate}T${startTime}`);
    const now = new Date();
    
    // Validate that the session is in the future (at least 5 minutes from now)
    const minStartTime = new Date(now.getTime() + 5 * 60000);
    if (startDateTime <= minStartTime) {
      toast({
        title: "Invalid Time",
        description: "Please schedule the session at least 5 minutes in the future",
        variant: "destructive",
      });
      return;
    }
    
    const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);
    
    const emails = inviteeEmails
      .split(/[,\s]+/)
      .map(e => e.trim())
      .filter(e => e.includes("@"));
    
    // Validate email format
    const invalidEmails = inviteeEmails
      .split(/[,\s]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && !e.includes("@"));
    
    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid Email",
        description: `Please check email format: ${invalidEmails.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    
    scheduleMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      sessionType,
      scheduledStart: startDateTime.toISOString(),
      scheduledEnd: endDateTime.toISOString(),
      inviteeEmails: emails,
    });
  };
  
  const getSessionIcon = (type: SessionType) => {
    switch (type) {
      case "screen_share": return <MonitorPlay className="h-4 w-4" />;
      case "video_call": return <Video className="h-4 w-4" />;
      case "livestream": return <Radio className="h-4 w-4" />;
    }
  };
  
  const minDate = new Date().toISOString().split("T")[0];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule a Session
          </DialogTitle>
          <DialogDescription>
            Schedule a screen share, video call, or livestream for later
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="session-title">Title *</Label>
            <Input
              id="session-title"
              data-testid="input-session-title"
              placeholder="e.g., Transmission Repair Workshop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="session-type">Session Type *</Label>
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
              <SelectTrigger id="session-type" data-testid="select-session-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screen_share" data-testid="option-screen-share">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="h-4 w-4" />
                    Screen Share
                  </div>
                </SelectItem>
                <SelectItem value="video_call" data-testid="option-video-call">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Video Call
                  </div>
                </SelectItem>
                <SelectItem value="livestream" data-testid="option-livestream">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    Livestream
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="session-date">Date *</Label>
              <Input
                id="session-date"
                data-testid="input-session-date"
                type="date"
                min={minDate}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-time">Start Time *</Label>
              <Input
                id="session-time"
                data-testid="input-session-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="session-duration">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="session-duration" data-testid="select-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="180">3 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="session-description">Description</Label>
            <Textarea
              id="session-description"
              data-testid="input-session-description"
              placeholder="What will this session cover?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="invitee-emails" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Invite Participants (optional)
            </Label>
            <Input
              id="invitee-emails"
              data-testid="input-invitee-emails"
              placeholder="email1@example.com, email2@example.com"
              value={inviteeEmails}
              onChange={(e) => setInviteeEmails(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separate emails with commas. They'll receive calendar invites if Google Calendar is connected.
            </p>
          </div>
        </div>
        
        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-schedule"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={scheduleMutation.isPending}
            data-testid="button-confirm-schedule"
          >
            {scheduleMutation.isPending ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
