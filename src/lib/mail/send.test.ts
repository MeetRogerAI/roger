import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { renderEmail } from "./layout";
import { alertAdmins, claim, sendToUser, type Transport } from "./send";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
const msg = renderEmail({ subject: "Hello", paragraphs: ["One line."] });
const user = { id: "11111111-1111-1111-1111-111111111111", email: "a@example.com" };
const noSleep = async () => {};

function recorder(results: Awaited<ReturnType<Transport>>[] = []) {
  const calls: Parameters<Transport>[0][] = [];
  const t: Transport = async (m) => {
    calls.push(m);
    return results.shift() ?? { ok: true };
  };
  return { t, calls };
}

beforeEach(async () => {
  ({ query } = await testDb());
  process.env.ADMIN_EMAILS = "peter@example.com, ehab@example.com";
});

describe("sendToUser", () => {
  it("sends once and records it", async () => {
    const { t, calls } = recorder();
    expect(await sendToUser(user, "welcome", "signup", msg, { query, transport: t, sleep: noSleep })).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0].idempotencyKey).toBe(`welcome/${user.id}/signup`);
    const [row] = await query<{ status: string }>("select status from notifications");
    expect(row.status).toBe("sent");
  });

  it("sends nothing the second time for the same trigger", async () => {
    const { t, calls } = recorder();
    await sendToUser(user, "welcome", "signup", msg, { query, transport: t, sleep: noSleep });
    expect(await sendToUser(user, "welcome", "signup", msg, { query, transport: t, sleep: noSleep })).toBe("already");
    expect(calls).toHaveLength(1);
  });

  it("sends once when two calls race for the same trigger", async () => {
    const { t, calls } = recorder();
    const r = await Promise.all([
      sendToUser(user, "welcome", "x", msg, { query, transport: t, sleep: noSleep }),
      sendToUser(user, "welcome", "x", msg, { query, transport: t, sleep: noSleep }),
    ]);
    expect(r.sort()).toEqual(["already", "sent"]);
    expect(calls).toHaveLength(1);
  });

  it("retries a rate limit inside one send and records one email", async () => {
    const { t, calls } = recorder([{ ok: false, error: "resend 429", retryable: true }, { ok: true }]);
    expect(await sendToUser(user, "welcome", "y", msg, { query, transport: t, sleep: noSleep })).toBe("sent");
    expect(calls).toHaveLength(2);
    expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
  });

  it("lets the next trigger send after a failure, and stops after three attempts with an admin alert", async () => {
    const calls: Parameters<Transport>[0][] = [];
    const t: Transport = async (m) => {
      calls.push(m);
      return m.to[0] === user.email ? { ok: false, error: "resend 500", retryable: false } : { ok: true };
    };
    const deps = { query, transport: t, sleep: noSleep };
    expect(await sendToUser(user, "receipt", "inv_1", msg, deps)).toBe("failed");
    expect(await sendToUser(user, "receipt", "inv_1", msg, deps)).toBe("failed");
    expect(await sendToUser(user, "receipt", "inv_1", msg, deps)).toBe("failed");
    expect(await sendToUser(user, "receipt", "inv_1", msg, deps)).toBe("already");
    const userSends = calls.filter((c) => c.to[0] === user.email);
    expect(userSends).toHaveLength(3);
    // Every failure was non-retryable, so each one alerted; one alert row per (kind, ref).
    const alerts = await query<{ kind: string }>("select kind from notifications where recipient = 'admins'");
    expect(alerts.map((a) => a.kind)).toEqual(["email_failed:receipt"]);
  });

  it("skips an email the user switched off, and still sends billing email", async () => {
    const { t, calls } = recorder();
    const optedOut = { ...user, emailPrefs: { monday: false } };
    expect(await sendToUser(optedOut, "monday_list", "2026-11-23", msg, { query, transport: t, sleep: noSleep })).toBe("skipped");
    expect(await sendToUser(optedOut, "charge_failed", "2026-11-23/1", msg, { query, transport: t, sleep: noSleep })).toBe("sent");
    expect(calls).toHaveLength(1);
  });
});

describe("claim", () => {
  it("never re-claims a sent row and takes over one stuck in sending", async () => {
    expect(await claim(query, "u", "k", "r")).toBe(1);
    expect(await claim(query, "u", "k", "r")).toBeNull();
    await query("update notifications set claimed_at = now() - interval '20 minutes'");
    expect(await claim(query, "u", "k", "r")).toBe(2);
    await query("update notifications set status = 'sent'");
    await query("update notifications set claimed_at = now() - interval '20 minutes'");
    expect(await claim(query, "u", "k", "r")).toBeNull();
  });
});

describe("alertAdmins", () => {
  it("sends one email to both admins, once per (kind, ref)", async () => {
    const { t, calls } = recorder();
    expect(await alertAdmins("cora_failed", "2026-11-23", msg, { query, transport: t, sleep: noSleep })).toBe("sent");
    expect(await alertAdmins("cora_failed", "2026-11-23", msg, { query, transport: t, sleep: noSleep })).toBe("already");
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toEqual(["peter@example.com", "ehab@example.com"]);
  });

  it("does nothing when no admin address is set", async () => {
    process.env.ADMIN_EMAILS = "";
    const { t, calls } = recorder();
    expect(await alertAdmins("x", "y", msg, { query, transport: t })).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
