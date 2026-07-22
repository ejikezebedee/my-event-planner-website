# My Event Planner

Production-grade event planning and budget control platform. Plan weddings, parties and corporate events with budgets per category, expenses with tax, **partial payments with live balances**, **reversals that preserve history**, guests (CSV import/export), vendors, tasks with dependencies, timelines, private document storage, notifications, and six report types (JSON/CSV/PDF).

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm 9 workspaces + Turborepo |
| Web | Next.js 15 (App Router) · React 19 · Tailwind · TanStack Query |
| API | NestJS 10 (REST, `/api/v1`) · Swagger at `/docs` |
| Database | PostgreSQL 16 via Prisma 6 |
| Cache/queues | Redis 7 + BullMQ (optional — graceful degradation) |
| Storage | S3-compatible (MinIO / AWS S3 / Cloudflare R2) or local disk |
| Mail | resend / SMTP / console (dev) |
| Tests | Vitest (unit + supertest e2e) · Testing Library · Playwright |
| PWA | Web app manifest, service worker, offline fallback page |

```
apps/
  web/        Next.js frontend (port 3000)
  api/        NestJS backend (port 4000), Prisma schema + seed
packages/
  types/      Enums + money utilities (integer minor units)
  validation/ Shared zod schemas (API + client)
  config/     Shared constants (session cookie, upload rules)
  ui/         shadcn-style React components
  eslint-config/
infrastructure/docker/   Dockerfiles
docs/                    Deployment guide
```

## Core invariants (do not break)

- **Money is always integer minor units** (€10.50 = `1050`), stored as `BigInt` in PostgreSQL. Floating-point arithmetic for money is forbidden. Parsing/validation lives in `packages/types/src/money.ts` + `packages/validation`.
- **Expense invariant**: `totalAmount = subtotal + taxAmount` (enforced by zod, server-side). Gross-only expenses (`grossOnly: true`) are the documented exception for invoices without a tax split.
- **Partial payments**: expense status is derived from the refund-aware net of non-reversed payments (`unpaid → partially_paid → paid → overpaid`; `refunded` when money came back and nothing remains paid).
- **Refunds** are first-class payment records (`type: refund`, linked via `refundOfPaymentId`). A refund may never exceed the refundable remainder of its payment. Refunds are idempotent and preserve history exactly like payments.
- **Overpayments** are rejected unless the client explicitly sends `confirmOverpayment: true`.
- **Reversals preserve history**: payments are marked `reversedAt` + `reversalReason`, never deleted. Expenses/events with financial records are cancelled/archived, never deleted — cancelled expenses can be recovered with `POST /expenses/:id/restore` (status recomputed from the payment history).
- **Access control**: workspace owner/admin see everything; planner/viewer must be explicit event members. Event viewers are read-only. Enforced server-side in `AccessService`.
- **Optimistic locking** on expenses via a `version` column; **idempotency keys** on payments.
- Passwords hashed with scrypt; sessions are sha256-hashed tokens in HTTP-only cookies; auth endpoints are rate-limited; password reset responses are always generic.

## Quick start (local development)

Prerequisites: Node 20+, pnpm 9 (`corepack enable`), Docker.

```bash
# 1. Start PostgreSQL, Redis and MinIO
docker compose up -d

# 2. Configure environment
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local   # optional; defaults work

# 3. Install dependencies
pnpm install

# 4. Create the database schema and load demo data
pnpm prisma:migrate:dev   # first run creates the migration
pnpm seed                 # demo workspace + wedding event

# 5. Run everything (api :4000, web :3000)
pnpm dev
```

Open http://localhost:3000 — API docs at http://localhost:4000/docs.

**Demo logins** (after `pnpm seed`): `demo@eventplanner.dev`, `planner@eventplanner.dev`, `viewer@eventplanner.dev` — password `Demo1234!`.

## Tests

