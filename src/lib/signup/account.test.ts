import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { counterFor, type Counter } from "@/lib/rate-limit";
import { consumeToken, userForToken } from "@/lib/auth/login-link";
import { testDb } from "@/test-helpers/pglite-db";
import { startAccount } from "./account";
import type { SignupDraft } from "./draft";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const counter: Counter = async () => 1;
const draft: SignupDraft = {
  answers: { work: "real_estate", role: "Agent", uses: "most_weeks", agents: ["grok-bot"], agentOther: "", count: "1-2", help: ["Listings"], software: "if_shown" },
  path: "new",
  continuedAnyway: false,
  source: "re",
  cur: "CAD",
  ref: null,
  zack: "z".repeat(24),
  utm: "nov",
};
const deps = () => ({ query, transport, counter });
const linkIn = (m: Parameters<Transport>[0]) => /t=([A-Za-z0-9_-]+)/.exec(m.text)![1];
const confirm = async (m: Parameters<Transport>[0]) => userForToken(query, (await consumeToken(query, linkIn(m)))!);

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
});

describe("startAccount", () => {
  it("writes no account until the link is confirmed, then creates it with the quiz as its profile", async () => {
    expect(await startAccount(query, { name: "Ana", email: "Ana@Example.com", draft, ip: "1.2.3.4" }, deps())).toBe("new");
    expect(await query("select 1 from users")).toHaveLength(0);
    expect(sent[0].subject).toBe("Confirm your email to start Roger");

    const used = await consumeToken(query, linkIn(sent[0]));
    expect(used?.nextPath).toBe("/start/plan");
    const user = await userForToken(query, used!);
    expect(user?.email).toBe("ana@example.com");

    const [u] = await query<Record<string, unknown>>(
      "select email, name, path, currency, agent, utm, pending_zack_token, signup_step, email_verified_at, profile from users",
    );
    expect(u).toMatchObject({ email: "ana@example.com", name: "Ana", path: "new", currency: "CAD", agent: "grok-bot", utm: "nov", signup_step: "plan" });
    expect(u.email_verified_at).not.toBeNull();
    expect(u.pending_zack_token).toBe("z".repeat(24));
    expect((u.profile as { help: string[] }).help).toEqual(["Listings"]);
  });

  it("lets a stranger who typed someone's address change nothing: an older link confirms into the existing account untouched", async () => {
    await startAccount(query, { name: "Stranger", email: "ana@example.com", draft: { ...draft, ref: "planted" }, ip: "9.9.9.9" }, deps());
    await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: "1.2.3.4" }, deps());
    await confirm(sent[1]); // Ana confirms her own link
    await confirm(sent[0]); // the stranger's link is confirmed later: it only signs in
    const rows = await query<{ name: string; ref: string }>("select name, ref from users");
    expect(rows).toEqual([{ name: "Ana", ref: "" }]);
  });

  it("changes nothing on an existing account and sends a plain sign-in link instead", async () => {
    await query("insert into users (email, name, path, email_verified_at, signup_step) values ('ana@example.com', 'Ana', 'running', now(), 'done')");
    expect(await startAccount(query, { name: "Someone else", email: "ana@example.com", draft, ip: "1.2.3.4" }, deps())).toBe("existing");
    const [u] = await query<{ name: string; path: string }>("select name, path from users");
    expect(u).toEqual({ name: "Ana", path: "running" });
    expect(sent[0].subject).toBe("Your Roger sign-in link");
    expect((await consumeToken(query, linkIn(sent[0])))?.nextPath).toBe("/app");
  });

  it("keeps the not-ready tag when someone chose to start anyway", async () => {
    await startAccount(query, { name: "Ana", email: "ana@example.com", draft: { ...draft, path: "not_ready" }, ip: "1.2.3.4" }, deps());
    await confirm(sent[0]);
    const [u] = await query<{ path: string; not_ready: boolean }>("select path, not_ready from users");
    expect(u).toEqual({ path: "new", not_ready: true });
  });

  it("refuses a blank name or a bad address", async () => {
    expect(await startAccount(query, { name: " ", email: "ana@example.com", draft, ip: "1" }, deps())).toBe("invalid");
    expect(await startAccount(query, { name: "Ana", email: "nope", draft, ip: "1" }, deps())).toBe("invalid");
    expect(sent).toHaveLength(0);
  });

  it("is limited by address and by IP, sending nothing past the limit", async () => {
    const real = counterFor(query);
    for (let i = 0; i < 5; i++) await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: `10.0.0.${i}` }, { query, transport, counter: real });
    expect(await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: "10.0.0.9" }, { query, transport, counter: real })).toBe("limited");
    for (let i = 0; i < 20; i++) await startAccount(query, { name: "B", email: `b${i}@example.com`, draft, ip: "10.9.9.9" }, { query, transport, counter: real });
    expect(await startAccount(query, { name: "C", email: "c@example.com", draft, ip: "10.9.9.9" }, { query, transport, counter: real })).toBe("limited");
    expect(sent).toHaveLength(25);
  });

  it("says so when the email could not be sent", async () => {
    const failing: Transport = async () => ({ ok: false, error: "resend 500", retryable: false });
    process.env.ADMIN_EMAILS = "";
    expect(await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: "1" }, { query, transport: failing, counter })).toBe("send_failed");
  });
});
