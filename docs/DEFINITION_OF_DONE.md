# Definition of Done — verification map

Every step of the master prompt's Definition of Done workflow is executed and
verified. Steps 2–30 and 33 run as a scripted end-to-end journey against a
real PostgreSQL database (`apps/api/test/definition-of-done.e2e-spec.ts`,
26 tests — **all passing**). Steps 1, 31 and 32 are browser-side and run in
Playwright (`tests/e2e/dod.spec.ts`, 3 tests — **all passing**). No step
requires manual database editing; in development, transactional mail is
delivered through the console mailer and the journey consumes the real
verification/invitation links from it.

| # | Step | How it is verified |
|---|---|---|
| 1 | Visit the public website | Playwright: landing + 8 public routes render (`public.spec.ts`, `dod.spec.ts`) |
| 2 | Register | Journey step 2 — `POST /auth/register` 201 |
| 3 | Verify the account | Journey step 3 — real token from the verification email, `emailVerifiedAt` set |
| 4 | Create a workspace | Journey step 4 — `POST /workspaces` 201 |
| 5 | Create an event | Journey step 5 — `POST /events` 201 |
| 6 | Enter event details | Journey step 6 — PATCH persists venue/city/date/guest count |
| 7 | Set the event budget | Journey step 7 — `budgetAmount` persisted (minor units) |
| 8 | Create budget categories | Journey step 8 — category + item with planned amount |
| 9 | Add vendors | Journey step 9 — workspace vendor created and linked to the event |
| 10 | Add guests | Journey step 10 — guest created |
| 11 | Import guests from CSV | Journey step 11 — 2 rows imported (plus dry-run/template covered by the Operational suite) |
| 12 | Add event tasks | Journey step 12 — task with priority and due date |
| 13 | Assign a task to a collaborator | Journey step 13 — assignee persisted on the task |
| 14 | Add an expense | Journey step 14 — subtotal + tax = total enforced |
| 15 | Upload the receipt or invoice | Journey step 15 — PDF receipt linked to the expense (magic-byte validated) |
| 16 | Record a partial payment | Journey step 16 — status becomes `partially_paid` |
| 17 | See the correct outstanding balance | Journey step 17 — outstanding = total − paid asserted exactly |
| 18 | Record the final payment | Journey step 18 — second payment accepted |
| 19 | See the expense become paid | Journey step 19 — status becomes `paid` |
| 20 | See the event dashboard update automatically | Journey step 20 — dashboard actual/paid equal the recorded amounts |
| 21 | View the event timeline | Journey step 21 — manual entry plus auto-generated items |
| 22 | Receive relevant notifications | Journey step 22 — `event_approaching` + `task_due_soon` generated for the user |
| 23 | Generate a budget report | Journey step 23 — `budget_summary` PDF (valid `%PDF-` bytes) |
| 24 | Generate an expense report | Journey step 24 — `expense_detail` PDF |
| 25 | Export a guest list | Journey step 25 — CSV export contains the imported guests |
| 26 | Invite another user | Journey step 26 — invitation email → registration → token acceptance |
| 27 | Verify the invited user only has authorised access | Journey steps 26–27 — planner cannot see the event until added (404), reads it once a member, cannot administer the workspace (403), sees only their own workspaces |
| 28 | Verify an unrelated account cannot access the event | Journey step 28 — 404 on the event, 403 on the workspace dashboard |
| 29 | Mark the event completed | Journey step 29 — status transition persisted |
| 30 | Archive and restore the event | Journey step 30 + Playwright — delete archives (financial records preserved), `POST /events/:id/restore` and the UI "Restore event" button return it to planning |
| 31 | Install the PWA | Playwright — manifest meets Chromium installability criteria (name, short_name, start_url, standalone display, 192/512 icons served), service worker active |
| 32 | Use the application on mobile and desktop | Playwright — responsive suite (no horizontal overflow at 390px on 11 pages, mobile drawer navigation) + full desktop suite |
| 33 | Log out securely | Journey step 33 — session revoked, subsequent requests 401 (also covered by the hardening suite) |

## Running the verification

```bash
# API journey (steps 2–30, 33) — API + PostgreSQL running
pnpm --filter @mep/api test:e2e

# Browser steps (1, 30 UI, 31, 32) — web + API running
pnpm exec playwright test tests/e2e/dod.spec.ts
```
