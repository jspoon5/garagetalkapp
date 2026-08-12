import { useState, useEffect, useRef, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Video, Monitor, Radio, Users, Play, RefreshCw, Key, Link as LinkIcon, ExternalLink, Copy, Check, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JitsiMeetingRoom from "@/components/JitsiMeetingRoom";

interface StreamInfo {
  streamId: string;
  broadcasterUsername: string;
  title: string;
  startedAt: string;
  viewerCount: number;
  streamType: 'camera' | 'screen';
}

type Mode = 'browse' | 'broadcast' | 'watch';

export default function NativeStreaming() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>('browse');
  const [streamTitle, setStreamTitle] = useState("");
  const [streamType, setStreamType] = useState<'camera' | 'screen'>('camera');
  const [activeStreams, setActiveStreams] = useState<StreamInfo[]>([]);
  const [watchingStream, setWatchingStream] = useState<StreamInfo | null>(null);
  const [roomName, setRoomName] = useState<string>("");
  
  // Occular Streaming state
  const [occularStreamKey, setOccularStreamKey] = useState("");
  const [occularStreamUrl, setOccularStreamUrl] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessagesRef = useRef<string[]>([]);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
      // Flush any pending messages
      while (pendingMessagesRef.current.length > 0) {
        const msg = pendingMessagesRef.current.shift();
        if (msg) ws.send(msg);
      }
      // Fetch active streams
      ws.send(JSON.stringify({ type: 'getActiveStreams' }));
    };
    
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'activeStreams':
          setActiveStreams(message.streams);
          break;
          
        case 'newStreamAvailable':
          setActiveStreams(prev => [...prev, message.stream]);
          break;
          
        case 'streamRemoved':
          setActiveStreams(prev => prev.filter(s => s.streamId !== message.streamId));
          break;
          
        case 'error':
          toast({
            title: "Error",
            description: message.message,
            variant: "destructive",
          });
          break;
      }
    };
    
    ws.onclose = () => {
      setTimeout(() => {
        if (mode === 'browse') {
          connectWebSocket();
        }
      }, 3000);
    };
    
    wsRef.current = ws;
  }, [mode, toast]);

  // Helper to send WebSocket messages with reconnect/queue logic
  const sendWsMessage = useCallback((message: object) => {
    const msgStr = JSON.stringify(message);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(msgStr);
    } else {
      // Queue the message to be sent when connection opens
      pendingMessagesRef.current.push(msgStr);
      
      // Attempt reconnect if not already connecting
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
    }
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const refreshStreams = () => {
    wsRef.current?.send(JSON.stringify({ type: 'getActiveStreams' }));
  };

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

  const startBroadcast = () => {
    // Generate a unique room name for the broadcast
    const roomId = `garagetalk_${user?.username || 'anon'}_${Date.now()}`;
    setRoomName(roomId);
    
    // Announce the stream via WebSocket so others can discover it
    sendWsMessage({
      type: 'createStream',
      streamId: roomId,
      title: streamTitle || `${user?.username || 'Anonymous'}'s Stream`,
      username: user?.username,
      userId: user?.id,
      streamType,
    });
    
    setMode('broadcast');
    toast({
      title: "Starting broadcast",
      description: "You're now live! Share your room ID with others.",
    });
  };

  const watchStream = (stream: StreamInfo) => {
    // For Jitsi, we use the stream ID as room name
    setRoomName(stream.streamId);
    setWatchingStream(stream);
    setMode('watch');
  };

  const handleLeaveBroadcast = () => {
    // End the stream via WebSocket
    sendWsMessage({ type: 'endStream' });
    setMode('browse');
    setRoomName("");
    setStreamTitle("");
    toast({
      title: "Broadcast ended",
      description: "Your stream has been stopped.",
    });
  };

  const handleLeaveWatch = () => {
    setMode('browse');
    setRoomName("");
    setWatchingStream(null);
  };

  // Broadcast mode - using Jitsi
  if (mode === 'broadcast' && roomName) {
    return (
      <div className="h-screen flex flex-col">
        <div className="bg-background border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleLeaveBroadcast} data-testid="button-back-browse">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                Live Broadcast
              </h1>
              <p className="text-sm text-muted-foreground">{streamTitle || "Untitled Stream"}</p>
            </div>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            Room: {roomName.slice(0, 20)}...
          </Badge>
        </div>
        <div className="flex-1">
          <JitsiMeetingRoom
            roomName={roomName}
            userName={user?.username || "Broadcaster"}
            feature="live_streaming"
            onLeave={handleLeaveBroadcast}
          />
        </div>
      </div>
    );
  }

  // Watch mode - using Jitsi
  if (mode === 'watch' && roomName && watchingStream) {
    return (
      <div className="h-screen flex flex-col">
        <div className="bg-background border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleLeaveWatch} data-testid="button-back-browse">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{watchingStream.title}</h1>
              <p className="text-sm text-muted-foreground">
                Streaming by {watchingStream.broadcasterUsername}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {watchingStream.viewerCount} watching
          </Badge>
        </div>
        <div className="flex-1">
          <JitsiMeetingRoom
            roomName={roomName}
            userName={user?.username || "Viewer"}
            feature="live_streaming"
            onLeave={handleLeaveWatch}
          />
        </div>
      </div>
    );
  }

  // Browse mode - show available streams and broadcast options
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Live Streaming</h1>
        <p className="text-muted-foreground">
          Stream directly using Jitsi - share your camera, screen, or watch others live
        </p>
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

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Go Live Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Go Live with Jitsi
            </CardTitle>
            <CardDescription>
              Start a live broadcast room - others can join and watch
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="stream-title">Stream Title</Label>
              <Input
                id="stream-title"
                placeholder="What are you streaming?"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                data-testid="input-stream-title"
              />
            </div>
            
            <div>
              <Label>Source</Label>
              <RadioGroup
                value={streamType}
                onValueChange={(v) => setStreamType(v as 'camera' | 'screen')}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="camera" id="camera" data-testid="radio-camera" />
                  <Label htmlFor="camera" className="flex items-center gap-2 cursor-pointer">
                    <Video className="h-4 w-4" />
                    Camera
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="screen" id="screen" data-testid="radio-screen" />
                  <Label htmlFor="screen" className="flex items-center gap-2 cursor-pointer">
                    <Monitor className="h-4 w-4" />
                    Screen
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            <Button 
              className="w-full" 
              onClick={startBroadcast}
              data-testid="button-go-live"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Jitsi Broadcast
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Jitsi provides reliable video conferencing with screen sharing, chat, and more.
              Share the room link with others to let them join your stream.
            </p>
          </CardContent>
        </Card>

        {/* Live Streams Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Live Streams
                </CardTitle>
                <CardDescription>
                  {activeStreams.length} active stream{activeStreams.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={refreshStreams}
                data-testid="button-refresh-streams"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeStreams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No live streams right now</p>
                <p className="text-sm">Be the first to go live!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStreams.map((stream) => (
                  <div
                    key={stream.streamId}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`stream-item-${stream.streamId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {stream.streamType === 'camera' ? (
                          <Video className="h-8 w-8 text-primary" />
                        ) : (
                          <Monitor className="h-8 w-8 text-primary" />
                        )}
                        <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                      </div>
                      <div>
                        <p className="font-medium">{stream.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {stream.broadcasterUsername} • {stream.viewerCount} watching
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => watchStream(stream)}
                      data-testid={`button-watch-${stream.streamId}`}
                    >
                      Watch
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Join Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Join a Stream by Room ID</CardTitle>
          <CardDescription>
            Enter a room ID to join an existing Jitsi stream
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Enter room ID (e.g., garagetalk_mechanic_123456)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              data-testid="input-room-id"
            />
            <Button
              onClick={() => {
                if (roomName.trim()) {
                  setWatchingStream({
                    streamId: roomName.trim(),
                    broadcasterUsername: "Unknown",
                    title: "Joined Stream",
                    startedAt: new Date().toISOString(),
                    viewerCount: 0,
                    streamType: 'camera',
                  });
                  setMode('watch');
                }
              }}
              disabled={!roomName.trim()}
              data-testid="button-join-room"
            >
              Join Room
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
