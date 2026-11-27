import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { v1 } from "@/data/site/v1";
import { amountsFrom, fillCopy } from "./amounts";
import { chromeFrom, siteChrome } from "./chrome";

const amounts = amountsFrom(v3Defaults);

describe("chromeFrom", () => {
  // The chrome is built in the root layout, so it must not depend on any page's own copy.
  it("builds when a page's own copy names an amount that does not exist", () => {
    const broken = { ...v1, home: { ...v1.home, closing: { line: "See what {freeList} Mondays bring." } }, cardLine: "Charged with your {thirdList} list." };
    // The case is real: filling the whole object throws.
    expect(() => fillCopy(broken, amounts)).toThrow(/\{freeList\}|\{thirdList\}/);
    expect(chromeFrom(broken, amounts)).toEqual(siteChrome("v1", amounts));
  });

  it("still fails on an unknown amount in a string the chrome shows", () => {
    for (const part of ["buttons", "nav", "footer", "notFound"] as const) {
      const [key] = Object.keys(v1[part]);
      const broken = { ...v1, [part]: { ...v1[part], [key]: "{nope}" } };
      expect(() => chromeFrom(broken, amounts), part).toThrow("{nope}");
    }
  });

  it("fills the amounts its own labels name", () => {
    expect(siteChrome("v1", amounts).start).toEqual({ href: "/start", label: "Get two free Monday lists", short: "Start free" });
    expect(JSON.stringify(siteChrome("v1", amounts))).not.toMatch(/[{}]\w|\w\}/);
  });
});
