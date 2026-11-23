import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { testDb } from "@/test-helpers/pglite-db";
import { approveEmailChange, confirmEmailChange, noticeEmailChanged, requestEmailChange, syncCustomerEmail, syncStripeEmails } from "./email-change";
import { consumeToken, issueToken, userForToken, type UsedToken } from "./login-link";

let q: Query;
let sent: { to: string[]; subject: string; text: string }[];
let failSends = false;
const transport: Transport = async (m) => {
  if (failSends) return { ok: false, error: "down", retryable: false };
  sent.push(m);
  return { ok: true };
};
const deps = (o: Record<string, unknown> = {}) => ({ query: q, transport, sleep: async () => {}, ...o });
const tokenIn = (text: string) => decodeURIComponent(/[?&]t=([^\s&]+)/.exec(text)![1]);
const mailTo = (addr: string) => sent.filter((m) => m.to.includes(addr));
const lastLinkTo = (addr: string) => tokenIn(mailTo(addr).at(-1)!.text);
const emailOf = async (id: string) => (await q<{ email: string }>(`select email from users where id = $1`, [id]))[0].email;

let ana: { id: string; email: string };
beforeEach(async () => {
  ({ query: q } = await testDb());
  sent = [];
  failSends = false;
  [ana] = await q<{ id: string; email: string }>(`insert into users (email, status, stripe_customer) values ('ana@example.com', 'trial', 'cus_ana') returning id, email`);
  await q(`insert into users (email, status) values ('bo@example.com', 'active')`);
});

/** Request, then approve from the old address: the confirm link is now in the new address's inbox. */
async function requestAndApprove(to: string, from = ana) {
  expect(await requestEmailChange(q, from, to, deps())).toBe("sent");
  const approval = await consumeToken(q, lastLinkTo(from.email));
  expect(approval?.purpose).toBe("email_approve");
  return { approval: approval!, outcome: await approveEmailChange(q, approval!, deps()) };
}

describe("step 1: the request", () => {
  it("sends only to the current address, and changes nothing", async () => {
    expect(await requestEmailChange(q, ana, " New@Example.com ", deps())).toBe("sent");
    expect(sent.map((m) => m.to)).toEqual([["ana@example.com"]]);
    expect(sent[0].subject).toBe("Approve changing your Roger address to new@example.com");
    expect(mailTo("new@example.com")).toEqual([]);
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });

  it("answers the same whether or not another account uses the new address", async () => {
    expect(await requestEmailChange(q, ana, "bo@example.com", deps())).toBe("sent");
    expect(sent.map((m) => m.to)).toEqual([["ana@example.com"]]);
  });

  it("fails closed: if the approval email can't be sent, its link is withdrawn and the user told to try again", async () => {
    failSends = true;
    expect(await requestEmailChange(q, ana, "new@example.com", deps())).toBe("send_failed");
    expect(await q(`select 1 from login_tokens where purpose = 'email_approve' and revoked_at is null`)).toHaveLength(0);
  });

  it("checks the per-address limit only for a valid, different address", async () => {
    const asked: string[] = [];
    const allow = async (e: string) => (asked.push(e), false);
    expect(await requestEmailChange(q, ana, "nope", deps({ allow }))).toBe("invalid");
    expect(await requestEmailChange(q, ana, "ANA@example.com", deps({ allow }))).toBe("same");
    expect(asked).toEqual([]);
    expect(await requestEmailChange(q, ana, "new@example.com", deps({ allow }))).toBe("limited");
    expect(asked).toEqual(["new@example.com"]);
    expect(sent).toEqual([]);
  });
});

describe("step 2: approval from the current address", () => {
  it("then, and only then, sends the confirm link to the new address", async () => {
    const { outcome } = await requestAndApprove("new@example.com");
    expect(outcome).toBe("sent");
    expect(mailTo("new@example.com")).toHaveLength(1);
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });

  it("is refused if the account's address changed since the request", async () => {
    await requestEmailChange(q, ana, "new@example.com", deps());
    const approval = await consumeToken(q, lastLinkTo("ana@example.com"));
    await q(`update users set email = 'other@example.com' where id = $1`, [ana.id]);
    expect(await approveEmailChange(q, approval!, deps())).toBe("stale");
    expect(mailTo("new@example.com")).toEqual([]);
  });

  it("for an address another account uses: no confirm link, and that address's owner is told someone tried", async () => {
    const { outcome } = await requestAndApprove("bo@example.com");
    expect(outcome).toBe("taken");
    expect(mailTo("bo@example.com").map((m) => m.subject)).toEqual(["Someone tried to use this address on Roger"]);
    expect(mailTo("bo@example.com")[0].text).not.toContain("ana@example.com");
    expect(await q(`select 1 from login_tokens where purpose = 'email_change'`)).toHaveLength(0);
  });
});

