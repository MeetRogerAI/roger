/**
 * The builder's preview of the blocks is served only where the environment is
 * known not to be live. It fails closed: a production build with no
 * VERCEL_ENV, such as one made off Vercel, does not serve it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});

class NotFound extends Error {}
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  notFound: (): never => {
    throw new NotFound("not found");
  },
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { default: SiteBlocksPreview, metadata } = await import("./page");

beforeAll(() => resetNextFakes());
afterEach(() => vi.unstubAllEnvs());

const env = (vercelEnv: string, nodeEnv: string) => {
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("NODE_ENV", nodeEnv);
};

describe("/site-preview/blocks", () => {
  it("is not found on Vercel production", async () => {
    env("production", "production");
    await expect(pageMarkup(<SiteBlocksPreview />)).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found on a production build with no VERCEL_ENV", async () => {
    env("", "production");
    await expect(pageMarkup(<SiteBlocksPreview />)).rejects.toBeInstanceOf(NotFound);
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(process.env.VERCEL_ENV).toBeUndefined();
    await expect(pageMarkup(<SiteBlocksPreview />)).rejects.toBeInstanceOf(NotFound);
  });

  it("renders the blocks on a Vercel preview, which is built with NODE_ENV=production", async () => {
    env("preview", "production");
    const markup = await pageMarkup(<SiteBlocksPreview />);
    expect(markup).toContain('data-plan="monthly"');
    expect(markup).toContain("You decide what Zack shares");
    expect(markup).toContain("Client email in two tones");
    // The bundled play has no scores, and the made-up scored card shows the five bars.
    expect(markup.match(/data-score="/g)).toHaveLength(5);
  });

  it("renders in local development and tests, and is kept out of search", async () => {
    env("", "test");
    expect(await pageMarkup(<SiteBlocksPreview />)).toContain('data-plan="monthly"');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
