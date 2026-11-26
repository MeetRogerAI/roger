import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { nextHeaders, nextNavigation, Redirected, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Plan 2026-11-26-001, Unit 6: `/start/payment`, rendered for real (async
 * server component through `prerender`), with Stripe.js mocked.
 */

const db: { query: Query | null; userId: string | null; gw: ReturnType<typeof fakeGateway> | null } = { query: null, userId: null, gw: null };
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => ({ ...nextNavigation, usePathname: () => "/start/payment" }));
vi.mock("@/lib/auth/access", async () => {
  const { Redirected } = await import("@/test-helpers/next-fakes");
  return {
    requireUser: async (next: string) => {
      if (!db.userId) throw new Redirected(`/signin?next=${encodeURIComponent(next)}`);
      return { userId: db.userId };
    },
    getSession: async () => (db.userId ? { userId: db.userId } : null),
  };
});
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/billing/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/gateway")>()), stripeGateway: () => db.gw }));
vi.mock("@/lib/v3-settings-display", async () => {
  const m = await import("@/lib/v3-settings");
  return { getV3SettingsForDisplay: async () => m.mergeV3([]) };
});
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});
vi.mock("@/lib/mail/send", async (orig) => {
  const m = await orig<typeof import("@/lib/mail/send")>();
  return { ...m, sendToUser: (u: Parameters<typeof m.sendToUser>[0], k: string, r: string, msg: Parameters<typeof m.sendToUser>[3], d: Parameters<typeof m.sendToUser>[4] = {}) => m.sendToUser(u, k, r, msg, { ...d, query: db.query!, transport: async () => ({ ok: true }), sleep: async () => {} }) };
});
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => new Promise(() => {}) }));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => children,
  useCheckoutElements: () => ({ type: "loading" }),
  PaymentElement: () => <div data-stripe="payment-element" />,
}));

const { default: Page } = await import("./page");
const { FooterSwitch } = await import("@/components/footer-switch");
const WEEK = "2026-12-14";

