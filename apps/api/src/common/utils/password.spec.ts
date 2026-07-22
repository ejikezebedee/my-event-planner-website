import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Sup3rSecret!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces unique salts", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("generateToken", () => {
  it("creates URL-safe unique tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
