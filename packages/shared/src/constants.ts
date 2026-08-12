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
