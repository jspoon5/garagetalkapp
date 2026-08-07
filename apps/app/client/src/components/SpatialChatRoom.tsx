import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SendIcon, Users2Icon, MapPin, Check, Search, Crosshair, Loader2, Smile, Upload, User, Gift } from "lucide-react";
import TipGiftDialog from "@/components/TipGiftDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Message, RoomParticipant } from "@shared/schema";

interface Props {
  roomId: string;
  roomName: string;
}

interface UserLocation {
  lat: number;
  lng: number;
  name: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

const DEFAULT_LOCATION: UserLocation = { lat: 40.7128, lng: -74.006, name: "New York, USA" };
const PROXIMITY_THRESHOLD_KM = 0.5;

// Preset expressions for avatar display
const PRESET_EXPRESSIONS = [
  { id: "happy", emoji: "😊", label: "Happy" },
  { id: "thinking", emoji: "🤔", label: "Thinking" },
  { id: "cool", emoji: "😎", label: "Cool" },
  { id: "wrench", emoji: "🔧", label: "Working" },
  { id: "question", emoji: "❓", label: "Need Help" },
  { id: "thumbsup", emoji: "👍", label: "Agree" },
  { id: "fire", emoji: "🔥", label: "Excited" },
  { id: "car", emoji: "🚗", label: "Car Talk" },
  { id: "tools", emoji: "🛠️", label: "Fixing" },
  { id: "lightbulb", emoji: "💡", label: "Idea" },
] as const;

type ExpressionType = "profile" | "custom" | typeof PRESET_EXPRESSIONS[number]["id"];

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface AvatarInfo {
  color: string;
  url?: string | null;
  type?: string;
  expression?: string;
  customExpressionUrl?: string | null;
}

function createLabelIcon(
  username: string, 
  avatar: AvatarInfo, 
  isCurrentUser: boolean = false
): L.DivIcon {
  const ringStyle = isCurrentUser ? "border: 3px solid #000;" : "";
  const size = isCurrentUser ? 44 : 40;
  const safeUsername = escapeHtml(username);
  const label = isCurrentUser ? `${safeUsername} (You)` : safeUsername;
  const fontWeight = isCurrentUser ? "bold" : "normal";
  const safeColor = avatar.color.replace(/[^#a-fA-F0-9]/g, '');
  
  // Check for expression-based avatar first
  const expression = avatar.expression;
  const presetExpression = PRESET_EXPRESSIONS.find(e => e.id === expression);
  
  let avatarContent: string;
  
  if (expression === "custom" && avatar.customExpressionUrl) {
    // Custom uploaded expression image
    avatarContent = `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        ${ringStyle}
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        overflow: hidden;
        background-color: ${safeColor};
      ">
        <img 
          src="${avatar.customExpressionUrl}" 
          alt="${safeUsername}"
          style="width: 100%; height: 100%; object-fit: cover;"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div style="
          display: none;
          width: 100%;
          height: 100%;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: ${size * 0.4}px;
        ">${safeUsername.slice(0, 2).toUpperCase()}</div>
      </div>
    `;
  } else if (presetExpression) {
    // Preset emoji expression
    avatarContent = `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${safeColor};
        border-radius: 50%;
        ${ringStyle}
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${size * 0.55}px;
      ">${presetExpression.emoji}</div>
    `;
  } else if ((avatar.type === "image" || avatar.type === "animated") && avatar.url) {
    // Profile avatar (image or animated)
    avatarContent = `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        ${ringStyle}
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        overflow: hidden;
        background-color: ${safeColor};
      ">
        <img 
          src="${avatar.url}" 
          alt="${safeUsername}"
          style="width: 100%; height: 100%; object-fit: cover;"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div style="
          display: none;
          width: 100%;
          height: 100%;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: ${size * 0.4}px;
        ">${safeUsername.slice(0, 2).toUpperCase()}</div>
      </div>
    `;
  } else {
    // Colored circle with initials (default)
    avatarContent = `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${safeColor};
        border-radius: 50%;
        ${ringStyle}
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size * 0.4}px;
      ">${safeUsername.slice(0, 2).toUpperCase()}</div>
    `;
  }
  
  return L.divIcon({
    className: "custom-avatar-marker",
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translateY(-10px);">
        <span style="
          font-size: 11px;
          font-weight: ${fontWeight};
          color: #1a1a1a;
          background: rgba(255,255,255,0.9);
          padding: 2px 6px;
          border-radius: 4px;
          margin-bottom: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        ">${label}</span>
        ${avatarContent}
      </div>
    `,
    iconSize: [size, size + 24],
    iconAnchor: [size / 2, size + 12],
  });
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapViewUpdater({ center, shouldFly }: { center: [number, number]; shouldFly: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (shouldFly) {
      map.flyTo(center, 15, { duration: 1 });
    }
  }, [center, map, shouldFly]);
  return null;
}

function FlyToParticipant({ position, trigger }: { position: [number, number] | null; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (position && trigger > 0) {
      map.flyTo(position, 16, { duration: 0.8 });
    }
  }, [position, trigger, map]);
  return null;
}

export default function SpatialChatRoom({ roomId, roomName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [shouldFlyToLocation, setShouldFlyToLocation] = useState(false);
  const [myPosition, setMyPosition] = useState<[number, number]>([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng]);
  const [cityInput, setCityInput] = useState("");
  const [isEditingCity, setIsEditingCity] = useState(false);
  const [isSavingCity, setIsSavingCity] = useState(false);
  
  const [locationSearch, setLocationSearch] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [tipTarget, setTipTarget] = useState<{ userId: string; username: string } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [highlightedUser, setHighlightedUser] = useState<string | null>(null);
  
  // Expression state for avatar display
  const [currentExpression, setCurrentExpression] = useState<ExpressionType>("profile");
  const [customExpressionUrl, setCustomExpressionUrl] = useState<string | null>(null);
  const [isUploadingExpression, setIsUploadingExpression] = useState(false);
  const [showExpressionPicker, setShowExpressionPicker] = useState(false);
  const expressionInputRef = useRef<HTMLInputElement>(null);
  
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const { toast } = useToast();
  
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentPositionRef = useRef({ lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng });
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Use authenticated user ID when available, fallback to ephemeral ID for guests
  const fallbackUserId = useRef(`guest-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  const fallbackUsername = useRef(`Mechanic${Math.floor(Math.random() * 9999)}`);
  const fallbackColor = useRef(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`);
  
  // Get actual user data or fallbacks
  const myUserId = useRef(user?.id || fallbackUserId.current);
  const myUsername = useRef(user?.username || fallbackUsername.current);
  const myAvatarColor = useRef(user?.avatarColor || fallbackColor.current);
  const myAvatarUrl = useRef<string | null>(user?.avatarUrl || null);
  const myAvatarType = useRef(user?.avatarType || "color");

  const searchLocation = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      // Include addressdetails=1 to get structured city/region info
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { 'User-Agent': 'GarageTalk/1.0' } }
      );
      const data: NominatimResult[] = await response.json();
      setSearchResults(data);
      setShowSearchResults(true);
    } catch (error) {
      console.error('[SpatialChat] Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setLocationSearch(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 300);
  }, [searchLocation]);

  // Extract city/region from Nominatim address object (avoid street-level/POI addresses)
  const extractCityFromAddress = useCallback((address: Record<string, string> | undefined, displayName: string): string => {
    if (address) {
      // Prefer structured city/town/village fields from address object
      const city = address.city || address.town || address.village || address.municipality || address.county;
      const region = address.state || address.region || address.country;
      
      if (city && region) {
        return `${city}, ${region}`;
      } else if (city) {
        return city;
      } else if (region) {
        return region;
      }
    }
    
    // Fallback: take last 2 parts of display_name (usually region, country)
    const parts = displayName.split(',').map(p => p.trim());
    return parts.slice(-2).join(', ');
  }, []);

  const selectSearchResult = useCallback((result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    // Use structured address fields to get only city/region (no street addresses or POIs)
    const cityName = extractCityFromAddress(result.address, result.display_name);
    
    const newLocation: UserLocation = { lat, lng, name: cityName };
    setSelectedLocation(newLocation);
    setMyPosition([lat, lng]);
    lastSentPositionRef.current = { lat, lng };
    setShouldFlyToLocation(true);
    setLocationSearch(cityName);
    setShowSearchResults(false);
    setSearchResults([]);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "position",
        x: lat,
        y: lng,
      }));
    }
    
    toast({
      title: "Location set",
      description: `Viewing ${cityName}`,
    });
    
    setTimeout(() => setShouldFlyToLocation(false), 1100);
  }, [toast, extractCityFromAddress]);

  // Use IP-based location (respects VPN settings for privacy)
  const useMyLocation = useCallback(async () => {
    setIsGettingLocation(true);
    
    try {
      // Get location based on IP address (VPN-friendly)
      const response = await fetch('/api/location/ip');
      const data = await response.json();
      
      if (data.lat && data.lon && data.displayName) {
        const newLocation: UserLocation = { 
          lat: data.lat, 
          lng: data.lon, 
          name: data.displayName 
        };
        setSelectedLocation(newLocation);
        setMyPosition([data.lat, data.lon]);
        lastSentPositionRef.current = { lat: data.lat, lng: data.lon };
        setShouldFlyToLocation(true);
        setLocationSearch(data.displayName);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "position",
            x: data.lat,
            y: data.lon,
          }));
        }
        
        toast({
          title: "Location found",
          description: `Showing ${data.displayName}`,
        });
        
        setTimeout(() => setShouldFlyToLocation(false), 1100);
      } else {
        toast({
          title: "Location unavailable",
          description: "Search for your city using the search box",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log('[SpatialChat] IP location error:', error);
      toast({
        title: "Location unavailable",
        description: "Search for your city using the search box",
        variant: "destructive",
      });
    } finally {
      setIsGettingLocation(false);
    }
  }, [toast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user?.city) {
      setCityInput(user.city);
    }
  }, [user?.city]);

  // Update user data refs when user data changes
  useEffect(() => {
    if (user?.id) {
      myUserId.current = user.id;
    }
    if (user?.username) {
      myUsername.current = user.username;
    }
    if (user?.avatarColor) {
      myAvatarColor.current = user.avatarColor;
    }
    myAvatarUrl.current = user?.avatarUrl || null;
    myAvatarType.current = user?.avatarType || "color";
  }, [user?.id, user?.username, user?.avatarColor, user?.avatarUrl, user?.avatarType]);

  // Auto-detect location on mount using IP-based geolocation (VPN-friendly, no exact addresses)
  useEffect(() => {
    const detectLocation = async () => {
      try {
        // Get location based on IP address (respects VPN for privacy)
        const response = await fetch('/api/location/ip');
        const data = await response.json();
        
        if (data.lat && data.lon && data.displayName) {
          const newLocation: UserLocation = { 
            lat: data.lat, 
            lng: data.lon, 
            name: data.displayName 
          };
          setSelectedLocation(newLocation);
          setMyPosition([data.lat, data.lon]);
          lastSentPositionRef.current = { lat: data.lat, lng: data.lon };
          setLocationSearch(data.displayName);
          setShouldFlyToLocation(true);
          
          toast({
            title: "Location found",
            description: `Showing ${data.displayName}`,
          });
          
          setTimeout(() => setShouldFlyToLocation(false), 1100);
        } else {
          // Fall back to default location silently
          setLocationSearch(DEFAULT_LOCATION.name);
        }
      } catch (error) {
        console.log('[SpatialChat] IP location auto-detect error:', error);
        setLocationSearch(DEFAULT_LOCATION.name);
      }
    };
    
    detectLocation();
  }, [toast]);

  const handleSaveCity = async () => {
    if (!user?.id) return;
    setIsSavingCity(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}`, { city: cityInput.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({ title: "City updated", description: "Your city will now appear in chat messages" });
      setIsEditingCity(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update city", variant: "destructive" });
    } finally {
      setIsSavingCity(false);
    }
  };

  useEffect(() => {
    // Wait until user data is loaded before connecting
    if (isUserLoading) {
      console.log('[SpatialChat] Waiting for user data to load...');
      return;
    }
    
    // Use user data or fallbacks
    const userId = user?.id || fallbackUserId.current;
    const username = user?.username || fallbackUsername.current;
    const avatarColor = user?.avatarColor || fallbackColor.current;
    const avatarUrl = user?.avatarUrl || null;
    const avatarType = user?.avatarType || "color";
    
    // Update refs with resolved values
    myUserId.current = userId;
    myUsername.current = username;
    myAvatarColor.current = avatarColor;
    myAvatarUrl.current = avatarUrl;
    myAvatarType.current = avatarType;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log('[SpatialChat] Connecting to WebSocket:', wsUrl, 'as', username);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[SpatialChat] WebSocket connected, joining as:', username);
      ws.send(JSON.stringify({
        type: "joinSpatial",
        roomId,
        userId,
        username,
        x: myPosition[0],
        y: myPosition[1],
        avatarColor,
        avatarUrl,
        avatarType,
      }));
    };

    ws.onerror = (error) => {
      console.error('[SpatialChat] WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('[SpatialChat] Received:', data.type);
      
      switch (data.type) {
        case "participants":
          setParticipants(data.participants);
          // Initialize current user's expression from server data
          const currentUserParticipant = data.participants.find(
            (p: RoomParticipant) => p.userId === myUserId.current
          );
          if (currentUserParticipant) {
            if (currentUserParticipant.expression) {
              setCurrentExpression(currentUserParticipant.expression as ExpressionType);
              if (currentUserParticipant.expression === "custom" && currentUserParticipant.customExpressionUrl) {
                setCustomExpressionUrl(currentUserParticipant.customExpressionUrl);
              }
            }
          }
          break;
        
        case "participantJoined":
          setParticipants(prev => [...prev, data.participant]);
          break;
        
        case "participantLeft":
          setParticipants(prev => prev.filter(p => p.userId !== data.userId));
          break;
        
        case "positionUpdate":
          setParticipants(prev => 
            prev.map(p => 
              p.userId === data.userId 
                ? { ...p, x: data.x.toString(), y: data.y.toString() }
                : p
            )
          );
          break;
        
        case "expressionUpdate":
          // Update participant's expression for map display
          setParticipants(prev => 
            prev.map(p => 
              p.userId === data.userId 
                ? { 
                    ...p, 
                    expression: data.expression,
                    customExpressionUrl: data.customExpressionUrl,
                  }
                : p
            )
          );
          break;
        
        case "message":
          setMessages(prev => [...prev, data.message]);
          break;
        
        case "history":
          setMessages(data.messages);
          break;
      }
    };

    ws.onclose = (event) => {
      console.log('[SpatialChat] WebSocket closed:', event.code, event.reason);
    };

    return () => {
      console.log('[SpatialChat] Cleaning up WebSocket connection');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leaveSpatial" }));
      }
      ws.close();
    };
  }, [roomId, isUserLoading, user?.id]);

  const handleMapClick = (lat: number, lng: number) => {
    setMyPosition([lat, lng]);
    
    const dLat = lat - lastSentPositionRef.current.lat;
    const dLng = lng - lastSentPositionRef.current.lng;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);
    
    if (distance > 0.0001 && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "position",
        x: lat,
        y: lng,
      }));
      lastSentPositionRef.current = { lat, lng };
    }
  };

  const nearbyParticipants = useMemo(() => {
    return participants.filter(p => {
      const pLat = parseFloat(p.x);
      const pLng = parseFloat(p.y);
      if (isNaN(pLat) || isNaN(pLng)) return false;
      const distance = getDistanceKm(myPosition[0], myPosition[1], pLat, pLng);
      return distance <= PROXIMITY_THRESHOLD_KM;
    });
  }, [participants, myPosition]);

  const nearbyMessages = useMemo(() => {
    return messages.filter(msg => 
      msg.isSystem || 
      nearbyParticipants.some(p => p.username === msg.username) ||
      msg.username === myUsername.current
    );
  }, [messages, nearbyParticipants]);

  const sendMessage = () => {
    if (!newMessage.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      type: "message",
      content: newMessage,
    }));

