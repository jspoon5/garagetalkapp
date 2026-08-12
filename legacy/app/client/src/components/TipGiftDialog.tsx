import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Wrench, Fuel, Cog, Car, Flame, Trophy } from "lucide-react";

interface TipGiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
  context: "chat" | "livestream" | "appointment";
  contextId?: string;
}

const GIFT_TIERS = [
  {
    type: "wrench",
    name: "Wrench",
    icon: Wrench,
    amount: 100,
    display: "$1.00",
    color: "text-muted-foreground",
  },
  {
    type: "oil_can",
    name: "Oil Can",
    icon: Fuel,
    amount: 200,
    display: "$2.00",
    color: "text-blue-500",
  },
  {
    type: "gear",
    name: "Gear",
    icon: Cog,
    amount: 500,
    display: "$5.00",
    color: "text-yellow-500",
  },
  {
    type: "nitro_boost",
    name: "Nitro Boost",
    icon: Flame,
    amount: 1000,
    display: "$10.00",
    color: "text-orange-500",
  },
  {
    type: "muscle_car",
    name: "Muscle Car",
    icon: Car,
    amount: 2500,
    display: "$25.00",
    color: "text-red-500",
  },
  {
    type: "golden_trophy",
    name: "Golden Trophy",
    icon: Trophy,
    amount: 5000,
    display: "$50.00",
    color: "text-amber-400",
  },
];

export default function TipGiftDialog({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  context,
  contextId,
}: TipGiftDialogProps) {
  const { toast } = useToast();
  const [selectedGift, setSelectedGift] = useState<string | null>(null);

  const tipMutation = useMutation({
    mutationFn: async (gift: (typeof GIFT_TIERS)[number]) => {
      const res = await apiRequest("POST", "/api/tips/checkout", {
        recipientId,
        giftType: gift.type,
        giftName: gift.name,
        amount: gift.amount,
        context,
        contextId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send gift",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const gift = GIFT_TIERS.find((g) => g.type === selectedGift);
    if (!gift) return;
    tipMutation.mutate(gift);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-tip-dialog-title">
            Send a Gift to {recipientName}
          </DialogTitle>
          <DialogDescription>
            Show your appreciation with an automotive-themed gift
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-4">
          {GIFT_TIERS.map((gift) => {
            const Icon = gift.icon;
            const isSelected = selectedGift === gift.type;
            return (
              <Button
                key={gift.type}
                onClick={() => setSelectedGift(gift.type)}
                variant="outline"
                className={`flex flex-col items-center gap-2 h-auto py-3 ${
                  isSelected ? "toggle-elevate toggle-elevated" : "toggle-elevate"
                }`}
                data-testid={`button-gift-${gift.type}`}
              >
                <Icon className={`h-8 w-8 ${gift.color}`} />
                <span className="text-xs font-medium">{gift.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {gift.display}
                </Badge>
              </Button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-tip"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedGift || tipMutation.isPending}
            data-testid="button-send-tip"
          >
            {tipMutation.isPending ? "Processing..." : "Send Gift"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { GIFT_TIERS };
