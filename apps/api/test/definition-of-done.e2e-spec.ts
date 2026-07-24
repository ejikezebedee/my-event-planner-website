/**
 * Definition of Done (master prompt §45) — the complete 33-step user workflow
 * executed end-to-end against a REAL PostgreSQL database, with no manual
 * database editing. Steps 1/31/32 are browser-side and covered by the
 * Playwright suites (public website, PWA installability, responsive).
 *
 * Dev note: with EMAIL_PROVIDER=console the API logs outgoing mail; the
 * journey reads verification/invitation links from that log (env API_LOG_PATH).
 *
 * Run: pnpm --filter @mep/api test:e2e
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const LOG_PATH = process.env.API_LOG_PATH ?? "/tmp/api.log";

const owner = request.agent(BASE);
const member = request.agent(BASE);
const outsider = request.agent(BASE);

const run = Date.now().toString(36);
const OWNER_EMAIL = `dod-owner-${run}@example.com`;
const MEMBER_EMAIL = `dod-member-${run}@example.com`;
const OUTSIDER_EMAIL = `dod-outsider-${run}@example.com`;
const PASSWORD = "Journey123!";

/** Pull the newest emailed link of a kind from the console-mailer log.
 *  Mail is sent fire-and-forget, so poll briefly for the log entry. */
