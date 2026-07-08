# Hanabi Radar — app

Next.js dashboard + Supabase backend for **Hanabi Radar**: it captures LinkedIn
posts (via a separate browser extension), deduplicates them, classifies them with
AI into three streams (market signal / business opportunity / trend), and presents
them to the Hanabi collective's partners.

This repository is the **app** (dashboard + backend). It currently contains only the
technical foundation — no business features yet (ticket FSC-84).

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
pnpm dev                   # start the dev server
```

Open [http://localhost:3000](http://localhost:3000) — you should see an empty home page.

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
