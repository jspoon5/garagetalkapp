import pino from "pino";

export function buildLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "email",
        "phone",
        "password",
        "req.headers.authorization",
        "req.headers.cookie",
        "body.password",
        "body.email",
        "body.phone",
      ],
      censor: "[REDACTED]",
    },
  });
}
