import type { FastifyInstance } from "fastify";
import type { Database } from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { c1C6Routes } from "./routes/c1-c6.js";
import type { DiagnosticProvider } from "./services/c1-c6-diagnostics.js";
import { C1C6Service } from "./services/c1-c6-service.js";
import type { NhtsaClient } from "./services/nhtsa-service.js";

export type RegisterC1C6Options = {
  db: Database;
  emailClient?: EmailClient;
  nhtsa?: NhtsaClient;
  diagnostics?: DiagnosticProvider;
};

export async function registerC1C6Routes(app: FastifyInstance, opts: RegisterC1C6Options) {
  const trackC = new C1C6Service(opts.db, {
    emailClient: opts.emailClient,
    nhtsa: opts.nhtsa,
    diagnostics: opts.diagnostics,
  });
  await app.register(c1C6Routes, { trackC });
}
