/**
 * Phase 4 — Financial Core e2e tests against a REAL PostgreSQL database.
 * Covers refunds, expense restore, gross-only expenses, search/filter/sort,
 * CSV export, budget item variance, and receipt/proof-of-payment linking.
 * Run: pnpm --filter @mep/api test:e2e
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const agent = request.agent(BASE);

let eventId: number;

async function createExpense(overrides: Record<string, unknown> = {}) {
  const res = await agent.post(`/api/v1/events/${eventId}/expenses`).send({
    title: "Financial test expense",
    expenseDate: new Date().toISOString(),
    subtotal: 10000,
    taxAmount: 1900,
    totalAmount: 11900,
    ...overrides,
  });
  return res;
}

describe("Financial Core (e2e)", () => {
  // Auth endpoints are rate-limited — log in once per suite run.
  beforeAll(async () => {
    const health = await request(BASE).get("/api/v1/health");
    expect(health.status).toBe(200);
    const res = await agent
      .post("/api/v1/auth/login")
      .send({ email: "demo@eventplanner.dev", password: "Demo1234!" });
    expect(res.status).toBe(200);
    // Dedicated suite event: tests must never depend on (or mutate) the
    // seeded demo event, so browser assertions on seeded totals stay valid.
    const event = await agent.post("/api/v1/events").send({
      workspaceId: 1,
      name: `FinancialSuite ${Date.now()}`,
      type: "other",
      budgetAmount: 0,
      currency: "EUR",
    });
    expect(event.status).toBe(201);
    eventId = event.body.id;
  });

  it("records refunds, enforces refundable limits, derives refunded status", async () => {
    const created = await createExpense({ title: "Refund flow" });
    expect(created.status).toBe(201);
    const expenseId = created.body.id;

    const pay = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 11900, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(pay.status).toBe(201);
    expect(pay.body.expenseStatus).toBe("paid");
    const paymentId = pay.body.payment.id;

    // Partial refund → partially_paid
    const r1 = await agent
      .post(`/api/v1/events/${eventId}/payments/${paymentId}/refund`)
      .send({ amount: 4000, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(r1.status).toBe(201);
    expect(r1.body.expenseStatus).toBe("partially_paid");
    expect(r1.body.refund.type).toBe("refund");
    expect(String(r1.body.refund.refundOfPaymentId)).toBe(String(paymentId));

    // Over-refund → 409
    const tooMuch = await agent
      .post(`/api/v1/events/${eventId}/payments/${paymentId}/refund`)
      .send({ amount: 99999, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(tooMuch.status).toBe(409);

    // Refund the remainder → refunded
    const r2 = await agent
      .post(`/api/v1/events/${eventId}/payments/${paymentId}/refund`)
      .send({ amount: 7900, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(r2.status).toBe(201);
    expect(r2.body.expenseStatus).toBe("refunded");

    // Cannot refund a refund
    const nested = await agent
      .post(`/api/v1/events/${eventId}/payments/${r1.body.refund.id}/refund`)
      .send({ amount: 100, paidAt: new Date().toISOString(), method: "cash" });
    expect(nested.status).toBe(400);

    // Net paid reflects refunds
    const expense = await agent.get(`/api/v1/events/${eventId}/expenses/${expenseId}`);
    const net = expense.body.payments
      .filter((p: { reversedAt: string | null }) => !p.reversedAt)
      .reduce(
        (s: number, p: { type: string; amount: number }) =>
          p.type === "refund" ? s - Number(p.amount) : s + Number(p.amount),
        0,
      );
    expect(net).toBe(0);
  });

  it("replays refund idempotency keys", async () => {
    const created = await createExpense({ title: "Idempotent refund" });
    const expenseId = created.body.id;
    const pay = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 11900, paidAt: new Date().toISOString(), method: "cash" });
    const paymentId = pay.body.payment.id;

    const key = `refund-e2e-${Date.now()}`;
    const first = await agent
      .post(`/api/v1/events/${eventId}/payments/${paymentId}/refund`)
      .send({ amount: 1000, paidAt: new Date().toISOString(), method: "cash", idempotencyKey: key });
    expect(first.status).toBe(201);
    const replay = await agent
      .post(`/api/v1/events/${eventId}/payments/${paymentId}/refund`)
      .send({ amount: 1000, paidAt: new Date().toISOString(), method: "cash", idempotencyKey: key });
    expect(replay.status).toBe(201);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(String(replay.body.refund.id)).toBe(String(first.body.refund.id));
  });

  it("cancels on delete with payments and restores with recomputed status", async () => {
    const created = await createExpense({ title: "Restore flow" });
    const expenseId = created.body.id;
    await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 5000, paidAt: new Date().toISOString(), method: "cash" });

    const del = await agent.delete(`/api/v1/events/${eventId}/expenses/${expenseId}`);
    expect(del.status).toBe(200);
    expect(del.body.cancelled).toBe(true);

    const restore = await agent.post(`/api/v1/events/${eventId}/expenses/${expenseId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.status).toBe("partially_paid");

    const after = await agent.get(`/api/v1/events/${eventId}/expenses/${expenseId}`);
    expect(after.body.status).toBe("partially_paid");

    // Restoring a non-cancelled expense is rejected
    const again = await agent.post(`/api/v1/events/${eventId}/expenses/${expenseId}/restore`);
    expect(again.status).toBe(400);
  });

  it("allows gross-only expenses to skip the subtotal+tax invariant", async () => {
    const ok = await createExpense({
      title: "Gross-only invoice",
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 25000,
      grossOnly: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.grossOnly).toBe(true);

    const notOk = await createExpense({
      title: "Bad invariant",
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 25000,
    });
    expect(notOk.status).toBe(400);
  });

  it("searches, filters and sorts expenses", async () => {
    // Run-unique marker: the database persists between runs.
    const marker = `Sortable${Date.now()}`;
    await createExpense({ title: `${marker} Alpha`, totalAmount: 1000, subtotal: 1000, taxAmount: 0 });
    await createExpense({ title: `${marker} Beta`, totalAmount: 9000, subtotal: 9000, taxAmount: 0 });

    const search = await agent.get(`/api/v1/events/${eventId}/expenses?q=${marker}`);
    expect(search.status).toBe(200);
    expect(search.body.length).toBe(2);

    const filtered = await agent.get(
      `/api/v1/events/${eventId}/expenses?q=${marker}&status=unpaid`,
    );
    expect(filtered.body.length).toBe(2);

    const sorted = await agent.get(
      `/api/v1/events/${eventId}/expenses?q=${marker}&sort=-totalAmount`,
    );
    expect(sorted.body[0].title).toBe(`${marker} Beta`);
    const asc = await agent.get(`/api/v1/events/${eventId}/expenses?q=${marker}&sort=totalAmount`);
    expect(asc.body[0].title).toBe(`${marker} Alpha`);
  });

  it("exports expenses as CSV", async () => {
    const marker = `Csv${Date.now()}`;
    await createExpense({ title: `${marker} Row`, totalAmount: 500, subtotal: 500, taxAmount: 0 });
    const res = await agent.get(`/api/v1/events/${eventId}/expenses/export?q=${marker}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("title,status");
    expect(res.text).toContain(`${marker} Row`);
    expect(res.text).not.toContain("Refund flow");
  });

  it("tracks budget item variance and utilisation from linked expenses", async () => {
    const created = await agent
      .post(`/api/v1/events/${eventId}/budget/categories`)
      .send({ name: "Variance category" });
    expect(created.status).toBe(201);
    const category = created.body;

    const item = await agent.post(`/api/v1/events/${eventId}/budget/items`).send({
      categoryId: Number(category.id),
      name: "Variance test item",
      plannedAmount: 20000,
      priority: "medium",
    });
    expect(item.status).toBe(201);

    const expense = await createExpense({
      title: "Linked to budget item",
      budgetItemId: Number(item.body.id),
      categoryId: Number(category.id),
      totalAmount: 11900,
      subtotal: 10000,
      taxAmount: 1900,
    });
    expect(expense.status).toBe(201);

    // Linking to a foreign budget item is rejected
    const badLink = await createExpense({ title: "Bad link", budgetItemId: 99999999 });
    expect(badLink.status).toBe(400);

    const after = await agent.get(`/api/v1/events/${eventId}/budget`);
    const updated = after.body.categories
      .flatMap((c: { items: unknown[] }) => c.items)
      .find((i: { id: number | string }) => String(i.id) === String(item.body.id)) as {
      actual: number;
      variance: number;
      utilisationPercent: number;
    };
    expect(Number(updated.actual)).toBe(11900);
    expect(updated.variance).toBe(8100); // 20000 - 11900, under budget
    expect(updated.utilisationPercent).toBe(59.5);
  });

  it("links documents to expenses and payments", async () => {
    const created = await createExpense({ title: "Documented expense" });
    const expenseId = created.body.id;
    const pay = await agent
      .post(`/api/v1/events/${eventId}/expenses/${expenseId}/payments`)
      .send({ amount: 11900, paidAt: new Date().toISOString(), method: "cash" });
    const paymentId = pay.body.payment.id;

    const upload = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("category", "receipt")
      .field("expenseId", String(expenseId))
      .field("paymentId", String(paymentId))
      .attach("file", Buffer.from("%PDF-1.4 fake receipt"), "receipt.pdf");
    expect(upload.status).toBe(201);
    expect(String(upload.body.expenseId)).toBe(String(expenseId));
    expect(String(upload.body.paymentId)).toBe(String(paymentId));

    const filtered = await agent.get(
      `/api/v1/events/${eventId}/documents?expenseId=${expenseId}`,
    );
    expect(filtered.body.length).toBe(1);

    const byPayment = await agent.get(
      `/api/v1/events/${eventId}/documents?paymentId=${paymentId}`,
    );
    expect(byPayment.body.length).toBe(1);

    // Foreign links are rejected
    const badUpload = await agent
      .post(`/api/v1/events/${eventId}/documents`)
      .field("expenseId", "99999999")
      .attach("file", Buffer.from("%PDF-1.4 fake"), "x.pdf");
    expect(badUpload.status).toBe(400);
  });

  it("event overview totals are refund-aware", async () => {
    // Self-contained probe: its own event so suite order cannot interfere.
    const event = await agent.post("/api/v1/events").send({
      workspaceId: 1,
      name: `TotalsProbe ${Date.now()}`,
      type: "other",
      budgetAmount: 100000,
      currency: "EUR",
    });
    expect(event.status).toBe(201);
    const probeId = event.body.id;

    const expense = await agent.post(`/api/v1/events/${probeId}/expenses`).send({
      title: "Totals probe expense",
      expenseDate: new Date().toISOString(),
      subtotal: 40000,
      taxAmount: 0,
      totalAmount: 40000,
    });
    expect(expense.status).toBe(201);
    const payment = await agent
      .post(`/api/v1/events/${probeId}/expenses/${expense.body.id}/payments`)
      .send({ amount: 30000, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(payment.status).toBe(201);
    const refund = await agent
      .post(`/api/v1/events/${probeId}/payments/${payment.body.payment.id}/refund`)
      .send({ amount: 5000, paidAt: new Date().toISOString(), method: "bank_transfer" });
    expect(refund.status).toBe(201);

    const overview = await agent.get(`/api/v1/events/${probeId}`);
    expect(overview.status).toBe(200);
    // 30.000 paid − 5.000 refunded = 25.000 net, not 35.000 gross.
    expect(overview.body.totals.paid).toBe(25000);
    expect(overview.body.totals.actual).toBe(40000);
  });
});
