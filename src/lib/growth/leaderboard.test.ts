import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { clearDisplayName } from "@/lib/admin/users";
import { testDb } from "@/test-helpers/pglite-db";
import { BOARD_LIMIT, joinLeaderboard, leaderboardFor, leaveLeaderboard, myBoardStanding, renameOnBoard } from "./leaderboard";
import { checkLeaderboardName, isNameTaken, NAME_INDEX, NAME_TAKEN, skeleton } from "./leaderboard-name";
import { myStanding, standingOf, standingsFor } from "./points";

/** B2 plan Unit 7: the opt-in board, its name rules and the unique-name race. */

let query: Query;
const NOW = new Date("2026-11-27T12:00:00Z");

beforeEach(async () => {
  ({ query } = await testDb());
});

async function user(email: string, o: { status?: string; displayName?: string; optedIn?: boolean } = {}) {
  const [u] = await query<{ id: string }>(
    "insert into users (email, status, display_name, leaderboard_name_key, leaderboard_opt_in_at) values ($1, $2, $3, $4, $5) returning id",
    [email, o.status ?? "active", o.displayName ?? "", o.displayName ? skeleton(o.displayName) : null, o.optedIn ? NOW.toISOString() : null],
  );
  return u.id;
}
async function points(userId: string, adopted: number, confirmed: number, week = "2026-11-16") {
  await query("insert into points (user_id, week_of, adopted, confirmed, total, computed_at) values ($1, $2, $3, $4, $5, now())", [userId, week, adopted, confirmed, adopted + confirmed]);
}
const reserved = { ok: false, message: "That name is reserved. Try another." };

