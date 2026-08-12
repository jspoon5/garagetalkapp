import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";

export function TipSuccess() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tips/complete", { sessionId });
      return res.json();
    },
  });

  useEffect(() => {
    if (sessionId) {
      completeMutation.mutate();
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle data-testid="text-tip-success">Gift Sent Successfully</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your gift has been delivered. Thanks for supporting the community!
            </p>
            <Button onClick={() => navigate("/chat")} data-testid="button-back-to-chat">
              Back to Chat
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function TipCancel() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <CardTitle data-testid="text-tip-cancelled">Gift Cancelled</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              No worries, your payment was not processed.
            </p>
            <Button onClick={() => navigate("/chat")} data-testid="button-back-to-chat-cancel">
              Back to Chat
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
