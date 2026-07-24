# Final Production Evidence — My Event Planner

Date: 2026-07-22 · Branch state: post-remediation (see `docs/PRODUCTION_REMEDIATION_REPORT.md`)

All commands were run on the exact source tree shipped in the release archive. Raw, unedited command output (ANSI stripped) is preserved in `docs/verification/rem-*.log`.

## 1. Verification summary

| Step                        | Command                                   | Result                                                              | Raw log                   |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| Dependency install          | `pnpm install --frozen-lockfile`          | ✅ clean, lockfile unchanged                                        | —                         |
| Typecheck                   | `pnpm typecheck`                          | ✅ 9/9 packages, 0 errors                                           | `rem-typecheck.log`       |
| Production build            | `pnpm build`                              | ✅ 5/5 (types, config, validation, api, web)                        | `rem-build.log`           |
| Migrations on a pristine DB | `prisma migrate deploy`                   | ✅ 4/4 applied (incl. `20260722090000_phase9_remediation`)          | `rem-migrate.log`         |
| Seed on a pristine DB       | `pnpm seed`                               | ✅ demo dataset (3 verified users, 1 event, 5 expenses, 4 payments) | `rem-seed.log`            |
| API boot                    | `node dist/main.js`                       | ✅ `/api/v1/health` 200; retention + scheduler started              | —                         |
| Unit tests                  | `pnpm test`                               | ✅ **42/42** (api 17, types 20, validation 5)                       | `rem-test-unit.log`       |
| API e2e                     | `pnpm --filter @mep/api test:e2e`         | ✅ **97/97 across 8 suites** (incl. 25 remediation tests)           | `rem-test-e2e-api.log`    |
| Browser e2e                 | `pnpm exec playwright test`               | ✅ **30/30**, zero flaky                                            | `rem-test-playwright.log` |
| Archive extraction test     | extract → install → build → boot → suites | ✅ see §4                                                           | —                         |

## 2. Remediation proof (finding → test)

Every finding has an automated proof in `apps/api/test/remediation.e2e-spec.ts` (25 tests, all passing) or a config/static proof:

| Finding                  | Proof                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 email worker          | `src/worker.ts` boots a BullMQ worker consuming the persisted `email` queue (typechecked, built into `dist/worker.js`); `worker` service in `docker-compose.prod.yml`              |
| C2 idempotency scope     | e2e “C2”: same key replays within its event, is a distinct operation in another event (no leak), event A retains exactly one payment                                               |
| C3 fail-fast config      | e2e “C3”: boots the real env module — refuses localhost origins (naming `WEB_ORIGIN`), refuses console mail (naming `EMAIL_PROVIDER`), accepts a coherent production config        |
| C4 verification gate     | e2e “C4”: dedicated API instance with `REQUIRE_EMAIL_VERIFICATION=true` — unverified account gets 403 on `/workspaces`, 200 on `/auth/me` + resend, full access after verification |
| C5 planner admin actions | e2e “C5”: planner 403 on event delete + member management, owner 200; planner write access intact                                                                                  |
| C6 transactional audit   | `audit.logTx` used by every financial mutation; full e2e regression passes (payments, refunds, reversals, expenses, budget)                                                        |
| C7 CI                    | `.github/workflows/ci.yml` (quality job + postgres-backed e2e job)                                                                                                                 |
| C8 PWA privacy           | `sw.js` v3 never caches `/app/**`; Playwright PWA suite (offline fallback still works) 30/30                                                                                       |
| C9 frozen installs       | both `infrastructure/docker/*.Dockerfile` use `--frozen-lockfile`                                                                                                                  |
| C10 licence              | root `LICENSE` (MIT); footer states MIT consistently                                                                                                                               |
| C11 account deletion     | e2e “C11”: 401 wrong password, 409 shared workspace with guidance, 200 + login impossible afterwards                                                                               |
| C12 ownership transfer   | e2e “C12”: 403 non-owner, 401 wrong password, role swap verified (planner→owner, owner→admin)                                                                                      |
| H1 email change          | e2e “H1”: 401 wrong password, confirmation link to the NEW address, sessions revoked, old address rejected, new address logs in                                                    |
| H2 malware scanning      | e2e “H2”: upload passes the scanner abstraction, `scanStatus=clean`, downloadable; infected/error documents are quarantined (410/503) by construction                              |
| H3 retention             | `RetentionService` boot + daily passes (sessions 7 d, tokens 24 h, invitations 7 d, read notifications 90 d, contact submissions 12 months); runs in the booted API                |
| H4 contact honeypot      | e2e “H4”: filled honeypot → 200 with fake success and zero delivery (asserted against the mail log)                                                                                |
| H5 legal pages           | `/impressum` (§ 5 DDG operator placeholders + consumer-dispute legal-review placeholder), privacy updated with real retention windows, footer link                                 |
| H6 mobile tabs           | scrollable single-row tab strip; responsive suite passes at 390 px                                                                                                                 |
| H7 responsive tables     | expenses/payments mobile cards; Playwright responsive suite 30/30                                                                                                                  |

## 3. Regression proof (nothing previously green broke)

- DoD journey suite: 26/26 — the complete 33-step user workflow still passes end to end.
- Security suite (authz, rate limits, sessions): 9/9.
- Hardening suite: 10/10. Financial: 9/9. Operations: 7/7. Notifications: 5/5. App: 6/6.
- Browser smoke (exact seeded totals €12,500/€7,500), responsive, DoD, a11y, PWA: 30/30.

## 4. Archive extraction test

The shipped archive (`my-event-planner-production-candidate.zip`) was extracted to a clean directory and verified end to end:

1. `pnpm install --frozen-lockfile` — clean.
2. `prisma migrate deploy` on a fresh database — 4/4 applied.
3. `pnpm seed` — demo dataset created.
4. `pnpm build` — 5/5.
5. Boot API (`node dist/main.js`) + web (standalone server) — health 200, login page serves, JS chunks 200.
6. Package audit: no `node_modules`, `.next`, `dist`, `.turbo`, `*.tsbuildinfo`, `test-results`, `playwright-report`, `coverage`, `.git`, uploads, `.env` files, secrets, or personal data in the archive (demo fixtures use example domains only).

## 5. Environment used

Node.js 20, pnpm 9.15.0, PostgreSQL 16 (embedded instance), Chromium (Playwright 1.58.2), Linux x64. CI equivalents are encoded in `.github/workflows/ci.yml`.

## Independent remediation note — 2026-07-22

The later hardening changes are documented in `docs/ASSISTANT_REMAINING_FIXES_REPORT.md`. Their static source validation passed, but dependency installation and executable build/test reproduction must run in GitHub Actions because the remediation environment had no npm-registry access.
