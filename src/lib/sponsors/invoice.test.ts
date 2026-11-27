import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeSponsors } from "@/test-helpers/fake-sponsors";
import { testDb } from "@/test-helpers/pglite-db";
import { HOLD_MINUTES, lastMonth, monthStart, prepareSponsorInvoice, REPREPARE, sendSponsorInvoice, sponsorBill, TAX_INCOMPLETE } from "./invoice";
import { createSponsor, releaseSeat, UNBILLED_SEAT_SQL } from "./sponsors";

/**
 * B2 plan Unit 10 and its review: the sponsor's calendar-month invoice. A
 * seat is billed for every month it was held by a member past their third
 * delivered list; B1's weekly contributor test, run per seat, decides
 * standard or higher. Nothing is recorded or sent to the member. Prepare
 * owns the month by a claim token; send refuses a stale draft or incomplete
 * tax, and never sends twice.
 */

let query: Query;
let gw: ReturnType<typeof fakeSponsors>;
const settings = mergeV3([]);
const BY = "peter@meetroger.ai";
const DEC_3 = new Date("2026-12-03T15:00:00Z");
const NOV = "2026-11-01";
const NOV_WEEKS = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
const THREE = ["2026-10-19", "2026-10-26", "2026-11-02"];
let sponsorId: string;

async function member(email: string, o: { delivered: string[]; ran?: string[]; status?: string; sharing?: string; from?: string; to?: string | null; closedAt?: string }) {
  const [u] = await query<{ id: string }>(
    `insert into users (email, name, status, plan, sharing, currency, sponsor_id, access_ends_at) values ($1, $2, $3, 'monthly', $4, 'CAD', $5, $6) returning id`,
    [email, email.split("@")[0], o.status ?? "trial", o.sharing ?? "share", o.to ? null : sponsorId, o.closedAt ?? null],
  );
  await query(`insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from, held_to) values ($1, $2, 1, $3, $4)`, [sponsorId, u.id, o.from ?? "2026-10-01T12:00:00Z", o.to ?? null]);
  for (const w of o.delivered) {
    await query(`insert into cora_user_weeks (user_id, week_of, outcome, picked_count, delivered_at) values ($1, $2, 'picked', 3, $3::date + interval '12 hours')`, [u.id, w, w]);
  }
  for (const w of o.ran ?? []) {
    await query(`insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'x', 'accepted')`, [u.id, w]);
  }
  return u.id;
}
const except = (...missed: string[]) => NOV_WEEKS.filter((w) => !missed.includes(w));
const snapshot = async (id: string) => (await query(`select * from users where id = $1`, [id]))[0];
const deps = (o: { now?: Date; clock?: () => Date } = {}) => ({ by: BY, sponsorId, month: "2026-11", settings, now: o.now ?? DEC_3, clock: o.clock ?? (() => o.now ?? DEC_3) });
const prepare = (o: Parameters<typeof deps>[0] = {}) => prepareSponsorInvoice(query, gw, deps(o));
const send = (now = DEC_3) => sendSponsorInvoice(query, gw, { by: BY, sponsorId, month: "2026-11", settings, now });
const draftOf = async () => (await query<{ stripe_invoice: string | null }>(`select stripe_invoice from sponsor_invoices where sponsor_id = $1 and month = $2`, [sponsorId, NOV]))[0]?.stripe_invoice ?? null;

beforeEach(async () => {
  ({ query } = await testDb());
  gw = fakeSponsors();
  const s = await createSponsor(query, gw, BY, {
    name: "Harbour Realty",
    currency: "CAD",
    standardCents: 20000,
    higherCents: 40000,
    seats: 10,
    billingEmail: "ap@harbour.example",
    billingCountry: "CA",
    billingPostal: "M5V 2T6",
  });
  if (!s.ok) throw new Error(s.message);
  sponsorId = s.id;
  for (const w of [...NOV_WEEKS, "2026-12-07"]) await query(`insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')`, [w]);
});