describe("checkLeaderboardName", () => {
  it("accepts 2 to 30 characters, trimmed and with spaces collapsed, Latin with accents", () => {
    expect(checkLeaderboardName("  Ken   R.  ")).toEqual({ ok: true, name: "Ken R.", key: "kenr" });
    expect(checkLeaderboardName("Al")).toMatchObject({ ok: true });
    expect(checkLeaderboardName("a".repeat(30))).toMatchObject({ ok: true });
    expect(checkLeaderboardName("Zoë Gauthier")).toMatchObject({ ok: true, name: "Zoë Gauthier" });
    expect(checkLeaderboardName("O’Neil & Sons-2")).toMatchObject({ ok: true, name: "O'Neil & Sons-2" });
    // A decomposed accent (one combining mark) is fine.
    expect(checkLeaderboardName("Zoe\u0308")).toMatchObject({ ok: true });
  });

  it("rejects 1 and 31 characters, and blank", () => {
    expect(checkLeaderboardName("K")).toMatchObject({ ok: false, message: "Use 2 to 30 characters." });
    expect(checkLeaderboardName("a".repeat(31))).toMatchObject({ ok: false, message: "Use 2 to 30 characters." });
    expect(checkLeaderboardName("   ")).toMatchObject({ ok: false });
  });

  it("needs two visible letters or digits", () => {
    expect(checkLeaderboardName("--")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("A.")).toMatchObject({ ok: false, message: "Include at least two letters or numbers." });
  });

  it("NFKC-normalises, so full-width and ligature forms become plain letters", () => {
    expect(checkLeaderboardName("Ｋｅｎ")).toMatchObject({ ok: true, name: "Ken" });
    expect(checkLeaderboardName("ﬁona")).toMatchObject({ ok: true, name: "fiona" });
  });

  it("rejects control, bidi, invisible and blank characters", () => {
    for (const cp of [0x0, 0x7, 0x1b, 0x7f, 0x85, 0xad, 0x200b, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x061c, 0xfeff, 0x2028, 0xe000, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800]) {
      expect(checkLeaderboardName(`Ken${String.fromCharCode(cp)}R`), `U+${cp.toString(16)}`).toMatchObject({ ok: false });
    }
    expect(checkLeaderboardName("Ken\nR")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("\u3164\u3164")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("\u2800\u2800\u2800")).toMatchObject({ ok: false });
  });

  it("is Latin script only: a Cyrillic or Greek look-alike is rejected", () => {
    expect(checkLeaderboardName("Rоger")).toMatchObject({ ok: false }); // Cyrillic о
    expect(checkLeaderboardName("Аnna")).toMatchObject({ ok: false }); // Cyrillic А
    expect(checkLeaderboardName("Anna")).toMatchObject({ ok: true });
    expect(checkLeaderboardName("Οscar")).toMatchObject({ ok: false }); // Greek Ο
    expect(checkLeaderboardName("Ken 王")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("Ken 🙂")).toMatchObject({ ok: false });
  });

  it("rejects stacked combining marks (zalgo) and a mark with no letter", () => {
    expect(checkLeaderboardName("Ke\u0301\u0302\u0303n")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("Z\u0336\u0337a\u0338lgo")).toMatchObject({ ok: false });
    expect(checkLeaderboardName("Ken \u0301R")).toMatchObject({ ok: false });
  });

  it("rejects reserved names in any case, spacing or look-alike spelling, and staff words anywhere", () => {
    for (const n of ["roger", "ROGER", "Roger AI", "Meet Roger", "meetroger", "R0ger", "Rog3r", "R.o.g.e.r", "Rögér", "Zack", "cora", "C0ra", "Admin", "adrnin", "SUPPORT", "5upp0rt", "Roger Support", "Ken Admin", "Ｒｏｇｅｒ"]) {
      expect(checkLeaderboardName(n), n).toMatchObject(reserved);
    }
    expect(checkLeaderboardName("Roger Tremblay")).toMatchObject({ ok: true });
    expect(checkLeaderboardName("Zack M.")).toMatchObject({ ok: true });
  });

  it("allows only the listed Latin letters: IPA, small capitals and phonetic letters are rejected", () => {
    for (const n of ["Ro{g}er".replace("{g}", String.fromCharCode(0x261)), String.fromCharCode(0x1d00) + "dmin", "Ken" + String.fromCharCode(0x250), "Ken" + String.fromCharCode(0x1d6f)]) {
      expect(checkLeaderboardName(n), n).toMatchObject({ ok: false, message: expect.stringContaining("Latin letters") });
    }
    for (const n of ["Ștefan Țurcanu", "Nguyễn Văn Ơn", "Łukasz Øster", "Ǿrjan", "Ðiðrik Þór", "Ŵyn Jones"]) {
      expect(checkLeaderboardName(n), n).toMatchObject({ ok: true });
    }
  });

  it("folds non-decomposing letters and i, l, 1 together, so look-alikes are reserved or taken", () => {
    expect(skeleton("Røger")).toBe("roger");
    expect(skeleton("Straße")).toBe("strasse");
    expect(skeleton("Æsir Œuvre Þor")).toBe("aeslroeuvrethor");
    expect(skeleton("Iian")).toBe(skeleton("lian"));
    expect(skeleton("l1an")).toBe(skeleton("lian"));
    for (const n of ["Røger", "RogerAdmin", "TheAdmin", "Roger Bot", "Roger HQ", "Roger Team", "Roger AI", "Ken Støff Admin", "Rogerbot"]) {
      expect(checkLeaderboardName(n), n).toMatchObject(reserved);
    }
    for (const n of ["Roger Tremblay", "Zack M.", "Tremblay Roger", "Cora Lee"]) expect(checkLeaderboardName(n), n).toMatchObject({ ok: true });
  });

  it("does not catch real names that merely contain a staff word (review round 3)", () => {
    for (const n of ["Roger Alvarez", "Roger Allen", "Stafford", "Badminton", "Supportiv", "Ken Stafford", "Teamwork Realty", "Helpful Hank"]) {
      expect(checkLeaderboardName(n), n).toMatchObject({ ok: true });
    }
  });

  it("rejects joined staff forms, admin/official at the start or end of a word, and staff words right after Roger", () => {
    const rejected = [
      "RogerAdmin", "RogerTeam", "Roger-Support", "RogerHQ", "rogerbot", "RogerStaff", "MeetRogerAI", "Ken Moderator", "SuperModerator",
      "TheAdmin", "AdminKen", "Admins", "Ken Official", "Officials Group",
      "Roger Staff", "Roger Support", "Roger Team", "Roger Help", "Roger Bot", "Roger HQ", "Roger AI", "Roger Al", "Roger A1",
      "Support", "Staff", "Team", "Help", "Bot", "HQ", "RogerAI",
    ];
    for (const n of rejected) expect(checkLeaderboardName(n), n).toMatchObject(reserved);
  });

  it("skeleton folds case, accents, look-alike digits, rn and vv", () => {
    expect(skeleton("Ann4")).toBe(skeleton("Anna"));
    expect(skeleton("Zoë")).toBe("zoe");
    expect(skeleton("Mo rn")).toBe("mom");
    expect(skeleton("Vvendy")).toBe("wendy");
    expect(skeleton("L1z")).toBe("llz");
  });
});

