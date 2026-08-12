# Garage Talk (production rebuild v3)

PWA-first automotive social platform rebuild per **GARAGE TALK — PRODUCTION REBUILD MASTER SPEC (v3)**.

## Layout

```text
apps/web          Vite + React PWA
apps/api          Fastify API
packages/db       Drizzle schema + migrations + seeds
packages/shared   env validation, constants, shared types
packages/ai       GearHead prompts / provider-agnostic AI
packages/email    Resend + React Email (memory client in A1)
legacy/           Archived legacy Express/Vite app (reference only — do not copy server code)
docs/             parity-deltas, data-map, invention-log, runbooks
BUILD-CERT.json   Machine-readable build certificate (source of truth)
BUILD-CERT.md     Human-readable certificate (rendered)
```

## Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm cert:render
```

Optional local Postgres/Redis: `docker compose up -d`

## Certificate

Build progress is tracked in `BUILD-CERT.json` / `BUILD-CERT.md` per Part VI. Auditor packets land in `/audit/cycle-N/`.

## Legacy

The previous Render monorepo app lives under `/legacy` for behavior/design reference only.
