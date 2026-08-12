import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSessionTracking } from "@/hooks/use-session-tracking";
import { useLanguageDetection } from "@/hooks/useLanguageDetection";
import '@/lib/i18n';
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import SignIn from "@/pages/SignIn";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import SubscriptionTiers from "@/pages/SubscriptionTiers";
import Subscribe from "@/pages/Subscribe";
import SubscriptionSuccess from "@/pages/SubscriptionSuccess";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import Upload from "@/pages/Upload";
import Dashboard from "@/pages/Dashboard";
import VideoDetail from "@/pages/VideoDetail";
import Search from "@/pages/Search";
import Podcasts from "@/pages/Podcasts";
import PodcastEpisode from "@/pages/PodcastEpisode";
import VideoStreaming from "@/pages/VideoStreaming";
import NativeStreaming from "@/pages/NativeStreaming";
import ProfileSettings from "@/pages/ProfileSettings";
import SiteSettings from "@/pages/SiteSettings";
import AdminLogin from "@/pages/AdminLogin";
import AdminPasswordRecovery from "@/pages/AdminPasswordRecovery";
import AdminDashboard from "@/pages/AdminDashboard";
import UserGuide from "@/pages/UserGuide";
import BookAppointment from "@/pages/BookAppointment";
import { TipSuccess, TipCancel } from "@/pages/TipResult";
import Rooms from "@/pages/Rooms";
import RoomDetail from "@/pages/RoomDetail";
import Feed from "@/pages/Feed";
import GearHeadAI from "@/pages/GearHeadAI";
import Live from "@/pages/Live";
import Marketplace from "@/pages/Marketplace";
import GarageProfile from "@/pages/GarageProfile";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import NavigationArrows from "@/components/NavigationArrows";
import { ThemeProvider } from "@/components/ThemeProvider";
function SessionTracker({ children }: { children: React.ReactNode }) {
  useSessionTracking();
  return <>{children}</>;
}

function LanguageDetector({ children }: { children: React.ReactNode }) {
  useLanguageDetection();
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/signin" component={SignIn} />
      <Route path="/sign-up" component={SignIn} />
      <Route path="/signup" component={SignIn} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/subscription-tiers" component={SubscriptionTiers} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/subscription/success" component={SubscriptionSuccess} />
      <Route path="/subscription/cancel" component={SubscriptionTiers} />
      <Route path="/browse" component={Home} />
      <Route path="/rooms" component={Rooms} />
      <Route path="/rooms/:slug" component={RoomDetail} />
      <Route path="/feed" component={Feed} />
      <Route path="/gearhead-ai" component={GearHeadAI} />
      <Route path="/live" component={Live} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/garage-profile" component={GarageProfile} />
      <Route path="/chat" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/upload" component={Upload} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/video/:id" component={VideoDetail} />
      <Route path="/search" component={Search} />
      <Route path="/podcasts" component={Podcasts} />
      <Route path="/podcast/:id" component={PodcastEpisode} />
      <Route path="/video-streaming" component={VideoStreaming} />
      <Route path="/native-streaming" component={NativeStreaming} />
      <Route path="/profile-settings" component={ProfileSettings} />
      <Route path="/site-settings" component={SiteSettings} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/recovery" component={AdminPasswordRecovery} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/guide" component={UserGuide} />
      <Route path="/user-guide" component={UserGuide} />
      <Route path="/book-appointment" component={BookAppointment} />
      <Route path="/book" component={BookAppointment} />
      <Route path="/tip/success" component={TipSuccess} />
      <Route path="/tip/cancel" component={TipCancel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <LanguageDetector>
            <SessionTracker>
              <AnalyticsTracker />
              <NavigationArrows />
              <Router />
            </SessionTracker>
          </LanguageDetector>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