describe("isNameTaken", () => {
  it("is true only for a unique violation on the board-name index", async () => {
    await user("a@example.com", { displayName: "Ace", optedIn: true });
    const b = await user("b@example.com");
    const nameClash = await query("update users set leaderboard_name_key = 'ace', leaderboard_opt_in_at = now() where id = $1", [b]).catch((e) => e);
    expect(nameClash).toMatchObject({ code: "23505", constraint: NAME_INDEX });
    expect(isNameTaken(nameClash)).toBe(true);
    const emailClash = await query("update users set email = 'a@example.com' where id = $1", [b]).catch((e) => e);
    expect(emailClash).toMatchObject({ code: "23505" });
    expect(isNameTaken(emailClash)).toBe(false);
    expect(isNameTaken(new Error("boom"))).toBe(false);
    expect(isNameTaken({ code: "23505" })).toBe(false);
  });
});

describe("the one standing reader", () => {
  it("myStanding, standingOf and standingsFor agree, and a member with no points ranks after all who have some", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const z = await user("z@example.com");
    await points(a, 3, 0);
    await points(b, 1, 0);
    expect(myStanding([], z)).toEqual({ userId: z, adopted: 0, confirmed: 0, total: 0, rank: 1 });
    expect(await standingOf(query, z)).toEqual({ userId: z, adopted: 0, confirmed: 0, total: 0, rank: 3 });
    expect((await standingsFor(query, [a, z])).get(z)).toEqual(await standingOf(query, z));
    expect(await standingOf(query, b)).toMatchObject({ total: 1, rank: 2 });
    expect(await myBoardStanding(query, b)).toEqual({ points: 1, adopted: 1, confirmed: 0, rank: 2, optedIn: false, name: "" });
  });
});

