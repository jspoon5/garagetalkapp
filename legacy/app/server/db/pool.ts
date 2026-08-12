import pg from "pg";

/**
 * Build a node-postgres pool that works with Neon (TLS) and Render Postgres (internal, usually no TLS).
 */
export function createPgPool(connectionString: string) {
  const needsSsl =
    /[?&]sslmode=require/i.test(connectionString) ||
    /\.neon\.tech\b/i.test(connectionString);

  return new pg.Pool({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}