describe("which seats, at which price", () => {
  it("November, 3 seats, one member missed 2 unexcused weeks: 2 × standard and 1 × higher, in CAD, with tax; that member gets no notice and is unchanged", async () => {
    await member("ana@example.com", { delivered: THREE, ran: NOV_WEEKS });
    await member("bo@example.com", { delivered: THREE, ran: NOV_WEEKS });
    const cy = await member("cy@example.com", { delivered: THREE, ran: except("2026-11-09", "2026-11-16") });
    const before = await snapshot(cy);

    const bill = (await sponsorBill(query, sponsorId, NOV, settings))!;
    expect([bill.standard, bill.higher]).toEqual([2, 1]);
    expect(bill.seats.find((s) => s.userId === cy)?.weeks.filter((w) => w.result === "missed").map((w) => w.week)).toEqual(["2026-11-09", "2026-11-16"]);

    const r = await prepare();
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("CA$904 with tax") });
    const [inv] = [...gw.invoices.values()];
    expect(inv).toMatchObject({ currency: "CAD", automaticTax: true, taxStatus: "complete", subtotalCents: 80000, taxCents: 10400, description: "Roger for Harbour Realty, November 2026" });
    expect(gw.linesOf(inv.id)).toEqual([
      ["higher", 1, 40000],
      ["standard", 2, 20000],
    ]);
    expect(await draftOf()).toBe(inv.id);

    // No notice and no record for the member; nothing at all went out by mail.
    expect(await query(`select 1 from notifications`)).toHaveLength(0);
    expect(await query(`select 1 from contribution_weeks`)).toHaveLength(0);
    expect(await query(`select 1 from pending_adjustments`)).toHaveLength(0);
    expect(await snapshot(cy)).toEqual(before);
  });

  it("one missed week, or two with one excused (by an admin or by Roger's failure), keeps the seat at standard", async () => {
    await member("one@example.com", { delivered: THREE, ran: except("2026-11-09") });
    const ex = await member("ex@example.com", { delivered: THREE, ran: except("2026-11-09", "2026-11-16") });
    await query(`insert into week_excuses (week_of, user_id, excused_by) values ('2026-11-16', $1, $2)`, [ex, BY]);
    const roger = await member("roger@example.com", { delivered: THREE, ran: except("2026-11-09", "2026-11-23") });
    await query(`insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-11-23', 'none')`, [roger]);
    const bill = (await sponsorBill(query, sponsorId, NOV, settings))!;
    expect(bill.seats.map((s) => s.tier)).toEqual(["standard", "standard", "standard"]);
    expect(bill.seats.find((s) => s.userId === ex)?.weeks.find((w) => w.week === "2026-11-16")?.result).toBe("excused");
  });

  it("an excuse for everyone counts too, and a week not sharing at the cutoff bills the higher price", async () => {
    await member("ex@example.com", { delivered: THREE, ran: except("2026-11-09", "2026-11-16") });
    await query(`insert into week_excuses (week_of, user_id, excused_by) values ('2026-11-09', null, $1)`, [BY]);
    await member("off@example.com", { delivered: THREE, ran: NOV_WEEKS, sharing: "off" });
    const bill = (await sponsorBill(query, sponsorId, NOV, settings))!;
    expect(bill.seats.map((s) => [s.email, s.tier])).toEqual([
      ["ex@example.com", "standard"],
      ["off@example.com", "higher"],
    ]);
  });

  it("a member whose third list comes in December isn't billed for November", async () => {
    await member("late@example.com", { delivered: ["2026-11-16", "2026-11-23", "2026-12-07"], ran: NOV_WEEKS });
    expect((await sponsorBill(query, sponsorId, NOV, settings))!.seats).toHaveLength(0);
    expect(await prepare()).toEqual({ ok: false, message: "No seats to bill for November 2026." });
    expect((await sponsorBill(query, sponsorId, "2026-12-01", settings))!.seats.map((s) => s.email)).toEqual(["late@example.com"]);
  });

  it("an account closed in October isn't billed for November; one closed in November is, and not for December", async () => {
    await member("oct@example.com", { delivered: THREE, ran: NOV_WEEKS, status: "closed", closedAt: "2026-10-20T12:00:00Z" });
    await member("nov@example.com", { delivered: THREE, ran: NOV_WEEKS, status: "closed", closedAt: "2026-11-15T12:00:00Z" });
    expect((await sponsorBill(query, sponsorId, NOV, settings))!.seats.map((s) => s.email)).toEqual(["nov@example.com"]);
    expect((await sponsorBill(query, sponsorId, "2026-12-01", settings))!.seats).toHaveLength(0);
  });

  it("a cancelled account is treated like a closed one: billed for the month it was cancelled in, never after (whole-branch review)", async () => {
    await member("oct@example.com", { delivered: THREE, ran: NOV_WEEKS, status: "cancelled", closedAt: "2026-10-20T12:00:00Z" });
    await member("nov@example.com", { delivered: THREE, ran: NOV_WEEKS, status: "cancelled", closedAt: "2026-11-15T12:00:00Z" });
    expect((await sponsorBill(query, sponsorId, NOV, settings))!.seats.map((s) => s.email)).toEqual(["nov@example.com"]);
    expect((await sponsorBill(query, sponsorId, "2026-12-01", settings))!.seats).toHaveLength(0);
  });

  it("UNBILLED_SEAT_SQL ends an open hold with a closed or cancelled account's access, as the invoice does", async () => {
    const unbilled = async (id: string) => (await query<{ x: boolean }>(`select ${UNBILLED_SEAT_SQL("u")} as x from users u where u.id = $1`, [id]))[0].x;
    // Third list on November 2; access ended October 20: no billable month, though the history row was never ended.
    expect(await unbilled(await member("oct@example.com", { delivered: THREE, status: "cancelled", closedAt: "2026-10-20T12:00:00Z" }))).toBe(false);
    expect(await unbilled(await member("octc@example.com", { delivered: THREE, status: "closed", closedAt: "2026-10-20T12:00:00Z" }))).toBe(false);
    expect(await unbilled(await member("nov@example.com", { delivered: THREE, status: "cancelled", closedAt: "2026-11-15T12:00:00Z" }))).toBe(true);
  });

  it("weeks before the member's third list don't count against the seat", async () => {
    await member("new@example.com", { delivered: ["2026-11-02", "2026-11-09", "2026-11-23"], ran: except("2026-11-09", "2026-11-16") });
    const bill = (await sponsorBill(query, sponsorId, NOV, settings))!;
    expect(bill.seats[0]).toMatchObject({ tier: "standard", thirdListWeek: "2026-11-23" });
    expect(bill.seats[0].weeks.map((w) => w.week)).toEqual(["2026-11-23", "2026-11-30"]);
  });
});

