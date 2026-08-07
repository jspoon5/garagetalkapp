import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Smartphone, User, RefreshCw, Eye, EyeOff, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const REMEMBER_ME_KEY = "garagetalk_remember_me";

export default function SignIn() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSignUp, setIsSignUp] = useState(location.includes('/sign-up') || location.includes('/signup'));
  
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneUsername, setPhoneUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [sentPhone, setSentPhone] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [emailLoginEmail, setEmailLoginEmail] = useState("");
  const [emailLoginPassword, setEmailLoginPassword] = useState("");
  const [emailRememberMe, setEmailRememberMe] = useState(false);
  const [city, setCity] = useState("");

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_ME_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.username) {
          setUsername(parsed.username);
          setRememberMe(true);
        }
        if (parsed.email) {
          setEmailLoginEmail(parsed.email);
          setEmailRememberMe(true);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const authMutation = useMutation({
    mutationFn: async ({ username, password, isSignUp, rememberMe, email, city }: { username: string; password: string; isSignUp: boolean; rememberMe: boolean; email?: string; city?: string }) => {
      const endpoint = isSignUp ? "/api/auth/sign-up" : "/api/auth/sign-in";
      const body = isSignUp 
        ? { username, password, email, city }
        : { username, password, rememberMe };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Authentication failed");
      }
      
      return response.json();
    },
    onSuccess: (user, variables) => {
      queryClient.setQueryData(["/api/users/current"], user);
      
      // Save or clear credentials based on rememberMe (preserve existing saved credentials)
      if (variables.rememberMe && !variables.isSignUp) {
        try {
          const saved = localStorage.getItem(REMEMBER_ME_KEY);
          const existing = saved ? JSON.parse(saved) : {};
          localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ ...existing, username: variables.username }));
        } catch {
          localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ username: variables.username }));
        }
      }
      
      toast({
        title: "Welcome!",
        description: `${isSignUp ? 'Account created' : 'Signed in'} successfully as ${user.username}`,
      });

      setTimeout(() => {
        setLocation("/subscription-tiers");
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const emailLoginMutation = useMutation({
    mutationFn: async ({ email, password, rememberMe }: { email: string; password: string; rememberMe: boolean }) => {
      const response = await fetch("/api/auth/email-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Authentication failed");
      }
      
      return response.json();
    },
    onSuccess: (user, variables) => {
      queryClient.setQueryData(["/api/users/current"], user);
      
      // Save or clear credentials based on rememberMe (preserve existing saved credentials)
      if (variables.rememberMe) {
        try {
          const saved = localStorage.getItem(REMEMBER_ME_KEY);
          const existing = saved ? JSON.parse(saved) : {};
          localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ ...existing, email: variables.email }));
        } catch {
          localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email: variables.email }));
        }
      }
      
      toast({
        title: "Welcome!",
        description: `Signed in successfully as ${user.username}`,
      });

      setTimeout(() => {
        setLocation("/subscription-tiers");
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const requestOtpMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await fetch("/api/auth/phone/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send verification code");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setOtpSent(true);
      setSentPhone(data.phone);
      setResendCooldown(60); // 60 second cooldown before resend
      setOtpCode(""); // Clear any previous code
      toast({
        title: "Code Sent",
        description: "Check your phone for the verification code",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phone, code, username }: { phone: string; code: string; username?: string }) => {
      const response = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, username }),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.needsUsername) {
          setNeedsUsername(true);
          throw new Error("Please choose a username for your new account");
        }
        throw new Error(data.error || "Failed to verify code");
      }
      
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/users/current"], user);
      
      toast({
        title: "Welcome!",
        description: `Signed in successfully as ${user.username}`,
      });

      setTimeout(() => {
        setLocation("/subscription-tiers");
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (isSignUp) {
      if (!email) {
        toast({
          title: "Error",
          description: "Email is required",
          variant: "destructive",
        });
        return;
      }
      if (!city) {
        toast({
          title: "Error",
          description: "City is required",
          variant: "destructive",
        });
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast({
          title: "Error",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return;
      }
    }

    authMutation.mutate({ username, password, isSignUp, rememberMe, email: isSignUp ? email : undefined, city: isSignUp ? city : undefined });
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }

    requestOtpMutation.mutate(phone);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otpCode) {
      toast({
        title: "Error",
        description: "Please enter the verification code",
        variant: "destructive",
      });
      return;
    }

    if (needsUsername && (!phoneUsername || phoneUsername.trim().length < 3)) {
      toast({
        title: "Error",
        description: "Please enter a username (at least 3 characters)",
        variant: "destructive",
      });
      return;
    }

    verifyOtpMutation.mutate({ 
      phone: sentPhone, 
      code: otpCode, 
      username: needsUsername ? phoneUsername.trim() : undefined 
    });
  };

  const handleResendCode = () => {
    if (resendCooldown > 0) return;
    setOtpCode("");
    setNeedsUsername(false);
    setPhoneUsername("");
    requestOtpMutation.mutate(sentPhone);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailLoginEmail) {
      toast({
        title: "Error",
        description: "Please enter your email",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLoginEmail)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (!emailLoginPassword) {
      toast({
        title: "Error",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    emailLoginMutation.mutate({ 
      email: emailLoginEmail, 
      password: emailLoginPassword, 
      rememberMe: emailRememberMe 
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 mb-4 cursor-pointer hover-elevate p-2 rounded-md">
              <WrenchScrewdriverIcon className="h-10 w-10 text-primary" />
              <span className="text-2xl font-bold">Garage Talk</span>
            </div>
          </Link>
          <p className="text-muted-foreground">
            {isSignUp ? 'Create your mechanic account' : 'Welcome back, mechanic!'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isSignUp ? 'Create Account' : 'Sign In'}</CardTitle>
            <CardDescription>
              {isSignUp 
                ? 'Join thousands of mechanics sharing repair knowledge' 
                : 'Enter your credentials to access your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="username" className="gap-2" data-testid="tab-username">
                  <User className="h-4 w-4" />
                  Username
                </TabsTrigger>
                <TabsTrigger value="phone" className="gap-2" data-testid="tab-phone">
                  <Smartphone className="h-4 w-4" />
                  Phone
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="email">
                {!isSignUp ? (
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="emailLogin">Email</Label>
                      <Input
                        id="emailLogin"
                        type="email"
                        placeholder="you@example.com"
                        value={emailLoginEmail}
                        onChange={(e) => setEmailLoginEmail(e.target.value)}
                        required
                        data-testid="input-email-login"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="emailPassword">Password</Label>
                      <div className="relative">
                        <Input
                          id="emailPassword"
                          type={showEmailPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={emailLoginPassword}
                          onChange={(e) => setEmailLoginPassword(e.target.value)}
                          required
                          className="pr-10"
                          data-testid="input-email-password"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors z-10"
                          onClick={() => setShowEmailPassword(!showEmailPassword)}
                          data-testid="button-toggle-email-password"
                          aria-label={showEmailPassword ? "Hide password" : "Show password"}
                        >
                          {showEmailPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="rounded" 
                          checked={emailRememberMe}
                          onChange={(e) => setEmailRememberMe(e.target.checked)}
                          data-testid="checkbox-email-remember"
                        />
                        <span className="text-muted-foreground">Remember me</span>
                      </label>
                      <Link href="/forgot-password" className="text-primary hover:underline" data-testid="link-email-forgot-password">
                        Forgot password?
                      </Link>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={emailLoginMutation.isPending}
                      data-testid="button-email-submit"
                    >
                      {emailLoginMutation.isPending ? 'Please wait...' : 'Sign In'}
                    </Button>
                  </form>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="mb-4">To create an account, use the Username tab or Phone tab.</p>
                    <p className="text-sm">Email login is only available for existing accounts.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="username">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="johndoe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      data-testid="input-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-10"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors z-10"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isSignUp && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          data-testid="input-email"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="city">City <span className="text-destructive">*</span></Label>
                        <Input
                          id="city"
                          type="text"
                          placeholder="Los Angeles"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          required
                          data-testid="input-city"
                        />
                      </div>
                    </>
                  )}

                  {!isSignUp && (
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="rounded" 
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          data-testid="checkbox-remember"
                        />
                        <span className="text-muted-foreground">Remember me</span>
                      </label>
                      <Link href="/forgot-password" className="text-primary hover:underline" data-testid="link-forgot-password">
                        Forgot password?
                      </Link>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={authMutation.isPending}
                    data-testid="button-submit"
                  >
                    {authMutation.isPending ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="phone">
                {!otpSent ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(415) 555-1234"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        data-testid="input-phone"
                      />
                      <p className="text-xs text-muted-foreground">
                        US numbers work without country code. For international, add + and country code.
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={requestOtpMutation.isPending}
                      data-testid="button-send-code"
                    >
                      {requestOtpMutation.isPending ? 'Sending...' : 'Send Verification Code'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp">Verification Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        maxLength={6}
                        required
                        data-testid="input-otp"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the 6-digit code sent to {sentPhone}
                      </p>
                    </div>

                    {needsUsername && (
                      <div className="space-y-2">
                        <Label htmlFor="phoneUsername">Choose a Username</Label>
                        <Input
                          id="phoneUsername"
                          type="text"
                          placeholder="johndoe"
                          value={phoneUsername}
                          onChange={(e) => setPhoneUsername(e.target.value)}
                          required
                          data-testid="input-phone-username"
                        />
                        <p className="text-xs text-muted-foreground">
                          This will be your display name in Garage Talk
                        </p>
                      </div>
                    )}

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={verifyOtpMutation.isPending}
                      data-testid="button-verify-code"
                    >
                      {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify & Sign In'}
                    </Button>
                    
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="flex-1 gap-2"
                        onClick={handleResendCode}
                        disabled={resendCooldown > 0 || requestOtpMutation.isPending}
                        data-testid="button-resend-code"
                      >
                        <RefreshCw className={`h-4 w-4 ${requestOtpMutation.isPending ? 'animate-spin' : ''}`} />
                        {requestOtpMutation.isPending 
                          ? 'Sending...' 
                          : resendCooldown > 0 
                            ? `Resend (${resendCooldown}s)` 
                            : 'Resend Code'}
                      </Button>
                      
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="flex-1"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode("");
                          setNeedsUsername(false);
                          setPhoneUsername("");
                          setResendCooldown(0);
                        }}
                        data-testid="button-back-phone"
                      >
                        Different number
                      </Button>
                    </div>
                  </form>
                )}
              </TabsContent>
            </Tabs>

          </CardContent>
          <CardFooter className="flex-col gap-4">
            <div className="text-sm text-center text-muted-foreground">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline"
                data-testid="button-toggle-mode"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
