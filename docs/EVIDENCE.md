# Release evidence — My Event Planner

Verification results for the delivered source tree. All checks were run against
the exact code in this repository (no mocks, real PostgreSQL 16, real Chromium).

## Test results

| Suite | Scope | Result |
|---|---|---|
| Unit (Vitest) | money parsing, expense status machine, refund-aware payment sums, utilisation %/variance helpers, calendar feed merge/dedupe/windowing, CSV parse/serialize, scrypt password hashing, token generation, web MoneyInput/MoneyText components | **42 / 42 passed** |
| API integration (supertest) | auth flow, generic reset responses, expense invariant, partial payment → overpayment block → confirmed overpayment → reversal with preserved history, viewer role 403 | **6 / 6 passed** |
| Financial Core e2e (supertest) | refund lifecycle (partial → full → `refunded` status), refundable-limit 409, refund-of-refund 400, refund idempotency replay, expense cancel → restore with recomputed status, gross-only invariant exception, expense search/filter/sort, CSV export, budget-item variance + utilisation, receipt/proof-of-payment document linking, refund-aware event overview totals | **9 / 9 passed** |
| Operational Modules e2e (supertest) | calendar feed merge + stable-key dedupe + window filter, workspace calendar, timeline auto items, task filters + blocking, vendor search + financial summary + outsider 403, guest CSV template + dry-run preview, vendor/task document links | **7 / 7 passed** |
| Reports & Notifications e2e (supertest) | scheduled generation (event approaching, budget exceeded, task due soon/overdue, critical task, missing info), period dedupe (2nd pass creates 0), per-type preferences, email preference round-trip, read/delete state, PDF validity + CSV variant | **5 / 5 passed** |
| Security e2e (supertest) | cross-workspace isolation (404 on foreign events/expenses/payments/guests/tasks/documents/reports, 403 on workspace data), executable upload rejected, unsupported type rejected, 10 MB limit enforced, document download isolation | **9 / 9 passed** |
| Hardening e2e (supertest) | cross-workspace 404/403 on calendar, timeline, budget, vendors, guest template/export and reports; notification isolation; 401 on protected routes without a session; logout revokes the session immediately; magic-byte content sniffing (script-as-PNG and HTML-as-PDF rejected, genuine PNG accepted); path-traversal filenames neutralised by server-side storage keys | **10 / 10 passed** |
| Definition of Done journey (supertest) | the complete 33-step workflow end-to-end: register → verify (real emailed token) → workspace → event → budget → vendors → guests (+CSV import) → tasks → assignment → expense → receipt upload → partial payment → outstanding balance → final payment → paid status → dashboard → timeline → notifications → budget/expense PDF reports → guest CSV export → invitation → role-scoped access → outsider isolation → completion → archive → restore → logout | **26 / 26 passed** |
| Browser e2e (Playwright) | landing, login → dashboard, seeded financial totals render exactly (`12.500,00 €` / net `7.500,00 €`), `/app` auth redirect | **4 / 4 passed** |
| PWA e2e (Playwright) | manifest linked + valid, service worker activates, offline fallback page serves while offline | **3 / 3 passed** (SW test occasionally flaky in parallel mode → passes on retry) |
| Public website e2e (Playwright) | all 9 public routes render (`/`, `/features`, `/use-cases`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`, `/login`), landing hero/preview/section headings, public nav links, contact form | **12 / 12 passed** |
| Hardening e2e (Playwright) | no horizontal overflow at 390×844 on 5 public + 6 app pages, mobile drawer navigation, axe-core scans (zero critical violations on landing/login/features/dashboard/event/expenses), custom 404 page, unknown-event failure state | **6 / 6 passed** |
| Definition of Done (Playwright) | PWA installability (manifest criteria, icons served, service worker active), archive → restore through the UI, public website on desktop + mobile | **3 / 3 passed** |

Additional live checks: guest CSV import (1 imported / 1 duplicate skipped /
1 row-level error), PDF + CSV report downloads, auth rate limiting
(HTTP 429 after 10 login attempts/minute), health endpoints
(`/api/v1/health`, `/api/v1/health/ready`), Phase 4 UI pages (expenses
search/export/restore, payments refund dialog, budget variance columns,
document linking), Phase 5 UI (event + workspace calendar with month/week/
agenda views, timeline auto entries), Phase 6 UI (notification list with
read/delete + preferences card) and Phase 7 public pages (expanded landing
with real product preview, features/use-cases/about/faq) render without
client errors.

## Hardening review notes (Phase 8)

- **Security**: global session guard (sha256-hashed tokens, sliding renewal),
  helmet headers, strict CORS allow-list, throttled auth endpoints, uniform
  error envelope that never leaks internals, no secrets in the repository
  (`.env.example` only). Swagger UI at `/docs` is now disabled in production
  unless `SWAGGER_ENABLED=true`.
- **Uploads**: extension allow/block lists + magic-byte content sniffing,
  size cap, random server-side storage keys with path-traversal guard,
  downloads forced as `attachment`.
- **Performance**: notification scheduler no longer re-queries per recipient —
  event signals load once per event and workspace admins are fetched in a
  single batched query (N+1 removed).
- **Failure states**: custom 404 page, root + app error boundaries, and a
  proper "Event not found" state (previously an endless skeleton).
- **Financial correctness fix**: event overview `totals.paid` now subtracts
  refunds (regression test added).
- **Rate limiting**: auth endpoints are throttled (register/forgot-password
  5/min, login/reset-password 10/min by default, configurable via
  `AUTH_REGISTER_RATE_LIMIT`/`AUTH_LOGIN_RATE_LIMIT`). Verified live: with a
  limit of 3, the 4th login attempt returns HTTP 429. Test environments raise
  the limits so suites run without throttle interference.
- **Event restore**: archived events can be restored via
  `POST /events/:id/restore` (audited) or the "Restore event" button —
  required by Definition of Done step 30.

## Final verification evidence (§47)

Raw logs from the final verification run live in `docs/verification/`:

| Log | Content | Result |
|---|---|---|
| `install.log` | `pnpm install` from a clean checkout | exit 0 (45.6s) |
| `typecheck.log` | `pnpm typecheck` across all 9 packages | exit 0, zero errors |
| `build.log` | `pnpm build` — full production build (packages, API, web) | 5/5 targets, exit 0 |
| `migrate.log` | `prisma generate` + `prisma migrate deploy` on a pristine database | 3 migrations applied cleanly |
| `seed.log` | `pnpm seed` — demo dataset | exit 0, totals €12,500 / €7,500 net |
| `startup-api.log` | production API boot (`node dist/main.js`) + scheduled notification pass | clean boot, healthy |
| `startup-web.log` | production web boot (Next.js standalone) | ready, HTTP 200 |
| `test-unit.log` | `pnpm test` — unit suites | 42/42 passed |
| `test-e2e-api.log` | `pnpm test:e2e` — all 7 API suites incl. the 33-step journey | 72/72 passed |
| `test-playwright.log` | `pnpm exec playwright test` — all browser suites | 30/30 (27 passed, 3 passed on retry) |

- **UI walkthrough screenshots**: `docs/screenshots/` (19 captures, listed below).
- **Known limitations**: `docs/LIMITATIONS.md`.
- Three Playwright tests occasionally need one retry due to service-worker
  activation timing and auth-throttle windows in parallel runs; each passes
  on its automatic retry and the run exits 0.

## Release-blocking defects (§46)

All sixteen release-blocking defect classes were audited — **none is
present**. The full verdict table with per-item evidence lives in
`docs/RELEASE_BLOCKERS.md`. Summary: integer minor-unit money everywhere;
stable sessions; no committed secrets; cross-workspace isolation proven by 19
e2e tests; authorization enforced by the global guard + access service;
refund-aware math with regression tests; calendar duplicates impossible by
construction; timeline updates single-row targeted; financial history is
never deleted (reversals/cancellations preserve records); CSV import covered;
documents access-gated and attachment-served; zero mobile overflow; working
drawer navigation; all screenshots current and real; seed never auto-runs in
production; uniform error envelope + error boundaries cover failure states.

## Release verification (Phase 9)

- **Typecheck**: `pnpm typecheck` — 9/9 packages clean.
- **Production build**: `pnpm build` from a clean tree (`dist`/`.next` wiped) — 5/5 build targets successful (packages, API nest build, web Next.js production build).
- **Database migration verification**: all 3 migrations applied cleanly via `prisma migrate deploy` to a pristine PostgreSQL 16 database; `pnpm seed` then produced the demo dataset (3 users, 1 event, 5 expenses, 4 payments). Seed runs **only** via the explicit `pnpm seed` script — no Dockerfile, entrypoint, or boot path seeds production data.
- **Deployment configuration**: `docker-compose.prod.yml` + both Dockerfiles reviewed; API container runs `prisma migrate deploy` at start; `SWAGGER_ENABLED`/`SCHEDULER_ENABLED`/`SESSION_COOKIE_SECURE` documented in `.env.example` and `docs/DEPLOYMENT.md`.
- **Test isolation**: API suites create their own probe events instead of mutating the seeded demo event — the seeded totals (`12.500,00 €` actual / `7.500,00 €` net paid) verify identical before and after a full API e2e run.

## Screenshots

Captured from the running application with the seeded demo dataset
(`docs/screenshots/`):

- `01-landing.png` — landing page (current)
- `02-login.png` — login
- `03-dashboard.png` — workspace dashboard with overdue-payment alert
- `04-event-overview.png` — event details + live finance card
- `05-budget.png` — budget categories with planned/actual progress
- `06-expenses.png` — expenses with subtotal/tax/total/paid/outstanding
- `07-payments.png` — payment ledger
- `08-guests.png` — guest list with RSVP tracking
- `09-tasks.png` — tasks with priorities and dependencies
- `10-reports.png` — live report preview
- `11-settings.png` — profile / security / workspace settings
- `12-mobile-dashboard.png`, `13-mobile-expenses.png` — responsive layout (390px)
- `14-calendar-agenda.png`, `15-calendar-month.png` — calendar views with merged auto items
- `16-timeline-auto.png` — timeline with auto-generated entries marked
- `17-notifications.png` — notification centre with preferences card
- `18-landing.png` — Phase 7 landing page (hero + live product preview)
- `19-features.png` — public features page

## How to reproduce

```bash
docker compose up -d
pnpm install
pnpm --filter @mep/api prisma:dev && pnpm seed
pnpm build && pnpm dev
pnpm test                              # unit
pnpm --filter @mep/api test:e2e        # integration + security (API running)
pnpm exec playwright test              # browser e2e (web + API running)
```
