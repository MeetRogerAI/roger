import { createElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeSponsors } from "@/test-helpers/fake-sponsors";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/**
 * B2 plan Unit 10: /admin/sponsors. Only an admin can use the actions; the
 * code is shown once and never logged; each change is logged with the
 * sponsor id.
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const db: { query: Query | null; admin: string | null; gw: ReturnType<typeof fakeSponsors> | null } = { query: null, admin: null, gw: null };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!db.admin) throw new Error("Not signed in");
    return db.admin;
  },
  isAdmin: async () => Boolean(db.admin),
}));
vi.mock("@/lib/billing/sponsor-gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/sponsor-gateway")>()), stripeSponsors: () => db.gw }));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([]) }));

const { createSponsorAction, revokeSponsorAction, setSeatsAction, releaseSeatAction, prepareInvoiceAction, sendInvoiceAction } = await import("./actions");
const { default: Page } = await import("./page");

const idle = { status: "idle" as const };
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const details = {
  name: "Harbour Realty",
  currency: "CAD",
  standard: "200",
  higher: "400.50",
  seats: "5",
  billingEmail: "ap@harbour.example",
  billingCountry: "CA",
  billingPostal: "M5V 2T6",
};

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.gw = fakeSponsors();
  db.admin = "peter@meetroger.ai";
  resetNextFakes();
});

describe("/admin/sponsors actions", () => {
  it("refuses anyone who isn't an admin, and writes nothing", async () => {
    db.admin = null;
    const fd = () => form({ ...details, sponsorId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", month: "2026-11" });
    for (const action of [createSponsorAction, revokeSponsorAction, setSeatsAction, releaseSeatAction, prepareInvoiceAction, sendInvoiceAction]) {
      await expect(action(idle, fd())).rejects.toThrow("Not signed in");
    }
    expect(await db.query!(`select 1 from sponsors`)).toHaveLength(0);
    expect(await db.query!(`select 1 from admin_actions`)).toHaveLength(0);
    expect(db.gw!.calls).toEqual([]);
  });

  it("creates a sponsor with its Stripe customer, shows the code once, and logs it without the code", async () => {
    const r = await createSponsorAction(idle, form(details));
    expect(r.status).toBe("ok");
    expect(r.code).toMatch(/^[A-Z2-7]{12}$/);
    expect(r.link).toContain(`/start?sponsor=${r.code}`);
    const [s] = await db.query!<{ id: string; standard_cents: number; higher_cents: number; stripe_customer: string }>(`select id, standard_cents, higher_cents, stripe_customer from sponsors`);
    expect(s).toMatchObject({ standard_cents: 20000, higher_cents: 40050 });
    expect(db.gw!.customers.get(s.stripe_customer)).toMatchObject({ country: "CA", postal: "M5V 2T6", email: "ap@harbour.example" });
    const log = await db.query!<{ action: string; admin_email: string; detail: unknown }>(`select action, admin_email, detail from admin_actions`);
    expect(log).toEqual([{ action: "sponsor_create", admin_email: "peter@meetroger.ai", detail: expect.objectContaining({ sponsorId: s.id }) }]);
    expect(JSON.stringify(log)).not.toContain(r.code!);

    // The page never shows the code again.
    const html = await render();
    expect(html).toContain("Harbour Realty");
    expect(html).not.toContain(r.code!);
  });

  it("keeps what was typed on an error", async () => {
    const r = await createSponsorAction(idle, form({ ...details, billingPostal: "" }));
    expect(r).toMatchObject({ status: "error", values: { ...details, billingPostal: "" } });
    expect(r.code).toBeUndefined();
  });

  it("revokes, edits seats, releases a seat, prepares and sends, each logged", async () => {
    const r = await createSponsorAction(idle, form(details));
    const [{ id }] = await db.query!<{ id: string }>(`select id from sponsors`);
    const [{ id: userId }] = await db.query!<{ id: string }>(`insert into users (email, name, status, sponsor_id, sponsor_seat) values ('ana@example.com', 'Ana', 'trial', $1, 1) returning id`, [id]);
    await db.query!(`insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from) values ($1, $2, 1, '2026-09-20T12:00:00Z')`, [id, userId]);
    for (const w of ["2026-09-28", "2026-10-05", "2026-10-12"]) {
      await db.query!(`insert into cora_user_weeks (user_id, week_of, outcome, picked_count, delivered_at) values ($1, $2, 'picked', 3, now())`, [userId, w]);
    }
    expect(await setSeatsAction(idle, form({ sponsorId: id, seats: "8" }))).toMatchObject({ status: "ok" });
    expect(await revokeSponsorAction(idle, form({ sponsorId: id }))).toMatchObject({ status: "ok" });
    expect(await prepareInvoiceAction(idle, form({ sponsorId: id, month: "2026-10" }))).toMatchObject({ status: "ok" });
    expect(await sendInvoiceAction(idle, form({ sponsorId: id, month: "2026-10" }))).toMatchObject({ status: "ok" });
    expect(await releaseSeatAction(idle, form({ sponsorId: id, userId }))).toMatchObject({ status: "ok" });
    const log = await db.query!<{ action: string; detail: Record<string, unknown> }>(`select action, detail from admin_actions order by id`);
    expect(log.map((l) => l.action)).toEqual(["sponsor_create", "sponsor_seats", "sponsor_revoke", "sponsor_invoice_prepare", "sponsor_invoice_send", "sponsor_release"]);
    expect(log.every((l) => l.detail.sponsorId === id)).toBe(true);
    expect(JSON.stringify(log)).not.toContain(r.code!);
  });

  it("refuses a malformed id without touching anything", async () => {
    expect(await revokeSponsorAction(idle, form({ sponsorId: "x" }))).toMatchObject({ status: "error" });
    expect(await setSeatsAction(idle, form({ sponsorId: "00000000-0000-4000-8000-000000000001", seats: "-1" }))).toMatchObject({ status: "error" });
  });
});

async function render() {
  const { prelude } = await prerender(createElement(Page, { searchParams: Promise.resolve({ month: "2026-11" }), params: Promise.resolve({}) } as never));
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}
