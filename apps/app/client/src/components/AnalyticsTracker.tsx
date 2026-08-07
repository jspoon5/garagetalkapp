import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

function generateSessionId(): string {
  const stored = sessionStorage.getItem("analytics_session_id");
  if (stored) return stored;
  
  const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  sessionStorage.setItem("analytics_session_id", newId);
  return newId;
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

function getSource(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get("utm_source");
  if (utmSource) return utmSource;
  
  if (!document.referrer) return "direct";
  
  try {
    const referrerUrl = new URL(document.referrer);
    const host = referrerUrl.hostname.toLowerCase();
    
    if (host.includes("google")) return "google";
    if (host.includes("facebook") || host.includes("fb.")) return "facebook";
    if (host.includes("twitter") || host.includes("t.co")) return "twitter";
    if (host.includes("youtube")) return "youtube";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("reddit")) return "reddit";
    if (host === window.location.hostname) return "internal";
    
    return host;
  } catch {
    return "unknown";
  }
}

export function AnalyticsTracker() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string>("");
  const sessionId = useRef<string>(generateSessionId());

  useEffect(() => {
    if (location === lastTrackedPath.current) return;
    lastTrackedPath.current = location;

    const trackPageView = async () => {
      try {
        await fetch("/api/analytics/pageview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId.current,
            pageUrl: window.location.href,
            pagePath: location,
            referrer: document.referrer || null,
            source: getSource(),
            deviceType: getDeviceType(),
          }),
        });
      } catch (error) {
        console.debug("Analytics tracking failed:", error);
      }
    };

    const timeoutId = setTimeout(trackPageView, 100);
    return () => clearTimeout(timeoutId);
  }, [location]);

  return null;
}
