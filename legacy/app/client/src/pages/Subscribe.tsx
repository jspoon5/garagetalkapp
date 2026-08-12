import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Loader2, CreditCard, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

const tierInfo: Record<string, { name: string; price: string; description: string; features: string[] }> = {
  gearhead: {
    name: "Gearhead",
    price: "$9.99/month",
    description: "Unlimited Gearhead Agent queries, 5 uploads/month, 5% profit sharing",
    features: [
      "Unlimited Gearhead Agent queries",
      "5 video uploads per month",
      "5% profit sharing",
      "Create chat rooms",
      "Free Occular Streaming app access"
    ]
  },
  racing_pro: {
    name: "Racing Pro",
    price: "$19.99/month",
    description: "Unlimited uploads, 10% profit sharing, viewer profits",
    features: [
      "Everything in Gearhead",
      "Unlimited video uploads",
      "10% profit sharing",
      "Viewer profit sharing",
      "Advanced analytics",
      "Free Occular Streaming app access"
    ]
  },
  pro: {
    name: "Pro",
    price: "$29.99/month",
    description: "15% profit sharing, 15% product commissions, featured placement",
    features: [
      "Everything in Racing Pro",
      "15% profit sharing",
      "15% product commission",
      "Featured placement",
      "Account manager",
      "24/7 priority support",
      "Free Occular Streaming app access"
    ]
  }
};

export default function Subscribe() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const tier = params.get('tier') || 'gearhead';
  const info = tierInfo[tier] || tierInfo.gearhead;

  const { data: user, isLoading: isCheckingAuth } = useQuery<{ 
    id: string; 
    subscriptionTier?: string;
    subscriptionStatus?: string;
  } | null>({
    queryKey: ['/api/users/current'],
    retry: false,
  });

  const isAuthenticated = !!user?.id;
  const hasActiveSubscription = user?.subscriptionTier && 
    user.subscriptionTier !== 'amateur' && 
    (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing');

  // Redirect active subscribers to dashboard
  if (!isCheckingAuth && hasActiveSubscription) {
    setLocation('/dashboard');
    return null;
  }

  const handleSubscribe = async () => {
    setIsProcessing(true);

    try {
      const response = await apiRequest('POST', '/api/create-subscription', { tier });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Subscription error:', err);
      
      const errorMessage = err.message || "Something went wrong";
      const isAuthError = errorMessage.includes("Not authenticated") || errorMessage.includes("sign in");
      
      if (isAuthError) {
        toast({
          title: "Sign In Required",
          description: "Please sign in to subscribe",
          variant: "destructive",
        });
        setLocation('/sign-in');
      } else {
        toast({
          title: "Subscription Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Garage Talk</span>
          </div>
          <Badge variant="default" className="mx-auto mb-2">
            {info.name}
          </Badge>
          <CardTitle>Subscribe to {info.name}</CardTitle>
          <CardDescription>
            {info.description}
          </CardDescription>
          <div className="text-3xl font-bold mt-4">{info.price}</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            {info.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
          
          {!isCheckingAuth && !isAuthenticated && (
            <Alert variant="destructive" data-testid="alert-sign-in-required">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You must sign in before subscribing. Please sign in or create an account first.
              </AlertDescription>
            </Alert>
          )}

          {!isCheckingAuth && !isAuthenticated ? (
            <Button 
              onClick={() => setLocation('/sign-in')}
              className="w-full" 
              data-testid="button-sign-in-to-subscribe"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In to Subscribe
            </Button>
          ) : (
            <Button 
              onClick={handleSubscribe}
              className="w-full" 
              disabled={isProcessing || isCheckingAuth}
              data-testid="button-submit-payment"
            >
              {isCheckingAuth ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking account...
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Subscribe Now
                </>
              )}
            </Button>
          )}
          
          <p className="text-xs text-center text-muted-foreground">
            You'll be redirected to Stripe's secure checkout. 
            By subscribing, you agree to our Terms of Service and Privacy Policy. 
            You can cancel anytime from your dashboard.
          </p>
          
          <Button 
            onClick={() => setLocation('/subscription-tiers')} 
            variant="outline"
            className="w-full"
            data-testid="button-back-to-subscription-tiers"
          >
            Back to Subscription Tiers
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
