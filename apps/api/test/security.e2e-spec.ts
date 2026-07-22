/**
 * Security e2e: cross-workspace isolation and upload security.
 * Requires a running API + seeded DB (same setup as app.e2e-spec.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const demo = request.agent(BASE);
const outsider = request.agent(BASE);

const unique = Date.now().toString(36);

describe("security: isolation and uploads (e2e)", () => {
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);

    await demo.post("/api/v1/auth/login").send({ email: "demo@eventplanner.dev", password: "Demo1234!" });
    // A second, unrelated user with their own default workspace.
    const reg = await outsider.post("/api/v1/auth/register").send({
      name: "Outsider",
      email: `outsider-${unique}@example.com`,
      password: "Outsider123!",
    });
    expect(reg.status).toBe(201);
  });

  it("hides events of other workspaces (404, not 403)", async () => {
    for (const path of [
      "/api/v1/events/1",
      "/api/v1/events/1/expenses",
      "/api/v1/events/1/payments",
      "/api/v1/events/1/guests",
      "/api/v1/events/1/tasks",
      "/api/v1/events/1/documents",
      "/api/v1/events/1/reports/budget_summary",
    ]) {
      const res = await outsider.get(path);
      expect(res.status, path).toBe(404);
    }
  });

  it("denies writes into foreign workspaces", async () => {
    const res = await outsider.post("/api/v1/events/1/expenses").send({
      title: "Malicious",
      expenseDate: new Date().toISOString(),
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
    });
    expect(res.status).toBe(404);
  });

  it("denies workspace member listing to non-members", async () => {
    const res = await outsider.get("/api/v1/workspaces/1/members");
    expect(res.status).toBe(403);
  });

  it("denies workspace-scoped dashboard to non-members", async () => {
    const res = await outsider.get("/api/v1/dashboard?workspaceId=1");
    expect(res.status).toBe(403);
  });

  it("the outsider's own workspace contains no foreign events", async () => {
    const workspaces = await outsider.get("/api/v1/workspaces");
    expect(workspaces.status).toBe(200);
    expect(workspaces.body).toHaveLength(1);
    const events = await outsider.get(`/api/v1/events?workspaceId=${workspaces.body[0].id}`);
    expect(events.status).toBe(200);
    expect(events.body).toHaveLength(0);
  });

  it("rejects executable uploads", async () => {
    const res = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", Buffer.from("MZ fake executable"), "virus.exe");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not allowed/i);
  });

  it("rejects unsupported file types", async () => {
    const res = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", Buffer.from("x"), "archive.zip");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported/i);
  });

  it("rejects oversized uploads", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1); // 11 MB > 10 MB limit
    const res = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", big, "big.pdf");
    expect(res.status).toBe(413);
  });

  it("accepts a legitimate document and serves it back", async () => {
    const content = Buffer.from("%PDF-1.4 fake but harmless test document");
    const up = await demo
      .post("/api/v1/events/1/documents")
      .attach("file", content, "contract.pdf");
    expect(up.status).toBe(201);

    const down = await demo.get(`/api/v1/documents/${up.body.id}/download`);
    expect(down.status).toBe(200);
    expect(down.body.equals(content)).toBe(true);

    // The outsider cannot download it.
    const forbidden = await outsider.get(`/api/v1/documents/${up.body.id}/download`);
    expect(forbidden.status).toBe(404);

    await demo.delete(`/api/v1/documents/${up.body.id}`);
  });
});
