/**
 * Phase 5 — Operational Modules e2e tests against a REAL PostgreSQL database.
 * Covers the calendar feed, merged timeline, task filters + blocking,
 * vendor search/summary, guest CSV template + dry-run preview, and
 * vendor/task document links.
 * Run: pnpm --filter @mep/api test:e2e
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const agent = request.agent(BASE);

let eventId: number;

describe("Operational Modules (e2e)", () => {
  // Auth endpoints are rate-limited — log in once per suite run.
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);
    const res = await agent
      .post("/api/v1/auth/login")
      .send({ email: "demo@eventplanner.dev", password: "Demo1234!" });
    expect(res.status).toBe(200);
    const events = await agent.get("/api/v1/events?workspaceId=1");
    // Pin the seeded demo event by name — other suites create their own
    // events, so list position is not stable.
    const seeded = events.body.find((e: { name: string }) => e.name.includes("Anna"));
    expect(seeded, "seeded demo event exists").toBeTruthy();
    eventId = seeded.id;
  });

  it("serves a merged calendar feed with stable, deduplicated keys", async () => {
    const feed = await agent.get(`/api/v1/events/${eventId}/calendar`);
    expect(feed.status).toBe(200);
    expect(feed.body.length).toBeGreaterThan(3);

    const keys = feed.body.map((i: { key: string }) => i.key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates

    const kinds = new Set(feed.body.map((i: { kind: string }) => i.kind));
    expect(kinds.has("event")).toBe(true);
    expect(kinds.has("task")).toBe(true);
    expect(kinds.has("expense_due")).toBe(true);

    // Completed tasks and paid expenses never appear
    const titles = feed.body.map((i: { title: string }) => i.title);
    expect(titles).not.toContain("Book venue"); // completed task
    expect(titles).not.toContain("Payment due: Venue rental"); // paid expense

    // Window filtering
    const narrow = await agent.get(
      `/api/v1/events/${eventId}/calendar?from=2999-01-01&to=2999-12-31`,
    );
    expect(narrow.body.length).toBe(0);

    // Editing a record keeps the same key (no duplicate on update).
    // Uses a dedicated task so seeded data is never mutated.
    const created = await agent.post(`/api/v1/events/${eventId}/tasks`).send({
      title: "Calendar dedupe probe",
      priority: "low",
      status: "not_started",
      dueAt: "2026-09-01T10:00:00Z",
      dependencyIds: [],
    });
    expect(created.status).toBe(201);
    const probeKey = `task:${created.body.id}`;
    await agent.patch(`/api/v1/events/${eventId}/tasks/${created.body.id}`).send({
      title: "Calendar dedupe probe (updated)",
      priority: "low",
      status: "not_started",
      dueAt: "2026-09-01T10:00:00Z",
      dependencyIds: [],
    });
    const after = await agent.get(`/api/v1/events/${eventId}/calendar`);
    const sameKey = after.body.filter((i: { key: string }) => i.key === probeKey);
    expect(sameKey.length).toBe(1);
    expect(sameKey[0].title).toContain("(updated)");
    await agent.delete(`/api/v1/events/${eventId}/tasks/${created.body.id}`);
  });

  it("serves a workspace-wide calendar feed", async () => {
    const res = await agent.get("/api/v1/calendar?workspaceId=1");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body[0].eventId).toBeDefined();
  });

  it("merges manual timeline entries with auto-generated items", async () => {
    const marker = `Manual${Date.now()}`;
    const created = await agent.post(`/api/v1/events/${eventId}/timeline`).send({
      title: marker,
      type: "rehearsal",
      startAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(created.status).toBe(201);

    const list = await agent.get(`/api/v1/events/${eventId}/timeline`);
    const manual = list.body.find((e: { title: string }) => e.title === marker);
    expect(manual.source).toBe("manual");
    const autoItems = list.body.filter((e: { source: string }) => e.source === "auto");
    expect(autoItems.length).toBeGreaterThan(0);
    // Auto entries carry their stable source key as id
    expect(String(autoItems[0].id)).toContain(":");

    // Manual entry remains editable/deletable
    const del = await agent.delete(`/api/v1/events/${eventId}/timeline/${created.body.id}`);
    expect(del.status).toBe(200);
  });

  it("filters tasks and reports blocking dependencies", async () => {
    const all = await agent.get(`/api/v1/events/${eventId}/tasks`);
    expect(all.status).toBe(200);
    const blocked = all.body.find((t: { blockedBy: unknown[] }) => t.blockedBy.length > 0);
    expect(blocked).toBeDefined();
    expect(blocked.blockedBy[0].title).toBeTruthy();

    const byStatus = await agent.get(`/api/v1/events/${eventId}/tasks?status=completed`);
    expect(byStatus.body.every((t: { status: string }) => t.status === "completed")).toBe(true);

    const bySearch = await agent.get(`/api/v1/events/${eventId}/tasks?q=catering`);
    expect(bySearch.body.length).toBeGreaterThan(0);
    expect(bySearch.body[0].title.toLowerCase()).toContain("catering");

    const none = await agent.get(`/api/v1/events/${eventId}/tasks?q=zzz-no-such-task`);
    expect(none.body.length).toBe(0);
  });

  it("searches vendors and returns a financial summary", async () => {
    const search = await agent.get("/api/v1/vendors?workspaceId=1&q=lakeside");
    expect(search.status).toBe(200);
    expect(search.body.length).toBe(1);
    const vendorId = search.body[0].id;

    const summary = await agent.get(`/api/v1/vendors/${vendorId}?workspaceId=1`);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.events).toBeGreaterThan(0);
    expect(Number(summary.body.summary.agreed)).toBe(500000);
    expect(Number(summary.body.summary.paid)).toBe(500000);
    expect(summary.body.links[0].event.name).toBeTruthy();

    const none = await agent.get("/api/v1/vendors?workspaceId=1&q=zzz-no-such-vendor");
    expect(none.body.length).toBe(0);

    // Outsiders cannot read the summary
    const outsider = request.agent(BASE);
    await outsider.post("/api/v1/auth/register").send({
      email: `outsider-p5-${Date.now()}@example.com`,
      password: "Outsider123!",
      name: "Outsider",
    });
    const denied = await outsider.get(`/api/v1/vendors/${vendorId}?workspaceId=1`);
    expect(denied.status).toBe(403);
  });

  it("offers a CSV template and a dry-run import preview that writes nothing", async () => {
    const template = await agent.get(`/api/v1/events/${eventId}/guests/import/template`);
    expect(template.status).toBe(200);
    expect(template.headers["content-type"]).toContain("text/csv");
    expect(template.text).toContain("First Name,Last Name");
    expect(template.text).toContain("Jane,Doe");

    const marker = `DryRun${Date.now()}`;
    const preview = await agent
      .post(`/api/v1/events/${eventId}/guests/import`)
      .send({ csv: `First Name,Last Name\n${marker},Person\nBad Row Without Columns,`, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.imported).toBe(1);

    // Nothing was written
    const guests = await agent.get(`/api/v1/events/${eventId}/guests?q=${marker}`);
    expect(guests.body.guests.length).toBe(0);

    // Real import of the same row now works (proves dry run did not mark it seen)
    const real = await agent
      .post(`/api/v1/events/${eventId}/guests/import`)
      .send({ csv: `First Name,Last Name\n${marker},Person` });
    expect(real.body.imported).toBe(1);
    const after = await agent.get(`/api/v1/events/${eventId}/guests?q=${marker}`);
    expect(after.body.guests.length).toBe(1);
  });

  it("links documents to vendors and tasks with validation", async () => {
    const links = await agent.get(`/api/v1/events/${eventId}/vendors`);
    const vendorId = links.body[0].vendorId;
    const tasks = await agent.get(`/api/v1/events/${eventId}/tasks`);
    const taskId = tasks.body[0].id;

    const vendorDoc = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("category", "contract")
      .field("linkedType", "vendor")
      .field("linkedId", String(vendorId))
      .attach("file", Buffer.from("%PDF-1.4 contract"), "contract.pdf");
    expect(vendorDoc.status).toBe(201);
    expect(vendorDoc.body.linkedType).toBe("vendor");
    expect(String(vendorDoc.body.linkedId)).toBe(String(vendorId));

    const taskDoc = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("linkedType", "task")
      .field("linkedId", String(taskId))
      .attach("file", Buffer.from("%PDF-1.4 checklist"), "checklist.pdf");
    expect(taskDoc.status).toBe(201);

    // Invalid links are rejected
    const badType = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("linkedType", "user")
      .field("linkedId", "1")
      .attach("file", Buffer.from("%PDF-1.4 x"), "x.pdf");
    expect(badType.status).toBe(400);

    const badVendor = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("linkedType", "vendor")
      .field("linkedId", "99999999")
      .attach("file", Buffer.from("%PDF-1.4 x"), "x.pdf");
    expect(badVendor.status).toBe(400);
  });
});
