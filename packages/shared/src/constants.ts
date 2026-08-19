export const SKILL_PATH_SLUGS = [
  "maintenance_basics",
  "brakes",
  "electrical_diagnostics",
  "welding",
  "detailing",
  "restoration",
  "shop_management",
] as const;

export const PARTS_RETAILERS = [
  "rockauto",
  "summit",
  "autozone",
  "oreilly",
  "amazon",
] as const;

export function partsSearchUrls(partName: string, vehicleLabel: string): Record<string, string> {
  const q = encodeURIComponent(`${partName} ${vehicleLabel}`.trim());
  return {
    rockauto: `https://www.rockauto.com/en/everywhere/${q}`,
    summit: `https://www.summitracing.com/search?keyword=${q}`,
    autozone: `https://www.autozone.com/search?searchText=${q}`,
    oreilly: `https://www.oreillyauto.com/search?q=${q}`,
    amazon: `https://www.amazon.com/s?k=${q}`,
  };
}

export const SUBSCRIPTION_TIER_QUOTAS = {
  amateur: { aiSearches: 10, liveSessions: 0, listingSlots: 1 },
  gearhead: { aiSearches: 100, liveSessions: 2, listingSlots: 5 },
  racing_pro: { aiSearches: 400, liveSessions: 10, listingSlots: 25 },
  pro: { aiSearches: 1000, liveSessions: 50, listingSlots: 100 },
} as const;

export const TIER_PRICES = {
  gearhead: { amountCents: 999, name: "GearHead Membership" },
  racing_pro: { amountCents: 1999, name: "Racing Pro Membership" },
  pro: { amountCents: 2999, name: "Pro Membership" },
} as const;

export type PaidTier = keyof typeof TIER_PRICES;

export const COIN_PACKS = [
  { id: "pack_100", coins: 100, priceCents: 499, label: "100 coins" },
  { id: "pack_500", coins: 500, priceCents: 1999, label: "500 coins" },
  { id: "pack_1200", coins: 1200, priceCents: 3999, label: "1200 coins" },
  { id: "pack_3000", coins: 3000, priceCents: 7999, label: "3000 coins" },
] as const;

export type CoinPackId = (typeof COIN_PACKS)[number]["id"];

/** Platform fee on gift coin value converted to creator earnings (basis points). */
export const GIFT_PLATFORM_FEE_BPS = 1000;
