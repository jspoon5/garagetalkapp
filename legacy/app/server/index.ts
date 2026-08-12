import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { registerGearHeadAiRoutes } from "./gearheadAi";
import { setupVite, serveStatic, log } from "./vite";
import { getUncachableStripeClient } from "./stripeClient";
import { pool } from "./db/client";

const app = express();

async function initStripe() {
  try {
    await getUncachableStripeClient();
    console.log("[Stripe] Client initialized successfully");
  } catch {
    console.warn(
      "[Stripe] Not configured - subscription payments will redirect to Stripe Checkout",
    );
  }
}

await initStripe();

// Trust proxy for production (Render / reverse proxies)
app.set("trust proxy", 1);

const MemoryStore = createMemoryStore(session);
const PgStore = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const isDevelopment = app.get("env") === "development";

if (!isDevelopment && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required in non-development environments",
  );
}

let sessionStore;
if (isDevelopment) {
  sessionStore = new MemoryStore({
    checkPeriod: 86400000,
  });
} else {
  sessionStore = new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  });
}

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "dev-secret-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: !isDevelopment,
    },
  }),
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(this, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  registerGearHeadAiRoutes(app);
  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
