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
import { Shield, Loader2, ArrowLeft, Mail, Phone, CheckCircle2, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type RecoveryStep = 'username' | 'verify-codes' | 'new-password' | 'success';

const usernameSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

const verifyCodesSchema = z.object({
  emailCode: z.string().length(6, "Enter the 6-digit code from your email"),
  phoneCode: z.string().length(6, "Enter the 6-digit code from SMS"),
});

const newPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AdminPasswordRecovery() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<RecoveryStep>('username');
  const [recoveryId, setRecoveryId] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const usernameForm = useForm<z.infer<typeof usernameSchema>>({
    resolver: zodResolver(usernameSchema),
    defaultValues: { username: "" },
  });

  const verifyCodesForm = useForm<z.infer<typeof verifyCodesSchema>>({
    resolver: zodResolver(verifyCodesSchema),
    defaultValues: { emailCode: "", phoneCode: "" },
  });

  const newPasswordForm = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const initiateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof usernameSchema>) => {
      const response = await apiRequest("POST", "/api/admin/recovery/initiate", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.recoveryId) {
        setRecoveryId(data.recoveryId);
        setMaskedEmail(data.maskedEmail || "");
        setMaskedPhone(data.maskedPhone || "");
        setStep('verify-codes');
        toast({
          title: "Verification codes sent",
          description: "Check your email and phone for the 6-digit codes",
        });
      } else {
        toast({
          title: "Recovery initiated",
          description: data.message || "If the account exists, recovery codes have been sent",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Recovery failed",
        description: error.message || "Failed to initiate recovery",
        variant: "destructive",
      });
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/admin/recovery/verify-email", {
        recoveryId,
        code,
      });
      return response.json();
    },
    onSuccess: () => {
      setEmailVerified(true);
      toast({ title: "Email verified", description: "Email code accepted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid email code",
        variant: "destructive",
      });
    },
  });

  const verifyPhoneMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/admin/recovery/verify-phone", {
        recoveryId,
        code,
      });
      return response.json();
    },
    onSuccess: () => {
      setPhoneVerified(true);
      toast({ title: "Phone verified", description: "SMS code accepted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid phone code",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof newPasswordSchema>) => {
      const response = await apiRequest("POST", "/api/admin/recovery/reset-password", {
        recoveryId,
        newPassword: data.newPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      setStep('success');
      toast({
        title: "Password reset successful",
        description: "You can now sign in with your new password",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset failed",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const handleVerifyCodes = () => {
    const emailCode = verifyCodesForm.getValues("emailCode");
    const phoneCode = verifyCodesForm.getValues("phoneCode");
    
    if (emailCode.length === 6 && !emailVerified) {
      verifyEmailMutation.mutate(emailCode);
    }
    if (phoneCode.length === 6 && !phoneVerified) {
      verifyPhoneMutation.mutate(phoneCode);
    }
  };

  const canProceedToPassword = emailVerified && phoneVerified;

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
            <span className="text-lg text-muted-foreground">Admin Password Recovery</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle data-testid="text-recovery-title">
              {step === 'username' && "Recover Your Password"}
              {step === 'verify-codes' && "Two-Factor Verification"}
              {step === 'new-password' && "Set New Password"}
              {step === 'success' && "Password Reset Complete"}
            </CardTitle>
            <CardDescription>
              {step === 'username' && "Enter your admin username to start the recovery process"}
              {step === 'verify-codes' && "Enter the verification codes sent to your email and phone"}
              {step === 'new-password' && "Create a new secure password for your account"}
              {step === 'success' && "Your password has been successfully updated"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'username' && (
              <Form {...usernameForm}>
                <form onSubmit={usernameForm.handleSubmit((data) => initiateMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={usernameForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Username</FormLabel>
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

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={initiateMutation.isPending}
                    data-testid="button-initiate"
                  >
                    {initiateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending codes...
                      </>
                    ) : (
                      "Send Recovery Codes"
                    )}
                  </Button>
                </form>
              </Form>
            )}

            {step === 'verify-codes' && (
              <div className="space-y-6">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Codes sent to:</p>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{maskedEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{maskedPhone}</span>
                  </div>
                </div>

                <Form {...verifyCodesForm}>
                  <form className="space-y-4">
                    <FormField
                      control={verifyCodesForm.control}
                      name="emailCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Email Code
                            {emailVerified && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                {...field}
                                placeholder="000000"
                                maxLength={6}
                                disabled={emailVerified}
                                data-testid="input-email-code"
                              />
                              {!emailVerified && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => verifyEmailMutation.mutate(field.value)}
                                  disabled={field.value.length !== 6 || verifyEmailMutation.isPending}
                                  data-testid="button-verify-email"
                                >
                                  {verifyEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={verifyCodesForm.control}
                      name="phoneCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            SMS Code
                            {phoneVerified && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                {...field}
                                placeholder="000000"
                                maxLength={6}
                                disabled={phoneVerified}
                                data-testid="input-phone-code"
                              />
                              {!phoneVerified && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => verifyPhoneMutation.mutate(field.value)}
                                  disabled={field.value.length !== 6 || verifyPhoneMutation.isPending}
                                  data-testid="button-verify-phone"
                                >
                                  {verifyPhoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="button" 
                      className="w-full" 
                      disabled={!canProceedToPassword}
                      onClick={() => setStep('new-password')}
                      data-testid="button-continue-password"
                    >
                      Continue to Set Password
                    </Button>
                  </form>
                </Form>
              </div>
            )}

            {step === 'new-password' && (
              <Form {...newPasswordForm}>
                <form onSubmit={newPasswordForm.handleSubmit((data) => resetPasswordMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={newPasswordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter new password"
                            data-testid="input-new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newPasswordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Confirm new password"
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={resetPasswordMutation.isPending}
                    data-testid="button-reset-password"
                  >
                    {resetPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting password...
                      </>
                    ) : (
                      <>
                        <Key className="mr-2 h-4 w-4" />
                        Reset Password
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}

            {step === 'success' && (
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <p className="text-muted-foreground">
                  Your password has been reset successfully. You can now sign in with your new password.
                </p>
                <Button 
                  className="w-full" 
                  onClick={() => setLocation("/admin/login")}
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link href="/admin/login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Admin Login
          </Link>
        </div>
      </div>
    </div>
  );
}
