# CLAUDE.md — Hanabi-app

> Copy to the root of the `Hanabi-app` repo as `CLAUDE.md`.
> Purpose: give an agent (Claude Code / conductor.build) the minimal, reliable context to work in this repo. Concise by design (~100 lines): the linter owns style, this file owns commands, architecture, and guardrails.

## Context

Hanabi Radar captures LinkedIn posts (via a browser extension, separate repo `Hanabi-extension`), deduplicates them, classifies them with AI into three streams (market signal / business opportunity / trend), and presents them to the Hanabi collective's partners in a dashboard.

This repo = **the app**: Next.js dashboard + Supabase backend (database, auth, ingestion, classification). The extension consumes the ingestion API defined here.

Full spec: see `docs/Hanabi-Radar-Documentation-MVP.md` (copy it into the repo). Tickets: Linear, team FSC Consulting, label `Hanabi-app`.

## Stack

- **Next.js 16 (App Router, strict TypeScript)** — Server Components by default.
- **Supabase**: PostgreSQL, Auth, Row Level Security, Edge Functions, `pg_cron`, Realtime. **EU** region.
- **Claude API (Anthropic)** for item classification (structured JSON output / tool use).
- **Deployment**: Vercel (functions in EU region).

## Commands

> Use **pnpm**. Check `package.json` if a command differs.

- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Supabase migrations: `pnpm supabase migration new <name>` / `pnpm supabase db push` (Supabase CLI)

Before opening a PR: `pnpm lint && pnpm typecheck && pnpm build` must pass.

## Architecture & conventions

- **Server Components by default.** Only add `"use client"` for local state, event handlers, or browser APIs. Keep the client boundary as close to the leaves as possible.
- **Initial data via Server Components**, not `useEffect`. Use `useEffect`/Realtime only for what changes after mount (new items streaming in live).
- ⚠️ **Next.js 16: `params` and `searchParams` are `Promise`s** in pages — `await` them.
- **The data schema is the source of truth**: tables `capteurs`, `items`, `item_sources` (see spec §7). `items.linkedin_post_id` is unique (deduplication key). Any change goes through a **versioned migration**, never a manual edit in the database.
- **Ingestion payload contract**: defined in this repo (ticket FSC-98) and documented in `docs/`. It is the interface the extension consumes — do not break it without updating both sides.
- **Classification**: one Claude call per new item, structured output. Pre-filter noise by keywords before the call (cost). Taxonomy = Hanabi expertise domains (pmo, servicenow, power_platform, ia_gen, carve_in_out, architecture_si, digital_workplace, product_management, appel_offres…).

## Guardrails (important)

- **Never bypass RLS.** The dashboard is partners-only; `item_sources` (who saw what) is **never** exposed by default — only via the warm-intro flow. Do not use the `service_role` key on the client or to read data on behalf of a partner.
- **Secrets out of code**: Supabase keys and the Claude API key via environment variables only. No committed secrets.
- **GDPR**: minimization (store only what's relevant), honor sensor opt-out and purge (ticket FSC-95). Third-party data (decision-makers) is personal data.
- **Keep it simple (no over-engineering)**: no speculative abstraction layers, no external queue (prefer native `pg_cron`/Realtime), a single production environment.

## Code quality

- **Strict TypeScript**, no unjustified `any`.
- **ESLint 10 flat config** (`eslint.config.js`). Note: `eslint-config-next` may require `--legacy-peer-deps` at install with ESLint 10.
- **Prettier** owns formatting — don't debate style in reviews, leave it to tooling.
- **Conventional commits** (commitlint + husky). One PR = one Linear ticket, green CI required before merge.
- Write tests for critical logic: deduplication, RLS, ingestion contract, classification.

## Do not

- Do not fetch LinkedIn from the backend (the backend never talks to LinkedIn — that's the extension's role).
- Do not duplicate the payload contract: single source in `docs/`.
- Do not add heavy dependencies without a clear need.
