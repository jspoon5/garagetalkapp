import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { 
  Shield, 
  Users, 
  CreditCard, 
  UserPlus, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  Settings,
  Mail,
  Lock,
  Globe,
  Activity,
  Eye,
  EyeOff,
  Monitor,
  Smartphone,
  Tablet,
  TestTube,
  Search,
  X
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

type SafeUser = Omit<User, "password">;

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  recentSignups: SafeUser[];
  tierBreakdown: Record<string, number>;
  cityBreakdown: Array<{ city: string; count: number }>;
  recentQueries: Array<{ query: string; username: string; city: string | null; isAiSearch: boolean; createdAt: string | null }>;
}

interface UsersResponse {
  users: SafeUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AdminMeResponse {
  admin: {
    id: string;
    username: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string | null;
  };
}

interface AnalyticsStats {
  activeUsers: number;
  totalPageViews: number;
  deviceBreakdown: Record<string, number>;
  countryBreakdown: Array<{ country: string; countryCode: string; count: number }>;
  sourceBreakdown: Record<string, number>;
  recentPageViews: any[];
  activeUsersList: Array<{ id: string; username: string; email: string | null; lastSeen: Date | null }>;
}

const countryCoordinates: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5],
  GB: [55.4, -3.4], DE: [51.2, 10.5], FR: [46.2, 2.2],
  ES: [40.5, -3.7], IT: [41.9, 12.6], NL: [52.1, 5.3],
  BR: [-14.2, -51.9], AR: [-38.4, -63.6], AU: [-25.3, 133.8],
  IN: [20.6, 78.9], CN: [35.9, 104.2], JP: [36.2, 138.3],
  KR: [35.9, 127.8], RU: [61.5, 105.3], ZA: [-30.6, 22.9],
  SE: [60.1, 18.6], NO: [60.5, 8.5], FI: [61.9, 25.7],
  PL: [51.9, 19.1], UA: [48.4, 31.2], TR: [38.9, 35.2],
  EG: [26.8, 30.8], NG: [9.1, 8.7], KE: [0.0, 37.9],
  PH: [12.9, 121.8], ID: [-0.8, 113.9], TH: [15.9, 100.9],
  VN: [14.1, 108.3], MY: [4.2, 101.9], SG: [1.4, 103.8],
  NZ: [-40.9, 174.9], CL: [-35.7, -71.5], CO: [4.6, -74.3],
  PE: [-9.2, -75.0], VE: [6.4, -66.6],
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#8884d8", "#82ca9d", "#ffc658"];