    setNewMessage("");
  };

  const handleParticipantClick = useCallback((participant: RoomParticipant) => {
    const pLat = parseFloat(participant.x);
    const pLng = parseFloat(participant.y);
    if (isNaN(pLat) || isNaN(pLng)) return;
    
    setFlyToPosition([pLat, pLng]);
    setFlyTrigger(prev => prev + 1);
    setHighlightedUser(participant.userId);
    
    toast({
      title: `Flying to ${participant.username}`,
      description: "Click on the map near them to chat",
    });
    
    setTimeout(() => setHighlightedUser(null), 3000);
  }, [toast]);

  const getParticipantByUsername = useCallback((username: string) => {
    return participants.find(p => p.username === username);
  }, [participants]);

  // Create the icon for the current user - includes expression state
  const myIcon = useMemo(() => {
    const username = user?.username || myUsername.current;
    const avatarColor = user?.avatarColor || myAvatarColor.current;
    const avatarUrl = user?.avatarUrl || myAvatarUrl.current;
    const avatarType = user?.avatarType || myAvatarType.current;
    
    return createLabelIcon(
      username, 
      { 
        color: avatarColor, 
        url: avatarUrl, 
        type: avatarType,
        expression: currentExpression === "profile" ? undefined : currentExpression,
        customExpressionUrl: customExpressionUrl,
      }, 
      true
    );
  }, [user?.username, user?.avatarUrl, user?.avatarType, user?.avatarColor, currentExpression, customExpressionUrl]);

  // Handle expression change and broadcast to other participants
  const handleExpressionChange = useCallback((expression: ExpressionType) => {
    setCurrentExpression(expression);
    setShowExpressionPicker(false);
    
    // Broadcast expression change via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "expression",
        expression: expression === "profile" ? null : expression,
        customExpressionUrl: expression === "custom" ? customExpressionUrl : null,
      }));
    }
    
    const presetExpression = PRESET_EXPRESSIONS.find(e => e.id === expression);
    if (presetExpression) {
      toast({
        title: "Expression changed",
        description: `You're now showing: ${presetExpression.label}`,
      });
    } else if (expression === "profile") {
      toast({
        title: "Using profile avatar",
        description: "Showing your profile picture on the map",
      });
    }
  }, [customExpressionUrl, toast]);

  // Handle custom expression image upload
  const handleExpressionUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 2MB for expressions)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Expression images must be under 2MB",
        variant: "destructive",
      });
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, GIF)",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploadingExpression(true);
    
    try {
      // Upload the image
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      const data = await response.json();
      const imageUrl = data.url;
      
      setCustomExpressionUrl(imageUrl);
      setCurrentExpression("custom");
      setShowExpressionPicker(false);
      
      // Broadcast the custom expression
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "expression",
          expression: "custom",
          customExpressionUrl: imageUrl,
        }));
      }
      
      toast({
        title: "Expression uploaded",
        description: "Your custom expression is now showing on the map",
      });
    } catch (error) {
      console.error("[SpatialChat] Expression upload error:", error);
      toast({
        title: "Upload failed",
        description: "Could not upload your expression image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingExpression(false);
      if (expressionInputRef.current) {
        expressionInputRef.current.value = "";
      }
    }
  }, [toast]);

  // Handle drag end for user's marker
  const handleDragEnd = useCallback((e: L.DragEndEvent) => {
    const marker = e.target;
    const position = marker.getLatLng();
    const lat = position.lat;
    const lng = position.lng;
    
    setMyPosition([lat, lng]);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "position",
        x: lat,
        y: lng,
      }));
      lastSentPositionRef.current = { lat, lng };
    }
  }, []);

  return (
    <>
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-room-name">{roomName}</h2>
          <p className="text-sm text-muted-foreground">Click on the map or drag your avatar to move around</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 relative" ref={searchContainerRef}>
            <Search className="h-4 w-4 text-muted-foreground" />
            <div className="relative">
              <Input
                value={locationSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                placeholder="Search any location..."
                className="h-8 w-48 text-sm"
                data-testid="input-location-search"
              />
              {isSearching && (
                <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-2 text-muted-foreground" />
              )}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-72 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.place_id}
                      onClick={() => selectSearchResult(result)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-b-0"
                      data-testid={`search-result-${result.place_id}`}
                    >
                      {/* Show only city/region, no street addresses or POI names */}
                      {extractCityFromAddress(result.address, result.display_name)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={useMyLocation}
              disabled={isGettingLocation}
              title="Use my location"
              data-testid="button-use-location"
            >
              {isGettingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
            </Button>
          </div>
          {user && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {isEditingCity ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    placeholder="Your city"
                    className="h-8 w-32 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveCity()}
                    data-testid="input-city-chat"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveCity}
                    disabled={isSavingCity}
                    data-testid="button-save-city"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-sm text-muted-foreground"
                  onClick={() => setIsEditingCity(true)}
                  data-testid="button-edit-city"
                >
                  {user.city || "Set your city"}
                </Button>
              )}
            </div>
          )}
          <Badge variant="secondary" className="gap-1" data-testid="badge-active-users">
            <Users2Icon className="h-4 w-4" />
            {participants.length} online
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <div 
            className="border rounded-md overflow-hidden" 
            style={{ height: "500px" }}
            data-testid="map-spatial-room"
          >
            <MapContainer
              center={[selectedLocation.lat, selectedLocation.lng]}
              zoom={15}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
              doubleClickZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onMapClick={handleMapClick} />
              <MapViewUpdater center={[selectedLocation.lat, selectedLocation.lng]} shouldFly={shouldFlyToLocation} />
              <FlyToParticipant position={flyToPosition} trigger={flyTrigger} />
              
              {participants.map(p => {
                if (p.userId === myUserId.current) return null;
                const pLat = parseFloat(p.x);
                const pLng = parseFloat(p.y);
                if (isNaN(pLat) || isNaN(pLng)) return null;
                const isHighlighted = highlightedUser === p.userId;
                
                return (
                  <Marker
                    key={p.userId}
                    position={[pLat, pLng]}
                    icon={createLabelIcon(
                      p.username, 
                      { 
                        color: isHighlighted ? '#ff6b6b' : p.avatarColor, 
                        url: p.avatarUrl, 
                        type: p.avatarType,
                        expression: p.expression || undefined,
                        customExpressionUrl: p.customExpressionUrl || undefined,
                      }, 
                      false
                    )}
                    eventHandlers={{
                      click: () => handleParticipantClick(p),
                    }}
                  >
                    <Popup>
                      <div className="text-center p-1">
                        <strong>{escapeHtml(p.username)}</strong>
                        <p className="text-xs text-muted-foreground mt-1">Click avatar to fly here</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
              
              <Marker
                position={myPosition}
                icon={myIcon}
                draggable={true}
                eventHandlers={{
                  dragend: handleDragEnd,
                }}
              >
                <Popup>
                  <div className="text-center">
                    <strong>{escapeHtml(user?.username || myUsername.current)} (You)</strong>
                    <p className="text-xs text-muted-foreground mt-1">Drag to move your avatar</p>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Drag your avatar or click anywhere to move. Get close to others to chat with them.
          </p>
        </div>

        <div className="lg:col-span-2 flex flex-col border rounded-md bg-card p-4 min-h-[500px]">
          <div className="mb-3 pb-3 border-b">
            <div className="flex items-center justify-between gap-1">
              <h3 className="font-semibold text-sm">Chat</h3>
              <Badge variant="outline" data-testid="badge-nearby-users">
                {nearbyParticipants.length} nearby
              </Badge>
            </div>
          </div>

          <ScrollArea className="flex-1 pr-4 mb-4">
            <div className="space-y-3">
              {nearbyMessages.length > 0 ? (
                nearbyMessages.map((msg) => {
                  const participant = getParticipantByUsername(msg.username);
                  const isMe = msg.username === myUsername.current;
                  
                  return (
                    <div
                      key={msg.id}
                      className={msg.isSystem ? "text-center" : ""}
                      data-testid={`message-${msg.id}`}
                    >
                      {msg.isSystem ? (
                        <p className="text-xs text-muted-foreground italic">{msg.content}</p>
                      ) : (
                        <div className="flex gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button 
                                className="focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
                                data-testid={`avatar-${msg.username}`}
                              >
                                <Avatar 
                                  className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                  style={{ 
                                    backgroundColor: participant?.avatarColor || (isMe ? myAvatarColor.current : '#888') 
                                  }}
                                >
                                  {(participant?.avatarUrl || (isMe && user?.avatarUrl)) && (
                                    <AvatarImage 
                                      src={participant?.avatarUrl || user?.avatarUrl || undefined} 
                                      alt={msg.username} 
                                    />
                                  )}
                                  <AvatarFallback 
                                    className="text-white text-xs font-semibold"
                                    style={{ 
                                      backgroundColor: participant?.avatarColor || (isMe ? myAvatarColor.current : '#888') 
                                    }}
                                  >
                                    {msg.username.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" side="right">
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <Avatar 
                                    className="h-12 w-12"
                                    style={{ 
                                      backgroundColor: participant?.avatarColor || (isMe ? myAvatarColor.current : '#888') 
                                    }}
                                  >
                                    {(participant?.avatarUrl || (isMe && user?.avatarUrl)) && (
                                      <AvatarImage 
                                        src={participant?.avatarUrl || user?.avatarUrl || undefined} 
                                        alt={msg.username} 
                                      />
                                    )}
                                    <AvatarFallback 
                                      className="text-white font-semibold"
                                      style={{ 
                                        backgroundColor: participant?.avatarColor || (isMe ? myAvatarColor.current : '#888') 
                                      }}
                                    >
                                      {msg.username.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{msg.username}</p>
                                    {isMe && <p className="text-xs text-muted-foreground">You</p>}
                                  </div>
                                </div>
                                {(participant?.bio || (isMe && user?.bio)) && (
                                  <p className="text-xs text-muted-foreground border-t pt-2">
                                    {participant?.bio || user?.bio}
                                  </p>
                                )}
                                {participant && !isMe && (
                                  <div className="space-y-2">
                                    <Button
                                      size="sm"
                                      className="w-full gap-1"
                                      onClick={() => handleParticipantClick(participant)}
                                      data-testid={`button-fly-to-${msg.username}`}
                                    >
                                      <MapPin className="h-3 w-3" />
                                      Fly to location
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full gap-1"
                                      onClick={() => setTipTarget({ userId: participant.userId, username: msg.username })}
                                      data-testid={`button-tip-${msg.username}`}
                                    >
                                      <Gift className="h-3 w-3" />
                                      Send Gift
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="flex-1 bg-muted/50 rounded-md p-2">
                            <p className="text-xs font-semibold text-primary">
                              {msg.username}
                              {msg.userCity && (
                                <span className="font-normal text-muted-foreground ml-1">
                                  ({msg.userCity})
                                </span>
                              )}
                            </p>
                            <p className="text-sm mt-1">{msg.content}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-muted-foreground text-sm">
                  Move close to other users to see their messages
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Popover open={showExpressionPicker} onOpenChange={setShowExpressionPicker}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="shrink-0"
                  data-testid="button-expression-picker"
                >
                  {currentExpression === "profile" ? (
                    <User className="h-4 w-4" />
                  ) : currentExpression === "custom" ? (
                    <Smile className="h-4 w-4" />
                  ) : (
                    <span className="text-lg">
                      {PRESET_EXPRESSIONS.find(e => e.id === currentExpression)?.emoji || "😊"}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" side="top" align="start">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Your Map Expression</Label>
                    <p className="text-xs text-muted-foreground mt-1">Choose how you appear on the map</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Button
                      variant={currentExpression === "profile" ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => handleExpressionChange("profile")}
                      data-testid="button-expression-profile"
                    >
                      <User className="h-4 w-4" />
                      <span>Use Profile Avatar</span>
                    </Button>
                    
                    <div className="grid grid-cols-5 gap-1">
                      {PRESET_EXPRESSIONS.map((expr) => (
                        <Tooltip key={expr.id}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={currentExpression === expr.id ? "default" : "ghost"}
                              size="icon"
                              className="h-10 w-10 text-lg"
                              onClick={() => handleExpressionChange(expr.id)}
                              data-testid={`button-expression-${expr.id}`}
                            >
                              {expr.emoji}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{expr.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                    
                    <div className="pt-2 border-t">
                      <input
                        type="file"
                        ref={expressionInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleExpressionUpload}
                      />
                      <Button
                        variant={currentExpression === "custom" ? "default" : "outline"}
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={() => expressionInputRef.current?.click()}
                        disabled={isUploadingExpression}
                        data-testid="button-expression-upload"
                      >
                        {isUploadingExpression ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        <span>Upload Custom Expression</span>
                      </Button>
                      {customExpressionUrl && currentExpression === "custom" && (
                        <div className="flex items-center gap-2 mt-2">
                          <img 
                            src={customExpressionUrl} 
                            alt="Custom expression" 
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <span className="text-xs text-muted-foreground">Current custom expression</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button 
              onClick={sendMessage} 
              size="icon"
              disabled={!newMessage.trim()}
              data-testid="button-send-message"
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
    {tipTarget && (
      <TipGiftDialog
        open={!!tipTarget}
        onOpenChange={(open) => { if (!open) setTipTarget(null); }}
        recipientId={tipTarget.userId}
        recipientName={tipTarget.username}
        context="chat"
        contextId={roomId}
      />
    )}
    </>
  );
}
