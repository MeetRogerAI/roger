import { randomUUID } from "node:crypto";
import { audited } from "@/lib/admin/log";
import { addDays, cutoffInstant, torontoDate, wallToInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { SENT_STATUSES, SponsorSendRefused, type SponsorGateway, type SponsorInvoice, type SponsorLine } from "@/lib/billing/sponsor-gateway";
import { CONTRIBUTED_SQL, ROGER_EXCUSED_SQL, SHARING_AT_CUTOFF_SQL, weekResult } from "@/lib/billing/contribution";
import { countMisses } from "@/lib/billing/period";
import { moneyCents, type Currency } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { ensureSponsorCustomer, SEAT_ENDED_SQL } from "./sponsors";

/**
 * The sponsor's monthly invoice (spec B.15; B2 plan Unit 10, Key Technical
 * Decisions, "Sponsors"; review decisions of November 27):
 *
 * - The period is the calendar month (Toronto): a week belongs to the month
 *   its Monday is in.
 * - Seats are billed from `sponsor_seat_history`: a seat is billed for every
 *   month in which it was held, even briefly, by a member whose third
 *   delivered, non-dry-run list week is before the month ends. A release, or
 *   the account closing or being cancelled, ends the hold; the month it ends in is still billed.
 *   A seat reused by a new member in the same month is billed for each member
 *   who qualifies.
 * - The contributor rule applies per seat (Peter, November 27): B1's weekly
 *   "contributed?" test (`weekResult`, contribution.ts) runs for each of the
 *   month's settled weeks the member held the seat in, from their third list
 *   on, with B1's excuses (an admin's, or Roger's own failure). Any week not
 *   sharing at the cutoff, or more missed weeks than are forgiven, bills the
 *   seat at the higher price. Nothing is recorded for the member, no notice
 *   is sent and their account is never changed.
 * - "Prepare" owns the (sponsor, month) row by a claim token, renewed before
 *   each Stripe write; it reuses the month's draft if there is one, records
 *   its id as soon as it exists, makes its lines match the bill and checks
 *   them. Preparing again re-syncs the same draft.
 * - "Send" recomputes the bill and refuses if the draft differs (prepare
 *   again), or if Stripe's tax isn't complete; `sent_at` is set only once
 *   Stripe confirms, and a send whose answer was lost is recognised from the
 *   invoice's status (sponsor-gateway.ts).
 */

export type SeatWeek = { week: string; result: "contributed" | "by_choice" | "missed" | "excused" };
export type Seat = { userId: string; name: string; email: string; thirdListWeek: string; heldUntil: string | null; tier: "standard" | "higher"; weeks: SeatWeek[] };
export type SponsorBill = {
  sponsorId: string;
  name: string;
  currency: Currency;
  month: string;
  seats: Seat[];
  standard: number;
  higher: number;
  lines: SponsorLine[];
  subtotalCents: number;
};
type RuleSettings = Pick<V3Settings, "runCutoff" | "forgivenMissesPerMonth">;

/** "2026-11" or "2026-11-01" to the month's first day; null for anything else. */
export function monthStart(raw: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})(?:-01)?$/.exec((raw ?? "").trim());
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${m[1]}-${m[2]}-01` : null;
}

export function nextMonth(first: string): string {
  const [y, m] = first.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** The calendar month before the one `now` is in (Toronto): the one usually invoiced. */
export function lastMonth(now: Date): string {
  const [y, m] = torontoDate(now).split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

export const monthLabel = (first: string) => new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** The Mondays in the month. */
function mondays(first: string): string[] {
  const end = nextMonth(first);
  const out: string[] = [];
  let d = first;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  for (; d < end; d = addDays(d, 7)) out.push(d);
  return out;
}

/** The seats a sponsor is billed for in a month, and at which price. Reads only. */
export async function sponsorBill(q: Query, sponsorId: string, month: string, s: RuleSettings): Promise<SponsorBill | null> {
  const first = monthStart(month);
  if (!first) return null;
  const end = nextMonth(first);
  const [sp] = await q<{ id: string; name: string; currency: Currency; standard_cents: number; higher_cents: number }>(
    `select id, name, currency, standard_cents, higher_cents from sponsors where id = $1`,
    [sponsorId],
  );
  if (!sp) return null;

  // Every hold that overlaps the month (Toronto midnights), ended by its release or the account's close, with the
  // member's third delivered list week. One member may have held a seat twice in a month: their holds are merged.
  const holds = await q<{ id: string; name: string; email: string; third: string | null; until: string | null }>(
    `select u.id, u.name, u.email,
       (select to_char(dw.week_of, 'YYYY-MM-DD') from cora_user_weeks dw
        where dw.user_id = u.id and not dw.dry_run and dw.delivered_at is not null order by dw.week_of offset 2 limit 1) as third,
       to_char(e.ends at time zone 'America/Toronto', 'YYYY-MM-DD') as until
     from sponsor_seat_history h join users u on u.id = h.user_id
     cross join lateral (select least(h.held_to, case when ${SEAT_ENDED_SQL("u")} then coalesce(u.access_ends_at, h.held_from) end) as ends) e
     where h.sponsor_id = $1 and h.held_from < $3::timestamptz and (e.ends is null or e.ends >= $2::timestamptz)
     order by u.name, u.id`,
    [sponsorId, wallToInstant(first, "00:00").toISOString(), wallToInstant(end, "00:00").toISOString()],
  );
  const byMember = new Map<string, { id: string; name: string; email: string; third: string; until: string | null }>();
  for (const h of holds) {
    if (!h.third || h.third >= end) continue;
    const had = byMember.get(h.id);
    const until = !had ? h.until : had.until === null || h.until === null ? null : had.until > h.until ? had.until : h.until;
    byMember.set(h.id, { ...h, third: h.third, until });
  }
  const members = [...byMember.values()];

  // The month's settled weeks (Cora finished or failed), each with its cutoff.
  const settled = (
    await q<{ week: string }>(
      `select to_char(week_of, 'YYYY-MM-DD') as week from cora_weeks where not dry_run and status in ('ready', 'sent', 'failed') and week_of = any($1::date[])`,
      [mondays(first)],
    )
  ).map((r) => r.week);
  const weeks = settled.map((week) => ({ week, cutoff: cutoffInstant(week, s.runCutoff).toISOString() }));

  const judged =
    members.length && weeks.length
      ? await q<{ user_id: string; week: string; sharing: string; contributed: boolean; excused: boolean }>(
          `select u.id as user_id, to_char(x.week, 'YYYY-MM-DD') as week,
             ${SHARING_AT_CUTOFF_SQL("u", "x.cutoff")} as sharing,
             ${CONTRIBUTED_SQL("u", "x.week")} as contributed,
             (exists (select 1 from week_excuses e where e.week_of = x.week and (e.user_id = u.id or e.user_id is null))
              or ${ROGER_EXCUSED_SQL("u.id", "x.week")}) as excused
           from users u cross join jsonb_to_recordset($2::jsonb) as x(week date, cutoff timestamptz)
           where u.id = any($1::uuid[])
           order by x.week`,
          [members.map((m) => m.id), JSON.stringify(weeks)],
        )
      : [];

  const seats: Seat[] = members.map((m) => {
    const own = judged
      .filter((j) => j.user_id === m.id && j.week >= m.third && (m.until === null || j.week <= m.until))
      .map((j): SeatWeek => {
        const r = weekResult(j);
        return { week: j.week, result: r === "missed" && j.excused ? "excused" : r };
      });
    const results = own.map((w) => w.result);
    const higher = results.includes("by_choice") || countMisses(results) > s.forgivenMissesPerMonth;
    return { userId: m.id, name: m.name, email: m.email, thirdListWeek: m.third, heldUntil: m.until, tier: higher ? "higher" : "standard", weeks: own };
  });
  const standard = seats.filter((x) => x.tier === "standard").length;
  const higher = seats.length - standard;
  const label = monthLabel(first);
  const lines: SponsorLine[] = [];
  if (standard) lines.push({ tier: "standard", quantity: standard, unitCents: sp.standard_cents, description: `Roger seats, ${label}, standard price` });
  if (higher) lines.push({ tier: "higher", quantity: higher, unitCents: sp.higher_cents, description: `Roger seats, ${label}, higher price (contributor rule)` });
  return {
    sponsorId: sp.id,
    name: sp.name,
    currency: sp.currency,
    month: first,
    seats,
    standard,
    higher,
    lines,
    subtotalCents: lines.reduce((n, l) => n + l.quantity * l.unitCents, 0),
  };
}

/** Whether a draft's lines are exactly the bill's (tier, quantity and price; order doesn't matter). */
export function sameLines(a: Pick<SponsorLine, "tier" | "quantity" | "unitCents">[], b: Pick<SponsorLine, "tier" | "quantity" | "unitCents">[]): boolean {
  const key = (xs: typeof a) => JSON.stringify(xs.map((l) => [l.tier, l.quantity, l.unitCents]).sort());
  return key(a) === key(b);
}

export type InvoiceRecord = { stripeInvoice: string | null; preparedBy: string | null; preparedAt: string | null; sentAt: string | null; claimed: boolean; sending: boolean };

export async function invoiceRecord(q: Query, sponsorId: string, month: string): Promise<InvoiceRecord | null> {
  const [r] = await q<{ stripe_invoice: string | null; prepared_by: string | null; prepared_at: string | null; sent_at: string | null; claimed: boolean; sending: boolean }>(
    `select stripe_invoice, prepared_by, prepared_at::text, sent_at::text, claim_token is not null as claimed, sending_at is not null as sending
     from sponsor_invoices where sponsor_id = $1 and month = $2`,
    [sponsorId, month],
  );
  return r
    ? { stripeInvoice: r.stripe_invoice, preparedBy: r.prepared_by, preparedAt: r.prepared_at, sentAt: r.sent_at, claimed: r.claimed, sending: r.sending }
    : null;
}

export type InvoiceOutcome = { ok: true; message: string; invoice?: SponsorInvoice } | { ok: false; message: string };

/** How long a "Prepare" or "Send" holds the month without renewing before another may take over. */
export const HOLD_MINUTES = 5;
export const TAX_INCOMPLETE = "Tax can’t be calculated: check the billing postal code.";
export const REPREPARE = "The seats or prices changed since the draft was prepared. Prepare the invoice again, then send it.";

class LostClaim extends Error {}
class NotADraft extends Error {
  constructor(
    public id: string,
    public status: string | null,
  ) {
    super(`Stripe returned ${id} (${status ?? "no status"}), which isn’t a draft`);
  }
}

type PrepareDeps = { by: string; sponsorId: string; month: string; settings: RuleSettings; now: Date; clock?: () => Date };

/**
 * Makes or re-syncs the month's Stripe draft. The row is claimed with a
 * random token; every Stripe write first renews the claim, and stops if it
 * was lost (another attempt took over after the hold lapsed). Only the
 * holder records the draft id, finishes, or gives the claim back.
 */
export async function prepareSponsorInvoice(q: Query, gw: SponsorGateway, o: PrepareDeps): Promise<InvoiceOutcome> {
  const first = monthStart(o.month);
  if (!first) return { ok: false, message: "Choose a month." };
  const label = monthLabel(first);
  if (torontoDate(o.now) < nextMonth(first)) return { ok: false, message: `${label} hasn’t ended yet.` };
  const bill = await sponsorBill(q, o.sponsorId, first, o.settings);
  if (!bill) return { ok: false, message: "No such sponsor." };
  if (!bill.seats.length) return { ok: false, message: `No seats to bill for ${label}.` };

  const token = randomUUID();
  // The real clock by default: the hold is renewed as time passes, not at the moment the press began.
  const clock = o.clock ?? (() => new Date());
  const [claimed] = await q<{ id: string; stripe_invoice: string | null }>(
    `insert into sponsor_invoices (sponsor_id, month, claim_token, claimed_at) values ($1, $2, $3, $4)
     on conflict (sponsor_id, month) do update set claim_token = excluded.claim_token, claimed_at = excluded.claimed_at
       where sponsor_invoices.sent_at is null and sponsor_invoices.sending_at is null
         and (sponsor_invoices.claim_token is null or sponsor_invoices.claimed_at < $4::timestamptz - make_interval(mins => $5))
     returning id, stripe_invoice`,
    [o.sponsorId, first, token, o.now.toISOString(), HOLD_MINUTES],
  );
  if (!claimed) {
    const r = await invoiceRecord(q, o.sponsorId, first);
    if (r?.sentAt) return { ok: true, message: `The ${label} invoice was already sent.` };
    return { ok: false, message: r?.sending ? "This invoice is being sent now." : "Someone is preparing this invoice now. Try again in a few minutes." };
  }
  const mine = async (sql: string, params: unknown[] = []) => {
    const rows = await q(sql, [claimed.id, token, ...params]);
    if (!rows.length) throw new LostClaim();
  };
  const renew = () =>
    mine(
      `update sponsor_invoices set claimed_at = $3 where id = $1 and claim_token = $2 and claimed_at > $3::timestamptz - make_interval(mins => $4) returning id`,
      [clock().toISOString(), HOLD_MINUTES],
    );
  const release = () => q(`update sponsor_invoices set claim_token = null, claimed_at = null where id = $1 and claim_token = $2`, [claimed.id, token]).catch(() => {});

  try {
    const outcome = await audited(
      q,
      { by: o.by, action: "sponsor_invoice_prepare", detail: { sponsorId: o.sponsorId, month: first, standard: bill.standard, higher: bill.higher } },
      async (): Promise<InvoiceOutcome> => {
        await renew();
        const customer = await ensureSponsorCustomer(q, gw, o.sponsorId);
        // The month's draft, if one exists: the id stored here, else Stripe's own record of it (a retry after the key expired).
        let inv = claimed.stripe_invoice ? await gw.getSponsorInvoice(claimed.stripe_invoice) : null;
        if (!inv || inv.status === "void") inv = await gw.findSponsorInvoice({ customer, sponsorId: o.sponsorId, month: first });
        if (!inv) {
          await renew();
          inv = await gw.createSponsorDraft({ customer, sponsorId: o.sponsorId, month: first, currency: bill.currency, replacing: claimed.stripe_invoice ?? "none" });
          // A key's cached answer can be an invoice that has since been finalized or voided: never build on it.
          if (inv.status !== "draft") throw new NotADraft(inv.id, inv.status);
        }
        // Recorded as soon as it exists, so a later attempt reuses it.
        await mine(`update sponsor_invoices set stripe_invoice = $3 where id = $1 and claim_token = $2 returning id`, [inv.id]);
        if (inv.status && SENT_STATUSES.includes(inv.status)) {
          await mine(`update sponsor_invoices set sent_at = coalesce(sent_at, $3), claim_token = null, claimed_at = null where id = $1 and claim_token = $2 returning id`, [clock().toISOString()]);
          return { ok: true, message: `The ${label} invoice (${inv.id}) was already sent in Stripe.` };
        }
        await renew();
        await gw.describeSponsorInvoice(inv.id, `Roger for ${bill.name}, ${label}`);
        for (const item of await gw.listSponsorItems(inv.id)) {
          await renew();
          await gw.deleteSponsorItem(item.id);
        }
        for (const line of bill.lines) {
          await renew();
          const added = await gw.addSponsorItem({ invoice: inv.id, customer, currency: bill.currency, sponsorId: o.sponsorId, month: first, line });
          // Stalled inside the call past the hold, and another attempt took over: take back this line, so the draft
          // keeps only the newer attempt's set (send also refuses a draft whose lines don't match the bill).
          await renew().catch(async (e) => {
            if (e instanceof LostClaim) await gw.deleteSponsorItem(added).catch(() => {});
            throw e;
          });
        }
        if (!sameLines(await gw.listSponsorItems(inv.id), bill.lines)) throw new Error("The draft’s lines don’t match the seats");
        const done = (await gw.getSponsorInvoice(inv.id)) ?? inv;
        await mine(`update sponsor_invoices set prepared_by = $3, prepared_at = $4, claim_token = null, claimed_at = null where id = $1 and claim_token = $2 returning id`, [
          o.by,
          clock().toISOString(),
        ]);
        const counts = `${bill.standard} at standard and ${bill.higher} at higher`;
        return {
          ok: true,
          invoice: done,
          message:
            done.taxStatus === "complete"
              ? `Draft ${done.id} prepared: ${counts}, ${moneyCents(done.totalCents, bill.currency)} with tax.`
              : `Draft ${done.id} prepared: ${counts}, ${moneyCents(done.subtotalCents, bill.currency)} before tax. ${TAX_INCOMPLETE}`,
        };
      },
      (r) => (r.ok ? { invoice: r.invoice?.id ?? null, taxStatus: r.invoice?.taxStatus ?? null } : r.message),
    );
    return outcome;
  } catch (e) {
    await release();
    if (e instanceof LostClaim) return { ok: false, message: "Another attempt took this invoice over. Reload to see where it stands." };
    if (e instanceof NotADraft) return { ok: false, message: `Stripe returned ${e.id} as ${e.status ?? "unknown"}, not a draft. Check it in Stripe before preparing again.` };
    console.error("[sponsors] prepare", e instanceof Error ? e.message : e);
    return { ok: false, message: "Stripe didn’t make the draft. Try again in a minute." };
  }
}

/**
 * Sends the month's draft, once. The row is held while sending; `sent_at` is
 * set only when Stripe confirms, or when Stripe shows the invoice already
 * finalized (a send whose answer was lost). Refuses when the bill no longer
 * matches the draft, or Stripe's tax isn't complete.
 */
export async function sendSponsorInvoice(q: Query, gw: SponsorGateway, o: { by: string; sponsorId: string; month: string; settings: RuleSettings; now: Date }): Promise<InvoiceOutcome> {
  const first = monthStart(o.month);
  if (!first) return { ok: false, message: "Choose a month." };
  const label = monthLabel(first);
  const at = o.now.toISOString();
  const [row] = await q<{ id: string; stripe_invoice: string; send_refusals: number }>(
    `update sponsor_invoices set sending_at = $3
     where sponsor_id = $1 and month = $2 and stripe_invoice is not null and sent_at is null and claim_token is null
       and (sending_at is null or sending_at < $3::timestamptz - make_interval(mins => $4))
     returning id, stripe_invoice, send_refusals`,
    [o.sponsorId, first, at, HOLD_MINUTES],
  );
  if (!row) {
    const r = await invoiceRecord(q, o.sponsorId, first);
    if (r?.sentAt) return { ok: true, message: `The ${label} invoice was already sent.` };
    if (r?.sending) return { ok: false, message: "This invoice is being sent now." };
    if (r?.claimed) return { ok: false, message: "Someone is preparing this invoice now. Try again in a few minutes." };
    return { ok: false, message: "Prepare the draft first." };
  }
  const release = () => q(`update sponsor_invoices set sending_at = null where id = $1 and sending_at = $2::timestamptz`, [row.id, at]).catch(() => {});
  const markSent = () => q(`update sponsor_invoices set sent_at = coalesce(sent_at, $2), sending_at = null where id = $1`, [row.id, at]);

  try {
    const inv = await gw.getSponsorInvoice(row.stripe_invoice);
    if (!inv || inv.status === "void") {
      await release();
      return { ok: false, message: "The draft is gone from Stripe. Prepare the invoice again." };
    }
    // Finalized already: only Roger's send finalizes these, so it went out (its answer was lost). Never sent twice.
    if (inv.status && SENT_STATUSES.includes(inv.status)) {
      await markSent();
      return { ok: true, invoice: inv, message: `The ${label} invoice was already sent.` };
    }
    const bill = await sponsorBill(q, o.sponsorId, first, o.settings);
    if (!bill || !sameLines(await gw.listSponsorItems(inv.id), bill.lines)) {
      await release();
      return { ok: false, message: REPREPARE };
    }
    if (inv.taxStatus !== "complete") {
      await release();
      return { ok: false, message: `${TAX_INCOMPLETE} The invoice wasn’t sent.` };
    }
    const sent = await audited(
      q,
      { by: o.by, action: "sponsor_invoice_send", detail: { sponsorId: o.sponsorId, month: first, invoice: inv.id } },
      () => gw.sendSponsorInvoice(inv.id, row.send_refusals),
      (x) => ({ status: x.status, totalCents: x.totalCents }),
    );
    await markSent();
    return { ok: true, invoice: sent, message: `Invoice ${sent.id} sent: ${moneyCents(sent.totalCents, bill.currency)} with tax.` };
  } catch (e) {
    await release();
    if (e instanceof SponsorSendRefused) {
      // A definite refusal: the next send uses a new key, so it isn't answered with this cached refusal.
      await q(`update sponsor_invoices set send_refusals = send_refusals + 1 where id = $1`, [row.id]).catch(() => {});
      return { ok: false, message: `Stripe refused to send it${e.code ? ` (${e.code})` : ""}.${/tax/.test(e.code ?? "") ? ` ${TAX_INCOMPLETE}` : ""}` };
    }
    console.error("[sponsors] send", e instanceof Error ? e.message : e);
    return { ok: false, message: "Stripe didn’t send the invoice. Try again in a minute." };
  }
}
