import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import type { Counter } from "@/lib/rate-limit";
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
  answers: { work: "real_estate", role: "Agent", uses: "most_weeks", agent: "grok-bot", agentOther: "", count: "1-2", help: ["Listings"], software: "if_shown" },
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

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
});

describe("startAccount", () => {
  it("creates an unverified account with the quiz as its profile, and emails a link to the plan step", async () => {
    expect(await startAccount(query, { name: "Ana", email: "Ana@Example.com", draft, ip: "1.2.3.4" }, deps())).toBe("new");
    const [u] = await query<Record<string, unknown>>("select email, name, path, currency, agent, utm, pending_zack_token, signup_step, email_verified_at, profile from users");
    expect(u).toMatchObject({ email: "ana@example.com", name: "Ana", path: "new", currency: "CAD", agent: "grok-bot", utm: "nov", signup_step: "plan", email_verified_at: null });
    expect(u.pending_zack_token).toBe("z".repeat(24));
    expect((u.profile as { help: string[] }).help).toEqual(["Listings"]);
    expect(sent[0].subject).toBe("Confirm your email to start Roger");
    const used = await consumeToken(query, linkIn(sent[0]));
    expect(used?.nextPath).toBe("/start/plan");
    expect((await userForToken(query, used!))?.email).toBe("ana@example.com");
  });

  it("replaces the answers on an account nobody has confirmed yet", async () => {
    await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: "1.2.3.4" }, deps());
    const other = { ...draft, path: "running" as const };
    expect(await startAccount(query, { name: "Ana B", email: "ana@example.com", draft: other, ip: "1.2.3.4" }, deps())).toBe("restarted");
    const rows = await query<{ name: string; path: string }>("select name, path from users");
    expect(rows).toEqual([{ name: "Ana B", path: "running" }]);
  });

  it("changes nothing on a confirmed account and sends a plain sign-in link instead", async () => {
    await query("insert into users (email, name, path, email_verified_at, signup_step) values ('ana@example.com', 'Ana', 'running', now(), 'done')");
    expect(await startAccount(query, { name: "Someone else", email: "ana@example.com", draft, ip: "1.2.3.4" }, deps())).toBe("existing");
    const [u] = await query<{ name: string; path: string }>("select name, path from users");
    expect(u).toEqual({ name: "Ana", path: "running" });
    expect(sent[0].subject).toBe("Your Roger sign-in link");
    expect((await consumeToken(query, linkIn(sent[0])))?.nextPath).toBe("/app");
  });

  it("keeps the not-ready tag when someone chose to start anyway", async () => {
    await startAccount(query, { name: "Ana", email: "ana@example.com", draft: { ...draft, path: "not_ready" }, ip: "1.2.3.4" }, deps());
    const [u] = await query<{ path: string; not_ready: boolean }>("select path, not_ready from users");
    expect(u).toEqual({ path: "new", not_ready: true });
  });

  it("refuses a blank name or a bad address", async () => {
    expect(await startAccount(query, { name: " ", email: "ana@example.com", draft, ip: "1" }, deps())).toBe("invalid");
    expect(await startAccount(query, { name: "Ana", email: "nope", draft, ip: "1" }, deps())).toBe("invalid");
    expect(sent).toHaveLength(0);
  });
});
