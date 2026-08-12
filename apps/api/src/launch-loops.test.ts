import { describe, expect, it } from "vitest";
import { runLaunchLoops, type LaunchLoop } from "./services/launch-loops.js";

describe("launch-loop integrations", () => {
  it("runs mocked presence, replay, and earnings loops with isolated failures", async () => {
    const loops: LaunchLoop[] = [
      { name: "presence-threshold-sweep", run: async () => ({ ok: true, processed: 3 }) },
      { name: "recording-replay-chapters", run: async () => ({ ok: true, processed: 2 }) },
      {
        name: "earnings-reconciliation",
        run: async () => {
          throw new Error("ledger fixture mismatch");
        },
      },
    ];

    const results = await runLaunchLoops(loops);

    expect(results).toEqual([
      { name: "presence-threshold-sweep", ok: true, processed: 3 },
      { name: "recording-replay-chapters", ok: true, processed: 2 },
      {
        name: "earnings-reconciliation",
        ok: false,
        processed: 0,
        error: "ledger fixture mismatch",
      },
    ]);
  });
});