describe("seat history", () => {
  it("a seat released on December 2 is billed for November, and not for December", async () => {
    const ana = await member("ana@example.com", { delivered: THREE, ran: NOV_WEEKS });
    expect(await releaseSeat(query, BY, sponsorId, ana, new Date("2026-12-02T15:00:00Z"))).toBe(true);
    expect((await snapshot(ana)).sponsor_id).toBeNull();
    expect((await sponsorBill(query, sponsorId, NOV, settings))!.seats.map((s) => s.email)).toEqual(["ana@example.com"]);
    expect((await sponsorBill(query, sponsorId, "2026-12-01", settings))!.seats.map((s) => [s.email, s.heldUntil])).toEqual([["ana@example.com", "2026-12-02"]]);
    expect((await sponsorBill(query, sponsorId, "2027-01-01", settings))!.seats).toHaveLength(0);
  });

  it("a seat reused in the month is billed for each member who qualifies; weeks after a release don't count", async () => {
    // Ana held seat 1 until November 10 (and missed every week after); Bo took it on November 12.
    await member("ana@example.com", { delivered: THREE, ran: ["2026-11-02", "2026-11-09"], to: "2026-11-10T15:00:00Z" });
    await member("bo@example.com", { delivered: THREE, ran: NOV_WEEKS, from: "2026-11-12T15:00:00Z" });
    const bill = (await sponsorBill(query, sponsorId, NOV, settings))!;
    expect(bill.seats.map((s) => [s.email, s.tier])).toEqual([
      ["ana@example.com", "standard"],
      ["bo@example.com", "standard"],
    ]);
    expect(bill.seats[0].weeks.map((w) => w.week)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("…but only the one who qualifies, when the new member's third list is in December", async () => {
    await member("ana@example.com", { delivered: THREE, ran: NOV_WEEKS, to: "2026-11-10T15:00:00Z" });
    await member("bo@example.com", { delivered: ["2026-11-16", "2026-11-23", "2026-12-07"], ran: NOV_WEEKS, from: "2026-11-12T15:00:00Z" });
    expect((await sponsorBill(query, sponsorId, NOV, settings))!.seats.map((s) => s.email)).toEqual(["ana@example.com"]);
  });
});

describe("prepare", () => {
  beforeEach(async () => {
    await member("ana@example.com", { delivered: THREE, ran: NOV_WEEKS });
  });

  it("preparing the same month twice, or twice at once, gives one draft with one set of lines", async () => {
    const [a, b] = await Promise.all([prepare(), prepare()]);
    expect([a.ok, b.ok]).toContain(true);
    expect(await prepare()).toMatchObject({ ok: true });
    expect(gw.invoices.size).toBe(1);
    expect(gw.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(gw.linesOf([...gw.invoices.keys()][0])).toEqual([["standard", 1, 20000]]);
    expect(await query(`select 1 from sponsor_invoices`)).toHaveLength(1);
  });

  it("refuses a month that hasn't ended", async () => {
    expect(await prepareSponsorInvoice(query, gw, { ...deps(), month: "2026-12" })).toEqual({ ok: false, message: "December 2026 hasn’t ended yet." });
    expect(gw.invoices.size).toBe(0);
  });

  it("a Stripe failure gives the month back at once, and the retry finishes the same draft", async () => {
    gw.failNext("add");
    expect(await prepare()).toMatchObject({ ok: false });
    const id = await draftOf();
    expect(id).not.toBeNull(); // recorded as soon as the draft existed
    expect(await prepare()).toMatchObject({ ok: true });
    expect([...gw.invoices.keys()]).toEqual([id]);
    const log = await query<{ detail: { outcome: string } }>(`select detail from admin_actions where action = 'sponsor_invoice_prepare' order by id`);
    expect(log.map((l) => l.detail.outcome)).toEqual(["error", "done"]);
  });

  it("a slow first attempt past the hold: the second takes over, the draft has exactly one set of lines, and the stale attempt stops", async () => {
    const later = new Date(DEC_3.getTime() + (HOLD_MINUTES + 1) * 60_000);
    let t = DEC_3;
    let second: Awaited<ReturnType<typeof prepare>> | null = null;
    gw.before("add", async () => {
      t = later; // the first attempt stalls here past its hold
      second = await prepare({ now: later });
    });
    const first = await prepare({ clock: () => t });
    expect(second).toMatchObject({ ok: true });
    expect(first).toEqual({ ok: false, message: "Another attempt took this invoice over. Reload to see where it stands." });
    expect(gw.invoices.size).toBe(1);
    expect(gw.linesOf([...gw.invoices.keys()][0])).toEqual([["standard", 1, 20000]]);
  });

  it("a stale attempt can neither write nor release a newer hold", async () => {
    gw.before("add", async () => {
      await query(`update sponsor_invoices set claim_token = 'newer', claimed_at = $1 where sponsor_id = $2`, [new Date(DEC_3.getTime() + 6 * 60_000).toISOString(), sponsorId]);
    });
    expect(await prepare()).toMatchObject({ ok: false });
    const [row] = await query<{ claim_token: string; prepared_by: string | null }>(`select claim_token, prepared_by from sponsor_invoices`);
    expect(row).toEqual({ claim_token: "newer", prepared_by: null });
    expect(gw.linesOf([...gw.invoices.keys()][0])).toEqual([]);
  });

  it("a rename between attempts reuses the draft and updates its memo", async () => {
    gw.failNext("add");
    await prepare();
    await query(`update sponsors set name = 'Harbour Realty Group' where id = $1`, [sponsorId]);
    expect(await prepare()).toMatchObject({ ok: true });
    expect(gw.invoices.size).toBe(1);
    expect([...gw.invoices.values()][0].description).toBe("Roger for Harbour Realty Group, November 2026");
  });

  it("a draft whose id was never recorded is found again after Stripe forgot the key (24 hours)", async () => {
    gw.loseNextAnswer("create");
    expect(await prepare()).toMatchObject({ ok: false });
    expect(await draftOf()).toBeNull();
    gw.expireKeys();
    expect(await prepare()).toMatchObject({ ok: true });
    expect(gw.invoices.size).toBe(1);
    expect(await draftOf()).toBe([...gw.invoices.keys()][0]);
  });

  for (const how of ["void", "delete"] as const) {
    it(`a draft ${how === "void" ? "voided" : "deleted"} in Stripe: preparing again makes a new working draft`, async () => {
      await prepare();
      const old = (await draftOf())!;
      gw.voidInvoice(old, how);
      expect(await prepare()).toMatchObject({ ok: true });
      const fresh = (await draftOf())!;
      expect(fresh).not.toBe(old);
      expect(gw.invoices.get(fresh)).toMatchObject({ status: "draft" });
      expect(gw.linesOf(fresh)).toEqual([["standard", 1, 20000]]);
      // Prepared again within Stripe's 24 hours: the same new draft, not a third.
      expect(await prepare()).toMatchObject({ ok: true });
      expect(await draftOf()).toBe(fresh);
      expect([...gw.invoices.values()].filter((i) => i.status === "draft")).toHaveLength(1);
    });
  }

  it("when Stripe can't work out the tax, the draft is kept but not called 'with tax', and send refuses", async () => {
    const [customer] = [...gw.customers.keys()];
    gw.customers.get(customer)!.postal = "";
    const r = await prepare();
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining(TAX_INCOMPLETE) });
    expect(r.message).not.toContain("with tax");
    expect(await send()).toEqual({ ok: false, message: `${TAX_INCOMPLETE} The invoice wasn’t sent.` });
    expect([...gw.invoices.values()][0]).toMatchObject({ status: "draft", emailed: 0 });
  });
});

describe("send", () => {
  let ana: string;
  beforeEach(async () => {
    ana = await member("ana@example.com", { delivered: THREE, ran: except("2026-11-09", "2026-11-16") });
  });

  it("before a draft there is nothing to send; then it is sent once, even pressed twice at once", async () => {
    expect(await send()).toEqual({ ok: false, message: "Prepare the draft first." });
    await prepare();
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.ok, b.ok]).toContain(true);
    expect([...gw.invoices.values()][0]).toMatchObject({ status: "open", emailed: 1 });
    expect(await send()).toEqual({ ok: true, message: "The November 2026 invoice was already sent." });
    expect(await query(`select 1 from admin_actions where action = 'sponsor_invoice_send'`)).toHaveLength(1);
  });

  it("a send that went out but whose answer was lost is never sent again", async () => {
    await prepare();
    gw.loseNextAnswer("send");
    expect(await send()).toMatchObject({ ok: false });
    const [row] = await query<{ sent_at: string | null; sending_at: string | null }>(`select sent_at, sending_at from sponsor_invoices`);
    expect(row).toEqual({ sent_at: null, sending_at: null });
    expect(await send()).toEqual({ ok: true, invoice: expect.anything(), message: "The November 2026 invoice was already sent." });
    expect([...gw.invoices.values()][0].emailed).toBe(1);
  });

  it("a refusal (no tax location), the address fixed, then sending again succeeds: not Stripe's cached refusal", async () => {
    await prepare();
    const [customer] = [...gw.customers.keys()];
    // The tax status looked complete when checked, but Stripe refuses at finalization (the address changed in between).
    gw.before("send", async () => {
      gw.customers.get(customer)!.postal = "";
    });
    expect(await send()).toEqual({ ok: false, message: `Stripe refused to send it (customer_tax_location_invalid). ${TAX_INCOMPLETE}` });
    gw.customers.get(customer)!.postal = "M5V 2T6";
    expect(await send()).toMatchObject({ ok: true });
    expect([...gw.invoices.values()][0]).toMatchObject({ status: "open", emailed: 1 });
    expect((await query<{ send_refusals: number }>(`select send_refusals from sponsor_invoices`))[0].send_refusals).toBe(1);
  });

  it("a failed send is given back, so it can be sent again", async () => {
    await prepare();
    gw.failNext("send");
    expect(await send()).toMatchObject({ ok: false });
    expect(await send()).toMatchObject({ ok: true });
    expect([...gw.invoices.values()][0].emailed).toBe(1);
  });

  it("refuses when the bill changed after the draft was prepared (an excuse), until it is prepared again", async () => {
    await prepare(); // two misses: higher
    await query(`insert into week_excuses (week_of, user_id, excused_by) values ('2026-11-16', $1, $2)`, [ana, BY]);
    expect(await send()).toEqual({ ok: false, message: REPREPARE });
    expect([...gw.invoices.values()][0].emailed).toBe(0);
    await prepare();
    expect(gw.linesOf([...gw.invoices.keys()][0])).toEqual([["standard", 1, 20000]]);
    expect(await send()).toMatchObject({ ok: true });
  });

  it("a release between prepare and send doesn't change a month the seat was held in, so it sends", async () => {
    await prepare();
    await releaseSeat(query, BY, sponsorId, ana, new Date("2026-12-03T16:00:00Z"));
    expect(await send()).toMatchObject({ ok: true });
  });

  it("refuses when the seats held in the month changed (a hold removed), until it is prepared again", async () => {
    const bo = await member("bo@example.com", { delivered: THREE, ran: NOV_WEEKS });
    await prepare();
    await query(`delete from sponsor_seat_history where user_id = $1`, [bo]);
    expect(await send()).toEqual({ ok: false, message: REPREPARE });
  });
});

describe("months", () => {
  it("reads a month, and the one usually invoiced is the last", () => {
    expect(monthStart("2026-11")).toBe("2026-11-01");
    expect(monthStart("2026-13")).toBeNull();
    expect(lastMonth(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-01");
  });
});
