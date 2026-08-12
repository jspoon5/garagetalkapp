import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./dist/schema/index.js",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://garagetalk:garagetalk@127.0.0.1:5433/garagetalk_test",
  },
  strict: true,
  verbose: true,
});
