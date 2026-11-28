import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastMonth, prepareSponsorInvoice, sendSponsorInvoice } from "@/lib/sponsors/invoice";
import { createSponsor } from "@/lib/sponsors/sponsors";
import { newSandboxWorld, sandboxEnvPresent, type SandboxWorld } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * B2 sponsor invoicing in the Stripe sandbox (B3 plan Unit 13; B2 plan Unit
 * 10): last calendar month's invoice for three seats, one of which missed two
 * weeks, prepared as a Stripe draft with automatic tax (2 × standard and
 * 1 × higher, in CAD), then finalized and sent. The sponsor's customer is a
 * plain sandbox customer (an invoice for a past month needs no test clock),
 * deleted at cleanup.
 *
 * The month is the one before today (Toronto), so `prepare` accepts it: the
 * scenario's database rows are dated in it. Skipped unless SCENARIO_TARGET=sandbox
 * and the sandbox variables are set.
 */
const LONG = 600_000;
const BY = "peter@example.com";
let w: SandboxWorld;

const day = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The Mondays of the month starting `first` (YYYY-MM-01). */
function mondays(first: string): string[] {
  const out: string[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = day(d, 1)) if (new Date(`${d}T12:00:00Z`).getUTCDay() === 1) out.push(d);
  return out;
}

describe.skipIf(!sandboxEnvPresent())("sandbox: a sponsor's monthly invoice", () => {
  beforeEach(async () => {
    w = await newSandboxWorld();
  }, LONG);
  afterEach(async () => {
    await w?.cleanup();
  }, LONG);

  it(
    "prepares last month's draft with automatic tax (2 standard, 1 higher), then sends it once",
    async () => {
      const first = lastMonth(new Date());
      const month = first.slice(0, 7);
      const weeks = mondays(first);
      // Three lists delivered before the month began: every seat is past its third list for the whole month.
      const three = [-21, -14, -7].map((n) => day(weeks[0], n));
      const s = await createSponsor(w.query, w.gateways.sponsors, BY, {
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
      expect(s.customer).toMatch(/^cus_/);
      w.track(s.customer!);
      for (const wk of [...weeks, day(weeks.at(-1)!, 7)]) await w.query(`insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict do nothing`, [wk]);

      const seat = async (email: string, ran: string[]) => {
        const [u] = await w.query<{ id: string }>(
          `insert into users (email, name, status, plan, sharing, currency, sponsor_id) values ($1, $2, 'trial', 'monthly', 'share', 'CAD', $3) returning id`,
          [email, email.split("@")[0], s.id],
        );
        await w.query(`insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from) values ($1, $2, 1, $3)`, [s.id, u.id, `${day(three[0], -7)}T12:00:00Z`]);
        for (const wk of three) {
          await w.query(`insert into cora_user_weeks (user_id, week_of, outcome, picked_count, delivered_at) values ($1, $2, 'picked', 3, $3::date + interval '12 hours')`, [u.id, wk, wk]);
        }
        for (const wk of ran) {
          await w.query(`insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'x', 'accepted')`, [u.id, wk]);
        }
      };
      await seat("ana@example.com", weeks);
      await seat("bo@example.com", weeks);
      await seat("cy@example.com", weeks.filter((_, i) => i !== 1 && i !== 2)); // two unexcused weeks missed

      const now = new Date();
      const prepared = await prepareSponsorInvoice(w.query, w.gateways.sponsors, { by: BY, sponsorId: s.id, month, settings: w.settings, now });
      expect(prepared).toMatchObject({ ok: true });
      const [row] = await w.query<{ stripe_invoice: string }>(`select stripe_invoice from sponsor_invoices where sponsor_id = $1`, [s.id]);
      const draft = await w.stripe.invoices.retrieve(row.stripe_invoice);
      expect(draft).toMatchObject({ status: "draft", currency: "cad", customer: s.customer });
      expect(draft.automatic_tax?.enabled).toBe(true);
      const lines = (await w.gateways.sponsors.listSponsorItems(row.stripe_invoice)).map((l) => [l.tier, l.quantity, l.unitCents]).sort();
      expect(lines).toEqual([
        ["higher", 1, 40000],
        ["standard", 2, 20000],
      ]);
      expect(draft.subtotal).toBe(80000);

      const sent = await sendSponsorInvoice(w.query, w.gateways.sponsors, { by: BY, sponsorId: s.id, month, settings: w.settings, now });
      expect(sent).toMatchObject({ ok: true });
      expect((await w.stripe.invoices.retrieve(row.stripe_invoice)).status).toBe("open");
      // Sending again sends nothing new.
      const again = await sendSponsorInvoice(w.query, w.gateways.sponsors, { by: BY, sponsorId: s.id, month, settings: w.settings, now });
      expect(again).toMatchObject({ ok: true, message: expect.stringContaining("was already sent") });
      expect((await w.stripe.invoices.list({ customer: s.customer!, limit: 10 })).data).toHaveLength(1);
    },
    LONG,
  );
});
