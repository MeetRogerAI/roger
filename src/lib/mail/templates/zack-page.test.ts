import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { sharingOffPrice } from "@/lib/zack/sharing-effect";
import { sharingChangedEmail } from "./zack-page";

/** Peter's wording for turning sharing off (2026-11-27): "doubles" only when the higher price is twice the standard one. */
const settings = mergeV3([]);
const args = { settings, plan: "monthly" as const, currency: "CAD" as const, from: "share" as const, to: "match_only" as const, trialStartedAt: null, status: "active" };

describe("the sharing-off email", () => {
  it("a CAD member turning to matching only: the price doubles, to CA$560 a month", () => {
    const higherPrice = sharingOffPrice(args);
    expect(higherPrice).toEqual({ higher: "CA$560", doubles: true });
    const m = sharingChangedEmail({ sharing: "match_only", priceLine: null, higherPrice });
    expect(m.text).toContain("Zack is now set to “use for my matching only”.");
    expect(m.text).toContain("but your price doubles, to CA$560 a month. This applies only to months when you are not sharing");
  });

  it("says the price goes up when the higher price is not exactly twice the standard one", () => {
    const higherPrice = sharingOffPrice({ ...args, settings: { ...settings, priceHigherCad: 500 } });
    expect(higherPrice).toEqual({ higher: "CA$500", doubles: false });
    const m = sharingChangedEmail({ sharing: "off", priceLine: null, higherPrice });
    expect(m.text).toContain("but your price goes up to CA$500 a month.");
    expect(m.text).not.toContain("doubles");
  });

  it("links the Zack page in the HTML", () => {
    const m = sharingChangedEmail({ sharing: "off", priceLine: null, higherPrice: sharingOffPrice({ ...args, to: "off" }) });
    expect(m.html).toMatch(/open the <a href="[^"]*\/app\/zack" style="[^"]*">Zack page<\/a> and change it back\./);
  });

  it("gives no explanation when the change does not turn sharing off", () => {
    expect(sharingOffPrice({ ...args, from: "match_only", to: "off" })).toBeNull();
    expect(sharingOffPrice({ ...args, from: "off", to: "share" })).toBeNull();
  });
});
