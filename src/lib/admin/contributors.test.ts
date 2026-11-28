import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveEmailChange, confirmEmailChange, requestEmailChange } from "@/lib/auth/email-change";
import { consumeToken, userForToken, type NewAccount, type UsedToken } from "@/lib/auth/login-link";
import { importSeedRun, SeedEmailRefused } from "@/lib/cora/seed-import";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { createPilotLink } from "@/lib/signup/pilot";
import { testDb } from "@/test-helpers/pglite-db";
import { EMAIL_CHANGE_ACTOR, linkContributor, linkContributorByEmail, listContributors, setContributorEmail, SIGNUP_ACTOR } from "./contributors";
import { changeUserEmail } from "./users";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/** R25, auto-linking (2026-11-27): a contributor's email links the account with that address. */
let q: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const mail = () => ({ query: q, transport, sleep: async () => {} });
const ADMIN = "admin@example.com";

const account: NewAccount = { name: "Robyn", path: "running", notReady: false, profile: {}, agent: "claude", currency: "CAD", ref: "", utm: "", zack: null };
/** The /start flow's last step: the sign-up link is used and userForToken makes the account. */
const signUpByLink = async (email: string) => (await userForToken(q, { email, purpose: "signin", userId: null, nextPath: "/start/plan", newAccount: account, data: null, hash: "h" }))!;

const contributor = async (label: string, email: string | null = null) =>
  (await q<{ id: string }>(`insert into seed_contributors (label, email) values ($1, $2) returning id`, [label, email]))[0].id;
const linkedTo = async (id: string) => (await q<{ user_id: string | null }>(`select user_id from seed_contributors where id = $1`, [id]))[0].user_id;
const user = async (email: string, status = "trial") => (await q<{ id: string }>(`insert into users (email, status) values ($1, $2) returning id`, [email, status]))[0].id;
const linkLog = () => q<{ admin_email: string; user_id: string; action: string; detail: Record<string, unknown> }>(
  `select admin_email, user_id, action, detail from admin_actions where action in ('link_contributor', 'unlink_contributor') order by id`,
);

beforeEach(async () => {
  ({ query: q } = await testDb());
  sent = [];
  process.env.ADMIN_EMAILS = ADMIN;
});

describe("setting a contributor's email", () => {
  it("stores it lower-case, logs it, and a sign-up with that address links at once, whatever its case", async () => {
    const robyn = await contributor("Robyn");
    expect(await setContributorEmail(q, ADMIN, robyn, " Robyn@Example.COM ")).toMatchObject({ ok: true, message: expect.stringMatching(/No account has it yet/) });
    expect(await q(`select email from seed_contributors`)).toEqual([{ email: "robyn@example.com" }]);
    expect(await q(`select admin_email, action from admin_actions`)).toEqual([{ admin_email: ADMIN, action: "contributor_email" }]);

    const u = await signUpByLink("robyn@example.com");
    expect(await linkedTo(robyn)).toBe(u.id);
    expect(await linkLog()).toEqual([{ admin_email: SIGNUP_ACTOR, user_id: u.id, action: "link_contributor", detail: expect.objectContaining({ contributorId: robyn, label: "Robyn", via: "email", movedFrom: null }) }]);
  });

  it("matches the account case-insensitively when an old account has a mixed-case address", async () => {
    const id = await user("Robyn@Example.com");
    const robyn = await contributor("Robyn");
    expect(await setContributorEmail(q, ADMIN, robyn, "robyn@example.com")).toMatchObject({ ok: true, message: expect.stringMatching(/linked/) });
    expect(await linkedTo(robyn)).toBe(id);
  });

  it("links an account that already exists at once, logged as the admin", async () => {
    const id = await user("rob@example.com");
    const rob = await contributor("Rob");
    expect(await setContributorEmail(q, ADMIN, rob, "rob@example.com")).toEqual({ ok: true, message: "Address saved, and Rob is linked to the account with it." });
    expect(await linkedTo(rob)).toBe(id);
    expect(await linkLog()).toEqual([{ admin_email: ADMIN, user_id: id, action: "link_contributor", detail: expect.objectContaining({ via: "email" }) }]);
  });

  it("links an admin's own account (Peter's seed runs, his account still at sign-up)", async () => {
    process.env.ADMIN_EMAILS = `${ADMIN},peter@meetroger.ai`;
    const id = await user("peter@meetroger.ai", "signup");
    const peter = await contributor("Peter");
    expect(await setContributorEmail(q, ADMIN, peter, "Peter@MeetRoger.ai")).toMatchObject({ ok: true });
    expect(await linkedTo(peter)).toBe(id);
    // The automatic path too (a second record of his), as at sign-up or an address change.
    const peter2 = await contributor("Peter K", "peter@meetroger.ai");
    expect(await linkContributorByEmail(q, SIGNUP_ACTOR, id)).toMatchObject({ ok: true });
    expect(await linkedTo(peter2)).toBe(id);
  });

  it("no match, no link", async () => {
    await user("someone@example.com");
    const kim = await contributor("Kim");
    await setContributorEmail(q, ADMIN, kim, "kim@example.com");
    await signUpByLink("other@example.com");
    expect(await linkedTo(kim)).toBeNull();
    expect(await linkLog()).toEqual([]);
  });

  it("refuses something that isn't an address, and clearing it keeps the link", async () => {
    const id = await user("lee@example.com");
    const lee = await contributor("Lee");
    expect(await setContributorEmail(q, ADMIN, lee, "not an address")).toMatchObject({ ok: false });
    await setContributorEmail(q, ADMIN, lee, "lee@example.com");
    expect(await setContributorEmail(q, ADMIN, lee, "")).toMatchObject({ ok: true, message: expect.stringMatching(/cleared/) });
    expect(await q(`select email, user_id from seed_contributors`)).toEqual([{ email: null, user_id: id }]);
  });

  it("lets several contributors (one person, two records) share one address", async () => {
    const a = await contributor("Chris M");
    const b = await contributor("Christopher");
    expect(await setContributorEmail(q, ADMIN, a, "cmarinakos@royallepage.ca")).toMatchObject({ ok: true });
    expect(await setContributorEmail(q, ADMIN, b, "CMarinakos@RoyalLepage.ca")).toMatchObject({ ok: true });
    expect((await listContributors(q)).map((c) => [c.label, c.email])).toEqual([
      ["Chris M", "cmarinakos@royallepage.ca"],
      ["Christopher", "cmarinakos@royallepage.ca"],
    ]);
  });
});

