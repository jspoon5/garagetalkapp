import { useEffect } from "react";
import { Adsense } from "@ctrl/react-adsense";

interface AdSenseProps {
  slot: string;
  format?: "auto" | "fluid" | "rectangle";
  responsive?: boolean;
  className?: string;
}

export function AdSense({
  slot,
  format = "auto",
  responsive = true,
  className = "my-6",
}: AdSenseProps) {
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID || "ca-pub-0000000000000000";
  const isTestMode = !import.meta.env.VITE_ADSENSE_CLIENT_ID || clientId === "ca-pub-0000000000000000";

  useEffect(() => {
    if (isTestMode) {
      console.log("[AdSense] Running in test mode. Set VITE_ADSENSE_CLIENT_ID to show real ads.");
    }
  }, [isTestMode]);

  return (
    <div className={className} data-testid={`adsense-${slot}`}>
      <Adsense
        client={clientId}
        slot={slot}
        style={{ display: "block" }}
        format={format}
        responsive={responsive ? "true" : "false"}
        adTest={isTestMode ? "on" : "off"}
      />
    </div>
  );
}

interface TierBasedAdSenseProps extends AdSenseProps {
  userTier: "amateur" | "gearhead" | "racing_pro" | "pro";
  adPosition: "top" | "middle" | "bottom" | "sidebar";
}

export function TierBasedAdSense({
  userTier,
  adPosition,
  ...adProps
}: TierBasedAdSenseProps) {
  const shouldShowAd = (() => {
    switch (userTier) {
      case "amateur":
        return true;
      case "gearhead":
        return adPosition === "top" || adPosition === "middle";
      case "racing_pro":
        return adPosition === "top";
      case "pro":
        return false;
      default:
        return true;
    }
  })();

  if (!shouldShowAd) {
    return null;
  }

  return <AdSense {...adProps} />;
}
