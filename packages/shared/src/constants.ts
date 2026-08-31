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

/**
 * Joe coin packs. Face value: 1 coin = $0.01 for earnings math.
 * Packs include psychological bonus coins above face value at higher tiers.
 */
export const COIN_PACKS = [
  { id: "pack_99", coins: 100, priceCents: 99, label: "100 coins" },
  { id: "pack_499", coins: 500, priceCents: 499, label: "500 coins" },
  { id: "pack_999", coins: 1100, priceCents: 999, label: "1,100 coins" },
  { id: "pack_1999", coins: 2400, priceCents: 1999, label: "2,400 coins" },
  { id: "pack_4999", coins: 6500, priceCents: 4999, label: "6,500 coins" },
  { id: "pack_9999", coins: 14000, priceCents: 9999, label: "14,000 coins" },
] as const;

export type CoinPackId = (typeof COIN_PACKS)[number]["id"];

/** Legacy pack ids map onto Joe packs so old clients keep working. */
export const COIN_PACK_ALIASES: Record<string, CoinPackId> = {
  pack_100: "pack_99",
  pack_500: "pack_499",
  pack_1200: "pack_999",
  pack_3000: "pack_1999",
};

export function resolveCoinPack(packId: string) {
  const resolved = COIN_PACK_ALIASES[packId] ?? packId;
  return COIN_PACKS.find((pack) => pack.id === resolved) ?? null;
}

/**
 * Creator revenue share of eligible gift cents (after tip-side fee), by subscription tier.
 * Prefer `revenue_share_rules` in DB; these are fallbacks. Values are basis points (10000 = 100%).
 */
export const REVENUE_SHARE_BPS = {
  amateur: 1000,
  gearhead: 1500,
  racing_pro: 2000,
  pro: 3000,
} as const;

/**
 * Tip-side fee: deducted from gift face value BEFORE creator revenue share.
 * This is a platform tip-side deduction, not a Stripe processing fee.
 */
export const TIP_SIDE_FEE_BPS = 400;

/** @deprecated Alias of TIP_SIDE_FEE_BPS — tip-side deduction, not Stripe fee. */
export const GIFT_PLATFORM_FEE_BPS = TIP_SIDE_FEE_BPS;

/** Days before PENDING creator earnings become AVAILABLE for Connect transfer. */
export const EARNINGS_HOLD_DAYS = 7;
