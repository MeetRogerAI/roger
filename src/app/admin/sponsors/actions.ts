"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { stripeSponsors } from "@/lib/billing/sponsor-gateway";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { appUrl } from "@/lib/mail/layout";
import { prepareSponsorInvoice, sendSponsorInvoice } from "@/lib/sponsors/invoice";
import { createSponsor, dollarsToCents, releaseSeat, revokeSponsor, setSponsorSeats, type SponsorInput } from "@/lib/sponsors/sponsors";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * /admin/sponsors (spec B.15, B2 plan Unit 10). Every action is a public
 * endpoint, so each checks the admin first; each change is logged with the
 * sponsor id and never with the code.
 */
export type SponsorFormValues = Record<"name" | "currency" | "standard" | "higher" | "seats" | "billingEmail" | "billingCountry" | "billingPostal", string>;
export type SponsorState = { status: "idle" | "ok" | "error"; message?: string; code?: string; link?: string; values?: SponsorFormValues; at?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STRIPE = "Stripe isn’t set up here (STRIPE_SECRET_KEY).";

const done = (ok: boolean, message: string): SponsorState => {
  if (ok) refresh();
  return { status: ok ? "ok" : "error", message, at: Date.now() };
};

export async function createSponsorAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const values: SponsorFormValues = {
    name: field(fd, "name", 120),
    currency: field(fd, "currency", 3),
    standard: field(fd, "standard", 12),
    higher: field(fd, "higher", 12),
    seats: field(fd, "seats", 6),
    billingEmail: field(fd, "billingEmail", 254),
    billingCountry: field(fd, "billingCountry", 2),
    billingPostal: field(fd, "billingPostal", 12),
  };
  const input: SponsorInput = {
    name: values.name,
    currency: values.currency as SponsorInput["currency"],
    standardCents: dollarsToCents(values.standard),
    higherCents: dollarsToCents(values.higher),
    seats: /^\d+$/.test(values.seats) ? Number(values.seats) : NaN,
    billingEmail: values.billingEmail,
    billingCountry: values.billingCountry as SponsorInput["billingCountry"],
    billingPostal: values.billingPostal,
  };
  const r = await createSponsor(query, stripeSponsors(), by, input);
  if (!r.ok) return { status: "error", message: r.message, values, at: Date.now() };
  refresh();
  return {
    status: "ok",
    code: r.code,
    link: appUrl(`/start?sponsor=${r.code}`),
    message: r.customer ? "Sponsor created." : "Sponsor created. Its Stripe customer wasn’t made; preparing its first invoice will make it.",
    at: Date.now(),
  };
}

export async function revokeSponsorAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const id = field(fd, "sponsorId", 40);
  if (!UUID.test(id)) return done(false, "No such sponsor.");
  const ok = await revokeSponsor(query, by, id);
  return done(ok, ok ? "Code revoked. Members keep their seats." : "Already revoked.");
}

export async function setSeatsAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const id = field(fd, "sponsorId", 40);
  const seats = field(fd, "seats", 6);
  if (!UUID.test(id)) return done(false, "No such sponsor.");
  if (!/^\d+$/.test(seats)) return done(false, "Enter a whole number of seats.");
  const r = await setSponsorSeats(query, by, id, Number(seats));
  return done(r.ok, r.message);
}

export async function releaseSeatAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const id = field(fd, "sponsorId", 40);
  const userId = field(fd, "userId", 40);
  if (!UUID.test(id) || !UUID.test(userId)) return done(false, "No such member.");
  const ok = await releaseSeat(query, by, id, userId);
  return done(ok, ok ? "Seat released. They are now an ordinary trial." : "That member doesn’t hold one of this sponsor’s seats.");
}

export async function prepareInvoiceAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const id = field(fd, "sponsorId", 40);
  if (!UUID.test(id)) return done(false, "No such sponsor.");
  const gw = stripeSponsors();
  if (!gw) return done(false, NO_STRIPE);
  const r = await prepareSponsorInvoice(query, gw, { by, sponsorId: id, month: field(fd, "month", 10), settings: await readV3Settings(), now: new Date() });
  return done(r.ok, r.message);
}

export async function sendInvoiceAction(_prev: SponsorState, fd: FormData): Promise<SponsorState> {
  const by = await requireAdmin();
  const id = field(fd, "sponsorId", 40);
  if (!UUID.test(id)) return done(false, "No such sponsor.");
  const gw = stripeSponsors();
  if (!gw) return done(false, NO_STRIPE);
  const r = await sendSponsorInvoice(query, gw, { by, sponsorId: id, month: field(fd, "month", 10), settings: await readV3Settings(), now: new Date() });
  return done(r.ok, r.message);
}
