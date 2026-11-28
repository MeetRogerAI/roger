import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { coraWeek, flaggedPlay, FRIDAY, member, note, pick, poolPlay, reply, run, WEEK } from "@/test-helpers/review-fixtures";
import { bound, EVIDENCE_LIMITS, type EvidenceItem, loadEvidence, reasonTemplate, reviewWeek } from "./evidence";

const ADMIN = "admin@roger.test";
let q: Query;

beforeEach(async () => {
  ({ query: q } = await testDb());
});

const load = () => loadEvidence(q, { week: WEEK, now: FRIDAY, admins: [ADMIN] });
const byKind = (items: EvidenceItem[], kind: string) => items.filter((i) => i.kind === kind);

describe("reviewWeek", () => {
  it("is the latest list Monday at or before now, in Toronto", () => {
    expect(reviewWeek(FRIDAY)).toBe(WEEK);
    expect(reviewWeek(new Date("2026-11-23T05:30:00Z"))).toBe(WEEK); // Monday 00:30 Toronto
    expect(reviewWeek(new Date("2026-11-23T04:30:00Z"))).toBe("2026-11-16"); // Sunday 23:30 Toronto
  });
});

describe("loadEvidence", () => {
  it("is empty for a week with no runs, picks or feedback", async () => {
    await member(q, "a@example.com");
    expect(await load()).toEqual({ items: [], empty: true });
  });

  it("gathers the week's runs, flags, rejections, Cora outcomes, picks, versions, feedback and cancellation reasons, with references", async () => {
    const a = await member(q, "a@example.com", { cancelReason: "Too pricey for me", cancelAt: "2026-11-24T10:00:00Z" });
    const b = await member(q, "b@example.com");
    const r1 = await run(q, a, { status: "flagged", parsedBy: "model" });
    await run(q, b, { status: "rejected", reason: "Zack's report was too long to read automatically" });
    const p = await flaggedPlay(q, r1, a, ["contains a link"]);
    const pp = await poolPlay(q);
    await pick(q, a, pp, { opened: true, marked: true });
    await pick(q, b, pp, { week: "2026-11-16", position: 2 });
    await coraWeek(q, a, "picked");
    await coraWeek(q, b, "short", "Only 2 eligible plays");
    const f = await note(q, a, "The ideas were too technical for me");
    const rep = await reply(q, b, "Loved the calendar idea");

    const { items, empty } = await load();
    expect(empty).toBe(false);
    expect(items.map((i) => i.id)).toEqual(items.map((_, i) => `e${i + 1}`));
    // Feedback first (newest first), then cancellation reasons, flags and rejections, then the counts.
    expect(items.slice(0, 3).map((i) => i.ref)).toEqual([
      { kind: "feedback", id: rep },
      { kind: "feedback", id: f },
      { kind: "cancel_reason", id: a },
    ]);
    expect(items[1].text).toBe(`A member's note on their list of ${WEEK}: The ideas were too technical for me`);
    expect(items[0].member && items[2].member).toBe(true);
    expect(byKind(items, "play_flag")).toEqual([{ id: expect.any(String), kind: "play_flag", ref: { kind: "play", id: p }, text: "1 play flagged this week: contains a link", member: true }]);
    expect(byKind(items, "run_reason")[0].text).toBe("1 run rejected: Zack's report was too long to read automatically");
    expect(byKind(items, "cora_note")[0]).toMatchObject({ ref: { kind: "cora_user_week", id: `${b}:${WEEK}` }, text: "1 member's list was short: Only 2 eligible plays" });
    expect(byKind(items, "run_counts")[0].text).toBe(`Runs for the list of ${WEEK} from claude: 2 in all (1 flagged, 1 rejected). 1 of 2 read by the model rather than from the roger-run block.`);
    expect(byKind(items, "cora_counts")[0].text).toBe(`Cora's lists for ${WEEK}: 1 picked, 1 short.`);
    const picks = byKind(items, "pick_counts").map((i) => i.text);
    expect(picks).toContain(`Ideas sent for the list of ${WEEK}, position 1: 1 sent, 1 opened, 1 marked set up, 0 confirmed set up.`);
    expect(picks).toContain("Ideas sent for the list of 2026-11-16, position 2: 1 sent, 0 opened, 0 marked set up, 0 confirmed set up.");
    expect(byKind(items, "versions")[0].text).toBe(`Instruction versions in use for ${WEEK}: Cora method cora987 (2), Zack claude abc1234 (2).`);
    // Never whole raw run text.
    expect(JSON.stringify(items)).not.toContain("RAW RUN TEXT");
  });

  it("leaves out admins, test runs, dry-run picks, other weeks' runs and feedback older than 14 days", async () => {
    const admin = await member(q, ADMIN);
    const a = await member(q, "a@example.com");
    await run(q, admin);
    await note(q, admin, "admin note");
    await run(q, a, { test: true });
    await run(q, a, { week: "2026-11-16" });
    await pick(q, a, await poolPlay(q), { dryRun: true });
    await reply(q, a, "old reply", "2026-11-12T10:00:00Z");
    await reply(q, a, "future reply", "2026-11-28T10:00:00Z");
    expect(await load()).toEqual({ items: [], empty: true });
  });

  it("gives run reasons as member text, with quoted play titles replaced by a placeholder and the same template merged", async () => {
    const a = await member(q, "a@example.com");
    const b = await member(q, "b@example.com");
    await run(q, a, { status: "rejected", reason: 'In "Dana Whitfield weekly sync", the low end of the hours range is above the high end.' });
    await run(q, b, { status: "rejected", reason: 'In "Acme invoice chase", the low end of the hours range is above the high end.' });
    const reasons = byKind((await load()).items, "run_reason");
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ member: true, text: '2 runs rejected: In "[a play title]", the low end of the hours range is above the high end.' });
    expect(JSON.stringify(reasons)).not.toMatch(/Dana|Acme/);
    const L = String.fromCharCode(0x201c);
    const R = String.fromCharCode(0x201d);
    expect(reasonTemplate(`In ${L}Inbox zero${R}, x. Zack's report has 'Acme' in it.`)).toBe(`In "[a play title]", x. Zack's report has "[a play title]" in it.`);
  });

  it("clips each item to 600 characters", async () => {
    const a = await member(q, "a@example.com");
    await note(q, a, "x".repeat(2_000));
    const { items } = await load();
    expect([...items[0].text].length).toBe(EVIDENCE_LIMITS.itemChars);
  });
});

describe("bound", () => {
  it("keeps every feedback item over 80 and trims the counts first, within 40,000 characters", () => {
    const fb = Array.from({ length: 70 }, (_, i) => ({ kind: "feedback" as const, ref: { kind: "feedback" as const, id: `f${i}` }, text: `note ${i} ${"y".repeat(500)}`, member: true }));
    const counts = Array.from({ length: 30 }, (_, i) => ({ kind: "pick_counts" as const, ref: { kind: "counts" as const, id: `c${i}` }, text: `count ${i}`, member: false }));
    const items = bound([...counts, ...fb]);
    expect(items).toHaveLength(EVIDENCE_LIMITS.items);
    expect(byKind(items, "feedback")).toHaveLength(70);
    expect(byKind(items, "pick_counts")).toHaveLength(10);
    const big = bound(Array.from({ length: 80 }, (_, i) => ({ kind: "feedback" as const, ref: { kind: "feedback" as const, id: `f${i}` }, text: "z".repeat(600), member: true })));
    expect(big).toHaveLength(66);
    expect(big.reduce((n, i) => n + i.text.length, 0)).toBeLessThanOrEqual(EVIDENCE_LIMITS.totalChars);
  });
});
