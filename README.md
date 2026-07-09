# Hanabi Radar — app

Next.js dashboard + Supabase backend for **Hanabi Radar**: it captures LinkedIn
posts (via a separate browser extension), deduplicates them, classifies them with
AI into three streams (market signal / business opportunity / trend), and presents
them to the Hanabi collective's partners.

This repository is the **app** (dashboard + backend). It ships the technical
foundation (FSC-84), the Supabase schema (FSC-89), and the **Daybreak** design
system + Item List reference screen (FSC-90).

## Tech stack

- **Next.js 16** (App Router, strict TypeScript) — Server Components by default
- **React 19**
- **Supabase** (PostgreSQL, Auth, RLS, Edge Functions) — EU region
- **Claude API** for classification _(to come)_
- **Deployment**: Vercel, EU region _(to come)_

## Prerequisites

- **Node.js 22** (see `.nvmrc` → `nvm use`). Enforced via `engines` + `engine-strict`.
- **pnpm 10** — enable it with `corepack enable` (version pinned in `packageManager`).
- **Docker** — required to run the local Supabase stack (`pnpm db:start`, see [Database](#database)).

## Getting started

Get the app running locally:

```bash
pnpm install               # also installs the git hooks (husky) + the Supabase CLI
pnpm db:start              # start the local Supabase stack (Docker) — see Database below
cp .env.example .env.local # then fill in local keys from `pnpm supabase status`
pnpm db:reset              # apply migrations + seed the demo items the dashboard reads
pnpm dev                   # start the dev server
```

Open [http://localhost:3000](http://localhost:3000) — the Item List dashboard
(Daybreak design system, FSC-90) renders the seeded items.

## Database

Supabase (PostgreSQL). The schema is defined entirely by versioned migrations in
[`supabase/migrations/`](supabase/migrations) — never edit the database by hand. Local
development runs the full stack in Docker via the Supabase CLI (a dev dependency, so use
`pnpm supabase …`); deployed environments use the already-provisioned hosted EU project.

### Local (Docker)

Requires Docker running.

```bash
pnpm db:start            # start the local stack (first run pulls images)
pnpm db:reset            # rebuild the schema from migrations + run seed.sql
pnpm supabase status     # print local URLs + anon / service_role keys
pnpm db:stop             # stop the stack
```

Copy the keys from `pnpm supabase status` into `.env.local`: `anon` →
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `service_role` → `SUPABASE_SERVICE_ROLE_KEY`.

After changing the schema, add a migration and regenerate the typed client:

```bash
pnpm db:migration <name> # create supabase/migrations/<timestamp>_<name>.sql
pnpm db:reset            # apply it locally
pnpm db:types            # regenerate src/types/database.ts — commit the result
pnpm db:test             # run the pgTAP tests in supabase/tests/
```

### Hosted (EU)

The hosted project is already provisioned in an EU region. Apply migrations to it:

```bash
pnpm supabase login
pnpm supabase link --project-ref <REF>   # <REF> = the hosted project ref
pnpm db:push                             # apply pending migrations to the hosted DB
```

Set the hosted keys in the Vercel project settings — never in the repo.

### Database commands

| Command                    | What it does                                          |
| -------------------------- | ----------------------------------------------------- |
| `pnpm db:start`            | Start the local Supabase stack (Docker)               |
| `pnpm db:stop`             | Stop the local stack                                  |
| `pnpm db:reset`            | Rebuild the local schema from migrations + `seed.sql` |
| `pnpm db:migration <name>` | Create a new timestamped migration                    |
| `pnpm db:diff`             | Diff the local database against the migrations        |
| `pnpm db:types`            | Regenerate `src/types/database.ts` (local stack up)   |
| `pnpm db:test`             | Run the pgTAP tests (`supabase/tests/`)               |
| `pnpm db:push`             | Apply migrations to the linked hosted project         |

## Authentication

The dashboard is **partners-only** (FSC-93). Access is enforced by **Row Level
Security** (shipped as the `..._partner_rls.sql` migration — never set by hand) plus
an SSR email+password login. An authenticated user is a **partner** iff a row exists
for them in `partners` (`active = true`); a partner reads the shared `items` feed, a
non-partner sees nothing, and an unauthenticated visitor is redirected to `/login`.
`item_sources` (who saw what) stays hidden from everyone but `service_role` — the
warm-intro reveal is a later ticket (FSC-106). Sensors authenticate ingestion with a
hashed token (`sensors.token_hash`), not Supabase Auth (FSC-98).

### Auth settings per environment

Auth config lives **outside migrations** (Supabase manages GoTrue, not Postgres DDL).
Local truth = `supabase/config.toml [auth]`; hosted truth = the Supabase dashboard →
Authentication (applied at deploy time, FSC-107). The values that must match per env:

| Setting                    | Local (`config.toml`)                | Hosted (Vercel EU)                                   |
| -------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `site_url`                 | `http://127.0.0.1:3000`              | `https://<prod-domain>`                              |
| `additional_redirect_urls` | `http://127.0.0.1:3000`              | prod domain (+ `https://*.vercel.app` previews)      |
| Providers                  | none (email + password only)         | none (email + password only)                         |
| `enable_signup`            | `true` (register test users locally) | **`false` — invite-only** (partners provisioned)     |
| Email confirmations        | `false` (instant local session)      | `true` (real-inbox double-opt-in)                    |
| SMTP                       | Mailpit (`http://127.0.0.1:54324`)   | **custom SMTP required** (built-in is non-prod)      |
| `minimum_password_length`  | `6`                                  | `8`+                                                 |
| JWT signing key / secret   | auto (local)                         | Supabase-managed — rotate in dashboard, never in git |

Secrets (SMTP password, JWT signing key, any OAuth secret) never live in the repo —
`.env.local` (gitignored) locally, Supabase dashboard / Vercel env when hosted.

### Local end-to-end

`pnpm db:reset` seeds a **login-ready demo partner** (local only):

```
email:    partner@hanabi.test
password: hanabi-demo-partner
```

```bash
pnpm db:reset            # schema + partners table + the demo partner
pnpm dev                 # http://127.0.0.1:3000
# Incognito -> redirected to /login (unauthenticated sees nothing).
# Sign in as the demo partner -> the seeded feed renders.
# Sign in as any other user (Studio "Add user", no partners row) -> empty feed.
```

### Provisioning a partner (no dashboard clicks for authorization)

Authorization is a versioned SQL insert; only the auth _account_ differs per env.

```sql
-- Promote an existing auth user to an active partner (idempotent).
insert into partners (id)
select id from auth.users where email = 'partner@firm.com'
on conflict (id) do update set active = true;
```

- **Local:** the seed above creates the account + promotes it. New local accounts:
  Studio → _Add user_, then run the insert.
- **Hosted:** dashboard → Authentication → _Invite user_ (or the Admin API) creates
  the account — **never** direct-insert `auth.users` on hosted — then run the insert.
- **Off-board:** `update partners set active = false where id = '<uuid>';` (takes effect
  on the next query). **GDPR erasure:** delete the `auth.users` row → `on delete cascade`
  drops the partner grant.

## Environment configuration

Configuration (Supabase URL/keys, Claude API key) is read from environment
variables — see [`.env.example`](.env.example) for the full list. `src/env.ts` is
the single source of truth that reads and validates them.

- **Local dev targets the local stack by default.** `.env.development` (committed,
  no secrets) sets `NEXT_PUBLIC_SUPABASE_URL` to the local Supabase API URL. Get the
  local keys with `pnpm supabase status` and put them in `.env.local`.
- **Deployed environments** (Vercel EU) use the hosted config — set the same
  variables in the Vercel project settings.

Secrets never live in the repo: `.env.local` and any `.env*.local` are gitignored;
only `.env.example` and `.env.development` are committed.

## Design system

The visual identity is the **Daybreak** theme (light only, no switcher), derived
from the Hanabi brand. Design tokens — colours, typography, spacing, radii,
elevation — live as plain CSS custom properties in
[`src/styles/tokens.css`](src/styles/tokens.css), the **single source of truth**.

- The dashboard consumes them via Tailwind v4: `src/styles/globals.css` imports
  `tokens.css` and maps every `--hb-*` value into Tailwind's theme namespace with
  `@theme inline`, so utilities (`bg-surface`, `text-ink`, `bg-stream-signal`, …)
  resolve to the tokens with no duplicated values.
- `tokens.css` is framework-neutral (plain CSS, no Tailwind directives) so the
  separate `Hanabi-extension` repo copies it **verbatim** (FSC-111 consent screen) —
  there is no shared package. Never add Tailwind directives there.
- Fonts (Figtree + JetBrains Mono) load via `next/font` in the app; the extension
  uses the plain font stacks documented in `tokens.css`.
- Note: `rounded-sm/md/lg` are remapped to 4/8/11px to match the token scale.

The **Item List** (`src/app/page.tsx` → `src/features/items/`) is the reference
screen demonstrating the system, including the permissioned warm-intro reveal modal.

## Quality commands

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `pnpm dev`          | Start the development server (Turbopack)                   |
| `pnpm build`        | Production build                                           |
| `pnpm start`        | Serve the production build                                 |
| `pnpm lint`         | ESLint (flat config), fails on any warning or error        |
| `pnpm lint:fix`     | ESLint with autofix                                        |
| `pnpm format`       | Format the codebase with Prettier                          |
| `pnpm format:check` | Check formatting without writing                           |
| `pnpm typecheck`    | TypeScript type checking (`next typegen` + `tsc --noEmit`) |
| `pnpm test`         | Run the test suite (Vitest)                                |

**Before opening a PR:** `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm format:check` must pass (mirrors CI).

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`type(scope): description`), enforced locally by git hooks:

- **pre-commit** → `lint-staged` (ESLint autofix + Prettier on staged files)
- **commit-msg** → `commitlint` validates the message

Hooks are installed by husky on the first `pnpm install`. A non-conforming commit
(bad message or unfixable lint error) is blocked before it is created.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: format check, lint,
typecheck, build, and test.
