import type { FastifyInstance } from "fastify";
import type { Database } from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { creatorRoutes } from "./routes/creator.js";
import { r2rRoutes } from "./routes/r2r.js";
import { serviceRecordRoutes } from "./routes/service-records.js";
import { shopRoutes } from "./routes/shops.js";
import { AdminService } from "./services/admin-service.js";
import { BookingService } from "./services/booking-service.js";
import { CreatorMonetizationService } from "./services/creator-monetization-service.js";
import { R2RService } from "./services/r2r-service.js";
import { ServiceRecordService } from "./services/service-record-service.js";
import { ShopService } from "./services/shop-service.js";

export type RegisterB3B8Options = {
  db: Database;
  emailClient?: EmailClient;
};

export async function registerB3B8Routes(app: FastifyInstance, opts: RegisterB3B8Options) {
  const shops = new ShopService(opts.db);
  const booking = new BookingService(opts.db, { emailClient: opts.emailClient });
  const admin = new AdminService(opts.db);
  const serviceRecords = new ServiceRecordService(opts.db);
  const creator = new CreatorMonetizationService(opts.db);
  const r2r = new R2RService(opts.db);

  await app.register(shopRoutes, { shops, booking, admin });
  await app.register(serviceRecordRoutes, { serviceRecords });
  await app.register(creatorRoutes, { creator });
  await app.register(r2rRoutes, { r2r, admin });
}
