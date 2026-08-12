export type LaunchLoopResult = {
  name: string;
  ok: boolean;
  processed: number;
  error?: string;
};

export type LaunchLoop = {
  name: string;
  run(): Promise<Omit<LaunchLoopResult, "name">>;
};

export async function runLaunchLoops(loops: LaunchLoop[]): Promise<LaunchLoopResult[]> {
  const results: LaunchLoopResult[] = [];
  for (const loop of loops) {
    try {
      results.push({ name: loop.name, ...(await loop.run()) });
    } catch (err) {
      results.push({
        name: loop.name,
        ok: false,
        processed: 0,
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }
  return results;
}