async function emailedLink(kind: "verify-email" | "invite", to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let log = "";
    try {
      log = readFileSync(LOG_PATH, "utf8");
    } catch {
      // Log file may not exist yet — keep polling.
    }
    const entries = log
      .split("[console mail]")
      .filter((e) => e.includes(`to=${to}`) && e.includes(`/${kind}?token=`));
    const last = entries[entries.length - 1] ?? "";
    const match = last.match(new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`));
    if (match?.[1]) return match[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`console mail log contains no ${kind} link for ${to}`);
}

// Journey state shared across steps.
let workspaceId: number;
let eventId: number;
let categoryId: number;
let vendorId: number;
let taskId: number;
let memberUserId: number;
let expenseId: number;
let paymentTotal = 0;

describe("Definition of Done — complete user workflow", () => {
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);
  });

  it("step 2 — register a new account", async () => {
    const res = await owner.post("/api/v1/auth/register").send({
      name: "DoD Owner",
      email: OWNER_EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
  });

  it("step 3 — verify the account via the emailed link", async () => {
    const token = await emailedLink("verify-email", OWNER_EMAIL);
    const res = await owner.post("/api/v1/auth/verify-email").send({ token });
    expect(res.status).toBe(200);
    const me = await owner.get("/api/v1/auth/me");
    expect(me.body.emailVerifiedAt).toBeTruthy();
  });

  it("step 4 — create a workspace", async () => {
    const res = await owner.post("/api/v1/workspaces").send({ name: "DoD Workspace" });
    expect(res.status).toBe(201);
    workspaceId = res.body.id;
    expect(workspaceId).toBeGreaterThan(0);
  });

  it("step 5 — create an event", async () => {
    const res = await owner.post("/api/v1/events").send({
      workspaceId,
      name: "DoD Gala",
      type: "corporate",
      currency: "EUR",
    });
    expect(res.status).toBe(201);
    eventId = res.body.id;
  });

  it("step 6 — enter event details", async () => {
    const res = await owner.patch(`/api/v1/events/${eventId}`).send({
      description: "Annual charity gala",
      startAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      venueName: "Grand Hall",
      city: "Berlin",
      expectedGuests: 120,
      status: "planning",
    });
    expect(res.status).toBe(200);
    expect(res.body.venueName).toBe("Grand Hall");
  });

  it("step 7 — set the event budget", async () => {
    const res = await owner.patch(`/api/v1/events/${eventId}`).send({ budgetAmount: 2000000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.budgetAmount)).toBe(2000000);
  });

  it("step 8 — create budget categories (with items)", async () => {
    const cat = await owner
      .post(`/api/v1/events/${eventId}/budget/categories`)
      .send({ name: "Venue" });
    expect(cat.status).toBe(201);
    categoryId = cat.body.id;
    const item = await owner
      .post(`/api/v1/events/${eventId}/budget/items`)
      .send({ categoryId, name: "Hall rental", plannedAmount: 500000, priority: "high" });
    expect(item.status).toBe(201);
  });

  it("step 9 — add vendors", async () => {
    const vendor = await owner
      .post(`/api/v1/vendors?workspaceId=${workspaceId}`)
      .send({ businessName: "DoD Catering GmbH", category: "catering" });
    expect(vendor.status).toBe(201);
    vendorId = vendor.body.id;
    const link = await owner
      .post(`/api/v1/events/${eventId}/vendors`)
      .send({ vendorId, quotedAmount: 300000, role: "Catering" });
    expect(link.status).toBe(201);
  });

  it("steps 10+11 — add guests and import guests from CSV", async () => {
    const one = await owner
      .post(`/api/v1/events/${eventId}/guests`)
      .send({ firstName: "Ada", lastName: "Guest", email: "ada@example.com" });
    expect(one.status).toBe(201);

    const csv =
      "firstName,lastName,email\nCarl,Importer,carl@example.com\nDana,Importer,dana@example.com";
    const imported = await owner.post(`/api/v1/events/${eventId}/guests/import`).send({ csv });
    expect(imported.status).toBe(200);
    expect(imported.body.imported).toBe(2);

    const list = await owner.get(`/api/v1/events/${eventId}/guests`);
    expect(list.body.guests.length ?? list.body.length).toBeGreaterThanOrEqual(3);
  });

  it("step 12 — add event tasks", async () => {
    const task = await owner.post(`/api/v1/events/${eventId}/tasks`).send({
      title: "Confirm menu",
      priority: "high",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(task.status).toBe(201);
    taskId = task.body.id;
  });

  it("step 26 (pre-requisite) — invite another user; they register and accept", async () => {
    const invite = await owner
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .send({ email: MEMBER_EMAIL, role: "planner" });
    expect(invite.status).toBe(201);

    const reg = await member.post("/api/v1/auth/register").send({
      name: "DoD Member",
      email: MEMBER_EMAIL,
      password: PASSWORD,
    });
    expect(reg.status).toBe(201);
    memberUserId = reg.body.id;

    const token = await emailedLink("invite", MEMBER_EMAIL);
    const accept = await member.post("/api/v1/workspaces/invitations/accept").send({ token });
    expect(accept.status).toBe(200);
    expect(Number(accept.body.workspaceId)).toBe(workspaceId);

    // Planners only see events they are a member of — the owner adds them.
    const before = await member.get(`/api/v1/events/${eventId}`);
    expect(before.status).toBe(404);
    const add = await owner
      .post(`/api/v1/events/${eventId}/members`)
      .send({ userId: memberUserId, role: "planner" });
    expect(add.status).toBe(201);
  });

  it("step 13 — assign a task to the collaborator", async () => {
    const res = await owner.patch(`/api/v1/events/${eventId}/tasks/${taskId}`).send({
      title: "Confirm menu",
      assigneeId: memberUserId,
      // PATCH is full-state: resend the due date so it is preserved.
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe(200);
    const tasks = await owner.get(`/api/v1/events/${eventId}/tasks`);
    const assigned = tasks.body.find((t: { id: number }) => Number(t.id) === taskId);
    expect(String(assigned.assigneeId)).toBe(String(memberUserId));
  });

  it("step 14 — add an expense", async () => {
    const res = await owner.post(`/api/v1/events/${eventId}/expenses`).send({
      title: "Catering deposit",
      expenseDate: new Date().toISOString(),
      categoryId,
      vendorId,
      subtotal: 100000,
      taxAmount: 19000,
      totalAmount: 119000,
    });
    expect(res.status).toBe(201);
    expenseId = res.body.id;
  });

  it("step 15 — upload the receipt", async () => {
    const res = await owner
      .post(`/api/v1/events/${eventId}/documents`)
      .field("expenseId", String(expenseId))
      .attach("file", Buffer.from("%PDF-1.4 receipt body"), "receipt.pdf");
    expect(res.status).toBe(201);
    expect(String(res.body.expenseId)).toBe(String(expenseId));
  });

  it("steps 16+17 — record a partial payment and see the correct outstanding balance", async () => {
    const pay = await owner
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 50000, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(pay.status).toBe(201);
    expect(pay.body.expenseStatus).toBe("partially_paid");
    paymentTotal = 50000;

    const expense = await owner.get(`/api/v1/events/${eventId}/expenses`);
    const row = expense.body.find((e: { id: number }) => Number(e.id) === expenseId);
    const outstanding = row.totalAmount - (row.paidAmount ?? row.paid ?? 0);
    expect(outstanding).toBe(119000 - paymentTotal);
  });

  it("steps 18+19 — record the final payment; the expense becomes paid", async () => {
    const pay = await owner
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 69000, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(pay.status).toBe(201);
    expect(pay.body.expenseStatus).toBe("paid");
  });

  it("step 20 — the dashboard reflects the new financials", async () => {
    const res = await owner.get(`/api/v1/dashboard?workspaceId=${workspaceId}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.finances.actual)).toBe(119000);
    expect(Number(res.body.finances.paid)).toBe(119000);
  });

  it("step 21 — view the event timeline", async () => {
    const entry = await owner.post(`/api/v1/events/${eventId}/timeline`).send({
      title: "Venue walkthrough",
      startAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
    expect(entry.status).toBe(201);
    const list = await owner.get(`/api/v1/events/${eventId}/timeline`);
    expect(list.body.some((t: { title: string }) => t.title === "Venue walkthrough")).toBe(true);
    // Auto items from records appear alongside manual entries.
    expect(list.body.some((t: { source?: string }) => t.source && t.source !== "manual")).toBe(
      true,
    );
  });

  it("step 22 — receive relevant notifications", async () => {
    const gen = await owner.post("/api/v1/notifications/generate");
    expect(gen.status).toBe(200);
    const list = await owner.get("/api/v1/notifications");
    const mine = list.body.filter(
      (n: { eventId: number | string }) => Number(n.eventId) === eventId,
    );
    // Event starts in 5 days → event_approaching; task due tomorrow → task_due_soon.
    expect(mine.some((n: { type: string }) => n.type === "event_approaching")).toBe(true);
    expect(mine.some((n: { type: string }) => n.type === "task_due_soon")).toBe(true);
  });

  it("steps 23+24 — generate a budget report and an expense report", async () => {
    const budget = await owner
      .get(`/api/v1/events/${eventId}/reports/budget_summary?format=pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(budget.status).toBe(200);
    expect(budget.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const expenses = await owner
      .get(`/api/v1/events/${eventId}/reports/expense_detail?format=pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(expenses.status).toBe(200);
    expect(expenses.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("step 25 — export the guest list", async () => {
    const res = await owner.get(`/api/v1/events/${eventId}/guests/export`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Carl");
    expect(res.text).toContain("Ada");
  });

  it("step 27 — the invited user only has authorised access", async () => {
    // Planner can read the event…
    const read = await member.get(`/api/v1/events/${eventId}`);
    expect(read.status).toBe(200);
    // …but cannot administer the workspace (owner-only member management)…
    const members = await member
      .patch(`/api/v1/workspaces/${workspaceId}/members/1`)
      .send({ role: "viewer" });
    expect(members.status).toBe(403);
    // …and cannot see the owner's other workspaces.
    const workspaces = await member.get("/api/v1/workspaces");
    const ids = workspaces.body.map((w: { id: number }) => Number(w.id));
    expect(ids).toContain(workspaceId);
    expect(ids.length).toBeLessThan(3); // own default workspace + shared one
  });

  it("step 28 — an unrelated account cannot access the event", async () => {
    const reg = await outsider.post("/api/v1/auth/register").send({
      name: "DoD Outsider",
      email: OUTSIDER_EMAIL,
      password: PASSWORD,
    });
    expect(reg.status).toBe(201);
    const res = await outsider.get(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(404);
    const ws = await outsider.get(`/api/v1/dashboard?workspaceId=${workspaceId}`);
    expect(ws.status).toBe(403);
  });

  it("step 29 — mark the event completed", async () => {
    const res = await owner.patch(`/api/v1/events/${eventId}`).send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("step 30 — archive and restore the event", async () => {
    const archive = await owner.delete(`/api/v1/events/${eventId}`);
    expect(archive.status).toBe(200);
    expect(archive.body.archived).toBe(true); // has financial records → archived

    const afterArchive = await owner.get(`/api/v1/events/${eventId}`);
    expect(afterArchive.body.status).toBe("archived");

    const restore = await owner.post(`/api/v1/events/${eventId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.archived).toBe(false);

    const afterRestore = await owner.get(`/api/v1/events/${eventId}`);
    expect(afterRestore.body.status).toBe("planning");
  });

  it("step 33 — log out securely", async () => {
    const out = await owner.post("/api/v1/auth/logout");
    expect(out.status).toBe(200);
    const me = await owner.get("/api/v1/auth/me");
    expect(me.status).toBe(401);
  });
});
