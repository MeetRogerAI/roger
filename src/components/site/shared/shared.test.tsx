import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import type { Currency } from "@/lib/site/amounts";

vi.mock("next/headers", () => nextHeaders);

const { CountryDefault } = await import("./country-default");
const { StartLink } = await import("./start-link");
const { useCurrency } = await import("./currency-store");

afterEach(() => resetNextFakes());

function Price({ initial }: { initial: Currency }) {
  const [currency] = useCurrency(initial);
  return <p>{`shows ${currency}`}</p>;
}

describe("the country default", () => {
  const block = <CountryDefault>{(currency) => <Price initial={currency} />}</CountryDefault>;

  it("shows CAD to a visitor in Canada", async () => {
    resetNextFakes({}, { "x-vercel-ip-country": "CA" });
    expect(await pageMarkup(block)).toContain("shows CAD");
  });

  it("shows USD to everyone else, and with no country header", async () => {
    resetNextFakes({}, { "x-vercel-ip-country": "GB" });
    expect(await pageMarkup(block)).toContain("shows USD");
    resetNextFakes();
    expect(await pageMarkup(block)).toContain("shows USD");
  });
});

// What the server sends is the link a visitor without script follows.
describe("the start link with no script", () => {
  const hrefOf = (markup: string) => /href="([^"]*)"/.exec(markup)?.[1].replace(/&amp;/g, "&");

  it("is a plain link to /start on a page with no audience", async () => {
    const markup = await pageMarkup(<StartLink className="btn">Get two free Monday lists</StartLink>);
    expect(hrefOf(markup)).toBe("/start");
    expect(markup).toContain('class="btn"');
    expect(markup).toContain("Get two free Monday lists");
  });

  it("carries the page's audience, and a Zack token when the page has one", async () => {
    expect(hrefOf(await pageMarkup(<StartLink audience="agents">Start</StartLink>))).toBe("/start?path=agents");
    expect(hrefOf(await pageMarkup(<StartLink audience="agents" zack="Zk3_free-run-token-0001">Start</StartLink>))).toBe("/start?path=agents&zack=Zk3_free-run-token-0001");
  });
});
