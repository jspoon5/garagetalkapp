import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function SubscriptionSuccess() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [tierName, setTierName] = useState('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const tier = params.get('tier');

  const tierNames: Record<string, string> = {
    gearhead: 'Gearhead',
    racing_pro: 'Racing Pro',
    pro: 'Pro'
  };

  useEffect(() => {
    const completeSubscription = async () => {
      if (!sessionId || !tier) {
        toast({
          title: "Error",
          description: "Invalid subscription parameters",
          variant: "destructive",
        });
        setLocation('/subscription-tiers');
        return;
      }

      try {
        const response = await apiRequest('POST', '/api/subscription/complete', {
          sessionId,
          tier
        });

        const data = await response.json();

        if (data.success) {
          setTierName(tierNames[tier] || tier);
          setIsComplete(true);
          toast({
            title: "Subscription Activated!",
            description: `Welcome to ${tierNames[tier] || tier}!`,
          });
        } else {
          throw new Error(data.error || 'Failed to complete subscription');
        }
      } catch (err: any) {
        console.error('Subscription completion error:', err);
        toast({
          title: "Subscription Error",
          description: err.message || "Failed to complete subscription",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    completeSubscription();
  }, [sessionId, tier]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Garage Talk</span>
          </div>
          {isProcessing ? (
            <>
              <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto mb-4" />
              <CardTitle>Activating Your Subscription</CardTitle>
              <CardDescription>
                Please wait while we set up your account...
              </CardDescription>
            </>
          ) : isComplete ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <CardTitle>Welcome to {tierName}!</CardTitle>
              <CardDescription>
                Your subscription is now active. Enjoy all your new benefits!
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Subscription Setup</CardTitle>
              <CardDescription>
                There was an issue setting up your subscription. Please try again or contact support.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!isProcessing && (
            <>
              <Button 
                onClick={() => setLocation('/dashboard')} 
                className="w-full"
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
              </Button>
              <Button 
                onClick={() => setLocation('/browse')} 
                variant="outline"
                className="w-full"
                data-testid="button-browse-videos"
              >
                Browse Videos
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
