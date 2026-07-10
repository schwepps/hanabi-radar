# CLAUDE.md — Hanabi Intelligence (App)

> Agent context for this repo. Concise by design: the linter owns style; this file owns commands, architecture, and guardrails. Keep it current — delete stale info as the code evolves.

## Context

Hanabi Intelligence captures LinkedIn posts (via a browser extension, separate repo `hanabi-intelligence-extension`), deduplicates them, classifies them with Claude into three streams (market signal / business opportunity / trend), and surfaces them to the Hanabi collective's partners in a dashboard.

This repo = **the app**: Next.js dashboard + Supabase backend (database, auth, ingestion, classification). The extension consumes the ingestion API defined here — its contract is single-sourced in `docs/ingestion-api-contract.md`. Tickets: Linear, team FSC Consulting, label `Hanabi-app` — one PR = one ticket, green CI required before merge.

## Stack (2026)

- **Next.js 16** — App Router, strict TypeScript, Turbopack, **React 19**. Server Components by default.
- **Supabase** — Postgres, Auth, Row Level Security, Edge Functions, `pg_cron`, Realtime. **EU** region. Schema provisioned via migrations (local Docker + hosted EU). A server-only client (`src/lib/supabase/server.ts`, service_role) reads the shared, non-sensitive `items` feed in Server Components (the schema's intended "server-side reads" accessor) and is the writer for the ingestion + classification jobs; partner auth + partner RLS are shipped, and `item_sources` is read only through the partner-gated `reveal_item_sources` RPC — the warm-intro reveal — never directly and never via the service_role client.
- **Claude API (Anthropic)** (`@anthropic-ai/sdk`) — item classification via structured output; one call per new item in a cron-triggered worker.
- **Tooling** — pnpm 10 on Node 22; ESLint 9 (flat config), Prettier, Vitest; husky + commitlint + lint-staged; EditorConfig.
- **Deploy** — Vercel, EU region.

## Commands (pnpm)

- `pnpm dev` — dev server (Turbopack), http://localhost:3000
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` / `pnpm lint:fix` — ESLint; `lint` fails on any warning
- `pnpm typecheck` — `next typegen && tsc --noEmit` (regenerates Next 16 typed routes first)
- `pnpm test` — Vitest
- `pnpm format` / `pnpm format:check` — Prettier
- Pre-PR gate (mirrors CI): `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm format:check`

Supabase CLI is a dev dependency — use `pnpm supabase …` or the `pnpm db:*` scripts (`db:start`, `db:reset`, `db:push`, `db:types`, `db:test`, …). Migrations live in `supabase/migrations/`; local stack runs in Docker. See the **Database** section in `README.md`.

## Project layout

- `src/app/**` — App Router routes; Server Components by default, `"use client"` only at the leaves.
- `src/env.ts` — **single source of truth for config**. Read env vars here, never `process.env` directly in features. Lazy validation + server-only guard on secret keys.
- `src/styles/tokens.css` — **canonical Daybreak brand tokens** (plain CSS custom properties, no Tailwind directives). Copied verbatim by `hanabi-intelligence-extension`. The Tailwind `@theme inline` mapping lives in `src/styles/globals.css` — never add Tailwind directives to `tokens.css`. `rounded-sm/md/lg` are remapped to 4/8/11px.
- `src/components/ui/**` — generic, token-driven primitives (Button, Badge, Chip, Avatar, Dot, BrandMark). `src/features/<feature>/**` — feature code (components + pure logic in `lib/` + `types.ts`): the Item List — live feed (Realtime) + warm-intro reveal — in `src/features/items/`, ingestion + sensor lifecycle (consent, opt-out, erasure) in `src/features/ingestion/`, classification in `src/features/classification/`.
- Shared libs in `src/lib/`: `taxonomy.ts` (expertise-domain SSOT), `anthropic/server.ts` (server-only Claude client), `http/bearer.ts` (bearer-token parsing), `supabase/server.ts` (service_role client).
- Tests colocated as `*.test.ts(x)` next to the code they cover (Vitest — Node env; extract pure logic to `lib/` and test that rather than adding React Testing Library).
- Root config: `eslint.config.js`, `.prettierrc.json`, `tsconfig.json`, `commitlint.config.js`, `.github/workflows/ci.yml`.

## Environment & secrets

- Config via **environment variables only** — documented in `.env.example`.
- **Local dev targets the local stack by default**: `.env.development` (committed, no secrets) sets the local Supabase URL. Deployed envs use Vercel config. Real secrets live in `.env.local` (gitignored) — never commit secrets.
- `NEXT_PUBLIC_*` is browser-safe; the Supabase `service_role` key, the Claude key (`ANTHROPIC_API_KEY`), and the classify-worker secret (`CLASSIFY_TRIGGER_SECRET`) are **server-only** and must never reach the client — `src/env.ts` enforces this.

## Architecture & conventions

- **Server Components by default.** Add `"use client"` only for local state, event handlers, or browser APIs — keep the client boundary at the leaves.
- **Initial data via Server Components**, not `useEffect`. Use Realtime only for what changes after mount (new items streaming in live).
- ⚠️ **Next.js 16: `params` and `searchParams` are `Promise`s** in pages — `await` them.
- **UI is French-facing** (`<html lang="fr">`); code, comments, commits, and docs are **English**.
- **The data schema is the source of truth**: tables `sensors`, `items`, `item_sources`. `items.linkedin_post_id` is unique (deduplication key). Enums: `stream` = signal | opportunity | trend | noise; `heat` = cold | warm | hot; `status` = new | processed | dismissed; `post_type` = text | image | multi_image | video | document | poll | article; `author_type` = person | company; `author_degree` / `best_author_degree` = first | second | third | none. Any change goes through a **versioned migration** in `supabase/migrations/`, never a manual edit in the database.
- ⚠️ **Per-sensor data never lands on `items`.** `author_degree` and `social_proof` (the warm-intro signals) belong on `item_sources` only. `items.best_author_degree` is a **derived, non-identifying** aggregate — it says a warm path exists without saying whose.
- **Reposts**: store against `original_author_*`, never the resharer. Contacting the resharer instead of the decision-maker is the bug this prevents.
- **`posted_at` is derived server-side** from `posted_at_raw` + `captured_at` — LinkedIn only renders relative timestamps ("2h", "1d").
- **Ingestion payload contract**: single source in `docs/ingestion-api-contract.md` — do not break it without updating the extension too.
- **Sensor GDPR lifecycle**: a sensor authenticates every call with its bearer token and can always leave — `POST /api/sensor/opt-out` deactivates it (idempotent; its sightings stop counting toward aggregates) and `DELETE /api/sensor/me` erases it (its `item_sources` links cascade away; captured `items` are retained as third-party content and affected aggregates self-heal). Neither is gated on active/consent state. Backed by the `deactivate_sensor` / `erase_sensor` RPCs.
- **Live dashboard**: the Item List hydrates from a Server Component, then updates after mount via Supabase Realtime as items are (re)classified. `items.status` (new/processed/dismissed) is persisted and collective across partners, written through the RLS-gated status-update policy — never the service_role client.
- **Classification**: a secured, cron-triggered worker (`GET/POST /api/classify`, `src/features/classification/`) makes one Claude call per new item (`stream IS NULL`) and writes `stream`/`domains`/`heat`/`summary` back via `service_role`. A keyword pre-filter skips obvious noise before the call (cost); the teaser rule keeps document/carousel/video/poll posts (substance in `media_title`) out of `noise`; `heat` may be set on any stream where there's a clear opening. Poison items park after an attempt cap (`classification_attempts`) so they can't block the FIFO queue. The expertise-domain taxonomy is single-sourced in `src/lib/taxonomy.ts` (also feeds the dashboard filter) — extend it there, never inline.

## Guardrails

- **Never bypass RLS.** The dashboard is partners-only; `item_sources` (who saw what) is **never** exposed by default — only via the warm-intro reveal, the `reveal_item_sources` RPC (SECURITY DEFINER, `is_partner()`-gated, active+consented sensors only). Never use the `service_role` key on the client or to read data on behalf of a partner.
- **Secrets out of code**: Supabase and Claude keys via environment variables only. No committed secrets.
- **GDPR**: minimization (store only what's relevant), honor sensor opt-out and erasure (the self-serve endpoints above). Third-party data (decision-makers) is personal data.
- **Keep it simple (no over-engineering)**: no speculative abstraction layers, no external queue (prefer native `pg_cron`/Realtime), a single production environment.

## Code quality

- **Strict TypeScript** — no unjustified `any`.
- **ESLint 9 flat config** (`eslint.config.js`) — pinned to 9, not 10: `eslint-config-next@16` bundles `eslint-plugin-react`, incompatible with ESLint 10 (it calls the removed `context.getFilename`).
- **Prettier** owns formatting — leave style to tooling, don't debate it in reviews.
- **Conventional commits** (commitlint + husky). Pre-commit runs lint-staged (ESLint + Prettier on staged files); hooks install on the first `pnpm install`.
- **CI** (`.github/workflows/ci.yml`, SHA-pinned actions) runs two jobs on every push/PR: `quality` (format-check → lint → typecheck → build → test) and `database` (boot local Supabase → `db:reset` from migrations → pgTAP → a generated-types-in-sync gate → the `/api/ingest` contract e2e matrix).
- **Tests** (Vitest): cover critical logic — deduplication, RLS, ingestion contract, classification.

## Do not

- Do not fetch LinkedIn from the backend (the backend never talks to LinkedIn — that's the extension's role).
- Do not duplicate the payload contract: single source in `docs/ingestion-api-contract.md`.
- Do not add heavy dependencies without a clear need.
- Do not bump ESLint past 9 (`eslint-config-next@16` plugins break on 10), skip hooks (`--no-verify`), or commit to `main`.
