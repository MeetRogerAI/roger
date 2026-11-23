import { beforeEach, describe, expect, it } from "vitest";
import { hashSecret } from "@/lib/auth/tokens";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { authenticate, KEY_PREFIX, keyFrom, newZackKey, replaceZackKey, userForKey } from "./key";

let query: Query;
let userId: string;

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id: userId }] = await query<{ id: string }>("insert into users (email, status, agent) values ('ana@example.com', 'trial', 'hark') returning id");
});

const req = (key?: string, how: "header" | "query" = "header", ip = "1.2.3.4") =>
  new Request(`https://meetroger.ai/api/zack/runs${key && how === "query" ? `?key=${key}` : ""}`, {
    headers: { "x-vercel-forwarded-for": ip, ...(key && how === "header" ? { authorization: `Bearer ${key}` } : {}) },
  });

describe("Zack keys", () => {
  it("are long, prefixed and stored only as a hash", async () => {
    const k = newZackKey();
    expect(k.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(k.key.length).toBeGreaterThanOrEqual(KEY_PREFIX.length + 43);
    const key = await replaceZackKey(query, userId);
    const [u] = await query<{ zack_key_hash: string; zack_key_prefix: string }>("select zack_key_hash, zack_key_prefix from users");
    expect(u.zack_key_hash).toBe(hashSecret(key));
    const [row] = await query("select * from users");
    expect(JSON.stringify(row)).not.toContain(key.slice(KEY_PREFIX.length + 4));
    expect(key.startsWith(u.zack_key_prefix)).toBe(true);
  });

  it("work from the header or the query string", async () => {
    const key = await replaceZackKey(query, userId);
    expect(keyFrom(req(key))).toBe(key);
    expect(keyFrom(req(key, "query"))).toBe(key);
    expect((await userForKey(query, key))?.id).toBe(userId);
  });

  it("stop working the moment they are replaced", async () => {
    const old = await replaceZackKey(query, userId);
    const fresh = await replaceZackKey(query, userId);
    expect(await userForKey(query, old)).toBeNull();
    expect((await userForKey(query, fresh))?.id).toBe(userId);
  });

  it("do not work for an account that cannot receive lists", async () => {
    const key = await replaceZackKey(query, userId);
    for (const status of ["signup", "cancelled", "closed"]) {
      await query("update users set status = $1", [status]);
      expect(await userForKey(query, key)).toBeNull();
    }
  });
});

describe("authenticate", () => {
  it("answers a wrong key, no key and a replaced key with the same bare 401 (spec check 6)", async () => {
    const old = await replaceZackKey(query, userId);
    await replaceZackKey(query, userId);
    for (const r of [req("rgr_zk_wrong"), req(), req(old)]) {
      const res = (await authenticate(query, r)) as Response;
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("refuses the eleventh wrong key from one IP in a minute with a bare 429, but never a valid key on that IP", async () => {
    // Agents send from their platform's shared addresses: one member's stale key must not lock out the rest.
    const key = await replaceZackKey(query, userId);
    const now = new Date("2026-11-29T12:00:10Z");
    for (let i = 0; i < 10; i++) expect(((await authenticate(query, req("rgr_zk_bad"), now)) as Response).status).toBe(401);
    const refused = (await authenticate(query, req("rgr_zk_bad"), now)) as Response;
    expect(refused.status).toBe(429);
    expect(await refused.text()).toBe("");
    expect(await authenticate(query, req(key), now)).toMatchObject({ id: userId });
    expect(((await authenticate(query, req("rgr_zk_bad", "header", "5.6.7.8"), now)) as Response).status).toBe(401);
  });

  it("does not count requests with no key at all (a link preview, a browser)", async () => {
    const now = new Date("2026-11-29T12:00:10Z");
    for (let i = 0; i < 15; i++) expect(((await authenticate(query, req(), now)) as Response).status).toBe(401);
    expect(((await authenticate(query, req("rgr_zk_bad"), now)) as Response).status).toBe(401);
  });

  it("does not count a good key against the IP", async () => {
    const key = await replaceZackKey(query, userId);
    const now = new Date("2026-11-29T12:00:10Z");
    for (let i = 0; i < 15; i++) expect(await authenticate(query, req(key), now)).toMatchObject({ id: userId });
  });
});