describe("step 3: confirmation from the new address", () => {
  it("changes the address, and the old address is told once", async () => {
    await requestAndApprove("new@example.com");
    const confirm = await consumeToken(q, lastLinkTo("new@example.com"));
    const changed = await confirmEmailChange(q, confirm!);
    expect(changed).toEqual({ id: ana.id, email: "new@example.com", oldEmail: "ana@example.com" });
    expect(await emailOf(ana.id)).toBe("new@example.com");
    await noticeEmailChanged(q, changed!, confirm!.hash, deps());
    await noticeEmailChanged(q, changed!, confirm!.hash, deps());
    expect(mailTo("ana@example.com").filter((m) => m.subject === "Your Roger email address changed")).toHaveLength(1);
    // A link used once never works again.
    expect(await consumeToken(q, lastLinkTo("new@example.com"))).toBeNull();
  });

  it("does nothing if the account's address changed after approval", async () => {
    await requestAndApprove("new@example.com");
    await q(`update users set email = 'moved@example.com' where id = $1`, [ana.id]);
    expect(await confirmEmailChange(q, (await consumeToken(q, lastLinkTo("new@example.com")))!)).toBeNull();
    expect(await emailOf(ana.id)).toBe("moved@example.com");
  });

  it("does nothing if the new address was taken after approval", async () => {
    await requestAndApprove("late@example.com");
    await q(`insert into users (email) values ('late@example.com')`);
    expect(await confirmEmailChange(q, (await consumeToken(q, lastLinkTo("late@example.com")))!)).toBeNull();
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });

  it("refuses a confirm link that no used approval stands behind", async () => {
    const forged = await issueToken(q, { email: "evil@example.com", purpose: "email_change", userId: ana.id, data: { from: "ana@example.com", to: "evil@example.com", approval: "nope" } });
    expect(await confirmEmailChange(q, (await consumeToken(q, forged))!)).toBeNull();
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });
});

describe("a hijacked session", () => {
  it("can never complete a change on its own: the new address gets nothing until the current address approves", async () => {
    // The attacker, signed in as Ana and holding evil@example.com, asks twice.
    await requestEmailChange(q, ana, "evil@example.com", deps());
    await requestEmailChange(q, ana, "evil@example.com", deps());
    expect(mailTo("evil@example.com")).toEqual([]);
    expect(await q(`select 1 from login_tokens where purpose = 'email_change'`)).toHaveLength(0);
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });
});

describe("a newer request", () => {
  it("supersedes an earlier approval link", async () => {
    await requestEmailChange(q, ana, "first@example.com", deps());
    const firstApproval = lastLinkTo("ana@example.com");
    await requestEmailChange(q, ana, "second@example.com", deps());
    // Even if the revoke had been missed (two requests racing).
    await q(`update login_tokens set revoked_at = null`);
    expect(await consumeToken(q, firstApproval)).toBeNull();
    expect((await consumeToken(q, lastLinkTo("ana@example.com")))?.data).toMatchObject({ to: "second@example.com" });
  });

  it("supersedes an earlier, already approved, confirm link", async () => {
    await requestAndApprove("first@example.com");
    const firstConfirm = lastLinkTo("first@example.com");
    await requestEmailChange(q, ana, "second@example.com", deps());
    await q(`update login_tokens set revoked_at = null`);
    expect(await consumeToken(q, firstConfirm)).toBeNull();
    expect(await emailOf(ana.id)).toBe("ana@example.com");
  });
});

describe("userForToken", () => {
  it("never signs anyone in from an email-change link or an unknown purpose", async () => {
    const base = { email: "ana@example.com", userId: ana.id, nextPath: "/app", newAccount: null, data: null, hash: "h" };
    for (const purpose of ["email_change", "email_approve", "email_revert", "whatever"]) {
      expect(await userForToken(q, { ...base, purpose } as unknown as UsedToken)).toBeNull();
    }
    expect(await userForToken(q, { ...base, purpose: "signin" })).toEqual({ id: ana.id, email: "ana@example.com" });
  });
});

describe("notification refs", () => {
  it("never contain an address", async () => {
    await requestAndApprove("new@example.com");
    await requestAndApprove("bo@example.com");
    const refs = await q<{ ref: string }>(`select ref from notifications`);
    expect(refs.length).toBeGreaterThan(2);
    for (const { ref } of refs) expect(ref).not.toMatch(/@|example/);
  });
});

describe("Stripe's copy of the address", () => {
  it("a failure keeps the change and is retried hourly, with admins told after repeats", async () => {
    await q(`update users set email = 'new@example.com', stripe_email_synced = false where id = $1`, [ana.id]);
    const failing = async () => {
      throw new Error("stripe down");
    };
    expect(await syncCustomerEmail(q, ana.id, failing)).toBe("failed");
    expect(await emailOf(ana.id)).toBe("new@example.com");
    process.env.ADMIN_EMAILS = "admin@example.com";
    try {
      await syncStripeEmails(q, failing, deps());
      expect(mailTo("admin@example.com")).toHaveLength(0);
      await syncStripeEmails(q, failing, deps());
      expect(mailTo("admin@example.com")).toHaveLength(1);
      await syncStripeEmails(q, failing, deps());
      expect(mailTo("admin@example.com")).toHaveLength(1);
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
    const calls: string[][] = [];
    expect(await syncStripeEmails(q, async (c, e) => void calls.push([c, e]), deps())).toEqual({ synced: 1, failed: 0 });
    expect(calls).toEqual([["cus_ana", "new@example.com"]]);
    expect(await syncStripeEmails(q, failing, deps())).toEqual({ synced: 0, failed: 0 });
  });
});
