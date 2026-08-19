# Garage Talk v3 — Entitlements, AI, Live & Gifting Roadmap

This document tracks the Joe/Jeremy v3 product spec against the current monorepo (`apps/api`, `apps/web`, `packages/shared`, `packages/db`).

## Current state (this session)

### Phase A — Tiered GearHead AI (foundation shipped)

- **`packages/shared/src/ai-plans.ts`** — canonical `AI_PLANS` config (Joe quotas: 10 / 100 / 400 / 1000 monthly questions).
- **`apps/api/src/services/entitlement-service.ts`** — resolves effective tier from `users` + active `subscriptions` row (never trusts client).
- **`apps/api/src/services/gearhead-service.ts`** — enforces allowance, model class via env, photo gate, concurrent in-flight lock, structured 402/403/429 errors.
- **`packages/db` `entitlements` table** — schema stub for unified Stripe / Google Play records (migration pending).
- **PWA** — `GearHeadScreen` shows server upgrade message on HTTP 402.

### Zip artifact vs v3 (`garage-talk-40-full-admin-livekit-20260818-162316.zip`)

| Area | Zip (legacy monolith) | v3 monorepo |
|------|----------------------|-------------|
| AI plans | `server/gearheadAiPlans.ts` — daily limits, per-tier env models | `packages/shared/ai-plans.ts` — **monthly** limits per Joe spec |
| Guest live | `server/liveGuestRoutes.ts` + `LiveGuestStudio.tsx` — real LiveKit SDK | `live-service.ts` — mock JWT tokens, no guest flow |
| Streaming UI | Jitsi + LiveKit components, OBS guide | `LiveSessionScreen.tsx` — list/token stub only |
| Billing | Inline Stripe in monolith routes | `billing-service.ts` — webhooks, tips, creator ledger |
| Media server | `media-server/` self-host docker compose | Not present — recommend LiveKit Cloud first |

**PR #9** — Could not inspect (`gh` not authenticated). Do not merge blindly; port guest-live patterns from zip into v3 `live-service` + new routes.

---

## Environment variables

### GearHead AI (server only — never expose model names to client)

| Variable | Purpose | Default |
|----------|---------|---------|
| `AI_MODEL_BASIC` | Free / amateur tier | `gpt-4o-mini` |
| `AI_MODEL_STANDARD` | GearHead ($9.99) | `gpt-4o-mini` |
| `AI_MODEL_ADVANCED` | Racing Pro ($19.99) | `gpt-4o` |
| `AI_MODEL_MAX` | Pro ($29.99) | `gpt-4o` |
| `AI_BASE_URL` | OpenAI-compatible API base | optional |
| `AI_API_KEY` | Provider API key | optional |

Legacy aliases still in `env.ts`: `AI_MODEL_FAST`, `AI_MODEL_SMART`, `AI_MODEL_VISION`.

### Stripe (subscriptions + web tips; coins later)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Checkout, portal, Connect |
| `STRIPE_WEBHOOK_SECRET` | Subscription + tip webhooks |
| `STRIPE_PRICE_GEARHEAD` | Price ID for GearHead tier |
| `STRIPE_PRICE_RACING_PRO` | Price ID for Racing Pro |
| `STRIPE_PRICE_PRO` | Price ID for Pro |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Creator payouts (optional) |

### LiveKit (Phase D)

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | Client WebSocket URL (`wss://…livekit.cloud`) |
| `LIVEKIT_API_KEY` | Server token minting |
| `LIVEKIT_API_SECRET` | Server token minting |
| `LIVEKIT_API_URL` | HTTP API for RoomService (optional; derived from URL) |
| `LIVEKIT_RTMP_URL` | OBS ingest (optional) |

---

## Unified entitlement model (Phase B)

**Target row** (see `entitlements` table in `packages/db/src/schema/commerce.ts`):

```
user → provider (stripe | google_play | apple | manual)
     → provider_subscription_id
     → tier
     → status
     → current_period_end
     → ai_monthly_allowance
     → feature_flags (jsonb: photos, live_host, gifting, …)
```

**Migration path**

1. Run Drizzle migration for `entitlements` + `entitlement_provider` enum.
2. Backfill from `subscriptions` on Stripe webhook reconcile.
3. Point `EntitlementService` at `entitlements` as source of truth; keep `users.tier` as denormalized cache.
4. Add `users.ai_month_token_estimate` column when token billing matters.

---

## Virtual gifting (Phase C — design)

Joe-spec tables (not yet implemented):

| Table | Role |
|-------|------|
| `coin_wallets` | Server-authoritative balance per user |
| `coin_ledger` | Immutable credit/debit audit trail |
| `gift_catalog` | Gift SKUs, coin prices, creator split |
| `live_gifts` | Gift events tied to live sessions |
| `creator_earnings` | Extend existing `creator_ledgers` pattern |

**Rules**

- Web: Stripe coin checkout (one-time payment → ledger credit).
- Android: Google Play Billing later — **never** put Stripe buy-coins in Android.
- Never trust client-reported balances; all spends via API with idempotency keys.
- Reuse fee math from `billing-service.ts` tips (`DEFAULT_FEE_BPS`).

---

## Phased delivery plan

### Phase 1 ✅ — AI entitlement foundation (this session)

- AI_PLANS config, entitlement resolution, quota enforcement, upgrade errors, tests.

### Phase 2 — Entitlements migration & billing sync

- Drizzle migration + webhook backfill to `entitlements`.
- `GET /billing/entitlement` for client display (tier label only, no secrets).
- Align `SUBSCRIPTION_TIER_QUOTAS` consumers (live session caps, listing slots).

### Phase 3 — LiveKit production + PWA player

- Add `livekit-server-sdk` + `livekit-client` dependencies.
- Replace mock JWT in `live-service.ts` with real `AccessToken`.
- PWA viewer/host UI in `LiveSessionScreen` using `LIVEKIT_URL`.
- Tier-gate session creation (paid tiers only).

### Phase 4 — Guest live (port from zip / PR #9)

- Tables: `live_guest_streams`, `live_guest_requests` (or extend `live_sessions`).
- Routes: create stream, request guest seat, host accept/decline, media token.
- Adapt `LiveGuestStudio.tsx` patterns to v3 React + Fastify auth.

### Phase 5 — Virtual gifting

- Schema + wallet service + Stripe coin SKU checkout.
- Live overlay send-gift UI; creator earnings rollup.

---

## Decisions needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| LiveKit hosting | Cloud vs self-host (`media-server/` in zip) | **LiveKit Cloud** for v1 — faster TLS, TURN, ops |
| PR #9 merge | Direct merge vs selective port | **Selective port** into v3 services; v3 auth/session differ |
| Google Play timeline | Q? | Block Android coin IAP until Play Console + RTDN webhook ready |
| Token persistence | Estimate only vs DB column | Estimate now; persist when billing/analytics requires |
| Concurrent AI lock | In-memory vs Redis | In-memory OK for single instance; Redis when horizontally scaled |

---

## Gaps / honest scope

This spec is **months of work**. This session delivered a solid **server-side AI entitlement foundation** only. LiveKit guest live, gifting economy, and Play Billing remain designed but unbuilt. Existing auth, Garage username login, and testids were not modified.
