import { describe, expect, it } from "vitest";
import { reactionCounts, reactionIdsForUser, toggleReaction } from "./services/reaction-store.js";

describe("reaction helpers", () => {
  it("counts and tracks ids from reaction rows", async () => {
    const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"] as const;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ subjectId: ids[0] }, { subjectId: ids[0] }, { subjectId: ids[1] }],
        }),
      }),
    };
    const counts = await reactionCounts(fakeDb as never, "listing", [...ids]);
    expect(counts.get(ids[0])).toBe(2);
    expect(counts.get(ids[1])).toBe(1);

    const mine = await reactionIdsForUser(fakeDb as never, "user", "listing", [...ids]);
    expect(mine.has(ids[0])).toBe(true);
  });

  it("toggleReaction returns liked false after a second tap when a row exists", async () => {
    const existing = { id: "r1", userId: "u1", subjectType: "post", subjectId: "p1", kind: "like" };
    let deleted = false;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [existing],
          }),
        }),
      }),
      delete: () => ({
        where: async () => {
          deleted = true;
          return [];
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [],
        }),
      }),
    };
    const result = await toggleReaction(fakeDb as never, "u1", "post", "p1", "like");
    expect(result.liked).toBe(false);
    expect(deleted).toBe(true);
  });
});