```bash
pnpm test                 # unit tests (money, csv, password, status logic, web components)
pnpm --filter @mep/api test:e2e   # integration + security e2e (needs running API + seeded DB)
pnpm exec playwright test         # browser + PWA e2e (needs web + api running)
```

See [docs/EVIDENCE.md](docs/EVIDENCE.md) for the latest verification results and screenshots.

## PWA & public pages

The web app ships a manifest (`/manifest.webmanifest`), a service worker
(`/sw.js`, production only) with an offline fallback page (`/offline.html`)
and safe update handling — a new version prompts "Reload to update" instead
of force-reloading the tab. Public pages: `/` (landing), `/features`,
`/use-cases`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`.
Security headers (including a Content-Security-Policy) are set in
`apps/web/next.config.mjs`.

## Hardening

Uploads are validated by extension **and** magic bytes, stored under random
server-generated keys, and always served as attachments. The API applies a
global session guard, helmet headers, strict CORS, throttled auth endpoints
and a uniform error envelope. Swagger (`/docs`) is disabled in production
unless `SWAGGER_ENABLED=true`. Custom 404/error pages cover failure states.

## Production remediation (2026-07)

A full production-readiness audit was remediated end to end: dedicated email
worker process (outbox over Redis), per-event payment idempotency,
production config fail-fast, enforced email verification, event-admin
authorization tightening, transactional financial audit records, CI
pipeline, PWA cache privacy, frozen Docker installs, MIT licence, safe
account deletion, workspace ownership transfer, email-change re-verification,
malware-scan abstraction for uploads, data-retention jobs, contact-form
spam guards, EU legal pages, and mobile UX corrections. See
[docs/PRODUCTION_REMEDIATION_REPORT.md](docs/PRODUCTION_REMEDIATION_REPORT.md)
and [docs/FINAL_PRODUCTION_EVIDENCE.md](docs/FINAL_PRODUCTION_EVIDENCE.md).

## Production deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the VPS guide (Docker, reverse proxy, TLS, backups). Short version:

```bash
cp .env.example .env     # set strong secrets
docker compose -f docker-compose.prod.yml up -d --build
```

## API overview

All endpoints under `/api/v1`, cookie-authenticated (`mep_session`), JSON envelope `{ statusCode, message }` on errors.

- `POST /auth/register|login|logout` · `GET/PATCH /auth/me` · `POST /auth/forgot-password|reset-password|verify-email|change-password` · `GET/DELETE /auth/sessions`
- `GET/POST /workspaces` · `GET /workspaces/:id/members` · `POST /workspaces/:id/invitations` · `POST /workspaces/invitations/accept`
- `GET/POST /events` · `GET/PATCH/DELETE /events/:id` · `/events/:id/members`
- `GET /events/:id/budget` (per-category + per-item planned/actual/variance/utilisation %) · `POST /events/:id/budget/categories|items`
- `GET/POST/PATCH/DELETE /events/:id/expenses…` (`?q=&status=&categoryId=&sort=` search/filter/sort) · `GET /events/:id/expenses/export` (CSV) · `POST /events/:id/expenses/:id/restore` · `POST /events/:id/expenses/:id/payments` · `POST /events/:id/payments/:id/refund` · `POST /events/:id/payments/:id/reverse`
- `GET/POST /events/:id/guests…` · `POST /events/:id/guests/import` · `GET /events/:id/guests/export`
- `GET/POST/PATCH /vendors…` · `GET/POST/PATCH/DELETE /events/:id/vendors…`
- `GET/POST/PATCH/DELETE /events/:id/tasks…` · `/events/:id/timeline…` · `/events/:id/documents…` (upload accepts `expenseId`/`paymentId` for receipts and proofs of payment; list filters with `?expenseId=&paymentId=`)
- `GET /events/:id/reports/:type?format=json|csv|pdf` (types: `budget_summary`, `expense_detail`, `payment_status`, `guest_list`, `vendor_summary`, `task_progress`)
- `GET /notifications…` · `GET /dashboard?workspaceId=` · `GET /health` + `/health/ready`