async function render(search: Record<string, string> = {}): Promise<{ html: string; text: string; redirect: string | null }> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(<Page params={Promise.resolve({})} searchParams={Promise.resolve(search)} />, { onError: (e) => void errors.push(e) });
  const html = await new Response(prelude).text();
  const r = errors.find((e): e is Redirected => e instanceof Redirected);
  const other = errors.find((e) => !(e instanceof Redirected));
  if (other) throw other;
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), redirect: r?.url ?? null };
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.gw = fakeGateway();
  resetNextFakes({}, { "x-vercel-forwarded-for": "203.0.113.9" });
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_page";
  const [u] = await query<{ id: string }>(
    "insert into users (email, name, status, plan, currency, consent_at, signup_step, first_teaser_at) values ('a@example.com', 'Ana Lee', 'trial', 'monthly', 'CAD', now(), 'done', now()) returning id",
  );
  db.userId = u.id;
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [u.id, WEEK]);
  for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures) values ($1, 'Sales', 'D.', '1. S.', 'I.', $2, $2, '{}') returning id`,
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits.')", [u.id, WEEK, i + 1, p.id]);
  }
});

describe("/start/payment", () => {
  it("renders Step 4 for a no-card trial with a held list: Price Box in the account currency, Due today, the button and the trust block", async () => {
    const { html, text, redirect } = await render();
    expect(redirect).toBeNull();
    expect(text).toContain("Step 4 of 4");
    expect(html).toMatch(/<h1[^>]*>Payment<\/h1>/);
    expect(text).toContain("Roger monthly CA$280");
    expect(text).toContain("Calculated from your billing address");
    expect(text).toContain("Total per month CA$280 + tax");
    expect(text).toContain("Due today: CA$0. Your first charge comes with your third list.");
    expect(text).toContain("Start free trial");
    expect(text).toContain("Secured by Stripe");
    expect(text).toContain("Payments are processed by Stripe, a PCI DSS Level 1 certified provider. Roger never sees your card number.");
    expect(html).toContain('value="Ana Lee"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>CAD</);
    expect(html).toContain('href="/app"');
    // One open session was made and stored for the card form.
    const [u] = await db.query!<{ setup_session: string | null }>("select setup_session from users");
    expect(db.gw!.sessions.get(u.setup_session!)).toMatchObject({ status: "open", currency: "CAD" });
    // No app nav on the page, no removed wording.
    expect(text).not.toMatch(/Nothing is charged today|no earlier than|one list at a time/i);
  });

  it("shows the address message from the return page above the form", async () => {
    const { text } = await render({ error: "address" });
    expect(text).toContain("Stripe couldn’t use that billing address to work out the tax.");
  });

  it("shows a pending promo code with its discount", async () => {
    const f = db.gw!.payment.addPromotion({ code: "SAVE20", coupon: { name: "Launch 20%" } });
    await db.query!("update users set promo_code = 'SAVE20', promo_coupon = $1, promo_label = 'Launch 20%'", [f.coupon!.id]);
    const { text } = await render();
    expect(text).toMatch(/Launch 20%.*first month only\s*−\s*CA\$56/);
    expect(text).toContain("Code SAVE20 applied");
  });

  it("drops a pending code that does not apply in the account's currency, and says so", async () => {
    const f = db.gw!.payment.addPromotion({ code: "TENUSD", coupon: { amountOff: { usd: 1000 }, percentOff: null } });
    await db.query!("update users set promo_code = 'TENUSD', promo_coupon = $1, promo_label = 'Ten off'", [f.coupon!.id]);
    const { text } = await render();
    expect(text).toContain("That code no longer applies, so the price is the regular one.");
    expect(text).not.toContain("Code TENUSD applied");
    expect(text).toContain("Total per month CA$280 + tax");
    expect(await db.query!("select promo_code from users")).toEqual([{ promo_code: null }]);
  });

  const away: [string, () => Promise<unknown>][] = [
    ["a card already saved", () => db.query!("update users set trial_started_at = now()")],
    ["no held list", () => db.query!("delete from picks").then(() => db.query!("delete from cora_user_weeks"))],
    ["a closed account", () => db.query!("update users set status = 'closed'")],
    ["a member still signing up", () => db.query!("update users set status = 'signup'")],
  ];
  for (const [name, setup] of away) {
    it(`sends ${name} to /app without opening a session`, async () => {
      await setup();
      expect((await render()).redirect).toBe("/app");
      expect(db.gw!.sessions.size).toBe(0);
    });
  }

  it("sends a signed-out visitor to sign in, back to Payment after", async () => {
    db.userId = null;
    expect((await render()).redirect).toBe(`/signin?next=${encodeURIComponent("/start/payment")}`);
  });

  it("finishes the save and goes to the unlocked list when the stored session already holds a confirmed card", async () => {
    await render();
    const [u] = await db.query!<{ setup_session: string }>("select setup_session from users");
    db.gw!.complete(u.setup_session);
    expect((await render()).redirect).toBe(`/app/week/${WEEK}?card=saved`);
  });

  it("explains, with the support address, when Stripe is not set up", async () => {
    db.gw = null;
    const { text } = await render();
    expect(text).toContain("Card payments aren’t switched on yet.");
    expect(text).toContain("hello@meetroger.ai");
  });

  it("the footer is hidden on the Payment routes", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    expect(renderToStaticMarkup(<FooterSwitch full={<footer>full</footer>} minimal={<footer>min</footer>} />)).toBe("");
    const { isPaymentPath } = await import("@/components/footer-switch");
    expect(["/start/payment", "/start/payment/done"].every(isPaymentPath)).toBe(true);
    expect(["/start/plan", "/start/paymentx", "/app"].some(isPaymentPath)).toBe(false);
  });
});
