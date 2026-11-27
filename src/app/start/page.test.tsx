import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * B2 plan Unit 10: /start shows the uniform message above the quiz when the
 * sponsor code brought there won't give a seat, and nothing for a good one.
 */

const db: { query: Query | null } = { query: null };
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => ({ ...nextNavigation, usePathname: () => "/start" }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({ getSession: async () => null }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([{ key: "v3.signupOpen", value: true }]) };
});

const { default: Page } = await import("./page");
const { SPONSOR_COOKIE, SPONSOR_INVALID } = await import("@/lib/sponsors/code");
const { createSponsor } = await import("@/lib/sponsors/sponsors");

async function render(): Promise<string> {
  const { prelude } = await prerender(<Page params={Promise.resolve({})} searchParams={Promise.resolve({})} />);
  return (await new Response(prelude).text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

let code: string;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  for (const k of ["sponsorsOn", "signupOpen", "cycleLive"]) await db.query!(`insert into settings (key, value) values ($1, 'true'::jsonb)`, [`v3.${k}`]);
  const s = await createSponsor(db.query!, null, "peter@meetroger.ai", {
    name: "Harbour Realty",
    currency: "CAD",
    standardCents: 20000,
    higherCents: 40000,
    seats: 2,
    billingEmail: "ap@harbour.example",
    billingCountry: "CA",
    billingPostal: "M5V 2T6",
  });
  if (!s.ok) throw new Error(s.message);
  code = s.code;
});

describe("/start with a sponsor code", () => {
  it("shows the uniform message for a code that won't give a seat, above the quiz", async () => {
    resetNextFakes({ [SPONSOR_COOKIE]: "ABCDEFGHJKLM" }, { "x-vercel-forwarded-for": "1.2.3.4" });
    const text = await render();
    expect(text).toContain(SPONSOR_INVALID);
    expect(text).toContain("A few questions first.");
  });

  it("shows nothing for a good code, or with no code", async () => {
    resetNextFakes({ [SPONSOR_COOKIE]: code }, { "x-vercel-forwarded-for": "1.2.3.4" });
    expect(await render()).not.toContain(SPONSOR_INVALID);
    resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
    expect(await render()).not.toContain(SPONSOR_INVALID);
  });
});
