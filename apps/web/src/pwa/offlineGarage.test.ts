import { describe, expect, it } from "vitest";
import { cacheGarageResponse, GARAGE_CACHE_NAME, readGarageFromCache } from "./offlineGarage";

class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }

  async match(request: Request) {
    return this.entries.get(request.url);
  }
}

class MemoryCacheStorage {
  readonly cache = new MemoryCache();
  openedName: string | null = null;

  async open(name: string) {
    this.openedName = name;
    return this.cache as unknown as Cache;
  }
}

describe("offline garage cache", () => {
  it("serves a garage response from cache while simulated offline", async () => {
    const cacheStorage = new MemoryCacheStorage();
    const request = new Request("https://app.garagetalk.test/garage/vehicles");
    const response = Response.json({ vehicles: [{ make: "Honda", model: "Civic" }] });

    await cacheGarageResponse(cacheStorage, request, response);
    const cached = await readGarageFromCache(cacheStorage, request);

    expect(cacheStorage.openedName).toBe(GARAGE_CACHE_NAME);
    await expect(cached?.json()).resolves.toEqual({
      vehicles: [{ make: "Honda", model: "Civic" }],
    });
  });
});
