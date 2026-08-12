export const GARAGE_CACHE_NAME = "garage-offline";

export async function cacheGarageResponse(
  cacheStorage: Pick<CacheStorage, "open">,
  request: Request,
  response: Response,
) {
  if (response.ok) {
    const cache = await cacheStorage.open(GARAGE_CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

export async function readGarageFromCache(cacheStorage: Pick<CacheStorage, "open">, request: Request) {
  const cache = await cacheStorage.open(GARAGE_CACHE_NAME);
  return cache.match(request);
}
