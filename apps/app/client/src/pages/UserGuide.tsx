import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  WrenchScrewdriverIcon, 
  ChatBubbleLeftRightIcon, 
  PlayIcon,
  SparklesIcon,
  CloudArrowUpIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
  ArrowPathIcon,
  CalendarIcon,
  CreditCardIcon
} from "@heroicons/react/24/outline";

export default function UserGuide() {
  const sections = [
    {
      id: "getting-started",
      title: "Getting Started",
      icon: PlayIcon,
      content: [
        {
          subtitle: "Creating Your Account",
          text: "Sign up using your email, username, or phone number. You can choose any method that's most convenient for you. After signing up, you'll have access to all free features immediately."
        },
        {
          subtitle: "Choosing a Subscription Plan",
          text: "Garage Talk offers 4 tiers: Amateur (Free), Gearhead ($9.99/mo), Racing Pro ($19.99/mo), and Pro ($29.99/mo). Each tier unlocks more features like unlimited AI queries, video uploads, and higher profit sharing."
        },
        {
          subtitle: "Setting Up Your Profile",
          text: "Navigate to Profile Settings from your dashboard to add your profile picture, update your city, and customize your experience."
        }
      ]
    },
    {
      id: "navigation",
      title: "Navigation Controls",
      icon: HomeIcon,
      content: [
        {
          subtitle: "Navigation Buttons",
          text: "Look at the bottom-left corner of any page. You'll see navigation buttons that work on every page including during livestreaming:"
        },
        {
          subtitle: "Back Arrow (←)",
          text: "Takes you to the previous page you visited, just like your browser's back button."
        },
        {
          subtitle: "Home Button",
          text: "Returns you to your profile dashboard from anywhere in the app."
        },
        {
          subtitle: "Refresh/Reset Button",
          text: "Reloads the current page. Useful if you're experiencing issues or want to see the latest content."
        },
        {
          subtitle: "Forward Arrow (→)",
          text: "Goes forward in your browsing history after you've gone back."
        }
      ]
    },
    {
      id: "gearhead-agent",
      title: "Gearhead Agent (AI Assistant)",
      icon: SparklesIcon,
      content: [
        {
          subtitle: "What is the Gearhead Agent?",
          text: "The Gearhead Agent is your AI-powered automotive expert. Ask it any question about car repairs, diagnostics, or maintenance and get detailed answers instantly."
        },
        {
          subtitle: "How to Use It",
          text: "Go to the Search page and type your question in natural language. For example: 'My 2018 Honda Civic is making a grinding noise when braking' or 'How do I change the spark plugs on a Ford F-150?'"
        },
        {
          subtitle: "Getting the Best Results",
          text: "Be specific! Include the year, make, model of your vehicle and describe symptoms in detail. The more information you provide, the better the diagnosis."
        },
        {
          subtitle: "Usage Limits",
          text: "Free users get 3 queries per day. Paid subscribers get unlimited access to the Gearhead Agent."
        }
      ]
    },
    {
      id: "video-library",
      title: "Video Library",
      icon: PlayIcon,
      content: [
        {
          subtitle: "Browsing Videos",
          text: "The Browse page shows all available repair tutorials organized by category. Use the search and filter options to find exactly what you need."
        },
        {
          subtitle: "Video Categories",
          text: "Videos are organized by repair type: Engine, Transmission, Brakes, Electrical, Suspension, and more. You can also filter by vehicle make and model."
        },
        {
          subtitle: "Watching Videos",
          text: "Click any video thumbnail to open the video player. You can like, comment, and share videos with fellow mechanics."
        }
      ]
    },
    {
      id: "uploading",
      title: "Uploading Content",
      icon: CloudArrowUpIcon,
      content: [
        {
          subtitle: "Who Can Upload?",
          text: "All paid subscribers can upload videos. Gearhead tier gets up to 5 uploads/month, while Racing Pro and Pro tiers get unlimited uploads."
        },
        {
          subtitle: "How to Upload",
          text: "Go to the Upload page from your dashboard. Fill in the video title, description, and select the category. You can upload video files or paste YouTube/Vimeo embed links."
        },
        {
          subtitle: "Earning Money",
          text: "Your videos can earn ad revenue! Profit sharing depends on your tier: Gearhead (10%), Racing Pro (25%), Pro (40%)."
        }
      ]
    },
    {
      id: "chat-rooms",
      title: "Chat Rooms",
      icon: ChatBubbleLeftRightIcon,
      content: [
        {
          subtitle: "Types of Chat Rooms",
          text: "We have regular themed chat rooms (Engine Talk, Transmission Help, etc.) and special Spatial Chat rooms where you can see other users on a virtual map."
        },
        {
          subtitle: "Joining a Chat Room",
          text: "Go to the Chat page and select any room from the list. Your messages appear in real-time and you can see other active participants."
        },
        {
          subtitle: "Spatial Chat Rooms",
          text: "In spatial chat, your avatar appears on a map. Move around by clicking on the map. You can only see messages from users who are near you!"
        },
        {
          subtitle: "Customizing Your Spatial Avatar",
          text: "Your avatar in spatial chat uses your profile picture. To change it, go to Profile Settings and customize your avatar. You can use a colored circle with your initials, upload a static picture (like a car or character), or use an animated GIF. Your custom avatar will appear on the map as you move around!"
        },
        {
          subtitle: "Using Custom Character Avatars",
          text: "Want to appear as a Jeep, racecar, or custom character on the map? Upload any image as your avatar in Profile Settings. Choose 'Picture' or 'Animated' avatar type, then upload your preferred image (PNG, JPG) or GIF. Your character will move around the map as you click to different locations."
        },
        {
          subtitle: "Location Privacy",
          text: "Your location is determined by your IP address (VPN-friendly). Only your city is shown - never street addresses or exact locations."
        }
      ]
    },
    {
      id: "livestreaming",
      title: "Live Streaming",
      icon: VideoCameraIcon,
      content: [
        {
          subtitle: "Starting a Livestream",
          text: "Go to 'Go Live (Native)' from your dashboard. Choose your camera, microphone, and optionally share your screen."
        },
        {
          subtitle: "Video Effects",
          text: "Before going live, you can enable background blur, apply color filters (grayscale, sepia, etc.), or set a virtual background image."
        },
        {
          subtitle: "Screen Sharing",
          text: "Toggle screen sharing to show your desktop, specific windows, or browser tabs. You can enable or disable your microphone while screen sharing."
        },
        {
          subtitle: "Recording Your Stream",
          text: "Click the Record button to capture your broadcast. Save recordings to cloud storage or download directly to your device."
        },
        {
          subtitle: "Navigation While Streaming",
          text: "The navigation buttons (back, home, refresh, forward) work even while streaming. Use them to navigate without interrupting your broadcast."
        }
      ]
    },
    {
      id: "scheduling",
      title: "Scheduling Sessions",
      icon: CalendarIcon,
      content: [
        {
          subtitle: "Calendar Integration",
          text: "Paid tier users can schedule video calls, screen shares, and livestreams in advance with Google Calendar integration."
        },
        {
          subtitle: "Creating a Scheduled Event",
          text: "Go to the Jitsi streaming page and use the scheduling feature. Choose your date, time, and event type."
        },
        {
          subtitle: "Getting Reminders",
          text: "Scheduled events sync with your Google Calendar so you'll get reminders before your session starts."
        }
      ]
    },
    {
      id: "subscriptions",
      title: "Subscriptions & Billing",
      icon: CreditCardIcon,
      content: [
        {
          subtitle: "Subscription Tiers",
          text: "Amateur (Free): Browse videos, limited AI queries, join chat rooms. Gearhead ($9.99): Unlimited AI, upload videos, livestream. Racing Pro ($19.99): Everything plus higher profit sharing. Pro ($29.99): Maximum earnings and priority support."
        },
        {
          subtitle: "Upgrading Your Plan",
          text: "Go to Subscription Tiers from the landing page or dashboard to view plans and upgrade. Payment is handled securely through Stripe."
        },
        {
          subtitle: "Billing Questions",
          text: "All billing is handled through Stripe. Contact support if you have questions about charges or need to cancel your subscription."
        }
      ]
    },
    {
      id: "settings",
      title: "Settings & Profile",
      icon: Cog6ToothIcon,
      content: [
        {
          subtitle: "Profile Settings",
          text: "Update your username, email, city, and profile picture from the Profile Settings page."
        },
        {
          subtitle: "Customizing Your Avatar",
          text: "Your avatar appears in chat rooms and throughout the app. Click the pencil/edit icon on your profile to open the avatar customization dialog. You can choose from three avatar styles:"
        },
        {
          subtitle: "Color Avatars",
          text: "Select 'Color' to use a solid color background with your initials. Pick from 10 vibrant colors including blue, red, green, yellow, purple, pink, orange, teal, indigo, and cyan."
        },
        {
          subtitle: "Picture Avatars",
          text: "Select 'Picture' to upload a custom profile image. Click the camera icon or 'Upload Picture' button to choose a JPG, PNG, or other image file (max 5MB)."
        },
        {
          subtitle: "Animated Avatars (GIFs)",
          text: "Select 'Animated' to upload a GIF animation as your avatar. When you upload a GIF file, the system automatically detects it and shows a 'GIF' badge on your avatar. Animated avatars will play in chat rooms."
        },
        {
          subtitle: "Avatar Tips",
          text: "For best results, use square images (1:1 ratio). Your avatar appears as a circle, so center the main content. GIF animations should be under 5MB to ensure smooth loading."
        },
        {
          subtitle: "Changing Your Password",
          text: "Use the Forgot Password feature on the sign-in page to reset your password via email."
        },
        {
          subtitle: "Language Settings",
          text: "Click the globe icon in the header to change the app language. We support 12 languages including English, Spanish, French, German, Chinese, and more."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ChevronLeftIcon className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">User Guide</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/signin">
              <Button variant="ghost" data-testid="button-signin">Sign In</Button>
            </Link>
            <Link href="/dashboard">
              <Button data-testid="button-dashboard">Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Help Center</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            How to Use Garage Talk
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Your complete guide to getting the most out of the Garage Talk platform - from AI diagnostics to live streaming.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HomeIcon className="h-5 w-5 text-primary" />
              Quick Navigation Reference
            </CardTitle>
            <CardDescription>
              The navigation buttons are always visible in the bottom-left corner of every page
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center text-center p-4 bg-muted/50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <ChevronLeftIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">Back</span>
                <span className="text-xs text-muted-foreground">Previous page</span>
              </div>
              <div className="flex flex-col items-center text-center p-4 bg-muted/50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <HomeIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">Home</span>
                <span className="text-xs text-muted-foreground">Dashboard</span>
              </div>
              <div className="flex flex-col items-center text-center p-4 bg-muted/50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <ArrowPathIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">Refresh</span>
                <span className="text-xs text-muted-foreground">Reload page</span>
              </div>
              <div className="flex flex-col items-center text-center p-4 bg-muted/50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <ChevronRightIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">Forward</span>
                <span className="text-xs text-muted-foreground">Next page</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Accordion type="single" collapsible className="space-y-4">
          {sections.map((section) => (
            <AccordionItem key={section.id} value={section.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline py-4" data-testid={`accordion-${section.id}`}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-lg font-semibold">{section.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-4 pl-13">
                  {section.content.map((item, index) => (
                    <div key={index} className="border-l-2 border-primary/20 pl-4">
                      <h4 className="font-medium text-base mb-1">{item.subtitle}</h4>
                      <p className="text-muted-foreground">{item.text}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Card className="mt-12">
          <CardContent className="pt-6 text-center">
            <h3 className="text-xl font-semibold mb-2">Still have questions?</h3>
            <p className="text-muted-foreground mb-4">
              Join our chat rooms to connect with fellow mechanics or use the Gearhead Agent for instant help.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/chat">
                <Button variant="outline" className="gap-2" data-testid="button-join-chat">
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                  Join Chat Room
                </Button>
              </Link>
              <Link href="/search">
                <Button className="gap-2" data-testid="button-ask-agent">
                  <SparklesIcon className="h-4 w-4" />
                  Ask Gearhead Agent
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t py-8 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          <p>© 2024 Garage Talk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
