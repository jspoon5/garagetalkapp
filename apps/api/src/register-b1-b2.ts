import type { FastifyInstance } from "fastify";
import type { Database } from "@garagetalk/db";
import { feedRoutes } from "./routes/feed.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { FeedService } from "./services/feed-service.js";
import { MarketplaceService } from "./services/marketplace-service.js";

export async function registerB1B2Routes(app: FastifyInstance, db: Database) {
  await app.register(feedRoutes, { feed: new FeedService(db) });
  await app.register(marketplaceRoutes, { marketplace: new MarketplaceService(db) });
}
