import type { FastifyInstance } from "fastify";
import type { Database } from "@garagetalk/db";
import { d1D6Routes } from "./routes/d1-d6-campus.js";
import { d7D11Routes } from "./routes/d7-d11-integrity.js";
import { PresenceLayerService } from "./services/d1-d2-presence-campus-service.js";
import { CampusLearningService } from "./services/d3-d6-campus-service.js";
import { TrackDIntegrityService } from "./services/d7-d11-integrity-service.js";

export async function registerD1D11Routes(app: FastifyInstance, db: Database) {
  const presence = new PresenceLayerService(Number(process.env.D1_PRESENCE_THRESHOLD ?? 3), true);
  const campus = new CampusLearningService(db);
  const integrity = new TrackDIntegrityService(db);

  await app.register(d1D6Routes, { presence, campus });
  await app.register(d7D11Routes, { integrity });
}
