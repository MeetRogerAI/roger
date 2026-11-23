import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let afterWork: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<unknown>) => void afterWork.push(fn()) }));
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
let current: Query;
let failOn: RegExp | null = null;
vi.mock("@/lib/db-query", () => ({
  query: (text: string, params?: unknown[]) => (failOn && failOn.test(text) ? Promise.reject(new Error("blip")) : current(text, params)),
}));
const mailed: { kind: string; to: string }[] = [];
vi.mock("@/lib/mail/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail/send")>()),
  sendToUser: async (u: { email: string }, kind: string) => {
    mailed.push({ kind, to: u.email });
    return "sent";
  },
}));
let stripeUpdates: [string, string][] = [];
let stripeFails = false;
vi.mock("@/lib/billing/stripe", () => ({
  stripe: () => ({
    customers: {
      update: async (c: string, p: { email: string }) => {
        if (stripeFails) throw new Error("stripe down");
        stripeUpdates.push([c, p.email]);
        return {};
      },
    },
  }),
}));

const { confirmSignIn } = await import("./actions");
const { issueToken } = await import("@/lib/auth/login-link");
const { createSession, findSession } = await import("@/lib/auth/session");
const { hashSecret } = await import("@/lib/auth/tokens");

const press = async (t: string) => {
  const fd = new FormData();
  fd.set("t", t);
  const r = await outcome(() => confirmSignIn(fd));
  await Promise.all(afterWork);
  afterWork = [];
  return r;
};
const user = async () => (await current<{ email: string; synced: boolean }>("select email, stripe_email_synced as synced from users where id = $1", [userId]))[0];

let userId: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  failOn = null;
  mailed.length = 0;
  stripeUpdates = [];
  stripeFails = false;
  afterWork = [];
  resetNextFakes();
  [{ id: userId }] = await current<{ id: string }>("insert into users (email, signup_step, stripe_customer) values ('ana@example.com', 'done', 'cus_ana') returning id");
});

describe("confirmSignIn", () => {
  it("signs in once, sets both cookies, and goes where the link said", async () => {
    const t = await issueToken(current, { email: "ana@example.com", purpose: "signin", nextPath: "/app/zack" });
    expect(await press(t)).toEqual({ redirect: "/app/zack" });
    expect(jar.has("roger-session")).toBe(true);
    expect(jar.get("roger-in")).toBe("1");
    resetNextFakes();
    expect(await press(t)).toEqual({ redirect: "/signin?e=expired" });
    expect(jar.size).toBe(0);
  });

  it("sends an unknown address to sign-in with a note, setting no cookie", async () => {
    const t = await issueToken(current, { email: "nobody@example.com", purpose: "signin" });
    expect(await press(t)).toEqual({ redirect: "/signin?e=noaccount" });
    expect(jar.size).toBe(0);
  });

  it("asks for a new link, not an error page, when signing in fails after the link was used", async () => {
    const t = await issueToken(current, { email: "ana@example.com", purpose: "signin" });
    failOn = /insert into sessions/;
    expect(await press(t)).toEqual({ redirect: "/signin?e=retry" });
    expect(jar.size).toBe(0);
  });
});

const data = { from: "ana@example.com", to: "new@example.com" };
const approveLink = () => issueToken(current, { email: "ana@example.com", purpose: "email_approve", userId, data });

describe("approving an email change (the current address's link)", () => {
  it("signs nobody in, and sends the confirm link to the new address after the response", async () => {
    expect(await press(await approveLink())).toEqual({ redirect: "/signin?e=approved" });
    expect(jar.size).toBe(0);
    expect(mailed).toEqual([{ kind: "email_change", to: "new@example.com" }]);
    expect((await user()).email).toBe("ana@example.com");
  });

  it("gives the same reply when the new address is taken", async () => {
    await current("insert into users (email) values ('new@example.com')");
    expect(await press(await approveLink())).toEqual({ redirect: "/signin?e=approved" });
    expect(mailed).toEqual([{ kind: "email_change_taken", to: "new@example.com" }]);
  });
});

describe("confirming an email change (the new address's link)", () => {
  /** An approval that was used, and the confirm link it issued. */
  const confirmLink = async () => {
    const a = await approveLink();
    await current("update login_tokens set used_at = now() where token_hash = $1", [hashSecret(a)]);
    return issueToken(current, { email: "new@example.com", purpose: "email_change", userId, nextPath: "/app/settings?email=changed", data: { ...data, approval: hashSecret(a) } });
  };

  it("in a browser already signed in as that user: changes the address and leaves exactly one live session, this one", async () => {
    const mine = await createSession(current, userId, "email");
    const other = await createSession(current, userId, "email");
    resetNextFakes({ "roger-session": mine.token });
    expect(await press(await confirmLink())).toEqual({ redirect: "/app/settings?email=changed" });
    expect((await user()).email).toBe("new@example.com");
    expect(await findSession(current, mine.token)).toBeNull();
    expect(await findSession(current, other.token)).toBeNull();
    expect(await findSession(current, jar.get("roger-session"))).not.toBeNull();
    expect(await current("select 1 from sessions")).toHaveLength(1);
  });

  it("from a link alone: changes the address but signs nobody in, and ends every session", async () => {
    const old = await createSession(current, userId, "email");
    expect(await press(await confirmLink())).toEqual({ redirect: "/signin?e=changed" });
    expect((await user()).email).toBe("new@example.com");
    expect(jar.has("roger-session")).toBe(false);
    expect(await findSession(current, old.token)).toBeNull();
  });

  it("tells the old address once, and gives Stripe the new address", async () => {
    await press(await confirmLink());
    expect(mailed).toEqual([{ kind: "email_changed", to: "ana@example.com" }]);
    expect(stripeUpdates).toEqual([["cus_ana", "new@example.com"]]);
    expect((await user()).synced).toBe(true);
  });

  it("keeps the change when Stripe fails, and leaves it for the hourly retry", async () => {
    stripeFails = true;
    expect(await press(await confirmLink())).toEqual({ redirect: "/signin?e=changed" });
    expect(await user()).toEqual({ email: "new@example.com", synced: false });
    expect(mailed.map((m) => m.kind)).toEqual(["email_changed"]);
  });

  it("ends on the settings page with a neutral note if the address was taken in the meantime", async () => {
    const t = await confirmLink();
    await current("insert into users (email) values ('new@example.com')");
    expect(await press(t)).toEqual({ redirect: "/app/settings?email=failed" });
    expect((await user()).email).toBe("ana@example.com");
    expect(mailed).toEqual([]);
  });

  it("a session alone is not enough: an approval link pressed in the attacker's browser signs nobody in", async () => {
    const s = await createSession(current, userId, "email");
    resetNextFakes({ "roger-session": s.token });
    expect(await press(await approveLink())).toEqual({ redirect: "/signin?e=approved" });
    expect(await current("select 1 from sessions")).toHaveLength(1);
    expect((await user()).email).toBe("ana@example.com");
  });
});
