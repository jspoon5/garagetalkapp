import type { FastifyPluginAsync } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { streamWebhookSchema, VideoService } from "../services/video-service.js";

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function verifyCloudflareWebhookSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((chunk) => {
      const [k, v] = chunk.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const time = parts.time;
  const sig = parts.sig1;
  if (!time || !sig) return false;
  const expected = createHmac("sha256", secret).update(`${time}.${rawBody}`).digest("hex");
  return safeEqualHex(expected, sig);
}

export const streamWebhookRoutes: FastifyPluginAsync<{ video: VideoService }> = async (
  app,
  opts,
) => {
  const video = opts.video;

  app.post("/webhooks/stream", {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const streamSecret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET?.trim();
      const legacyToken = req.headers["x-webhook-token"];
      const bearer = typeof req.headers.authorization === "string"
        ? req.headers.authorization.replace(/^Bearer\s+/i, "").trim()
        : "";
      const cfHeader =
        typeof req.headers["webhook-signature"] === "string"
          ? req.headers["webhook-signature"]
          : undefined;

      let authorized = false;
      if (typeof legacyToken === "string" && video.verifyStreamWebhookToken(legacyToken)) {
        authorized = true;
      } else if (streamSecret && bearer && bearer === streamSecret) {
        authorized = true;
      } else if (streamSecret && cfHeader) {
        const raw = JSON.stringify(req.body ?? {});
        authorized = verifyCloudflareWebhookSignature(raw, cfHeader, streamSecret);
      }

      if (!authorized) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const bodyUid =
        req.body && typeof req.body === "object" && "uid" in req.body
          ? String((req.body as { uid: unknown }).uid)
          : null;
      const eventId =
        typeof req.headers["x-webhook-id"] === "string"
          ? req.headers["x-webhook-id"]
          : bodyUid
            ? `cf_${bodyUid}_${Date.now()}`
            : `evt_${Date.now()}`;

      const payload = streamWebhookSchema.parse(req.body);
      const result = await video.handleStreamWebhook(eventId, payload);
      return reply.code(result.processed ? 200 : 202).send(result);
    },
  });
};
