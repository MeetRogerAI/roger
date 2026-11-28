import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { logAdminReads, READ_LOG_MAX_IDS, readsOfMember } from "./read-log";

/**
 * B3 plan Unit 6 (spec B.16 "Admin read log"): each time an admin opens a
 * member's runs, picks or feedback, admin_actions records who read what and
 * when, with user ids only (never member text), at most 200 ids a row and
 * never truncated: more members go in more rows of the same statement.
 */

let query: Query;
const rows = () =>
  query<{ admin_email: string; user_id: string | null; action: string; detail: Record<string, unknown> }>("select admin_email, user_id, action, detail from admin_actions order by id");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("logAdminReads", () => {
  it("writes one row per kind of data, with the member's id when there is exactly one", async () => {
    await logAdminReads(query, "peter@example.com", "/admin/users/[id]", [
      { what: "read_runs", userIds: [id(1)] },
      { what: "read_picks", userIds: [id(1)] },
    ]);
    expect(await rows()).toEqual([
      { admin_email: "peter@example.com", user_id: id(1), action: "read_runs", detail: { page: "/admin/users/[id]", user_ids: [id(1)], count: 1 } },
      { admin_email: "peter@example.com", user_id: id(1), action: "read_picks", detail: { page: "/admin/users/[id]", user_ids: [id(1)], count: 1 } },
    ]);
  });

  it("lists several members in one row, de-duplicated, with no single user id", async () => {
    await logAdminReads(query, "peter@example.com", "/admin/runs", [{ what: "read_runs", userIds: [id(1), id(2), id(1), null, id(3)] }]);
    expect(await rows()).toEqual([{ admin_email: "peter@example.com", user_id: null, action: "read_runs", detail: { page: "/admin/runs", user_ids: [id(1), id(2), id(3)], count: 3 } }]);
  });

  it("records all 450 members shown, in rows of at most 200 ids, in one statement", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => id(i + 1));
    let inserts = 0;
    const counting: Query = async (t, p) => {
      if (/insert into admin_actions/.test(t)) inserts++;
      return query(t, p);
    };
    await logAdminReads(counting, "peter@example.com", "/admin/runs", [
      { what: "read_runs", userIds: ids },
      { what: "read_picks", userIds: [id(1)] },
    ]);
    expect(inserts).toBe(1);
    const r = await rows();
    expect(r.map((x) => [x.action, x.user_id, (x.detail.user_ids as string[]).length, x.detail.count, x.detail.part, x.detail.parts])).toEqual([
      ["read_runs", null, 200, 450, 1, 3],
      ["read_runs", null, 200, 450, 2, 3],
      ["read_runs", null, 50, 450, 3, 3],
      ["read_picks", id(1), 1, 1, undefined, undefined],
    ]);
    expect(r.slice(0, 3).flatMap((x) => x.detail.user_ids as string[])).toEqual(ids);
    expect(Math.max(...r.map((x) => (x.detail.user_ids as string[]).length))).toBe(READ_LOG_MAX_IDS);
  });

  it("writes none of the 450-member rows when one row fails (all or nothing)", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => id(i + 1));
    // The last row's single user id is malformed, so the one statement fails.
    await expect(
      logAdminReads(query, "peter@example.com", "/admin/runs", [
        { what: "read_runs", userIds: ids },
        { what: "read_picks", userIds: ["not-a-uuid"] },
      ]),
    ).rejects.toThrow();
    expect(await rows()).toEqual([]);
  });

  it("writes nothing when no member's data is shown", async () => {
    await logAdminReads(query, "peter@example.com", "/admin/runs", [{ what: "read_runs", userIds: [null] }, { what: "read_picks", userIds: [] }]);
    expect(await rows()).toEqual([]);
  });

  it("names the password admin as such", async () => {
    await logAdminReads(query, "admin (password)", "/admin/cora", [{ what: "read_picks", userIds: [id(9)] }]);
    expect((await rows())[0].admin_email).toBe("admin (password)");
  });

  it("is all or nothing, and throws when the write fails (fail-closed)", async () => {
    const failing: Query = async (t, p) => {
      if (/insert into admin_actions/.test(t)) throw new Error("db down");
      return query(t, p);
    };
    await expect(logAdminReads(failing, "peter@example.com", "/admin/runs", [{ what: "read_runs", userIds: [id(1)] }])).rejects.toThrow("db down");
    // A malformed id fails the one statement: neither row is written.
    await expect(
      logAdminReads(query, "peter@example.com", "/admin/users/[id]", [
        { what: "read_runs", userIds: [id(1)] },
        { what: "read_picks", userIds: ["not-a-uuid"] },
      ]),
    ).rejects.toThrow();
    expect(await rows()).toEqual([]);
  });
});

describe("readsOfMember", () => {
  it("lists the page views that showed the member, newest first, with their kinds, from user_id or user_ids", async () => {
    await logAdminReads(query, "peter@example.com", "/admin/users/[id]", [
      { what: "read_runs", userIds: [id(1)] },
      { what: "read_feedback", userIds: [id(1)] },
    ]);
    await query("update admin_actions set created_at = now() - interval '2 hours'");
    await logAdminReads(query, "tim@example.com", "/admin/runs", [{ what: "read_runs", userIds: Array.from({ length: 450 }, (_, i) => id(i + 1)) }]);
    // Another member's read, and a real action on this member, are not listed.
    await logAdminReads(query, "tim@example.com", "/admin/cora", [{ what: "read_picks", userIds: [id(999)] }]);
    await query("insert into admin_actions (admin_email, user_id, action, detail) values ('peter@example.com', $1, 'nudge', '{}')", [id(1)]);
    const list = await readsOfMember(query, id(1));
    expect(list.map((x) => [x.adminEmail, x.page, x.kinds])).toEqual([
      ["tim@example.com", "/admin/runs", ["read_runs"]],
      ["peter@example.com", "/admin/users/[id]", ["read_feedback", "read_runs"]],
    ]);
    // A member in the third 200-id row is found too.
    expect((await readsOfMember(query, id(430))).map((x) => x.page)).toEqual(["/admin/runs"]);
    expect(await readsOfMember(query, id(1000))).toEqual([]);
  });

  it("returns at most the limit, 50 by default", async () => {
    await query(
      `insert into admin_actions (admin_email, user_id, action, detail, created_at)
       select 'peter@example.com', $1::uuid, 'read_runs', jsonb_build_object('page', '/admin/users/[id]'), now() - make_interval(mins => g) from generate_series(1, 60) g`,
      [id(1)],
    );
    const list = await readsOfMember(query, id(1));
    expect(list).toHaveLength(50);
    expect(list[0].at > list[49].at).toBe(true);
    expect(await readsOfMember(query, id(1), 5)).toHaveLength(5);
  });
});
