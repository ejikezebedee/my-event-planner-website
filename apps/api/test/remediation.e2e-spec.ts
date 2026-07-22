/**
 * Production hardening remediation — e2e proof for the release-blocker fixes.
 * Each describe maps to a finding id from the remediation program:
 *
 *   C2  idempotency isolation across events
 *   C3  production config fail-fast
 *   C4  email verification enforcement
 *   C5  planner cannot perform admin actions
 *   C11 safe account deletion
 *   C12 workspace ownership transfer
 *   H1  email-change reverification
 *   H2  malware-scan abstraction (no-op engine marks uploads clean)
 *   H4  contact-form honeypot
 *
 * Most tests run against the main API on :4000 (verification gate OFF, as in
 * dev/test). The C4 gate is proven against a second API instance booted on
 * :4100 with REQUIRE_EMAIL_VERIFICATION=true.
 *
 * Run: pnpm --filter @mep/api test:e2e
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWriteStream, readFileSync } from "fs";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import request from "supertest";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const GATE_BASE = process.env.GATE_API_BASE_URL ?? "http://localhost:4100";
const LOG_PATH = process.env.API_LOG_PATH ?? "/tmp/api.log";
const GATE_LOG_PATH = "/tmp/api-4100.log";

const owner = request.agent(BASE); // workspace owner (user A)
const planner = request.agent(BASE); // workspace planner (user B)
const run = Date.now().toString(36);
const OWNER_EMAIL = `rem-owner-${run}@example.com`;
const PLANNER_EMAIL = `rem-planner-${run}@example.com`;
const PASSWORD = "Remediation123!";

type LinkKind = "verify-email" | "invite" | "confirm-email-change";

/** Pull the newest emailed link token of a kind from a console-mailer log. */
async function emailedToken(kind: LinkKind, to: string, logPath: string = LOG_PATH): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    let log = "";
    try {
      log = readFileSync(logPath, "utf8");
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

/** Register + verify + login a fresh account on the given agent/base. */
async function verifiedAccount(
  agent: ReturnType<typeof request.agent>,
  email: string,
  name: string,
  logPath: string = LOG_PATH,
) {
  const reg = await agent.post("/api/v1/auth/register").send({ name, email, password: PASSWORD });
  expect(reg.status).toBe(201);
  const token = await emailedToken("verify-email", email, logPath);
  const verify = await agent.post("/api/v1/auth/verify-email").send({ token });
  expect(verify.status).toBe(200);
  const login = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
}

let workspaceId: number;
let eventA: number; // used for C2/C5/H2
let eventB: number; // second event for C2 cross-event scope
let expenseA: number;
let expenseB: number;

beforeAll(async () => {
  await verifiedAccount(owner, OWNER_EMAIL, "Remediation Owner");
  const ws = await owner.post("/api/v1/workspaces").send({ name: "Remediation Workspace" });
  expect(ws.status).toBe(201);
  workspaceId = ws.body.id;
  for (const name of ["Remediation Event A", "Remediation Event B"]) {
    const ev = await owner.post("/api/v1/events").send({ workspaceId, name, type: "corporate", currency: "EUR" });
    expect(ev.status).toBe(201);
    if (!eventA) eventA = ev.body.id;
    else eventB = ev.body.id;
  }
  for (const [eventId, title] of [
    [eventA, "Expense A"],
    [eventB, "Expense B"],
  ] as const) {
    const ex = await owner.post(`/api/v1/events/${eventId}/expenses`).send({
      title,
      expenseDate: new Date().toISOString(),
      subtotal: 100000,
      taxAmount: 0,
      totalAmount: 100000,
    });
    expect(ex.status).toBe(201);
    if (eventId === eventA) expenseA = ex.body.id;
    else expenseB = ex.body.id;
  }
}, 60_000);

describe("C2 — idempotency is scoped per event (no cross-event collision or leak)", () => {
  const KEY = `c2-key-${run}`;
  let firstPaymentId: number;

  it("records a payment with an idempotency key", async () => {
    const res = await owner
      .post(`/api/v1/events/${eventA}/expenses/${expenseA}/payments`)
      .send({ amount: 10000, paidAt: new Date().toISOString(), method: "bank_transfer", idempotencyKey: KEY });
    expect(res.status).toBe(201);
    firstPaymentId = res.body.payment.id;
    expect(res.body.idempotentReplay).toBe(false);
  });

  it("replaying the same key in the SAME event returns the same record", async () => {
    const res = await owner
      .post(`/api/v1/events/${eventA}/expenses/${expenseA}/payments`)
      .send({ amount: 10000, paidAt: new Date().toISOString(), method: "bank_transfer", idempotencyKey: KEY });
    expect(res.status).toBe(201);
    expect(res.body.idempotentReplay).toBe(true);
    expect(res.body.payment.id).toBe(firstPaymentId);
  });

  it("the same key in a DIFFERENT event is a distinct operation — not a replay", async () => {
    const res = await owner
      .post(`/api/v1/events/${eventB}/expenses/${expenseB}/payments`)
      .send({ amount: 10000, paidAt: new Date().toISOString(), method: "bank_transfer", idempotencyKey: KEY });
    expect(res.status).toBe(201);
    expect(res.body.idempotentReplay).toBe(false);
    expect(res.body.payment.id).not.toBe(firstPaymentId);

    // And event A still shows exactly one payment for its expense.
    const listA = await owner.get(`/api/v1/events/${eventA}/payments`);
    expect(listA.status).toBe(200);
    const forExpense = listA.body.filter((p: { expenseId: number }) => Number(p.expenseId) === expenseA);
    expect(forExpense).toHaveLength(1);
  });
});

describe("C5 — planners cannot perform event admin actions", () => {
  beforeAll(async () => {
    await verifiedAccount(planner, PLANNER_EMAIL, "Remediation Planner");
    // Invite as workspace planner and accept.
    const invite = await owner
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .send({ email: PLANNER_EMAIL, role: "planner" });
    expect([200, 201]).toContain(invite.status);
    const token = await emailedToken("invite", PLANNER_EMAIL);
    const accept = await planner.post("/api/v1/workspaces/invitations/accept").send({ token });
    expect(accept.status).toBe(200);
    // Owner grants the planner event-level membership too.
    const plannerUser = await planner.get("/api/v1/auth/me");
    const add = await owner
      .post(`/api/v1/events/${eventA}/members`)
      .send({ userId: plannerUser.body.id, role: "planner" });
    expect([200, 201]).toContain(add.status);
  }, 60_000);

  it("planner has ordinary write access (sanity)", async () => {
    const res = await planner.post(`/api/v1/events/${eventA}/expenses`).send({
      title: "Planner-created expense",
      expenseDate: new Date().toISOString(),
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
    });
    expect(res.status).toBe(201);
  });

  it("planner cannot delete/archive the event (403)", async () => {
    const res = await planner.delete(`/api/v1/events/${eventA}`);
    expect(res.status).toBe(403);
  });

  it("planner cannot manage event membership (403)", async () => {
    const res = await planner.post(`/api/v1/events/${eventA}/members`).send({ userId: 1, role: "viewer" });
    expect(res.status).toBe(403);
  });

  it("workspace owner retains admin actions (archive works)", async () => {
    const res = await owner.delete(`/api/v1/events/${eventB}`);
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true); // has financial records → archived, not deleted
    // Restore it again for later suites' cleanliness.
    const restore = await owner.post(`/api/v1/events/${eventB}/restore`);
    expect(restore.status).toBe(200);
  });
});

