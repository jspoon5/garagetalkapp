import { drizzle } from "drizzle-orm/node-postgres";
import { createPgPool } from "./pool";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = createPgPool(databaseUrl);
export const db = drizzle(pool);
