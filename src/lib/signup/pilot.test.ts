import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { consumeToken, userForToken } from "@/lib/auth/login-link";
import { testDb } from "@/test-helpers/pglite-db";
import { createPilotLink, revokePilotLinks } from "./pilot";

let query: Query;
const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;
const DAY = 86_400_000;

beforeEach(async () => {
  ({ query } = await testDb());
  process.env.ADMIN_EMAILS = "peter@example.com";
});

describe("createPilotLink", () => {
  it("makes the account and a 7-day link that opens the plan step, logged against the admin", async () => {
    const r = await createPilotLink(query, { email: "Robyn@Example.com", name: "Robyn M", createdBy: "peter@example.com" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [u] = await query<{ email: string; signup_step: string; email_verified_at: unknown }>("select email, signup_step, email_verified_at from users");
    expect(u).toMatchObject({ email: "robyn@example.com", signup_step: "plan", email_verified_at: null });
    const used = await consumeToken(query, tokenOf(r.link), new Date(Date.now() + 6 * DAY));
    expect(used).toMatchObject({ purpose: "pilot", nextPath: "/start/plan" });
    expect((await userForToken(query, used!))?.id).toBe(r.userId);
    const log = await query<{ admin_email: string; action: string }>("select admin_email, action from admin_actions");
    expect(log).toEqual([{ admin_email: "peter@example.com", action: "pilot_link" }]);
  });

  it("works once, and not after 7 days", async () => {
    const a = await createPilotLink(query, { email: "ken@example.com", name: "Ken F", createdBy: "peter@example.com" });
    if (!a.ok) throw new Error("expected ok");
    expect(await consumeToken(query, tokenOf(a.link))).not.toBeNull();
    expect(await consumeToken(query, tokenOf(a.link))).toBeNull();
    const b = await createPilotLink(query, { email: "ken@example.com", name: "Ken F", createdBy: "peter@example.com" });
    if (!b.ok) throw new Error("expected ok");
    expect(await consumeToken(query, tokenOf(b.link), new Date(Date.now() + 8 * DAY))).toBeNull();
  });

  it("can be revoked before it is used", async () => {
    const r = await createPilotLink(query, { email: "ken@example.com", name: "Ken F", createdBy: "peter@example.com" });
    if (!r.ok) throw new Error("expected ok");
    expect(await revokePilotLinks(query, r.userId)).toBe(1);
    expect(await consumeToken(query, tokenOf(r.link))).toBeNull();
  });

  it("is refused for an admin address and for someone already past sign-up", async () => {
    expect(await createPilotLink(query, { email: "peter@example.com", name: "Peter", createdBy: "peter@example.com" })).toEqual({ ok: false, reason: "admin_address" });
    await query("insert into users (email, name, status) values ('chris@example.com', 'Chris', 'trial')");
    expect(await createPilotLink(query, { email: "chris@example.com", name: "Chris", createdBy: "peter@example.com" })).toEqual({ ok: false, reason: "already_signed_up" });
  });
});