describe("C12 — workspace ownership transfer", () => {
  it("a non-owner cannot transfer ownership (403)", async () => {
    const res = await planner
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .send({ memberId: 1, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("the owner must confirm with the correct password (401 on wrong)", async () => {
    const members = await owner.get(`/api/v1/workspaces/${workspaceId}/members`);
    const target = members.body.find((m: { user: { email: string } }) => m.user.email === PLANNER_EMAIL);
    const res = await owner
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .send({ memberId: target.id, password: "WrongPassword123!" });
    expect(res.status).toBe(401);
  });

  it("successful transfer swaps roles: planner becomes owner, owner becomes admin", async () => {
    const members = await owner.get(`/api/v1/workspaces/${workspaceId}/members`);
    const target = members.body.find((m: { user: { email: string } }) => m.user.email === PLANNER_EMAIL);
    const res = await owner
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .send({ memberId: target.id, password: PASSWORD });
    expect(res.status).toBe(200);

    const after = await planner.get(`/api/v1/workspaces/${workspaceId}/members`);
    const roles = Object.fromEntries(
      after.body.map((m: { role: string; user: { email: string } }) => [m.user.email, m.role]),
    );
    expect(roles[PLANNER_EMAIL]).toBe("owner");
    expect(roles[OWNER_EMAIL]).toBe("admin");
  });
});

describe("H1 — email change requires re-verification of the new address", () => {
  const changer = request.agent(BASE);
  const OLD_EMAIL = `rem-change-${run}@example.com`;
  const NEW_EMAIL = `rem-changed-${run}@example.com`;

  it("setup: verified account", async () => {
    await verifiedAccount(changer, OLD_EMAIL, "Email Changer");
  }, 30_000);

  it("request requires the current password (401 on wrong)", async () => {
    const res = await changer.post("/api/v1/auth/change-email").send({ newEmail: NEW_EMAIL, password: "nope" });
    expect(res.status).toBe(401);
  });

  it("request sends a confirmation link to the NEW address; nothing changes yet", async () => {
    const res = await changer.post("/api/v1/auth/change-email").send({ newEmail: NEW_EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const me = await changer.get("/api/v1/auth/me");
    expect(me.body.email).toBe(OLD_EMAIL);
  });

  it("confirming switches the address and revokes all sessions", async () => {
    const token = await emailedToken("confirm-email-change", NEW_EMAIL);
    const confirm = await request(BASE).post("/api/v1/auth/confirm-email-change").send({ token });
    expect(confirm.status).toBe(200);

    // Old session is revoked.
    const me = await changer.get("/api/v1/auth/me");
    expect(me.status).toBe(401);

    // Login works with the NEW address (and not with the old one).
    const oldLogin = await request(BASE).post("/api/v1/auth/login").send({ email: OLD_EMAIL, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(BASE).post("/api/v1/auth/login").send({ email: NEW_EMAIL, password: PASSWORD });
    expect(newLogin.status).toBe(200);
  });
});

describe("C11 — safe account deletion", () => {
  const solo = request.agent(BASE);
  const shared = request.agent(BASE);
  const invitee = request.agent(BASE);
  const SOLO_EMAIL = `rem-solo-${run}@example.com`;
  const SHARED_EMAIL = `rem-shared-${run}@example.com`;
  const INVITEE_EMAIL = `rem-invitee-${run}@example.com`;

  it("setup: one account without workspaces, one owning a shared workspace", async () => {
    await verifiedAccount(solo, SOLO_EMAIL, "Solo User");
    await verifiedAccount(shared, SHARED_EMAIL, "Shared Owner");
    await verifiedAccount(invitee, INVITEE_EMAIL, "Invitee");
    const ws = await shared.post("/api/v1/workspaces").send({ name: "Shared Workspace" });
    expect(ws.status).toBe(201);
    const invite = await shared
      .post(`/api/v1/workspaces/${ws.body.id}/invitations`)
      .send({ email: INVITEE_EMAIL, role: "viewer" });
    expect([200, 201]).toContain(invite.status);
    const token = await emailedToken("invite", INVITEE_EMAIL);
    const accept = await invitee.post("/api/v1/workspaces/invitations/accept").send({ token });
    expect(accept.status).toBe(200);
  }, 60_000);

  it("deletion requires the password (401 on wrong)", async () => {
    const res = await solo.delete("/api/v1/auth/account").send({ password: "wrong", confirmation: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("owning a shared workspace blocks deletion (409 with guidance)", async () => {
    const res = await shared.delete("/api/v1/auth/account").send({ password: PASSWORD, confirmation: "DELETE" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/transfer ownership|remove all other members/i);
  });

  it("an account without shared ownership is deleted and cannot log in again", async () => {
    const res = await solo.delete("/api/v1/auth/account").send({ password: PASSWORD, confirmation: "DELETE" });
    expect(res.status).toBe(200);
    const login = await request(BASE).post("/api/v1/auth/login").send({ email: SOLO_EMAIL, password: PASSWORD });
    expect(login.status).toBe(401);
  });
});

describe("H4 — contact form honeypot silently drops bots", () => {
  it("a filled honeypot returns success but delivers nothing", async () => {
    const marker = `honeypot-${run}`;
    const res = await request(BASE).post("/api/v1/contact").send({
      name: "Spam Bot",
      email: "bot@example.com",
      subject: marker,
      message: "Buy my stuff, this is definitely spam.",
      consent: true,
      website: "http://spam.example.com", // honeypot — humans never fill this
    });
    expect(res.status).toBe(200);

    // Give the (non-existent) mail a moment, then prove nothing was queued.
    await new Promise((r) => setTimeout(r, 500));
    let log = "";
    try {
      log = readFileSync(LOG_PATH, "utf8");
    } catch {
      // no log yet
    }
    expect(log).not.toContain(`Contact form: ${marker}`);
  });
});

describe("H2 — uploads pass the malware-scan abstraction", () => {
  it("no-op engine (default) marks uploads clean and downloadable", async () => {
    const upload = await owner
      .post(`/api/v1/events/${eventA}/documents`)
      .field("category", "other")
      .attach("file", Buffer.from("plain text upload"), "notes.txt");
    expect(upload.status).toBe(201);
    expect(upload.body.scanStatus).toBe("clean");

    const download = await owner.get(`/api/v1/documents/${upload.body.id}/download`);
    expect(download.status).toBe(200);
  });
});

describe("C3 — production configuration fails fast", () => {
  const envScript = 'require("./dist/config/env.js").assertProductionConfig()';
  const baseEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://mep:mep@127.0.0.1:5433/mep_dev",
  };

  it("refuses to boot with localhost origins in production", () => {
    const res = spawnSync("node", ["-e", envScript], {
      cwd: __dirname + "/..",
      env: { ...baseEnv, WEB_ORIGIN: "http://localhost:3000", APP_BASE_URL: "http://localhost:3000" },
      encoding: "utf8",
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Refusing to start");
    expect(res.stderr).toContain("WEB_ORIGIN");
  });

  it("refuses to boot with console mail in production", () => {
    const res = spawnSync("node", ["-e", envScript], {
      cwd: __dirname + "/..",
      env: {
        ...baseEnv,
        WEB_ORIGIN: "https://app.example.com",
        APP_BASE_URL: "https://app.example.com",
        SESSION_COOKIE_SECURE: "true",
        EMAIL_PROVIDER: "console",
      },
      encoding: "utf8",
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("EMAIL_PROVIDER");
  });

  it("accepts a coherent production configuration", () => {
    const res = spawnSync("node", ["-e", envScript], {
      cwd: __dirname + "/..",
      env: {
        ...baseEnv,
        WEB_ORIGIN: "https://app.example.com",
        APP_BASE_URL: "https://app.example.com",
        SESSION_COOKIE_SECURE: "true",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
        REQUIRE_EMAIL_VERIFICATION: "true",
      },
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
  });
});

describe("C4 — email verification gate (dedicated API instance)", () => {
  let gateApi: ChildProcess | null = null;
  const GATE_EMAIL = `rem-gate-${run}@example.com`;

  beforeAll(async () => {
    gateApi = spawn("node", ["dist/main.js"], {
      cwd: __dirname + "/..",
      env: {
        ...process.env,
        API_PORT: "4100",
        REQUIRE_EMAIL_VERIFICATION: "true",
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://mep:mep@127.0.0.1:5433/mep_dev",
      },
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (gateApi.stdout) gateApi.stdout.pipe(createWriteStream(GATE_LOG_PATH));
    // Wait for the health endpoint.
    for (let i = 0; i < 60; i++) {
      try {
        const res = await request(GATE_BASE).get("/api/v1/health");
        if (res.status === 200) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("gate API did not start on :4100");
  }, 90_000);

  afterAll(() => {
    gateApi?.kill("SIGTERM");
  });

  it("an unverified account can log in but is blocked from the app (403)", async () => {
    const agent = request.agent(GATE_BASE);
    const reg = await agent.post("/api/v1/auth/register").send({
      name: "Gate User",
      email: GATE_EMAIL,
      password: PASSWORD,
    });
    expect(reg.status).toBe(201);
    const login = await agent.post("/api/v1/auth/login").send({ email: GATE_EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);

    const blocked = await agent.get("/api/v1/workspaces");
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/verify your email/i);

    // Identity essentials stay reachable.
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);
    expect((await agent.post("/api/v1/auth/resend-verification")).status).toBe(200);
  }, 30_000);

  it("after verification the same account gets full access", async () => {
    const token = await emailedToken("verify-email", GATE_EMAIL, GATE_LOG_PATH);
    const agent = request.agent(GATE_BASE);
    await agent.post("/api/v1/auth/login").send({ email: GATE_EMAIL, password: PASSWORD });
    const verify = await agent.post("/api/v1/auth/verify-email").send({ token });
    expect(verify.status).toBe(200);
    const allowed = await agent.get("/api/v1/workspaces");
    expect(allowed.status).toBe(200);
  }, 30_000);
});
