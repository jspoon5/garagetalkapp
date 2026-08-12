import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon, VideoCameraIcon, ChatBubbleLeftRightIcon, Bars3Icon, HomeIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GarageMainNav from "@/components/GarageMainNav";

type SearchMode = "standard" | "agent" | "web";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("agent");
  const [, setLocation] = useLocation();
  const { user } = useCurrentUser();

  const cycleSearchMode = () => {
    setSearchMode(prev => {
      if (prev === "agent") return "web";
      if (prev === "web") return "standard";
      return "agent";
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    if (searchMode === "agent") {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}&mode=agent`);
    } else if (searchMode === "web") {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}&mode=web`);
    } else {
      setLocation(`/browse?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between gap-4 h-16 mt-[20px] mb-[20px] pt-[60px] pb-[60px]">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md px-2 py-1" data-testid="link-logo">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">GT</span>
                </div>
                <span className="font-bold text-lg hidden sm:inline">Garage Talk</span>
              </div>
            </Link>

            <form onSubmit={handleSearch} className="flex-1 max-w-2xl flex gap-2">
              <div className="relative flex-1 ml-[0px] mr-[0px] mt-[0px] mb-[0px] pl-[11px] pr-[11px]">
                <Input
                  type="search"
                  placeholder={
                    searchMode === "web" 
                      ? "Search the web for automotive videos & resources..." 
                      : searchMode === "agent" 
                      ? "Ask Gearhead Agent: 'Engine knocking at idle?'" 
                      : "Search local videos, fault codes..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3 pr-24 min-w-[480px]"
                  data-testid="input-search"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={searchMode === "standard" ? "secondary" : "default"}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={cycleSearchMode}
                  data-testid="button-toggle-ai"
                >
                  {searchMode === "web" ? "Web" : searchMode === "agent" ? "Agent" : "Local"}
                </Button>
              </div>
            </form>

            <div className="hidden md:flex flex-col gap-1 ml-auto items-end">
              <div className="flex items-center gap-2 ml-[120px] mr-[120px]">
                <Link href="/native-streaming">
                  <Button size="sm" variant="default" className="gap-2 w-28 justify-center bg-red-600 hover:bg-red-700 pl-[0px] pr-[0px]" data-testid="button-native-streaming">
                    <VideoCameraIcon className="h-4 w-4" />
                    <span>Go Live</span>
                  </Button>
                </Link>

                <Link href="/dashboard">
                  <Button size="sm" variant="default" className="gap-2 w-28 justify-center" data-testid="button-dashboard">
                    <HomeIcon className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Button>
                </Link>

                <Link href="/chat">
                  <Button size="sm" variant="default" className="gap-2 w-28 justify-center relative" data-testid="button-chat">
                    <ChatBubbleLeftRightIcon className="h-4 w-4" />
                    <span>Chat</span>
                    <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-xs rounded-full">3</Badge>
                  </Button>
                </Link>

                <Link href="/book-appointment">
                  <Button size="sm" variant="outline" className="gap-2 w-28 justify-center" data-testid="button-book">
                    <CalendarDaysIcon className="h-4 w-4" />
                    <span>Book</span>
                  </Button>
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-10 w-10 cursor-pointer hover-elevate active-elevate-2" data-testid="button-profile">
                    <AvatarImage src={user?.avatarUrl || undefined} alt={user?.username || "Profile"} />
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                      {user?.username?.slice(0, 2).toUpperCase() || "GT"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.username || "Guest"}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email || "Not signed in"}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/garage-profile">
                    <DropdownMenuItem className="cursor-pointer" data-testid="link-garage-profile">
                      <User className="mr-2 h-4 w-4" />
                      <span>Garage Profile</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/profile-settings">
                    <DropdownMenuItem className="cursor-pointer" data-testid="link-profile-settings">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile Settings</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/site-settings">
                    <DropdownMenuItem className="cursor-pointer" data-testid="link-site-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Site Settings</span>
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={async () => {
                      await apiRequest("POST", "/api/logout");
                      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
                      setLocation("/");
                    }}
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="icon" variant="ghost" className="md:hidden" data-testid="button-menu">
                <Bars3Icon className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      <GarageMainNav />
    </>
  );
}
