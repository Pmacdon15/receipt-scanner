# Receiptly

Receipt scanning SaaS. Capture a receipt once, get a categorised, totalled
record you can report on.

## Stack

| Concern    | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 16 (App Router, React 19)             |
| UI         | shadcn/ui `base-nova` style on Base UI        |
| Styling    | Tailwind CSS v4                               |
| Auth       | Clerk                                         |
| Database   | Neon Postgres (`@neondatabase/serverless`)    |
| Hosting    | Vercel                                        |

## Getting started

```bash
bun install
cp .env.example .env.local   # then fill in the values
bun run dev
```

Pull the Clerk keys with the Clerk CLI instead of copying them by hand:

```bash
clerk env pull
```

Apply the database schema to a fresh Neon branch (it is safe to re-run on an
existing database, which is how the `org_id` column gets added):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Pages

- `/` — marketing home page.
- `/scan` — the scanner: capture form, live category detection, recent receipts.
- `/search` — search receipts by type, merchant/notes text, date range and
  amount, with per-type counts. When a Clerk organization is active it can
  switch between "My receipts" and the organization's receipts. All filters
  live in the URL, so a search can be bookmarked or shared.
- `/sign-in`, `/sign-up` — Clerk-hosted flows.

## Data access

Data flows in one direction, and every layer has a single job:

```
page / server action  →  lib/dal/*  →  lib/db/*  →  Neon
```

- **`lib/db/*`** — the only place that talks SQL. Each export is one query and
  takes `userId` as its first argument. No auth logic lives here.
- **`lib/dal/*`** — the access layer. It resolves the Clerk user, refuses the
  call when there is no session, maps snake_case rows to camelCase app types,
  and is the only caller of `lib/db`. Reads are wrapped in React `cache()` so a
  render that needs the same data twice hits the database once.
- **`app/actions/*`** — `"use server"` entry points for forms and buttons. They
  validate input, call the DAL, revalidate paths, and turn thrown errors into
  serialisable state. Server components call the DAL directly for reads.

A server component must never import from `lib/db` directly — that would skip
the auth check in the DAL.

## Receipt types

`lib/receipt-types.ts` holds the taxonomy — one `RECEIPT_TYPES` array that the
form, the list, the home page and the database constraint all read from. Add a
category there and it appears everywhere.

Every receipt stores three things about its category:

- `receipt_type` — the category in effect.
- `type_source` — `auto` if detection chose it, `user` if a person did.
- `detected_type` / `detected_confidence` — what detection suggested, kept even
  when the user overrides it.

That means the UI can always show what was auto-selected alongside what is
actually set. Detection itself lives in `lib/classify-receipt.ts` and is
keyword scoring for now; replacing it with OCR plus a model means rewriting
that one function body, since callers only read `{ type, confidence }`.

## Deploying to Vercel

The Vercel CLI needs an interactive browser login first:

```bash
vercel login
vercel link --project receipt-scanner --yes
```

Then push the three secrets to the project. Pull the values from
`.env.local` — do not retype them:

```bash
vercel env add DATABASE_URL production
vercel env add CLERK_SECRET_KEY production
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel deploy --prod
```

The Clerk keys in `.env.local` are **development** keys. Before a real
production deploy, create a production instance (`clerk deploy`) and use its
keys instead — development keys have strict usage limits.

## Scripts

```bash
bun run dev        # dev server
bun run build      # production build
bun run lint       # eslint
bun run format     # prettier
bun run typecheck  # tsc --noEmit
```

## Testing

Unit, integration and component tests run on [Bun](https://bun.sh)'s test
runner; end-to-end tests run on Playwright. None of them need Clerk keys or a
database.

```bash
bun run test               # everything below except e2e
bun run test:unit          # lib helpers: classification, money, search params
bun run test:integration   # lib/db, the DAL and server actions on real Postgres
bun run test:components    # React components in happy-dom
bun run test:coverage      # all Bun tests with a coverage table
bun run test:e2e           # Playwright against a production build
```

- `tests/unit` covers pure functions.
- `tests/integration` runs the real SQL against [PGlite](https://pglite.dev),
  an in-process Postgres loaded with `db/schema.sql`. Clerk, `next/cache` and
  the Neon client are swapped for fakes in `tests/helpers/server-mocks.ts`,
  which `bunfig.toml` preloads. Tests sign in as a user with `signIn()`.
- `tests/components` render client components with Testing Library, with the
  server actions mocked.
- `e2e/` covers the signed-out site on desktop and mobile. When no Clerk keys
  are set, `playwright.config.ts` starts the app with a placeholder key so
  every page renders signed out. Run `bunx playwright install chromium` once
  first.

Always run Bun tests through the scripts: they pass `--isolate`, which keeps
each file's module mocks and DOM globals from leaking into the next. CI runs
lint, typecheck, the Bun suite and the e2e suite on every pull request
(`.github/workflows/test.yml`).
