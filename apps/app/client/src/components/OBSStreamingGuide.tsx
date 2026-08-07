import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Monitor, Settings, Video, Wifi, Download, Play, CheckCircle2 } from "lucide-react";
import { SiYoutube, SiTwitch, SiFacebook } from "react-icons/si";

interface OBSStreamingGuideProps {
  userTier: string;
}

export default function OBSStreamingGuide({ userTier }: OBSStreamingGuideProps) {
  const [expandedSection, setExpandedSection] = useState<string | undefined>("step1");
  
  const isPro = userTier.toLowerCase() === "pro";
  
  if (!isPro) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Live Streaming with OBS
          </CardTitle>
          <CardDescription>
            Stream your repair tutorials to YouTube, Twitch, or Facebook Live
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="secondary">Pro Tier Required</Badge>
            <span className="text-sm">Upgrade to Pro to access streaming guides</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Live Streaming with OBS Studio
            </CardTitle>
            <CardDescription>
              Stream your Garage Talk sessions to YouTube, Twitch, or Facebook Live
            </CardDescription>
          </div>
          <Badge variant="default" data-testid="badge-pro-feature">Pro Feature</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm">
            <SiYoutube className="h-5 w-5 text-red-500" />
            <span>YouTube Live</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <SiTwitch className="h-5 w-5 text-purple-500" />
            <span>Twitch</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <SiFacebook className="h-5 w-5 text-blue-500" />
            <span>Facebook Live</span>
          </div>
        </div>

        <Accordion type="single" collapsible value={expandedSection} onValueChange={setExpandedSection}>
          <AccordionItem value="step1">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-step1">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  1
                </div>
                <div className="text-left">
                  <div className="font-medium">Download & Install OBS Studio</div>
                  <div className="text-sm text-muted-foreground">Free, open-source streaming software</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pl-11">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  OBS Studio is free, professional streaming software that works on Windows, Mac, and Linux.
                </p>
                <Button variant="outline" asChild data-testid="button-download-obs">
                  <a href="https://obsproject.com/download" target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Download OBS Studio
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </a>
                </Button>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-2">System Requirements:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Windows 10/11, macOS 10.15+, or Linux</li>
                    <li>4GB+ RAM (8GB recommended)</li>
                    <li>DirectX 10.1 compatible GPU</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step2">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-step2">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  2
                </div>
                <div className="text-left">
                  <div className="font-medium">Configure Window Capture</div>
                  <div className="text-sm text-muted-foreground">Capture your Garage Talk video session</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pl-11">
              <div className="space-y-4">
                <ol className="list-decimal pl-4 space-y-3 text-sm">
                  <li>
                    <span className="font-medium">Start a Garage Talk video session</span>
                    <p className="text-muted-foreground">Use Screen Sharing or Video Conferencing from this page</p>
                  </li>
                  <li>
                    <span className="font-medium">In OBS, click the + button under "Sources"</span>
                    <p className="text-muted-foreground">This adds a new capture source to your stream</p>
                  </li>
                  <li>
                    <span className="font-medium">Select "Window Capture"</span>
                    <p className="text-muted-foreground">Choose your browser window showing Garage Talk</p>
                  </li>
                  <li>
                    <span className="font-medium">Alternatively, use "Display Capture"</span>
                    <p className="text-muted-foreground">Captures your entire screen including all windows</p>
                  </li>
                </ol>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Pro Tip: Audio Setup
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add an "Audio Output Capture" source to include your system audio, and "Audio Input Capture" for your microphone.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step3">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-step3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  3
                </div>
                <div className="text-left">
                  <div className="font-medium">Get Your Stream Key</div>
                  <div className="text-sm text-muted-foreground">From YouTube, Twitch, or Facebook</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pl-11">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 border rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <SiYoutube className="h-4 w-4 text-red-500" />
                      <span className="font-medium">YouTube Live</span>
                    </div>
                    <ol className="list-decimal pl-4 text-sm text-muted-foreground space-y-1">
                      <li>Go to YouTube Studio → Create → Go Live</li>
                      <li>Copy your "Stream key" from the Stream settings</li>
                      <li>Server URL: rtmp://a.rtmp.youtube.com/live2</li>
                    </ol>
                  </div>
                  
                  <div className="p-3 border rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <SiTwitch className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">Twitch</span>
                    </div>
                    <ol className="list-decimal pl-4 text-sm text-muted-foreground space-y-1">
                      <li>Go to Creator Dashboard → Settings → Stream</li>
                      <li>Copy your "Primary Stream key"</li>
                      <li>Select "Twitch" as the service in OBS</li>
                    </ol>
                  </div>
                  
                  <div className="p-3 border rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <SiFacebook className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Facebook Live</span>
                    </div>
                    <ol className="list-decimal pl-4 text-sm text-muted-foreground space-y-1">
                      <li>Go to Facebook → Live Video → Create Live Video</li>
                      <li>Select "Use Stream Key"</li>
                      <li>Copy the stream key provided</li>
                    </ol>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-step4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  4
                </div>
                <div className="text-left">
                  <div className="font-medium">Configure OBS Stream Settings</div>
                  <div className="text-sm text-muted-foreground">Enter your stream key and go live</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pl-11">
              <div className="space-y-4">
                <ol className="list-decimal pl-4 space-y-3 text-sm">
                  <li>
                    <span className="font-medium">Open OBS Settings → Stream</span>
                  </li>
                  <li>
                    <span className="font-medium">Select your streaming service</span>
                    <p className="text-muted-foreground">YouTube, Twitch, Facebook, or Custom RTMP</p>
                  </li>
                  <li>
                    <span className="font-medium">Paste your stream key</span>
                    <p className="text-muted-foreground">Keep this private - anyone with it can stream to your channel</p>
                  </li>
                  <li>
                    <span className="font-medium">Click "Apply" then "OK"</span>
                  </li>
                </ol>
                
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Recommended Output Settings
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>Resolution: 1920x1080 (or 1280x720 for slower connections)</li>
                    <li>Bitrate: 4500-6000 Kbps for 1080p, 2500-4000 for 720p</li>
                    <li>Encoder: Hardware (NVENC) if available, otherwise x264</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step5">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-step5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  5
                </div>
                <div className="text-left">
                  <div className="font-medium">Go Live!</div>
                  <div className="text-sm text-muted-foreground">Start streaming to your audience</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pl-11">
              <div className="space-y-4">
                <ol className="list-decimal pl-4 space-y-3 text-sm">
                  <li>
                    <span className="font-medium">Start your Garage Talk session first</span>
                    <p className="text-muted-foreground">Make sure your video call or screen share is working</p>
                  </li>
                  <li>
                    <span className="font-medium">In OBS, click "Start Streaming"</span>
                    <p className="text-muted-foreground">OBS will connect to your streaming platform</p>
                  </li>
                  <li>
                    <span className="font-medium">Wait for connection confirmation</span>
                    <p className="text-muted-foreground">The status bar will show "LIVE" when connected</p>
                  </li>
                  <li>
                    <span className="font-medium">Go live on your platform</span>
                    <p className="text-muted-foreground">On YouTube/Facebook, click "Go Live" to make stream public</p>
                  </li>
                </ol>
                
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    You're now broadcasting your Garage Talk session to the world!
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="h-4 w-4" />
            <span className="font-medium text-sm">Quick Tips for Quality Streams</span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              Use a wired ethernet connection for stable streaming
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              Close unnecessary applications to free up CPU/GPU
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              Test your stream privately before going live to your audience
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              Use good lighting and a quality microphone for professional results
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
