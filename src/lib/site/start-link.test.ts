import { describe, expect, it } from "vitest";
import { parseStartParams, startQuery } from "@/lib/signup/params";
import { startHref, utmValue, type StartLinkInput } from "./start-link";

/** What /start reads from a link, parsed the way the page does. */
function arrive(href: string) {
  const url = new URL(href, "https://meetroger.ai");
  expect(url.pathname).toBe("/start");
  return parseStartParams(Object.fromEntries(url.searchParams));
}

const token = "Zk3_free-run-token-0001";
const tags = { utm_source: "partner", utm_medium: "email", utm_campaign: "dec-1" };

describe("the start link", () => {
  // Plan AE11: read /agents, then /pricing (no audience of its own), having chosen CAD.
  it("carries the remembered audience, the chosen currency and the campaign tags", () => {
    const href = startHref({ audience: null, remembered: "agents", currency: "CAD", tags });
    expect(arrive(href)).toEqual({ path: "agents", cur: "CAD", ref: null, zack: null, utm: "partner/email/dec-1" });
  });

  it("prefers the page's own audience to the remembered one", () => {
    expect(arrive(startHref({ audience: "re", remembered: "agents" })).path).toBe("re");
  });

  it("has no path when the page has no audience and none is remembered", () => {
    expect(startHref()).toBe("/start");
    expect(startHref({ audience: null, remembered: null, currency: null, tags: {} })).toBe("/start");
    expect(startHref({ currency: "USD" })).toBe("/start?cur=USD");
  });

  it("ignores a remembered audience or currency it does not know", () => {
    expect(startHref({ remembered: "investors", currency: "EUR" })).toBe("/start");
  });

  it("carries a Zack token of the right shape and drops any other", () => {
    expect(arrive(startHref({ audience: "agents", zack: token }))).toMatchObject({ path: "agents", zack: token });
    for (const bad of ["short", "has spaces in it, sixteen long", `${token}?x=1`, "x".repeat(129)]) {
      expect(startHref({ audience: "agents", zack: bad })).toBe("/start?path=agents");
    }
  });

  it("carries a referral code of the right shape and drops any other", () => {
    expect(arrive(startHref({ ref: "ehab-01" })).ref).toBe("ehab-01");
    expect(startHref({ ref: "no" })).toBe("/start");
    expect(startHref({ ref: "not a code" })).toBe("/start");
  });

  it("builds nothing that /start drops or changes", () => {
    const cases: StartLinkInput[] = [
      {},
      { audience: "re" },
      { remembered: "agents", currency: "CAD", tags },
      { audience: "agents", currency: "USD", zack: token, ref: "friend_22", tags },
      { audience: "re", tags: { utm_source: "  Dec 1 launch / wave 2  ", utm_campaign: "été & hiver = 50%" } },
      { tags: { utm_source: "s".repeat(80), utm_medium: "m".repeat(80), utm_campaign: "c".repeat(80) } },
      { tags: { utm_medium: "email" } },
      { zack: "bad token", ref: "!", currency: "EUR", remembered: "nobody", tags: { utm_source: 7 } },
    ];
    for (const input of cases) {
      const href = startHref(input);
      const read = arrive(href);
      // Parsed and written again, the link is the same link.
      expect(`/start${startQuery(read)}`, JSON.stringify(input)).toBe(href);
      expect(read.utm).toBe(utmValue(input.tags));
    }
  });
});

describe("hostile campaign tags", () => {
  const zack = "AAAAAAAAAAAAAAAAAAAA";
  const hostile = [
    `x&path=agents&zack=${zack}`,
    "x#path=agents",
    "100%26path%3Dagents",
    `"quoted" 'single' <b>`,
    "line one\nline two&ref=sneaky",
  ];

  it("never adds a parameter of its own to the link", () => {
    for (const value of hostile) {
      for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
        const href = startHref({ tags: { [key]: value } });
        const url = new URL(href, "https://meetroger.ai");
        expect([...url.searchParams.keys()], value).toEqual(["utm"]);
        const read = arrive(href);
        expect(typeof read.utm).toBe("string");
        expect(read).toMatchObject({ path: null, cur: null, ref: null, zack: null });
        expect(read.utm).toBe(utmValue({ [key]: value }));
      }
    }
  });

  it("leaves path, ref and zack exactly as passed in separately", () => {
    for (const value of hostile) {
      const read = arrive(
        startHref({ audience: "re", ref: "ehab-01", zack: token, tags: { utm_source: value, utm_campaign: value } }),
      );
      expect(read).toMatchObject({ path: "re", ref: "ehab-01", zack: token });
      expect(read.utm).toBe(utmValue({ utm_source: value, utm_campaign: value }));
    }
  });
});

describe("campaign tags of the wrong type", () => {
  const wrong: unknown[] = [null, 42, ["partner", "email"], "partner", true, {}];

  it("gives no utm and does not throw", () => {
    for (const value of wrong) {
      expect(() => utmValue(value as never), String(value)).not.toThrow();
      expect(utmValue(value as never)).toBe("");
      const href = startHref({ tags: value as never });
      expect(href).toBe("/start");
      expect(arrive(href).utm).toBe("");
    }
  });

  it("drops a tag of the wrong type and keeps the others", () => {
    for (const value of [null, 42, ["a"], {}, true]) {
      expect(utmValue({ utm_source: value, utm_medium: "email" })).toBe("email");
    }
  });
});

describe("the campaign tags as one value", () => {
  it("joins the tags that are present", () => {
    expect(utmValue(tags)).toBe("partner/email/dec-1");
    expect(utmValue({ utm_source: "partner" })).toBe("partner");
    expect(utmValue({})).toBe("");
    expect(utmValue(null)).toBe("");
  });

  it("keeps to printable ASCII, one separator and 200 characters", () => {
    expect(utmValue({ utm_source: "a/b", utm_medium: " café\n" })).toBe("a-b/caf");
    const long = utmValue({ utm_source: "s".repeat(80), utm_medium: "m".repeat(80), utm_campaign: "c".repeat(80) });
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.split("/")).toHaveLength(3);
  });
});
