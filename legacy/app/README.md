# Garage Talk (Local Development)

## Prerequisites
- Node.js **22 LTS** (tested with 22.22.2)
- npm
- A Neon PostgreSQL database URL (non-pooler host)

## 1) Configure environment
1. Copy the example file.
2. Set your Neon `DATABASE_URL` and `SESSION_SECRET`.

### macOS / Linux
```bash
cp .env.example .env
```

### Windows (PowerShell)
```powershell
Copy-Item .env.example .env
```

> Keep `?sslmode=require` in your Neon `DATABASE_URL`.

## 2) Install dependencies
```bash
npm install
```

## 3) Database workflow (Neon-safe)

This repo supports a fallback migration path that avoids direct `pg` TCP connections when they are unstable, such as `read ECONNRESET` with `drizzle-kit push`.

- `npm run db:generate` – generate SQL migrations from `shared/schema.ts`
- `npm run db:push:kit` – normal `drizzle-kit push` using pg
- `npm run db:migrate:neon` – apply migrations using the Neon HTTP driver
- `npm run db:push` – tries `drizzle-kit push`; if it fails, falls back to the Neon HTTP migrator

Recommended command:

```bash
npm run db:push
```

## 4) Start the app
```bash
npm run dev
```

For the Windows local setup used during development, the app can also be started with:

```powershell
$env:PORT="5174"
node --env-file=.env ./node_modules/tsx/dist/cli.mjs server/index.ts
```

Then open:

```text
http://127.0.0.1:5174
```

## GearHead AI / OpenAI setup

GearHead AI now has a backend API route:

- `GET /api/gearhead-ai/status`
- `POST /api/gearhead-ai/chat`

The `/gearhead-ai` page calls `/api/gearhead-ai/chat`.

If OpenAI is not configured, the server returns a safe demo fallback response instead of crashing.

To enable live AI responses, add this to `.env`:

```env
AI_INTEGRATIONS_OPENAI_API_KEY=your_openai_api_key_here
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
GEARHEAD_AI_MODEL=gpt-4o-mini
```

Only `AI_INTEGRATIONS_OPENAI_API_KEY` is required for live responses. The base URL and model are optional.

GearHead AI safety behavior:

- educational guidance only
- no safety bypass instructions
- recommends licensed professionals for dangerous, regulated, high-voltage, fuel-system, structural, brake, steering, airbag, gas, appliance electrical, or safety-critical repairs

## Garage Talk MVP Screens

The first MVP screen set is sample-data-first and does not require live OpenAI, Stripe, Twilio, Jitsi, or backend room data.

MVP routes:

- `/rooms` – Garage room directory
- `/rooms/:slug` – Room detail with sample chat, pinned resources, active users, and GearHead AI prompt
- `/feed` – Short clips, tutorials, project updates, and questions
- `/gearhead-ai` – GearHead AI chat-style page with backend API call and fallback mode
- `/live` – Scheduled/live/ended session cards with production video provider note
- `/marketplace` – Parts, tools, local services, creator offers, and smart garage gear placeholders
- `/garage-profile` – Skills, vehicles/devices/projects, favorite rooms, and creator/social placeholders

Shared sample data is in:

```text
client/src/data/garageMvp.ts
```

Future work can connect these pages to real APIs incrementally while keeping the sample data as safe fallbacks.

## Notes
- The application runtime already uses Neon serverless for primary DB operations.
- If `drizzle-kit push` fails with `ECONNRESET`, use `npm run db:migrate:neon` directly.
- Do not commit `.env`.
