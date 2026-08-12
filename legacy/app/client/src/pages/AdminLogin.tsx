import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Shield, Eye, EyeOff, Loader2, CheckCircle, Mail, Smartphone, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

type LoginStep = "credentials" | "verify-codes" | "success";

interface LoginState {
  loginId: string;
  maskedEmail: string;
  maskedPhone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<LoginStep>("credentials");
  const [loginState, setLoginState] = useState<LoginState | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");

  const form = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Step 1: Submit credentials
  const loginMutation = useMutation({
    mutationFn: async (data: AdminLoginForm) => {
      const response = await apiRequest("POST", "/api/admin/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.requires2FA) {
        setLoginState({
          loginId: data.loginId,
          maskedEmail: data.maskedEmail,
          maskedPhone: data.maskedPhone,
          emailVerified: false,
          phoneVerified: false,
        });
        setStep("verify-codes");
        setError(null);
        toast({
          title: "Verification Required",
          description: "Please enter the codes sent to your email and phone",
        });
      } else if (data.success) {
        setLocation("/admin");
      }
    },
    onError: (error: Error) => {
      const message = error.message.includes("401") 
        ? "Invalid username or password" 
        : error.message.includes("403")
        ? "Account is inactive"
        : error.message.includes("400")
        ? "No phone number configured for 2FA. Please contact support."
        : "Login failed. Please try again.";
      setError(message);
    },
  });

  // Verify email code
  const verifyEmailMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/admin/login/verify-email", {
        loginId: loginState?.loginId,
        code,
      });
      return response.json();
    },
    onSuccess: () => {
      setLoginState(prev => prev ? { ...prev, emailVerified: true } : null);
      setError(null);
      toast({
        title: "Email Verified",
        description: "Email verification successful",
      });
    },
    onError: (error: Error) => {
      setError("Invalid email code. Please try again.");
    },
  });

  // Verify phone code
  const verifyPhoneMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/admin/login/verify-phone", {
        loginId: loginState?.loginId,
        code,
      });
      return response.json();
    },
    onSuccess: () => {
      setLoginState(prev => prev ? { ...prev, phoneVerified: true } : null);
      setError(null);
      toast({
        title: "Phone Verified",
        description: "SMS verification successful",
      });
    },
    onError: (error: Error) => {
      setError("Invalid SMS code. Please try again.");
    },
  });

  // Complete login
  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/login/complete", {
        loginId: loginState?.loginId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome, Admin",
        description: "Successfully signed into the admin portal",
      });
      setTimeout(() => {
        setLocation("/admin");
      }, 300);
    },
    onError: (error: Error) => {
      setError("Failed to complete login. Please try again.");
    },
  });

  const onSubmit = (data: AdminLoginForm) => {
    setError(null);
    loginMutation.mutate(data);
  };

  const handleVerifyEmail = () => {
    if (emailCode.length === 6) {
      verifyEmailMutation.mutate(emailCode);
    }
  };

  const handleVerifyPhone = () => {
    if (phoneCode.length === 6) {
      verifyPhoneMutation.mutate(phoneCode);
    }
  };

  const handleCompleteLogin = () => {
    completeMutation.mutate();
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setLoginState(null);
    setEmailCode("");
    setPhoneCode("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <WrenchScrewdriverIcon className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">Garage Talk</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Shield className="h-6 w-6 text-muted-foreground" />
            <span className="text-lg text-muted-foreground">Admin Portal</span>
          </div>
        </div>

        <Card>
          {step === "credentials" && (
            <>
              <CardHeader>
                <CardTitle data-testid="text-admin-title">Administrator Login</CardTitle>
                <CardDescription>
                  Sign in with your administrator credentials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {error && (
                      <div 
                        className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                        data-testid="text-error-message"
                      >
                        {error}
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="admin"
                              autoComplete="username"
                              data-testid="input-username"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                className="pr-10"
                                data-testid="input-password"
                              />
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
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
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                      data-testid="button-submit"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In to Admin Panel"
                      )}
                    </Button>

                    <div className="text-center">
                      <Link 
                        href="/admin/recovery" 
                        className="text-sm text-muted-foreground hover:text-primary"
                        data-testid="link-forgot-password"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </>
          )}

          {step === "verify-codes" && loginState && (
            <>
              <CardHeader>
                <CardTitle data-testid="text-2fa-title">Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Enter the verification codes sent to your email and phone
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div 
                    className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                    data-testid="text-error-message"
                  >
                    {error}
                  </div>
                )}

                {/* Email Verification */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Email Code</span>
                    <span className="text-xs text-muted-foreground">({loginState.maskedEmail})</span>
                    {loginState.emailVerified && (
                      <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      disabled={loginState.emailVerified}
                      data-testid="input-email-code"
                    />
                    <Button
                      onClick={handleVerifyEmail}
                      disabled={emailCode.length !== 6 || loginState.emailVerified || verifyEmailMutation.isPending}
                      variant={loginState.emailVerified ? "outline" : "default"}
                      data-testid="button-verify-email"
                    >
                      {verifyEmailMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : loginState.emailVerified ? (
                        "Verified"
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Phone Verification */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">SMS Code</span>
                    <span className="text-xs text-muted-foreground">({loginState.maskedPhone})</span>
                    {loginState.phoneVerified && (
                      <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      disabled={loginState.phoneVerified}
                      data-testid="input-phone-code"
                    />
                    <Button
                      onClick={handleVerifyPhone}
                      disabled={phoneCode.length !== 6 || loginState.phoneVerified || verifyPhoneMutation.isPending}
                      variant={loginState.phoneVerified ? "outline" : "default"}
                      data-testid="button-verify-phone"
                    >
                      {verifyPhoneMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : loginState.phoneVerified ? (
                        "Verified"
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Complete Login Button */}
                <Button
                  onClick={handleCompleteLogin}
                  disabled={!loginState.emailVerified || !loginState.phoneVerified || completeMutation.isPending}
                  className="w-full"
                  data-testid="button-complete-login"
                >
                  {completeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Completing login...
                    </>
                  ) : (
                    "Complete Login"
                  )}
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleBackToCredentials}
                  className="w-full"
                  data-testid="button-back"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          This portal is for authorized administrators only.
        </p>
      </div>
    </div>
  );
}
