import type { FastifyInstance } from "fastify";
import type { Database } from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { adminRoutes } from "./routes/admin.js";
import { billingRoutes } from "./routes/billing.js";
import { liveRoutes } from "./routes/live.js";
import { AdminService } from "./services/admin-service.js";
import { BillingService } from "./services/billing-service.js";
import { LiveService } from "./services/live-service.js";

export type RegisterA8A10Options = {
  db: Database;
  emailClient?: EmailClient;
  appBaseUrl?: string;
};

export async function registerA8A10Routes(app: FastifyInstance, opts: RegisterA8A10Options) {
  const live = new LiveService(opts.db, { emailClient: opts.emailClient });
  const billing = new BillingService(opts.db);
  const admin = new AdminService(opts.db);

  await app.register(liveRoutes, { live });
  await app.register(billingRoutes, { billing, appBaseUrl: opts.appBaseUrl });
  await app.register(adminRoutes, { admin });
}
