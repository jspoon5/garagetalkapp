import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, Phone, Shield } from "lucide-react";
import type { User } from "@shared/schema";
import { useTranslation } from "react-i18next";

interface RequireContactInfoProps {
  user: User | null | undefined;
  children: React.ReactNode;
}

export default function RequireContactInfo({ user, children }: RequireContactInfoProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [activeTab, setActiveTab] = useState<"email" | "phone">("email");

  const needsContactInfo = user && !user.email && !user.phone;

  const updateEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      await apiRequest("PATCH", `/api/users/${user!.id}`, { email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });
      toast({ title: t("profile.emailUpdated", "Email added successfully") });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("profile.emailUpdateFailed", "Failed to add email"),
        variant: "destructive",
      });
    },
  });

  const sendOtpMutation = useMutation({
    mutationFn: async (phone: string) => {
      await apiRequest("POST", "/api/auth/phone/send-otp", { phone });
    },
    onSuccess: () => {
      setCodeSent(true);
      toast({ title: t("auth.codeSent", "Verification code sent") });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("auth.sendCodeFailed", "Failed to send verification code"),
        variant: "destructive",
      });
    },
  });

  const verifyPhoneMutation = useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      await apiRequest("POST", "/api/users/profile/verify-phone", { phone, code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/current"] });
      toast({ title: t("profile.phoneVerified", "Phone number verified") });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("profile.phoneVerifyFailed", "Failed to verify phone"),
        variant: "destructive",
      });
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: t("common.error", "Error"),
        description: t("auth.invalidEmail", "Please enter a valid email address"),
        variant: "destructive",
      });
      return;
    }
    updateEmailMutation.mutate(email.trim().toLowerCase());
  };

  const handlePhoneSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast({
        title: t("common.error", "Error"),
        description: t("auth.invalidPhone", "Please enter a valid phone number"),
        variant: "destructive",
      });
      return;
    }
    sendOtpMutation.mutate(phone);
  };

  const handlePhoneVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.length < 4) {
      toast({
        title: t("common.error", "Error"),
        description: t("auth.invalidCode", "Please enter the verification code"),
        variant: "destructive",
      });
      return;
    }
    verifyPhoneMutation.mutate({ phone, code: verificationCode });
  };

  if (!needsContactInfo) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-6 w-6 text-primary" />
              <DialogTitle>{t("contactInfo.required", "Contact Information Required")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("contactInfo.description", "To continue using Garage Talk, please add your email address or phone number. This helps us keep your account secure and allows you to recover your account if needed.")}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "email" | "phone")} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
                <Mail className="h-4 w-4" />
                {t("common.email", "Email")}
              </TabsTrigger>
              <TabsTrigger value="phone" className="gap-2" data-testid="tab-phone">
                <Phone className="h-4 w-4" />
                {t("common.phone", "Phone")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-4">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.emailAddress", "Email Address")}</Label>
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={updateEmailMutation.isPending}
                  data-testid="button-save-email"
                >
                  {updateEmailMutation.isPending ? t("common.saving", "Saving...") : t("common.saveEmail", "Save Email")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone" className="mt-4">
              {!codeSent ? (
                <form onSubmit={handlePhoneSendCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("common.phoneNumber", "Phone Number")}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      data-testid="input-phone"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={sendOtpMutation.isPending}
                    data-testid="button-send-code"
                  >
                    {sendOtpMutation.isPending ? t("common.sending", "Sending...") : t("common.sendCode", "Send Verification Code")}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handlePhoneVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">{t("common.verificationCode", "Verification Code")}</Label>
                    <Input
                      id="code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
                      data-testid="input-verification-code"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCodeSent(false)}
                      className="flex-1"
                      data-testid="button-back"
                    >
                      {t("common.back", "Back")}
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={verifyPhoneMutation.isPending}
                      data-testid="button-verify-phone"
                    >
                      {verifyPhoneMutation.isPending ? t("common.verifying", "Verifying...") : t("common.verify", "Verify")}
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
