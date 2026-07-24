/**
 * Integration test against a REAL PostgreSQL database.
 * Requires DATABASE_URL (see .env.example) and migrated + seeded schema:
 *   pnpm --filter @mep/api prisma:migrate && pnpm --filter @mep/api seed
 * Run: pnpm --filter @mep/api test:e2e
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const agent = request.agent(BASE);

async function login(email: string, password: string) {
  const res = await agent.post("/api/v1/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res;
}

let suiteEventId: number;

describe("My Event Planner API (e2e)", () => {
  // Auth endpoints are rate-limited (10/min) — log in once per suite run.
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);
    await login("demo@eventplanner.dev", "Demo1234!");
    // Dedicated suite event — never mutate the seeded demo event, so browser
    // assertions on its exact totals keep passing after this suite runs.
    const event = await agent.post("/api/v1/events").send({
      workspaceId: 1,
      name: `IntegrationSuite ${Date.now()}`,
      type: "other",
      budgetAmount: 0,
      currency: "EUR",
    });
    expect(event.status).toBe(201);
    suiteEventId = event.body.id;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(BASE).get("/api/v1/workspaces");
    expect(res.status).toBe(401);
  });

  it("logs in the seeded demo user and lists workspaces", async () => {
    const res = await agent.get("/api/v1/workspaces");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].name).toBe("Demo Workspace");
  });

  it("returns generic response for unknown password resets", async () => {
    const res = await request(BASE)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
  });

  it("enforces the expense total invariant (subtotal + tax = total)", async () => {
    const res = await agent.post(`/api/v1/events/${suiteEventId}/expenses`).send({
      title: "Broken expense",
      expenseDate: new Date().toISOString(),
      subtotal: 1000,
      taxAmount: 190,
      totalAmount: 9999, // wrong on purpose
    });
    expect(res.status).toBe(400);
  });

  it("supports partial payments, blocks unconfirmed overpayment, reverses", async () => {
    const eventId = suiteEventId;
    const created = await agent.post(`/api/v1/events/${eventId}/expenses`).send({
      title: "E2E expense",
      expenseDate: new Date().toISOString(),
      subtotal: 10000,
      taxAmount: 1900,
      totalAmount: 11900,
    });
    expect(created.status).toBe(201);
    const expenseId = created.body.id;

    // Partial payment
    const p1 = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 5000, paidAt: new Date().toISOString(), method: "cash" });
    expect(p1.status).toBe(201);
    expect(p1.body.expenseStatus).toBe("partially_paid");

    // Overpayment without confirmation → 409
    const over = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 99999, paidAt: new Date().toISOString(), method: "cash" });
    expect(over.status).toBe(409);

    // Complete the payment
    const p2 = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 6900, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(p2.status).toBe(201);
    expect(p2.body.expenseStatus).toBe("paid");

    // Reverse the first payment → back to partially_paid
    const rev = await agent
      .post(`/api/v1/events/${eventId}/payments/${p1.body.payment.id}/reverse`)
      .send({ reason: "Duplicate entry" });
    expect(rev.status).toBe(200);
    expect(rev.body.expenseStatus).toBe("partially_paid");

    // History preserved: reversed payment still listed
    const payments = await agent.get(`/api/v1/events/${eventId}/payments`);
    const reversed = payments.body.find((p: { id: number }) => p.id === p1.body.payment.id);
    expect(reversed.reversedAt).toBeTruthy();
    expect(reversed.reversalReason).toBe("Duplicate entry");
  });

  it("blocks viewers from writing", async () => {
    const viewer = request.agent(BASE);
    await viewer
      .post("/api/v1/auth/login")
      .send({ email: "viewer@eventplanner.dev", password: "Demo1234!" });
    const events = await viewer.get("/api/v1/events?workspaceId=1");
    expect(events.status).toBe(200);
    const res = await viewer.post(`/api/v1/events/${events.body[0].id}/expenses`).send({
      title: "Should fail",
      expenseDate: new Date().toISOString(),
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
    });
    expect(res.status).toBe(403);
  });
});
