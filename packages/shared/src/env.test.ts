import { describe, expect, it } from "vitest";
import { loadEnv, partsSearchUrls } from "./index.js";

describe("loadEnv", () => {
  it("accepts valid development env", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://garagetalk:garagetalk@127.0.0.1:5433/garagetalk_test",
      SESSION_SECRET: "x".repeat(64),
      APP_BASE_URL: "http://localhost:5173",
    });
    expect(env.STREAM_PROVIDER).toBe("cloudflare");
  });

  it("accepts r2 stream provider", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://garagetalk:garagetalk@127.0.0.1:5433/garagetalk_test",
      SESSION_SECRET: "x".repeat(64),
      APP_BASE_URL: "http://localhost:5173",
      STREAM_PROVIDER: "r2",
    });
    expect(env.STREAM_PROVIDER).toBe("r2");
  });

  it("rejects placeholder secrets in production", () => {
    expect(() =>
      loadEnv(
        {
          NODE_ENV: "production",
          DATABASE_URL: "change-me",
          SESSION_SECRET: "x".repeat(64),
          APP_BASE_URL: "https://garagetalk.app",
        },
        { requireProductionSecrets: true },
      ),
    ).toThrow(/placeholder|Invalid environment/i);
  });
});

describe("partsSearchUrls", () => {
  it("builds retailer search links", () => {
    const urls = partsSearchUrls("oil filter", "2018 Honda Civic");
    expect(urls.amazon).toContain("amazon.com");
    expect(urls.rockauto).toContain("rockauto.com");
  });
});
