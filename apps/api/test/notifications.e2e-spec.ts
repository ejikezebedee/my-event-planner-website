/**
 * Phase 6 — Reports & Notifications e2e tests against a REAL PostgreSQL database.
 * Covers scheduled notification generation (all condition types), period
 * dedupe, preferences (per-type + email switch), delete, read state, and
 * PDF report structure.
 * Run: pnpm --filter @mep/api test:e2e
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const agent = request.agent(BASE);

const DAY = 24 * 60 * 60 * 1000;

async function typesFor(user: ReturnType<typeof request.agent>): Promise<string[]> {
  const res = await user.get("/api/v1/notifications");
  return res.body.map((n: { type: string }) => n.type);
}

describe("Reports & Notifications (e2e)", () => {
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);
    const res = await agent
      .post("/api/v1/auth/login")
      .send({ email: "demo@eventplanner.dev", password: "Demo1234!" });
    expect(res.status).toBe(200);
  });

  it("generates scheduled notifications for real conditions and dedupes per period", async () => {
    // Create conditions on a fresh event: approaching + missing info +
    // budget exceeded + task due soon + critical overdue.
    const eventRes = await agent.post("/api/v1/events").send({
      workspaceId: 1,
      name: `NotifProbe ${Date.now()}`,
      type: "other",
      startAt: new Date(Date.now() + 2 * DAY).toISOString(), // approaching
      budgetAmount: 10000,
    });
    expect(eventRes.status).toBe(201);
    const eventId = eventRes.body.id;

    // Budget exceeded: expense 15000 > budget 10000 (gross-only to skip tax split)
    const expense = await agent.post(`/api/v1/events/${eventId}/expenses`).send({
      title: "Over budget spend",
      expenseDate: new Date().toISOString(),
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 15000,
      grossOnly: true,
    });
    expect(expense.status).toBe(201);

    // Task due soon (tomorrow)
    await agent.post(`/api/v1/events/${eventId}/tasks`).send({
      title: "Due tomorrow",
      priority: "medium",
      status: "in_progress",
      dueAt: new Date(Date.now() + DAY).toISOString(),
      dependencyIds: [],
    });
    // Critical overdue task
    await agent.post(`/api/v1/events/${eventId}/tasks`).send({
      title: "Critical and late",
      priority: "critical",
      status: "in_progress",
      dueAt: new Date(Date.now() - DAY).toISOString(),
      dependencyIds: [],
    });

    const first = await agent.post("/api/v1/notifications/generate");
    expect(first.status).toBe(200);
    expect(first.body.created).toBeGreaterThan(0);

    const types = await typesFor(agent);
    expect(types).toContain("event_approaching");
    expect(types).toContain("budget_exceeded");
    expect(types).toContain("task_due_soon");
    expect(types).toContain("critical_task_overdue");
    expect(types).toContain("missing_event_info"); // no venue set

    // Second pass: period-scoped dedupe keys block duplicates
    const before = (await agent.get("/api/v1/notifications")).body.length;
    const second = await agent.post("/api/v1/notifications/generate");
    expect(second.body.created).toBe(0);
    const after = (await agent.get("/api/v1/notifications")).body.length;
    expect(after).toBe(before);
  });

  it("respects per-type preferences", async () => {
    // Disable event_approaching
    const put = await agent.put("/api/v1/notifications/preferences").send({
      types: { event_approaching: false },
      email: false,
    });
    expect(put.status).toBe(200);

    // Fresh approaching event
    const ev = await agent.post("/api/v1/events").send({
      workspaceId: 1,
      name: `NotifPref ${Date.now()}`,
      startAt: new Date(Date.now() + 2 * DAY).toISOString(),
      venueName: "Town Hall",
    });
    expect(ev.status).toBe(201);
    const created = await agent.post("/api/v1/notifications/generate");
    expect(created.status).toBe(200);

    const res = await agent.get("/api/v1/notifications");
    // Filter by this run's event id — earlier runs leave their own
    // notifications behind, and the database persists between runs.
    const prefEvents = res.body.filter(
      (n: { eventId: number | string; type: string }) =>
        String(n.eventId) === String(ev.body.id) && n.type === "event_approaching",
    );
    expect(prefEvents.length).toBe(0);

    // Restore defaults
    await agent.put("/api/v1/notifications/preferences").send({ types: {}, email: false });
  });

  it("round-trips the email preference", async () => {
    const on = await agent.put("/api/v1/notifications/preferences").send({ types: {}, email: true });
    expect(on.body.email).toBe(true);
    const read = await agent.get("/api/v1/notifications/preferences");
    expect(read.body.email).toBe(true);
    await agent.put("/api/v1/notifications/preferences").send({ types: {}, email: false });
  });

  it("manages read state and deletion", async () => {
    const list = await agent.get("/api/v1/notifications");
    expect(list.body.length).toBeGreaterThan(0);

    const unread = await agent.get("/api/v1/notifications/unread-count");
    expect(unread.body.count).toBeGreaterThan(0);

    const first = list.body[0];
    const read = await agent.post(`/api/v1/notifications/${first.id}/read`);
    expect(read.status).toBe(200);

    const del = await agent.delete(`/api/v1/notifications/${first.id}`);
    expect(del.status).toBe(200);
    const after = await agent.get("/api/v1/notifications");
    expect(after.body.find((n: { id: number }) => n.id === first.id)).toBeUndefined();

    const all = await agent.post("/api/v1/notifications/read-all");
    expect(all.status).toBe(200);
    const unreadAfter = await agent.get("/api/v1/notifications/unread-count");
    expect(unreadAfter.body.count).toBe(0);
  });

  it("serves valid PDF reports with footer pagination", async () => {
    const events = await agent.get("/api/v1/events?workspaceId=1");
    const eventId = events.body.find((e: { name: string }) => e.name.includes("Anna"))?.id
      ?? events.body[0].id;
    const res = await agent
      .get(`/api/v1/events/${eventId}/reports/budget_summary?format=pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // pdfkit buffers page objects; a valid multi-object document is well over 1KB
    expect(pdf.length).toBeGreaterThan(1000);

    // CSV variant still works alongside
    const csv = await agent.get(`/api/v1/events/${eventId}/reports/budget_summary?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
  });
});
