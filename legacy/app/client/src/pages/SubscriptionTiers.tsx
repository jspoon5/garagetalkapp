import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, Home, ArrowRight } from "lucide-react";
import Header from "@/components/Header";

const tiers = [
  {
    id: "amateur",
    name: "Amateur",
    price: "Free",
    priceValue: 0,
    description: "Perfect for learning the basics",
    features: [
      "Browse all videos",
      "Gearhead Agent (5 queries/day)",
      "Join chat rooms",
      "Live streaming (watch only)",
      "Community support"
    ],
    limitations: [
      "Limited Gearhead Agent queries",
      "No earnings features",
      "Standard support"
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    id: "gearhead",
    name: "Gearhead",
    price: "$9.99",
    priceValue: 9.99,
    period: "/month",
    description: "For active mechanics",
    features: [
      "Everything in Amateur, plus:",
      "Unlimited Gearhead Agent queries",
      "Upload videos (5 per month)",
      "Live streaming (broadcast & watch)",
      "Profit sharing (5%)",
      "Ad revenue sharing",
      "Priority support"
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    id: "racing_pro",
    name: "Racing Pro",
    price: "$19.99",
    priceValue: 19.99,
    period: "/month",
    description: "For professional mechanics",
    features: [
      "Everything in Gearhead, plus:",
      "Unlimited video uploads",
      "Profit sharing (10%)",
      "Viewer profit sharing",
      "Advanced analytics",
      "Custom branding on streams",
      "Expert support"
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29.99",
    priceValue: 29.99,
    period: "/month",
    description: "Maximum earning potential",
    features: [
      "Everything in Racing Pro, plus:",
      "Profit sharing (15%)",
      "Product commission (15%)",
      "Featured placement",
      "Dedicated account manager",
      "Early access to new features",
      "White-label options",
      "24/7 priority support"
    ],
    cta: "Start Free Trial",
    popular: false,
  },
];

export default function SubscriptionTiers() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            Subscription Tiers
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Perfect Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade as your channel grows. All paid plans include profit sharing and revenue opportunities.
          </p>
          
          {/* Continue with Free Tier Link */}
          <div className="mt-6">
            <Link href="/browse">
              <Button variant="ghost" className="gap-2" data-testid="button-continue-free">
                <Home className="h-4 w-4" />
                Continue with Free Tier
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Subscription Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {tiers.map((tier) => (
            <Card 
              key={tier.id} 
              className={`relative flex flex-col ${tier.popular ? 'border-primary shadow-lg' : ''}`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Badge variant="default">Most Popular</Badge>
                </div>
              )}
              
              <CardHeader className="text-center pt-8">
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <div className="mt-4 mb-2">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.period && (
                    <span className="text-muted-foreground">{tier.period}</span>
                  )}
                </div>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Link href={tier.priceValue === 0 ? "/browse" : `/subscribe?tier=${tier.id}`} className="w-full">
                  <Button 
                    className="w-full" 
                    variant={tier.popular ? "default" : "outline"}
                    data-testid={`button-subscribe-${tier.id}`}
                  >
                    {tier.cta}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Feature Comparison */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Feature Comparison</h2>
          
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-semibold">Feature</th>
                    <th className="text-center p-4 font-semibold">Amateur</th>
                    <th className="text-center p-4 font-semibold">Gearhead</th>
                    <th className="text-center p-4 font-semibold">Racing Pro</th>
                    <th className="text-center p-4 font-semibold">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4">Gearhead Agent Queries</td>
                    <td className="text-center p-4 text-muted-foreground">5/day</td>
                    <td className="text-center p-4">Unlimited</td>
                    <td className="text-center p-4">Unlimited</td>
                    <td className="text-center p-4">Unlimited</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Video Uploads</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4">5/month</td>
                    <td className="text-center p-4">Unlimited</td>
                    <td className="text-center p-4">Unlimited</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Live Streaming</td>
                    <td className="text-center p-4 text-muted-foreground">Watch only</td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Profit Sharing</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4">5%</td>
                    <td className="text-center p-4">10%</td>
                    <td className="text-center p-4">15%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Ad Revenue Sharing</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Viewer Profit Sharing</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                    <td className="text-center p-4">
                      <CheckIcon className="h-5 w-5 text-primary mx-auto" />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">Product Commissions</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4 text-muted-foreground">—</td>
                    <td className="text-center p-4">15%</td>
                  </tr>
                  <tr>
                    <td className="p-4">Support</td>
                    <td className="text-center p-4 text-muted-foreground">Community</td>
                    <td className="text-center p-4">Priority</td>
                    <td className="text-center p-4">Expert</td>
                    <td className="text-center p-4">24/7 Dedicated</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How does profit sharing work?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Profit sharing gives you a percentage of the revenue generated from views on your videos. 
                  Higher tiers earn higher percentages - from 5% on Gearhead up to 15% on Pro tier.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I cancel anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! All subscriptions are month-to-month with no long-term contracts. 
                  You can upgrade, downgrade, or cancel at any time from your dashboard.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What's included in the free trial?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  All paid tiers include a 7-day free trial with full access to all features. 
                  No credit card required to start - you can upgrade when you're ready.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How do product commissions work?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Pro tier members earn 15% commission on any automotive products sold through 
                  affiliate links in your video descriptions. Perfect for tool reviews and repair tutorials.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16 p-8 bg-muted/30 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Ready to Start Earning?</h2>
          <p className="text-muted-foreground mb-6">
            Join thousands of mechanics sharing knowledge and earning revenue
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signin">
              <Button size="lg" data-testid="button-cta-signup">
                Sign Up Free
              </Button>
            </Link>
            <Link href="/browse">
              <Button size="lg" variant="outline" data-testid="button-cta-browse">
                Browse Videos First
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
