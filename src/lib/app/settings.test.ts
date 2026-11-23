import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { sendToUser, type Transport } from "@/lib/mail/send";
import { testDb } from "@/test-helpers/pglite-db";
import { saveProfile, validateProfile } from "./settings";

let q: Query;
const transport: Transport = async () => ({ ok: true });
let ana: { id: string; email: string };
beforeEach(async () => {
  ({ query: q } = await testDb());
  [ana] = await q<{ id: string; email: string }>(`insert into users (email, status) values ('ana@example.com', 'trial') returning id, email`);
});

describe("the profile", () => {
  it("validates name, display name and time zone", () => {
    expect(validateProfile({ name: "  Ana  Lopez ", displayName: "", timezone: "America/Vancouver" })).toEqual({ ok: true, value: { name: "Ana Lopez", displayName: "", timezone: "America/Vancouver" } });
    const bad = validateProfile({ name: "", displayName: "x".repeat(81), timezone: "Mars/Olympus" });
    expect(bad).toMatchObject({ ok: false, errors: { name: expect.any(String), displayName: expect.any(String), timezone: expect.any(String) } });
  });

  it("saves the Monday list switch under the key the mail layer reads, keeping other keys", async () => {
    await q(`update users set email_prefs = '{"other": 1}' where id = $1`, [ana.id]);
    await saveProfile(q, ana.id, { name: "Ana", displayName: "A", timezone: "America/Toronto", prefs: { monday: false, friday_prompt: true } });
    const [u] = await q<{ email_prefs: Record<string, unknown>; name: string }>(`select name, email_prefs from users where id = $1`, [ana.id]);
    expect(u).toEqual({ name: "Ana", email_prefs: { other: 1, monday: false, friday_prompt: true } });
    // The mail layer then skips the Monday list, and still sends a billing email.
    const msg = { subject: "s", html: "h", text: "t" };
    const me = { id: ana.id, email: ana.email, emailPrefs: u.email_prefs };
    const deps = { query: q, transport, sleep: async () => {} };
    expect(await sendToUser(me, "monday_list", "2026-11-30", msg, deps)).toBe("skipped");
    expect(await sendToUser(me, "charge_failed", "2026-11-30", msg, deps)).toBe("sent");
  });
});
