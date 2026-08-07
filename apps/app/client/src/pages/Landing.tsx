import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { RecentlyWatchedCarousel } from "@/components/RecentlyWatchedCarousel";
import { 
  WrenchScrewdriverIcon, 
  ChatBubbleLeftRightIcon, 
  MagnifyingGlassIcon,
  MicrophoneIcon,
  PlayIcon,
  SparklesIcon,
  CloudArrowUpIcon,
  DevicePhoneMobileIcon,
  CheckIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    {
      icon: PlayIcon,
      title: t('features.videoLibrary.title'),
      description: t('features.videoLibrary.description'),
      link: "/browse"
    },
    {
      icon: SparklesIcon,
      title: t('features.gearheadAgent.title'),
      description: t('features.gearheadAgent.description'),
      link: "/search"
    },
    {
      icon: ChatBubbleLeftRightIcon,
      title: t('features.liveChat.title'),
      description: t('features.liveChat.description'),
      link: "/chat"
    },
    {
      icon: CloudArrowUpIcon,
      title: t('features.uploadVideos.title'),
      description: t('features.uploadVideos.description'),
      link: "/upload"
    },
    {
      icon: MagnifyingGlassIcon,
      title: t('features.smartSearch.title'),
      description: t('features.smartSearch.description'),
      link: "/search"
    },
    {
      icon: WrenchScrewdriverIcon,
      title: t('features.mobileFirst.title'),
      description: t('features.mobileFirst.description'),
      link: null
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">{t('landing.title')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <Link href="/book-appointment">
              <Button variant="ghost" data-testid="button-book-appointment">Book Appointment</Button>
            </Link>
            <Link href="/subscription-tiers">
              <Button variant="ghost" data-testid="button-subscription-tiers">{t('landing.subscriptionTiers')}</Button>
            </Link>
            <Link href="/signin">
              <Button variant="ghost" data-testid="button-signin">{t('common.signIn')}</Button>
            </Link>
            <Link href="/signin">
              <Button data-testid="button-get-started">{t('common.getStarted')}</Button>
            </Link>
          </div>
        </div>
      </header>
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="relative max-w-7xl mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            {t('landing.badge')}
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            {t('landing.title')}
          </h1>
          
          {/* Tagline */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-6 max-w-3xl mx-auto">
            The Garage Talk social media and Gearhead AI app to have fun and learn how to fix anything with an engine.
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-8">
            <Link href="/search">
              <div className="flex items-center gap-3 bg-card border rounded-full px-6 py-4 hover-elevate cursor-pointer text-[#2012e0]" data-testid="landing-search-bar">
                <MagnifyingGlassIcon className="h-6 w-6 text-muted-foreground" />
                <span className="flex-1 text-lg text-[#106bc6] bg-[#211e1e00]">Ask the Gearhead Agent anything about auto repair...</span>
                <div className="flex items-center gap-1 text-primary" data-testid="landing-voice-hint">
                  <MicrophoneIcon className="h-5 w-5" />
                  <span className="text-sm font-medium hidden sm:inline">Voice</span>
                </div>
              </div>
            </Link>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            <span className="text-primary">{t('landing.subtitle')}</span>
          </h2>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signin">
              <Button size="lg" className="gap-2" data-testid="button-hero-start">
                <PlayIcon className="h-5 w-5" />
                {t('landing.startLearning')}
              </Button>
            </Link>
            <Link href="/browse">
              <Button size="lg" variant="outline" data-testid="button-browse-videos">
                {t('landing.browseVideos')}
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-3xl mx-auto">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-primary mb-1">500+</div>
                <div className="text-sm text-muted-foreground">{t('landing.stats.repairVideos')}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-primary mb-1">10K+</div>
                <div className="text-sm text-muted-foreground">{t('landing.stats.activeMechanics')}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-primary mb-1">24/7</div>
                <div className="text-sm text-muted-foreground">{t('landing.stats.chatRooms')}</div>
              </CardContent>
            </Card>
          </div>

          {/* Download App QR Code */}
          <div className="mt-16 max-w-md mx-auto">
            <Card className="bg-card/50 backdrop-blur">
              <CardContent className="pt-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <DevicePhoneMobileIcon className="h-6 w-6 text-primary" />
                  <h3 className="text-lg font-semibold">{t('landing.installApp')}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('landing.scanQR')}
                </p>
                <div className="bg-white p-4 rounded-lg inline-block" data-testid="qr-code-download">
                  <QRCodeSVG 
                    value={typeof window !== 'undefined' ? window.location.origin : 'https://garage-talk.replit.app'}
                    size={160}
                    level="H"
                    includeMargin={false}
                    fgColor="#1a1a2e"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  {t('landing.worksOnBoth')}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* Recently Watched Section (only shows for authenticated users with history) */}
      <RecentlyWatchedCarousel />
      
      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('landing.featuresTitle')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('landing.featuresDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const cardContent = (
                <Card className="hover-elevate h-full">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              );

              return feature.link ? (
                <Link key={index} href={feature.link} data-testid={`link-feature-${index}`}>
                  {cardContent}
                </Link>
              ) : (
                <div key={index}>
                  {cardContent}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('landing.howItWorks')}
            </h2>
            <p className="text-muted-foreground text-lg">
              {t('landing.threeSteps')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('landing.step1Title')}</h3>
              <p className="text-muted-foreground">
                {t('landing.step1Description')}
              </p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('landing.step2Title')}</h3>
              <p className="text-muted-foreground">
                {t('landing.step2Description')}
              </p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('landing.step3Title')}</h3>
              <p className="text-muted-foreground">
                {t('landing.step3Description')}
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section className="py-20 px-4 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              {t('landing.pricingPlans')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('landing.chooseYourPlan')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('landing.pricingDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Amateur - Free */}
            <Card className="flex flex-col">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{t('subscription.amateur')}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{t('subscription.free')}</span>
                </div>
                <CardDescription>{t('landing.perfectForLearning')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.browseAllVideos')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.gearheadAgentLimit')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.joinChatRooms')}</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/signin" className="w-full">
                  <Button variant="outline" className="w-full" data-testid="button-plan-amateur">
                    {t('common.getStarted')}
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Gearhead */}
            <Card className="flex flex-col">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{t('subscription.gearhead')}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">$9.99</span>
                  <span className="text-muted-foreground">{t('subscription.perMonth')}</span>
                </div>
                <CardDescription>{t('landing.forActiveMechanics')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.unlimitedGearhead')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.uploadVideosLimit')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.liveStreamingBroadcast')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.profitSharing10')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.prioritySupport')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <a href="https://occular-stream--garagegrouphold.replit.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-occular-gearhead">{t('landing.freeOccularStreaming')}</a>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/subscribe?tier=gearhead" className="w-full">
                  <Button variant="outline" className="w-full" data-testid="button-plan-gearhead">
                    {t('landing.startFreeTrial')}
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Racing Pro - Popular */}
            <Card className="flex flex-col border-primary relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Badge>{t('subscription.mostPopular')}</Badge>
              </div>
              <CardHeader className="text-center pt-8">
                <CardTitle className="text-xl">{t('subscription.racingPro')}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">$19.99</span>
                  <span className="text-muted-foreground">{t('subscription.perMonth')}</span>
                </div>
                <CardDescription>{t('landing.forProMechanics')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.unlimitedVideoUploads')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.profitSharing25')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.viewerProfitSharing')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.advancedAnalytics')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.expertSupport')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <a href="https://occular-stream--garagegrouphold.replit.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-occular-racing-pro">{t('landing.freeOccularStreaming')}</a>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/subscribe?tier=racing_pro" className="w-full">
                  <Button className="w-full" data-testid="button-plan-racing-pro">
                    {t('landing.startFreeTrial')}
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Pro */}
            <Card className="flex flex-col">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{t('subscription.pro')}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">$29.99</span>
                  <span className="text-muted-foreground">{t('subscription.perMonth')}</span>
                </div>
                <CardDescription>{t('landing.forMaxEarnings')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.profitSharing40')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.productCommission15')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.featuredPlacement')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.accountManager')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{t('landing.prioritySupport247')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <a href="https://occular-stream--garagegrouphold.replit.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-occular-pro">{t('landing.freeOccularStreaming')}</a>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/subscribe?tier=pro" className="w-full">
                  <Button variant="outline" className="w-full" data-testid="button-plan-pro">
                    {t('landing.startFreeTrial')}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>

          <div className="text-center mt-8">
            <Link href="/subscription-tiers">
              <Button variant="ghost" data-testid="link-view-all-plans">
                {t('landing.viewAllPlanDetails')} →
              </Button>
            </Link>
          </div>
        </div>
      </section>
      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('landing.ctaTitle')}
          </h2>
          <p className="text-lg mb-8 opacity-90">
            {t('landing.ctaDescription')}
          </p>
          <Link href="/signin">
            <Button size="lg" variant="secondary" className="gap-2" data-testid="button-cta-start">
              {t('landing.startFreeToday')}
            </Button>
          </Link>
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <WrenchScrewdriverIcon className="h-6 w-6 text-primary" />
                <span className="font-bold">{t('landing.title')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('footer.description')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{t('footer.platform')}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/browse">{t('footer.browseVideos')}</Link></li>
                <li><Link href="/chat">{t('footer.chatRooms')}</Link></li>
                <li><Link href="/upload">{t('footer.uploadVideo')}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{t('footer.features')}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>{t('footer.gearheadAgent')}</li>
                <li>{t('footer.videoLibrary')}</li>
                <li>{t('footer.liveChat')}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{t('footer.support')}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/guide" data-testid="link-user-guide">{t('footer.helpCenter')}</Link></li>
                <li>{t('footer.contactUs')}</li>
                <li>{t('footer.community')}</li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>© 2024 {t('landing.title')}. {t('footer.copyright')}</span>
            <Link href="/admin/login" data-testid="link-admin-portal">
              <ShieldCheckIcon className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