describe("at sign-up", () => {
  it("links every contributor with the address (one person, several records)", async () => {
    const a = await contributor("Chris M", "cmarinakos@royallepage.ca");
    const b = await contributor("Christopher", "cmarinakos@royallepage.ca");
    const u = await signUpByLink("cmarinakos@royallepage.ca");
    expect(await linkedTo(a)).toBe(u.id);
    expect(await linkedTo(b)).toBe(u.id);
    expect((await linkLog()).map((l) => [l.admin_email, l.action, l.detail.label])).toEqual([
      [SIGNUP_ACTOR, "link_contributor", "Chris M"],
      [SIGNUP_ACTOR, "link_contributor", "Christopher"],
    ]);
  });

  it("links an account made by a pilot link", async () => {
    const ken = await contributor("Ken", "ken@example.com");
    const r = await createPilotLink(q, { email: "Ken@example.com", name: "Ken F", createdBy: ADMIN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await linkedTo(ken)).toBe(r.userId);
  });

  it("does not link again when the sign-up link signs in an account that already existed", async () => {
    const id = await user("ana@example.com");
    const ana = await contributor("Ana");
    await q(`update seed_contributors set email = 'ana@example.com' where id = $1`, [ana]);
    expect((await signUpByLink("ana@example.com")).id).toBe(id);
    expect(await linkedTo(ana)).toBeNull();
  });

  it("never moves a contributor already linked by hand to another account", async () => {
    const first = await user("first@example.com");
    const rob = await contributor("Rob");
    expect((await linkContributor(q, ADMIN, rob, first)).ok).toBe(true);
    await setContributorEmail(q, ADMIN, rob, "second@example.com");
    expect(await linkedTo(rob)).toBe(first);
    const second = await signUpByLink("second@example.com");
    expect(second.id).not.toBe(first);
    expect(await linkedTo(rob)).toBe(first);
    expect((await linkLog()).map((l) => l.user_id)).toEqual([first]);
  });
});

describe("when an account's address changes", () => {
  it("an admin's change to a matching address links, logged as that admin", async () => {
    const id = await user("old@example.com");
    const fay = await contributor("Fay", "fay@example.com");
    const r = await changeUserEmail(q, mail(), ADMIN, id, "Fay@example.com");
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/Linked Fay/) });
    expect(await linkedTo(fay)).toBe(id);
    expect(await linkLog()).toEqual([expect.objectContaining({ admin_email: ADMIN, user_id: id, action: "link_contributor" })]);
  });

  it("a member's own change, once confirmed, links; a change away never unlinks", async () => {
    const id = await user("ana@example.com");
    const eve = await contributor("Eve", "eve@example.com");
    const ana = { id, email: "ana@example.com" };
    expect(await requestEmailChange(q, ana, "eve@example.com", mail())).toBe("sent");
    const tokenIn = (text: string) => decodeURIComponent(/[?&]t=([^\s&]+)/.exec(text)![1]);
    const approval = await consumeToken(q, tokenIn(sent.at(-1)!.text));
    expect(await approveEmailChange(q, approval!, mail())).toBe("sent");
    const confirm = (await consumeToken(q, tokenIn(sent.at(-1)!.text))) as UsedToken;
    expect(await confirmEmailChange(q, confirm)).toMatchObject({ id, email: "eve@example.com" });
    expect(await linkedTo(eve)).toBe(id);
    expect(await linkLog()).toEqual([expect.objectContaining({ admin_email: EMAIL_CHANGE_ACTOR, user_id: id })]);

    expect((await changeUserEmail(q, mail(), ADMIN, id, "elsewhere@example.com")).ok).toBe(true);
    expect(await linkedTo(eve)).toBe(id);
  });
});

describe("the seed import's email", () => {
  it("refuses something that isn't an address before anything is written", async () => {
    // Intake and merging are never reached.
    const unused = {} as Parameters<typeof importSeedRun>[2];
    await expect(importSeedRun(q, { label: "Rob", agent: "hark", text: "x", ranOn: "2026-11-13", email: "nope" }, unused)).rejects.toBeInstanceOf(SeedEmailRefused);
    expect(await q(`select 1 from seed_contributors`)).toEqual([]);
  });
});
