import { TIER_QUOTAS, SKILL_PATH_SLUGS } from "@garagetalk/shared";
import { eq } from "drizzle-orm";
import { createDb } from "./index.js";
import { avatarItems, skillPaths, subscriptionTierEnum, subscriptionTierDefs } from "./schema/index.js";

const TIER_NAMES: Record<(typeof subscriptionTierEnum.enumValues)[number], string> = {
  amateur: "Amateur",
  gearhead: "GearHead",
  racing_pro: "Racing Pro",
  pro: "Pro",
};

const PATH_TITLES: Record<(typeof SKILL_PATH_SLUGS)[number], string> = {
  maintenance_basics: "Maintenance Basics",
  brakes: "Brakes",
  electrical_diagnostics: "Electrical Diagnostics",
  welding: "Welding",
  detailing: "Detailing",
  restoration: "Restoration",
  shop_management: "Shop Management",
};

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for seed");
  const { db, pool } = createDb(url);

  for (const slug of subscriptionTierEnum.enumValues) {
    const q = TIER_QUOTAS[slug];
    const existing = await db
      .select()
      .from(subscriptionTierDefs)
      .where(eq(subscriptionTierDefs.slug, slug))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(subscriptionTierDefs).values({
        slug,
        name: TIER_NAMES[slug],
        aiSearches: q.aiSearchesPerMonth,
        liveFeatures: q.liveFeatures,
        listingSlots: q.listingSlots,
      });
    }
  }

  for (const slug of SKILL_PATH_SLUGS) {
    const existing = await db.select().from(skillPaths).where(eq(skillPaths.slug, slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(skillPaths).values({
        slug,
        title: PATH_TITLES[slug],
        description: `${PATH_TITLES[slug]} learning path`,
      });
    }
  }

  const starterItems = [
    { kind: "uniform", name: "Shop Tee", unlockRule: "complete_first_lesson" },
    { kind: "tool", name: "Starter Wrench", unlockRule: "complete_first_quest" },
    { kind: "nameplate", name: "Rookie Plate", unlockRule: "earn_first_badge" },
  ];
  for (const item of starterItems) {
    const existing = await db.select().from(avatarItems).where(eq(avatarItems.name, item.name)).limit(1);
    if (existing.length === 0) {
      await db.insert(avatarItems).values(item);
    }
  }

  await pool.end();
  console.log("[seed] complete");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