describe("joining and leaving", () => {
  it("opting in with 'Ken R.' puts the member on the board at their rank (counted over every member)", async () => {
    const ken = await user("ken@example.com", { displayName: "Kenneth" });
    const top = await user("top@example.com");
    const mid = await user("mid@example.com", { displayName: "Mia", optedIn: true });
    await points(top, 5, 3);
    await points(ken, 2, 1);
    await points(mid, 3, 1);

    expect((await leaderboardFor(query, ken)).board.map((r) => r.name)).toEqual(["Mia"]);
    expect(await joinLeaderboard(query, ken, "Ken R.", NOW)).toEqual({ ok: true, name: "Ken R." });

    const lb = await leaderboardFor(query, ken);
    expect(lb.board).toEqual([
      { rank: 2, name: "Mia", adopted: 3, confirmed: 1, total: 4, isMe: false },
      { rank: 3, name: "Ken R.", adopted: 2, confirmed: 1, total: 3, isMe: true },
    ]);
    expect(lb.me).toEqual({ points: 3, adopted: 2, confirmed: 1, rank: 3, optedIn: true, name: "Ken R." });
    expect(lb.meShown).toBe(true);
    const [u] = await query<{ display_name: string; key: string }>("select display_name, leaderboard_name_key as key from users where id = $1", [ken]);
    expect(u).toEqual({ display_name: "Ken R.", key: "kenr" });
  });

  it("a display_name set in settings alone does not put anyone on the board; they see their own standing privately", async () => {
    const ana = await user("ana@example.com", { displayName: "Ana Settings" });
    await points(ana, 4, 0);
    const lb = await leaderboardFor(query, ana);
    expect(lb.board).toEqual([]);
    expect(lb.me).toEqual({ points: 4, adopted: 4, confirmed: 0, rank: 1, optedIn: false, name: "Ana Settings" });
  });

  it("members tied on points share a rank, and members with no points share the rank after everyone with some", async () => {
    const a = await user("a@example.com", { displayName: "Ann", optedIn: true });
    const b = await user("b@example.com", { displayName: "Bo", optedIn: true });
    const c = await user("c@example.com", { displayName: "Cy", optedIn: true });
    const d = await user("d@example.com", { displayName: "Di", optedIn: true });
    await user("e@example.com", { displayName: "Ed", optedIn: true });
    await points(a, 2, 0);
    await points(b, 2, 0);
    await points(c, 1, 0);
    expect((await leaderboardFor(query, d)).board.map((r) => [r.rank, r.name, r.total])).toEqual([
      [1, "Ann", 2],
      [1, "Bo", 2],
      [3, "Cy", 1],
      [4, "Di", 0],
      [4, "Ed", 0],
    ]);
  });

  it("rejects a name an opted-in member already holds, ignoring case and look-alikes, and allows it when the holder is not opted in", async () => {
    await user("ken@example.com", { displayName: "Ken R.", optedIn: true });
    await user("anna@example.com", { displayName: "Anna", optedIn: true });
    await user("kim@example.com", { displayName: "Kim" });
    const me = await user("me@example.com");
    expect(await joinLeaderboard(query, me, "ken r.", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
    expect(await joinLeaderboard(query, me, "KEN-R", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
    expect(await joinLeaderboard(query, me, "Ann4", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
    expect(await joinLeaderboard(query, me, "Ｋｅｎ R", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
    expect(await joinLeaderboard(query, me, "KIM", NOW)).toEqual({ ok: true, name: "KIM" });
  });

  it("'Iian' is taken when 'lian' is on the board", async () => {
    await user("lian@example.com", { displayName: "lian", optedIn: true });
    const me = await user("me@example.com");
    expect(await joinLeaderboard(query, me, "Iian", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
  });

  it("a legacy opted-in row with no name key is not on the board, and can join again", async () => {
    const [{ id: old }] = await query<{ id: string }>(
      "insert into users (email, status, display_name, leaderboard_opt_in_at) values ('old@example.com', 'active', 'Old Timer', $1) returning id",
      [NOW.toISOString()],
    );
    const lb = await leaderboardFor(query, old);
    expect(lb.board).toEqual([]);
    expect(lb.me.optedIn).toBe(false);
    expect(await myBoardStanding(query, old)).toMatchObject({ optedIn: false });
    expect(await renameOnBoard(query, old, "Old Timer", { join: false, now: NOW })).toMatchObject({ ok: false, reason: "not_on_board" });
    expect(await joinLeaderboard(query, old, "Old Timer", NOW)).toEqual({ ok: true, name: "Old Timer" });
    expect((await leaderboardFor(query, old)).board.map((r) => r.name)).toEqual(["Old Timer"]);
    const [u] = await query<{ key: string }>("select leaderboard_name_key as key from users where id = $1", [old]);
    expect(u.key).toBe(skeleton("Old Timer"));
  });

  it("a status change that does not close the account keeps the member on the board; cancelling takes them off", async () => {
    const a = await user("a@example.com", { displayName: "Ann", optedIn: true });
    const [{ id: t }] = await query<{ id: string }>(
      "insert into users (email, status, display_name, leaderboard_name_key, leaderboard_opt_in_at) values ('t@example.com', 'trial', 'Tia', 'tla', now()) returning id",
    );
    await query("update users set status = 'held', hold_reason = 'renewal_unpaid' where id = $1", [a]);
    await query("update users set status = 'active' where id = $1", [t]);
    const opted = async (id: string) => (await query<{ at: string | null }>("select leaderboard_opt_in_at as at from users where id = $1", [id]))[0].at;
    expect(await opted(a)).not.toBeNull();
    expect(await opted(t)).not.toBeNull();
    expect((await leaderboardFor(query, a)).board.map((r) => r.name).sort()).toEqual(["Ann", "Tia"]);
    await query("update users set status = 'cancelled' where id = $1", [t]);
    expect(await opted(t)).toBeNull();
    expect((await leaderboardFor(query, a)).board.map((r) => r.name)).toEqual(["Ann"]);
  });

  it("two members racing for one name: one wins, the other is told it is taken", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const results = await Promise.all([joinLeaderboard(query, a, "Ken R.", NOW), joinLeaderboard(query, b, "ken r.", NOW)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, message: NAME_TAKEN, reason: "taken" }]);
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from users where leaderboard_opt_in_at is not null");
    expect(n).toBe(1);
  });

  it("turns the index's unique violation (the race the guard cannot see) into 'taken', and rethrows any other error", async () => {
    await user("a@example.com", { displayName: "Ken R.", optedIn: true });
    const b = await user("b@example.com");
    // A real unique violation from the index, raised where the guarded write runs.
    const racing: Query = async (text, params) => {
      if (text.includes("update users u set display_name")) return query(`update users set leaderboard_name_key = 'kenr', leaderboard_opt_in_at = now() where id = $1`, [b]);
      return query(text, params);
    };
    expect(await joinLeaderboard(racing, b, "Ken R.", NOW)).toMatchObject({ ok: false, message: NAME_TAKEN });
    const broken: Query = async (text, params) => {
      if (text.includes("update users u set display_name")) return query(`update users set email = 'a@example.com' where id = $1`, [b]);
      return query(text, params);
    };
    await expect(joinLeaderboard(broken, b, "Bea", NOW)).rejects.toMatchObject({ code: "23505" });
  });

  it("renaming while on the board keeps the first opt-in time, and a member may re-use their own name in another case", async () => {
    const ken = await user("ken@example.com", { displayName: "Ken", optedIn: true });
    expect(await joinLeaderboard(query, ken, "KEN", new Date("2026-12-01T00:00:00Z"))).toEqual({ ok: true, name: "KEN" });
    const [u] = await query<{ at: string }>("select leaderboard_opt_in_at as at from users where id = $1", [ken]);
    expect(new Date(u.at).toISOString()).toBe(NOW.toISOString());
  });

  it("renameOnBoard without join changes the name only for a member on the board", async () => {
    const off = await user("off@example.com", { displayName: "Off" });
    expect(await renameOnBoard(query, off, "New Name", { join: false, now: NOW })).toMatchObject({ ok: false, reason: "not_on_board" });
    const [u] = await query<{ display_name: string; opted: string | null }>("select display_name, leaderboard_opt_in_at as opted from users where id = $1", [off]);
    expect(u).toEqual({ display_name: "Off", opted: null });
  });

  it("leaving removes the member from the board and keeps their private standing", async () => {
    const ken = await user("ken@example.com", { displayName: "Ken R.", optedIn: true });
    await points(ken, 1, 1);
    await leaveLeaderboard(query, ken);
    const lb = await leaderboardFor(query, ken);
    expect(lb.board).toEqual([]);
    expect(lb.me).toMatchObject({ points: 2, rank: 1, optedIn: false });
  });

  it("closing or cancelling an account takes it off the board and frees its name; a closed member cannot join", async () => {
    const ken = await user("ken@example.com", { displayName: "Ken R.", optedIn: true });
    const cy = await user("cy@example.com", { displayName: "Cy", optedIn: true });
    const me = await user("me@example.com");
    await points(ken, 9, 0);
    await query("update users set status = 'closed' where id = $1", [ken]);
    await query("update users set status = 'cancelled' where id = $1", [cy]);
    const lb = await leaderboardFor(query, me);
    expect(lb.board).toEqual([]);
    expect(lb.me.rank).toBe(1);
    expect(await joinLeaderboard(query, me, "Ken R.", NOW)).toEqual({ ok: true, name: "Ken R." });
    expect(await joinLeaderboard(query, ken, "Back Again", NOW)).toEqual({ ok: false, message: "Your account can’t join the leaderboard.", reason: "account" });
    const [u] = await query<{ display_name: string; opted: string | null }>("select display_name, leaderboard_opt_in_at as opted from users where id = $1", [ken]);
    expect(u).toEqual({ display_name: "Ken R.", opted: null });
  });

  it(`shows at most ${BOARD_LIMIT} rows; a member ranked below still has their standing`, async () => {
    await query(
      `with u as (insert into users (email, status, display_name, leaderboard_name_key, leaderboard_opt_in_at)
         select 'm' || lpad(g::text, 3, '0') || '@example.com', 'active', 'Member ' || g, 'member' || g, now() from generate_series(1, ${BOARD_LIMIT}) g returning id, email)
       insert into points (user_id, week_of, adopted, confirmed, total, computed_at)
         select id, '2026-11-16', 200 - substring(email from 2 for 3)::int, 0, 200 - substring(email from 2 for 3)::int, now() from u`,
    );
    const me = await user("last@example.com", { displayName: "Last One", optedIn: true });
    await points(me, 1, 0);
    const lb = await leaderboardFor(query, me);
    expect(lb.board).toHaveLength(BOARD_LIMIT);
    expect(lb.meShown).toBe(false);
    expect(lb.me).toMatchObject({ rank: BOARD_LIMIT + 1, points: 1, optedIn: true });
  });

  it("an admin clearing a name removes the member from the board and logs it", async () => {
    const ken = await user("ken@example.com", { displayName: "Ken R.", optedIn: true });
    const me = await user("me@example.com");
    expect(await clearDisplayName(query, "peter@example.com", ken)).toMatchObject({ ok: true });
    expect((await leaderboardFor(query, me)).board).toEqual([]);
    const [u] = await query<{ display_name: string; key: string | null; opted: string | null }>(
      "select display_name, leaderboard_name_key as key, leaderboard_opt_in_at as opted from users where id = $1",
      [ken],
    );
    expect(u).toEqual({ display_name: "", key: null, opted: null });
    const [log] = await query<{ admin_email: string; action: string; detail: Record<string, unknown> }>("select admin_email, action, detail from admin_actions where user_id = $1", [ken]);
    expect(log).toEqual({ admin_email: "peter@example.com", action: "clear_display_name", detail: { name: "Ken R.", wasOnLeaderboard: true } });
  });

  it("an admin clearing a member who is not on the board clears the name only; an unknown id logs nothing", async () => {
    const ana = await user("ana@example.com", { displayName: "Ana S." });
    expect(await clearDisplayName(query, "peter@example.com", ana)).toEqual({ ok: true, message: "Display name cleared." });
    const [log] = await query<{ detail: Record<string, unknown> }>("select detail from admin_actions where user_id = $1", [ana]);
    expect(log.detail).toEqual({ name: "Ana S.", wasOnLeaderboard: false });
    expect(await clearDisplayName(query, "peter@example.com", "00000000-0000-4000-8000-000000000099")).toEqual({ ok: false, message: "No such user." });
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from admin_actions");
    expect(n).toBe(1);
  });
});
