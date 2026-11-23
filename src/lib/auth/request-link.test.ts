import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import type { Counter } from "@/lib/rate-limit";
import { testDb } from "@/test-helpers/pglite-db";
import { requestSignInLink } from "./request-link";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
function memoryCounter(): Counter {
  const rows = new Map<string, number>();
  return async (key, start) => {
    const n = (rows.get(`${key}@${start}`) ?? 0) + 1;
    rows.set(`${key}@${start}`, n);
    return n;
  };
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  await query("insert into users (email) values ('a@example.com')");
});

describe("requestSignInLink", () => {
  it("emails a one-time link to a known address", async () => {
    const counter = memoryCounter();
    expect(await requestSignInLink(query, " A@example.com", "1.2.3.4", "/app", { query, transport, counter })).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["a@example.com"]);
    expect(sent[0].text).toMatch(/\/auth\/confirm\?t=/);
  });

  it("tells an unknown address where to start, and creates no account", async () => {
    const counter = memoryCounter();
    expect(await requestSignInLink(query, "new@example.com", "1.2.3.4", "/app", { query, transport, counter })).toBe("no_account");
    expect(sent[0].text).toMatch(/no Roger account/);
    expect(await query("select 1 from users where email = 'new@example.com'")).toHaveLength(0);
  });

  it("sends a fresh link for each request", async () => {
    const counter = memoryCounter();
    await requestSignInLink(query, "a@example.com", "1.2.3.4", "/app", { query, transport, counter });
    await requestSignInLink(query, "a@example.com", "1.2.3.4", "/app", { query, transport, counter });
    expect(sent).toHaveLength(2);
    expect(sent[0].text).not.toBe(sent[1].text);
  });

  it("refuses the sixth request for one address inside the window, sending nothing", async () => {
    const counter = memoryCounter();
    for (let i = 0; i < 5; i++) await requestSignInLink(query, "a@example.com", `10.0.0.${i}`, "/app", { query, transport, counter });
    expect(await requestSignInLink(query, "a@example.com", "10.0.0.9", "/app", { query, transport, counter })).toBe("limited");
    expect(sent).toHaveLength(5);
  });

  it("ignores an address that is not one", async () => {
    expect(await requestSignInLink(query, "not an email", "1.2.3.4", "/app", { query, transport, counter: memoryCounter() })).toBe("invalid");
    expect(sent).toHaveLength(0);
  });
});
