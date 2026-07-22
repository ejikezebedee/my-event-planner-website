/**
 * Phase 8 hardening e2e: cross-workspace isolation for the Phase 5–7
 * endpoints, upload content sniffing, and session lifecycle.
 * Requires a running API + seeded DB (same setup as security.e2e-spec.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const demo = request.agent(BASE);
const outsider = request.agent(BASE);

const unique = Date.now().toString(36);

describe("hardening: cross-workspace coverage of operational endpoints", () => {
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);

    await demo
      .post("/api/v1/auth/login")
      .send({ email: "demo@eventplanner.dev", password: "Demo1234!" });
    const reg = await outsider.post("/api/v1/auth/register").send({
      name: "Outsider Hardening",
      email: `outsider-h-${unique}@example.com`,
      password: "Outsider123!",
    });
    expect(reg.status).toBe(201);
  });

  it("hides Phase 5–7 event endpoints of other workspaces (404)", async () => {
    for (const path of [
      "/api/v1/events/1/calendar",
      "/api/v1/events/1/timeline",
      "/api/v1/events/1/budget",
      "/api/v1/events/1/vendors",
      "/api/v1/events/1/guests/import/template",
      "/api/v1/events/1/guests/export",
      "/api/v1/events/1/reports/task_progress",
      "/api/v1/events/1/reports/guest_list",
    ]) {
      const res = await outsider.get(path);
      expect(res.status, path).toBe(404);
    }
  });

  it("denies workspace-scoped calendar and vendors to non-members", async () => {
    const cal = await outsider.get("/api/v1/calendar?workspaceId=1");
    expect(cal.status).toBe(403);
    const vendors = await outsider.get("/api/v1/vendors?workspaceId=1");
    expect(vendors.status).toBe(403);
    const summary = await outsider.get("/api/v1/vendors/1?workspaceId=1");
    expect([403, 404]).toContain(summary.status);
  });

  it("denies writes to foreign events via operational endpoints", async () => {
    const task = await outsider.post("/api/v1/events/1/tasks").send({ title: "Malicious task" });
    expect(task.status).toBe(404);
    const entry = await outsider
      .post("/api/v1/events/1/timeline")
      .send({ title: "Malicious entry", startAt: new Date().toISOString() });
    expect(entry.status).toBe(404);
    const guest = await outsider
      .post("/api/v1/events/1/guests")
      .send({ firstName: "Malicious", lastName: "Guest" });
    expect(guest.status).toBe(404);
  });

  it("never shows another user's notifications", async () => {
    const res = await outsider.get("/api/v1/notifications");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const n of res.body) {
      expect(String(n.eventId)).not.toBe("1");
    }
    // Foreign notification ids cannot be read/deleted cross-user (demo's ids unknown to outsider → no-op, not leak).
    const count = await outsider.get("/api/v1/notifications/unread-count");
    expect(count.status).toBe(200);
  });

  it("rejects unauthenticated requests on protected routes (401)", async () => {
    const anon = request(BASE);
    for (const path of [
      "/api/v1/events?workspaceId=1",
      "/api/v1/notifications",
      "/api/v1/calendar?workspaceId=1",
      "/api/v1/auth/me",
    ]) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it("logout revokes the session immediately", async () => {
    const agent = request.agent(BASE);
    const reg = await agent.post("/api/v1/auth/register").send({
      name: "Logout Probe",
      email: `logout-${unique}@example.com`,
      password: "Logout123!",
    });
    expect(reg.status).toBe(201);
    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    const out = await agent.post("/api/v1/auth/logout");
    expect(out.status).toBe(200);
    const after = await agent.get("/api/v1/auth/me");
    expect(after.status).toBe(401);
  });
});

describe("hardening: upload content security", () => {
  it("rejects content that does not match its extension", async () => {
    const res = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", Buffer.from("<script>alert(1)</script>"), "xss.png");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it("rejects HTML masquerading as a PDF", async () => {
    const res = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", Buffer.from("<html><body>fake</body></html>"), "invoice.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it("accepts a real PNG signature", async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("fake-png-body"),
    ]);
    const res = await demo.post("/api/v1/events/1/documents").attach("file", png, "image.png");
    expect(res.status).toBe(201);
    await demo.delete(`/api/v1/documents/${res.body.id}`);
  });

  it("sanitises path-traversal filenames", async () => {
    const content = Buffer.from("%PDF-1.4 traversal probe");
    const up = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", content, "../../evil.pdf");
    expect(up.status).toBe(201);
    // The storage key is server-generated — no path segments possible.
    expect(up.body.storageKey).toMatch(/^[a-z0-9-]+\.pdf$/);
    const down = await demo.get(`/api/v1/documents/${up.body.id}/download`);
    expect(down.status).toBe(200);
    expect(down.body.equals(content)).toBe(true);
    await demo.delete(`/api/v1/documents/${up.body.id}`);
  });
});
