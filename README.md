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
- **Supabase** (PostgreSQL, Auth, RLS, Edge Functions) — EU region _(to come)_
- **Claude API** for classification _(to come)_
- **Deployment**: Vercel, EU region _(to come)_

## Prerequisites

- **Node.js 22** (see `.nvmrc` → `nvm use`). Enforced via `engines` + `engine-strict`.
- **pnpm 10** — enable it with `corepack enable` (version pinned in `packageManager`).

## Getting started

```bash
pnpm install   # also installs the git hooks (husky)
pnpm dev       # start the dev server
```

Open [http://localhost:3000](http://localhost:3000) — you should see an empty home page.

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

**Before opening a PR:** `pnpm lint && pnpm typecheck && pnpm build` must pass.

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