function getTierBadgeVariant(tier: string): "default" | "secondary" | "destructive" | "outline" {
  switch (tier) {
    case "pro":
      return "default";
    case "racing_pro":
      return "default";
    case "gearhead":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTierName(tier: string): string {
  return tier.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [settingsEmail, setSettingsEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [tierTestUsername, setTierTestUsername] = useState("");
  const [tierTestSelectedTier, setTierTestSelectedTier] = useState("");
  const [tierTestUser, setTierTestUser] = useState<SafeUser | null>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [checkoutProcessingTier, setCheckoutProcessingTier] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResult, setUserSearchResult] = useState<SafeUser | null>(null);
  const [isSearchingUserList, setIsSearchingUserList] = useState(false);
  const limit = 10;

  const adminQuery = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const statsQuery = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!adminQuery.data,
    refetchInterval: 600000, // Auto-refresh every 10 minutes
  });

  const usersQuery = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", page, limit],
    enabled: !!adminQuery.data,
    refetchInterval: 600000, // Auto-refresh every 10 minutes
  });

  const analyticsQuery = useQuery<AnalyticsStats>({
    queryKey: ["/api/admin/analytics"],
    enabled: !!adminQuery.data,
    refetchInterval: 600000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/logout");
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/admin"] });
      toast({
        title: "Logged out",
        description: "You have been signed out of the admin portal",
      });
      setLocation("/sign-in");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    },
  });

  const updateCredentialsMutation = useMutation({
    mutationFn: async (data: { email?: string; currentPassword?: string; newPassword?: string }) => {
      const res = await apiRequest("PATCH", "/api/admin/me", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Settings updated",
        description: "Your credentials have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update credentials",
        variant: "destructive",
      });
    },
  });

  const updateUserTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/tier`, { tier });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setTierTestUser(data.user);
      toast({
        title: "Tier Updated",
        description: data.message || "User tier has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user tier",
        variant: "destructive",
      });
    },
  });

  const handleFindUser = async () => {
    if (!tierTestUsername.trim()) {
      toast({
        title: "Error",
        description: "Please enter a username",
        variant: "destructive",
      });
      return;
    }
    
    setIsSearchingUser(true);
    try {
      const res = await apiRequest("GET", `/api/admin/users/search?username=${encodeURIComponent(tierTestUsername.trim())}`);
      if (!res.ok) {
        const error = await res.json();
        toast({
          title: "User Not Found",
          description: error.error || `No user found with username "${tierTestUsername}"`,
          variant: "destructive",
        });
        setTierTestUser(null);
        return;
      }
      
      const data = await res.json();
      setTierTestUser(data.user);
      setTierTestSelectedTier(data.user.subscriptionTier || "amateur");
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error?.message || "Failed to search for user",
        variant: "destructive",
      });
      setTierTestUser(null);
    } finally {
      setIsSearchingUser(false);
    }
  };

  const handleUserListSearch = async () => {
    if (!userSearchQuery.trim()) {
      setUserSearchResult(null);
      return;
    }
    
    setIsSearchingUserList(true);
    try {
      const res = await apiRequest("GET", `/api/admin/users/search?username=${encodeURIComponent(userSearchQuery.trim())}`);
      if (!res.ok) {
        const error = await res.json();
        toast({
          title: "User Not Found",
          description: error.error || `No user found with username "${userSearchQuery}"`,
          variant: "destructive",
        });
        setUserSearchResult(null);
        return;
      }
      
      const data = await res.json();
      setUserSearchResult(data.user);
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error?.message || "Failed to search for user",
        variant: "destructive",
      });
      setUserSearchResult(null);
    } finally {
      setIsSearchingUserList(false);
    }
  };

  const clearUserSearch = () => {
    setUserSearchQuery("");
    setUserSearchResult(null);
  };

  const handleUpdateUserTier = () => {
    if (!tierTestUser || !tierTestSelectedTier) {
      toast({
        title: "Error",
        description: "Please select a user and tier",
        variant: "destructive",
      });
      return;
    }
    updateUserTierMutation.mutate({
      userId: tierTestUser.id,
      tier: tierTestSelectedTier,
    });
  };

  const handleTierCheckout = async (tier: string) => {
    if (tier === "amateur") {
      toast({
        title: "Free Tier",
        description: "Amateur tier is free - no checkout required",
      });
      return;
    }
    
    if (!tierTestUser) {
      toast({
        title: "User Required",
        description: "Please search for a user first to test Stripe checkout",
        variant: "destructive",
      });
      return;
    }
    
    setCheckoutProcessingTier(tier);
    try {
      // Use admin endpoint to create checkout for the selected user
      const response = await fetch("/api/admin/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: tierTestUser.id, tier }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }
      
      if (data.url) {
        window.open(data.url, "_blank");
        toast({
          title: "Checkout Opened",
          description: `Stripe checkout opened for ${tierTestUser.username} - ${tier} tier`,
        });
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast({
        title: "Checkout Error",
        description: err.message || "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setCheckoutProcessingTier(null);
    }
  };

  const handleUpdateCredentials = () => {
    if (newPassword && newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (newPassword && !currentPassword) {
      toast({
        title: "Error",
        description: "Current password is required to change password",
        variant: "destructive",
      });
      return;
    }
    const updates: { email?: string; currentPassword?: string; newPassword?: string } = {};
    if (settingsEmail && settingsEmail !== adminQuery.data?.admin.email) {
      updates.email = settingsEmail;
    }
    if (newPassword) {
      updates.currentPassword = currentPassword;
      updates.newPassword = newPassword;
    }
    if (Object.keys(updates).length === 0) {
      toast({
        title: "No changes",
        description: "No changes to save",
      });
      return;
    }
    updateCredentialsMutation.mutate(updates);
  };

  useEffect(() => {
    if (adminQuery.isError) {
      setLocation("/admin/login");
    }
  }, [adminQuery.isError, setLocation]);

  useEffect(() => {
    if (adminQuery.data?.admin.email) {
      setSettingsEmail(adminQuery.data.admin.email);
    }
  }, [adminQuery.data?.admin.email]);

  if (adminQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (adminQuery.isError || !adminQuery.data) {
    return null;
  }

  const admin = adminQuery.data.admin;
  const stats = statsQuery.data;
  const usersData = usersQuery.data;
  const analyticsData = analyticsQuery.data;

  const deviceChartData = analyticsData?.deviceBreakdown
    ? Object.entries(analyticsData.deviceBreakdown).map(([name, value]) => ({ name, value }))
    : [];

  const sourceChartData = analyticsData?.sourceBreakdown
    ? Object.entries(analyticsData.sourceBreakdown).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-dashboard-title">
                  <Shield className="h-5 w-5" />
                  Admin Dashboard
                </h1>
                <p className="text-sm text-muted-foreground" data-testid="text-admin-info">
                  Logged in as {admin.username} ({formatTierName(admin.role)})
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-users">
                  {stats?.totalUsers ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-active-subscriptions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-active-subscriptions">
                  {stats?.activeSubscriptions ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2" data-testid="card-tier-breakdown">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tier Breakdown</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <div className="flex flex-wrap gap-2" data-testid="tier-breakdown-list">
                  {stats?.tierBreakdown && Object.entries(stats.tierBreakdown).map(([tier, count]) => (
                    <Badge key={tier} variant={getTierBadgeVariant(tier)}>
                      {formatTierName(tier)}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* City Breakdown & Recent Activity Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card data-testid="card-city-breakdown">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users by City</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : stats?.cityBreakdown && stats.cityBreakdown.length > 0 ? (
                <div className="space-y-2" data-testid="city-breakdown-list">
                  {stats.cityBreakdown.map((item, index) => (
                    <div key={item.city} className="flex items-center justify-between" data-testid={`city-row-${index}`}>
                      <span className="text-sm">{item.city}</span>
                      <Badge variant="outline">{item.count} users</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No city data available</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-recent-queries">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity Queries</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : stats?.recentQueries && stats.recentQueries.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto" data-testid="recent-queries-list">
                  {stats.recentQueries.map((item, index) => (
                    <div key={index} className="p-2 rounded-md border bg-muted/30" data-testid={`query-row-${index}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={item.isAiSearch ? "default" : "secondary"} className="text-xs">
                          {item.isAiSearch ? "Gearhead Agent" : "Search"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by {item.username}{item.city ? ` from ${item.city}` : ""}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate" title={item.query}>
                        {item.query}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent queries</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Real-Time Analytics Section */}
        <div className="mb-8">
          <Card data-testid="card-realtime-analytics">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Real-Time Analytics
              </CardTitle>
              <CardDescription>
                Live visitor data and traffic insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-4 p-4 rounded-md border">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Users</p>
                    {analyticsQuery.isLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <p className="text-2xl font-bold" data-testid="text-active-users">
                        {analyticsData?.activeUsers ?? 0}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-md border">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Eye className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Page Views</p>
                    {analyticsQuery.isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <p className="text-2xl font-bold" data-testid="text-total-pageviews">
                        {analyticsData?.totalPageViews ?? 0}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Signed-In Users */}
              <div className="mb-6">
                <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" />
                  Active Signed-In Users (Last 30 min)
                </h3>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full rounded-lg" />
                ) : analyticsData?.activeUsersList && analyticsData.activeUsersList.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden" data-testid="list-active-users">
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-medium">Username</th>
                            <th className="text-left p-2 font-medium">Email</th>
                            <th className="text-left p-2 font-medium">Last Seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.activeUsersList.map((user) => (
                            <tr key={user.id} className="border-t hover:bg-muted/30" data-testid={`row-active-user-${user.id}`}>
                              <td className="p-2 font-medium">{user.username}</td>
                              <td className="p-2 text-muted-foreground">{user.email || "—"}</td>
                              <td className="p-2 text-muted-foreground">
                                {user.lastSeen ? new Date(user.lastSeen).toLocaleTimeString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                    No signed-in users active in the last 30 minutes
                  </p>
                )}
              </div>

              {/* World Map */}
              <div className="mb-6">
                <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4" />
                  User Locations
                </h3>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-lg" />
                ) : (
                  <div className="rounded-lg border overflow-hidden" style={{ height: "300px" }} data-testid="map-world-analytics">
                    <MapContainer
                      center={[20, 0]}
                      zoom={1.5}
                      style={{ height: "100%", width: "100%" }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {(() => {
                        const maxCount = Math.max(...(analyticsData?.countryBreakdown?.map(c => c.count) || [1]));
                        // Color scale function: low traffic = light teal, high traffic = deep red/orange
                        const getColor = (ratio: number) => {
                          // Interpolate hue from 180 (cyan/teal) to 0 (red) based on ratio
                          const hue = Math.round(180 - (ratio * 180));
                          const saturation = 70 + (ratio * 20); // 70% to 90%
                          const lightness = 55 - (ratio * 15); // 55% to 40% (darker for higher traffic)
                          return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                        };
                        
                        return analyticsData?.countryBreakdown?.map((item) => {
                          const coords = countryCoordinates[item.countryCode];
                          if (!coords) return null;
                          const ratio = item.count / maxCount;
                          const radius = Math.max(5, Math.min(30, ratio * 30));
                          const color = getColor(ratio);
                          return (
                            <CircleMarker
                              key={item.countryCode}
                              center={coords}
                              radius={radius}
                              pathOptions={{
                                fillColor: color,
                                fillOpacity: 0.7,
                                color: color,
                                weight: 2,
                              }}
                            >
                              <Tooltip>
                                {item.country}: {item.count} users
                              </Tooltip>
                            </CircleMarker>
                          );
                        });
                      })()}
                    </MapContainer>
                  </div>
                )}
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Device Breakdown */}
                <div data-testid="chart-device-breakdown">
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Monitor className="h-4 w-4" />
                    Device Breakdown
                  </h3>
                  {analyticsQuery.isLoading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : deviceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={deviceChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {deviceChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No device data available
                    </div>
                  )}
                </div>

                {/* Traffic Sources */}
                <div data-testid="chart-traffic-sources">
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4" />
                    Traffic Sources
                  </h3>
                  {analyticsQuery.isLoading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : sourceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={sourceChartData} layout="vertical">
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No source data available
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" data-testid="card-user-management">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Manage all registered users ({usersData?.total ?? 0} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search username..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUserListSearch()}
                    className="pl-9 pr-9"
                    data-testid="input-user-search"
                  />
                  {userSearchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={clearUserSearch}
                      data-testid="button-clear-search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Button
                  onClick={handleUserListSearch}
                  disabled={isSearchingUserList}
                  data-testid="button-user-search"
                >
                  {isSearchingUserList ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>

              {userSearchResult ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Search result:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearUserSearch}
                      data-testid="button-show-all-users"
                    >
                      Show all users
                    </Button>
                  </div>
                  <div 
                    className="flex items-center justify-between gap-4 p-3 rounded-md border bg-primary/5 hover-elevate cursor-pointer"
                    onClick={() => setSelectedUser(userSearchResult)}
                    data-testid={`row-search-result-${userSearchResult.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userSearchResult.avatarUrl || undefined} />
                        <AvatarFallback style={{ backgroundColor: userSearchResult.avatarColor || undefined }}>
                          {userSearchResult.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium" data-testid="text-search-result-username">
                          {userSearchResult.username}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {userSearchResult.email || "No email"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={getTierBadgeVariant(userSearchResult.subscriptionTier || "amateur")}>
                      {formatTierName(userSearchResult.subscriptionTier || "amateur")}
                    </Badge>
                  </div>
                </div>
              ) : usersQuery.isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : usersData?.users.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No users found</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {usersData?.users.map((user) => (
                      <div 
                        key={user.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-md border hover-elevate cursor-pointer"
                        onClick={() => setSelectedUser(user)}
                        data-testid={`row-user-${user.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback style={{ backgroundColor: user.avatarColor || undefined }}>
                              {user.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium" data-testid={`text-username-${user.id}`}>
                              {user.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {user.email || "No email"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={getTierBadgeVariant(user.subscriptionTier || "amateur")}>
                          {formatTierName(user.subscriptionTier || "amateur")}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {usersData && usersData.totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                        Page {page} of {usersData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(usersData.totalPages, p + 1))}
                        disabled={page >= usersData.totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-recent-signups">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Recent Signups
              </CardTitle>
              <CardDescription>
                Latest user registrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : stats?.recentSignups.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No recent signups</p>
              ) : (
                <div className="space-y-3">
                  {stats?.recentSignups.map((user) => (
                    <div 
                      key={user.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                      data-testid={`recent-signup-${user.id}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatarUrl || undefined} />
                        <AvatarFallback style={{ backgroundColor: user.avatarColor || undefined }}>
                          {user.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{user.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.createdAt 
                            ? new Date(user.createdAt).toLocaleDateString()
                            : "Unknown date"
                          }
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6" data-testid="card-admin-settings">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Admin Settings
            </CardTitle>
            <CardDescription>
              Update your admin account credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input
                    id="settings-email"
                    type="email"
                    value={settingsEmail}
                    onChange={(e) => setSettingsEmail(e.target.value)}
                    placeholder="admin@example.com"
                    data-testid="input-settings-email"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Change Password
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                      data-testid="input-current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      data-testid="button-toggle-current-password"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                      data-testid="input-new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      data-testid="button-toggle-new-password"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                      data-testid="input-confirm-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      data-testid="button-toggle-confirm-password"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Button
                onClick={handleUpdateCredentials}
                disabled={updateCredentialsMutation.isPending}
                data-testid="button-save-settings"
              >
                {updateCredentialsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6" data-testid="card-tier-testing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              DevOps Tier Testing
            </CardTitle>
            <CardDescription>
              Test subscription tiers by manually setting user tier levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="tier-levels-reference">
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    tierTestSelectedTier === "amateur" 
                      ? "ring-2 ring-primary border-primary bg-muted/40" 
                      : "bg-muted/20"
                  }`}
                  data-testid="tier-card-amateur"
                >
                  <Badge variant="secondary" className="mb-2">Amateur</Badge>
                  <p className="text-lg font-bold">Free</p>
                  <p className="text-xs text-muted-foreground mb-2">Basic access</p>
                  <div className="space-y-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        if (tierTestUser) {
                          updateUserTierMutation.mutate({ userId: tierTestUser.id, tier: "amateur" });
                        } else {
                          toast({ title: "No User Selected", description: "Find a user first to set their tier", variant: "destructive" });
                        }
                      }}
                      disabled={updateUserTierMutation.isPending || (tierTestUser?.subscriptionTier === "amateur")}
                      className="w-full text-xs"
                      data-testid="button-set-amateur"
                    >
                      {updateUserTierMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set Tier"}
                    </Button>
                  </div>
                </div>
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    tierTestSelectedTier === "gearhead" 
                      ? "ring-2 ring-blue-500 border-blue-500 bg-blue-500/20" 
                      : "bg-blue-500/10"
                  }`}
                  data-testid="tier-card-gearhead"
                >
                  <Badge className="mb-2 bg-blue-500">Gearhead</Badge>
                  <p className="text-lg font-bold">$9.99/mo</p>
                  <p className="text-xs text-muted-foreground mb-2">AI diagnostics</p>
                  <div className="space-y-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        if (tierTestUser) {
                          updateUserTierMutation.mutate({ userId: tierTestUser.id, tier: "gearhead" });
                        } else {
                          toast({ title: "No User Selected", description: "Find a user first to set their tier", variant: "destructive" });
                        }
                      }}
                      disabled={updateUserTierMutation.isPending || (tierTestUser?.subscriptionTier === "gearhead")}
                      className="w-full text-xs bg-blue-500 hover:bg-blue-600"
                      data-testid="button-set-gearhead"
                    >
                      {updateUserTierMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set Tier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTierCheckout("gearhead")}
                      disabled={checkoutProcessingTier === "gearhead"}
                      className="w-full text-xs"
                      data-testid="button-checkout-gearhead"
                    >
                      {checkoutProcessingTier === "gearhead" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Stripe Checkout"
                      )}
                    </Button>
                  </div>
                </div>
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    tierTestSelectedTier === "racing_pro" 
                      ? "ring-2 ring-purple-500 border-purple-500 bg-purple-500/20" 
                      : "bg-purple-500/10"
                  }`}
                  data-testid="tier-card-racing-pro"
                >
                  <Badge className="mb-2 bg-purple-500">Racing Pro</Badge>
                  <p className="text-lg font-bold">$19.99/mo</p>
                  <p className="text-xs text-muted-foreground mb-2">Live streaming</p>
                  <div className="space-y-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        if (tierTestUser) {
                          updateUserTierMutation.mutate({ userId: tierTestUser.id, tier: "racing_pro" });
                        } else {
                          toast({ title: "No User Selected", description: "Find a user first to set their tier", variant: "destructive" });
                        }
                      }}
                      disabled={updateUserTierMutation.isPending || (tierTestUser?.subscriptionTier === "racing_pro")}
                      className="w-full text-xs bg-purple-500 hover:bg-purple-600"
                      data-testid="button-set-racing-pro"
                    >
                      {updateUserTierMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set Tier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTierCheckout("racing_pro")}
                      disabled={checkoutProcessingTier === "racing_pro"}
                      className="w-full text-xs"
                      data-testid="button-checkout-racing-pro"
                    >
                      {checkoutProcessingTier === "racing_pro" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Stripe Checkout"
                      )}
                    </Button>
                  </div>
                </div>
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    tierTestSelectedTier === "pro" 
                      ? "ring-2 ring-amber-500 border-amber-500 bg-amber-500/20" 
                      : "bg-amber-500/10"
                  }`}
                  data-testid="tier-card-pro"
                >
                  <Badge className="mb-2 bg-amber-500 text-black">Pro</Badge>
                  <p className="text-lg font-bold">$29.99/mo</p>
                  <p className="text-xs text-muted-foreground mb-2">All features</p>
                  <div className="space-y-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        if (tierTestUser) {
                          updateUserTierMutation.mutate({ userId: tierTestUser.id, tier: "pro" });
                        } else {
                          toast({ title: "No User Selected", description: "Find a user first to set their tier", variant: "destructive" });
                        }
                      }}
                      disabled={updateUserTierMutation.isPending || (tierTestUser?.subscriptionTier === "pro")}
                      className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-black"
                      data-testid="button-set-pro"
                    >
                      {updateUserTierMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set Tier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTierCheckout("pro")}
                      disabled={checkoutProcessingTier === "pro"}
                      className="w-full text-xs"
                      data-testid="button-checkout-pro"
                    >
                      {checkoutProcessingTier === "pro" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Stripe Checkout"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="tier-test-username">Username</Label>
                  <Input
                    id="tier-test-username"
                    placeholder="Enter username to search"
                    value={tierTestUsername}
                    onChange={(e) => setTierTestUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFindUser()}
                    data-testid="input-tier-test-username"
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleFindUser}
                    variant="outline"
                    disabled={isSearchingUser}
                    data-testid="button-find-user"
                  >
                    {isSearchingUser ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {isSearchingUser ? "Searching..." : "Find User"}
                  </Button>
                </div>
              </div>

              {tierTestUser && (
                <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={tierTestUser.avatarUrl || undefined} />
                      <AvatarFallback style={{ backgroundColor: tierTestUser.avatarColor || undefined }}>
                        {tierTestUser.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold" data-testid="text-tier-test-username">{tierTestUser.username}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Current tier:</span>
                        <Badge variant={getTierBadgeVariant(tierTestUser.subscriptionTier || "amateur")}>
                          {formatTierName(tierTestUser.subscriptionTier || "amateur")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="tier-select">Set Subscription Tier</Label>
                      <Select value={tierTestSelectedTier} onValueChange={setTierTestSelectedTier}>
                        <SelectTrigger id="tier-select" data-testid="select-tier">
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amateur">Amateur (Free)</SelectItem>
                          <SelectItem value="gearhead">Gearhead ($9.99/mo)</SelectItem>
                          <SelectItem value="racing_pro">Racing Pro ($19.99/mo)</SelectItem>
                          <SelectItem value="pro">Pro ($29.99/mo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button 
                        onClick={handleUpdateUserTier}
                        disabled={updateUserTierMutation.isPending || tierTestSelectedTier === tierTestUser.subscriptionTier}
                        data-testid="button-update-tier"
                      >
                        {updateUserTierMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="mr-2 h-4 w-4" />
                        )}
                        Update Tier
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <p>Email: {tierTestUser.email || "Not set"}</p>
                    <p>City: {tierTestUser.city || "Not set"}</p>
                    <p>User ID: {tierTestUser.id}</p>
                  </div>
                </div>
              )}

              {!tierTestUser && tierTestUsername && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Enter a username and click "Find User" to begin tier testing
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent data-testid="dialog-user-details">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Viewing information for {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedUser.avatarUrl || undefined} />
                  <AvatarFallback style={{ backgroundColor: selectedUser.avatarColor || undefined }}>
                    {selectedUser.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-detail-username">
                    {selectedUser.username}
                  </h3>
                  <Badge variant={getTierBadgeVariant(selectedUser.subscriptionTier || "amateur")}>
                    {formatTierName(selectedUser.subscriptionTier || "amateur")}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium" data-testid="text-detail-email">
                    {selectedUser.email || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium" data-testid="text-detail-phone">
                    {selectedUser.phone || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">City</p>
                  <p className="font-medium" data-testid="text-detail-city">
                    {selectedUser.city || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-medium" data-testid="text-detail-joined">
                    {selectedUser.createdAt 
                      ? new Date(selectedUser.createdAt).toLocaleDateString()
                      : "Unknown"
                    }
                  </p>
                </div>
              </div>

              {selectedUser.bio && (
                <div>
                  <p className="text-muted-foreground text-sm">Bio</p>
                  <p className="text-sm" data-testid="text-detail-bio">{selectedUser.bio}</p>
                </div>
              )}

              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-sm">AI Search Count</p>
                <p className="font-medium" data-testid="text-detail-ai-searches">
                  {selectedUser.aiSearchCount ?? 0} searches
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
