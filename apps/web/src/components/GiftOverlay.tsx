import { useEffect, useState } from "react";

export type GiftOverlayEvent = {
  gift: { name: string; slug: string; animationKey: string; coinCost: number };
  sender: { username: string };
};

/** Duration (ms) by animation key — Joe gift ladder cost tiers (1.5s–12s). */
const DURATION_MS: Record<string, number> = {
  lug_nut: 1500,
  wrench: 2000,
  burnout: 2500,
  fuel_up: 3000,
  checkered_flag: 3500,
  rev_it: 4000,
  hot_lap: 5000,
  green_light: 6000,
  podium: 7000,
  supercar: 8000,
  track_day: 9000,
  garage_legend: 10000,
  king_of_the_garage: 12000,
};

function durationFor(key: string, coinCost: number): number {
  if (DURATION_MS[key]) return DURATION_MS[key]!;
  if (coinCost >= 30000) return 10000;
  if (coinCost >= 10000) return 8000;
  if (coinCost >= 1000) return 5000;
  if (coinCost >= 100) return 3000;
  return 2000;
}

const LABELS: Record<string, string> = {
  lug_nut: "LUG",
  wrench: "WRX",
  burnout: "HOT",
  fuel_up: "FUEL",
  checkered_flag: "FLAG",
  rev_it: "REV",
  hot_lap: "LAP",
  green_light: "GO",
  podium: "P1",
  supercar: "SUPR",
  track_day: "TRACK",
  garage_legend: "LEGEND",
  king_of_the_garage: "KING",
};

export function GiftOverlay({
  event,
  onDone,
}: {
  event: GiftOverlayEvent | null;
  onDone: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const ms = durationFor(event.gift.animationKey, event.gift.coinCost);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [event, onDone]);

  if (!event || !visible) return null;

  const key = event.gift.animationKey || "default";
  const glyph = LABELS[key] ?? "🎁";

  return (
    <div
      className={`gift-overlay gift-overlay--${key}`}
      data-animation={key}
      data-testid="gift-overlay"
      role="status"
      aria-live="polite"
    >
      <div className="gift-overlay-stage" aria-hidden="true">
        <span className="gift-overlay-burst" />
        <span className="gift-overlay-glyph">{glyph}</span>
        <span className="gift-overlay-ring" />
        <span className="gift-overlay-trail" />
      </div>
      <p className="gift-overlay-caption">
        <strong>{event.sender.username}</strong> sent <em>{event.gift.name}</em>
        <span> · {event.gift.coinCost} coins</span>
      </p>
    </div>
  );
}
