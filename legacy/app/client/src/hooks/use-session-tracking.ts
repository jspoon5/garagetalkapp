import { useEffect, useRef, useCallback, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

const HEARTBEAT_INTERVAL = 60_000;
const RETRY_DELAY = 30_000;

export function useSessionTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false);
  const initializedRef = useRef(false);

  const cancelHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const trackEvent = useCallback(async (eventType: string, eventData?: Record<string, unknown>, page?: string) => {
    const token = sessionTokenRef.current;
    if (!token) return;

    try {
      await apiRequest("POST", "/api/analytics/event", {
        sessionToken: token,
        eventType,
        eventData,
        page: page ?? window.location.pathname,
      });
    } catch (error) {
      console.warn("[Analytics] Event tracking failed", error);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    function scheduleRetry() {
      if (retryTimerRef.current || isStartingRef.current) return;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        startSession();
      }, RETRY_DELAY);
    }

    function startHeartbeat() {
      cancelHeartbeat();
      heartbeatTimerRef.current = setInterval(async () => {
        const token = sessionTokenRef.current;
        if (!token) return;

        try {
          await apiRequest("POST", "/api/analytics/session/heartbeat", { sessionToken: token });
        } catch (error) {
          console.warn("[Analytics] Heartbeat failed; scheduling restart", error);
          cancelHeartbeat();
          sessionTokenRef.current = null;
          setIsTracking(false);
          scheduleRetry();
        }
      }, HEARTBEAT_INTERVAL);
    }

    async function startSession() {
      if (sessionTokenRef.current || isStartingRef.current) return;
      isStartingRef.current = true;
      cancelRetry();

      try {
        const response = await apiRequest("POST", "/api/analytics/session/start", {});
        const data = await response.json();

        if (!data?.sessionToken || typeof data.sessionToken !== "string") {
          throw new Error("Invalid session token response");
        }

        sessionTokenRef.current = data.sessionToken;
        setIsTracking(true);
        startHeartbeat();
      } catch (error) {
        console.warn("[Analytics] Session start failed; retrying", error);
        sessionTokenRef.current = null;
        setIsTracking(false);
        scheduleRetry();
      } finally {
        isStartingRef.current = false;
      }
    }

    startSession();

    const handleBeforeUnload = () => {
      const token = sessionTokenRef.current;
      if (!token) return;

      const payload = JSON.stringify({ sessionToken: token });
      const blob = new Blob([payload], { type: "application/json" });

      if (!navigator.sendBeacon || !navigator.sendBeacon("/api/analytics/session/end", blob)) {
        fetch("/api/analytics/session/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cancelHeartbeat();
      cancelRetry();
      sessionTokenRef.current = null;
      setIsTracking(false);
    };
  }, [cancelHeartbeat, cancelRetry]);

  return { trackEvent, isTracking };
}
