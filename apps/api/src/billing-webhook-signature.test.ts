import { describe, expect, it, afterEach } from "vitest";
import Stripe from "stripe";
import {
  shouldUseStripeConstructEvent,
  signStripeWebhookPayload,
  verifyStripeWebhookSignature,
} from "./services/billing-service.js";

describe("Stripe webhook signature verification", () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecretKey;
    if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it("keeps the custom HMAC verifier for stub/test secrets (existing test path)", () => {
    process.env.NODE_ENV = "test";
    delete process.env.STRIPE_SECRET_KEY;

    const rawBody = JSON.stringify({
      id: "evt_test_hmac",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { type: "coin_pack", userId: "user-1", packId: "pack_100", coins: "100" },
        },
      },
    });
    const secret = "whsec_test";
    const header = signStripeWebhookPayload(rawBody, secret);

    expect(verifyStripeWebhookSignature(rawBody, header, secret)).toBe(true);
    expect(shouldUseStripeConstructEvent(secret)).toBe(false);
  });

  it("documents constructEvent path for real whsec_ secrets when Stripe is configured", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEY = "sk_test_construct_event_path_only";
    // Stripe test webhook secret (base64 payload after whsec_) — matches generateTestHeaderString.
    const secret = "whsec_dGVzdF9jb25zdHJ1Y3RfZXZlbnRfc2VjcmV0";
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect(shouldUseStripeConstructEvent(secret)).toBe(true);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const rawBody = JSON.stringify({
      id: "evt_construct",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          metadata: { type: "coin_pack", userId: "user-1", packId: "pack_100", coins: "100" },
          payment_status: "paid",
        },
      },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret });
    const event = stripe.webhooks.constructEvent(rawBody, header, secret);
    expect(event.type).toBe("checkout.session.completed");
    expect((event.data.object as { metadata?: { type?: string } }).metadata?.type).toBe("coin_pack");

    // Raw HMAC with the whsec_ string as the key does NOT match Stripe's constructEvent signing.
    expect(verifyStripeWebhookSignature(rawBody, header, secret)).toBe(false);
  });
});
