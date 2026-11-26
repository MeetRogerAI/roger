import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromoField } from "./promo-field";

/** Plan 2026-11-26-001, Unit 6 (origin R17): "Have a promo code?". */

const noop = async () => null;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("PromoField", () => {
  it("starts as a quiet text link, not a field", () => {
    const html = renderToStaticMarkup(<PromoField promo={null} onApply={noop} onRemove={async () => {}} />);
    expect(text(html)).toContain("Have a promo code?");
    expect(html).not.toContain("<input");
    expect(html).toContain('class="tlink');
  });

  it("opened: one labelled field and an Apply button, never a form (it must not submit or reset the card form)", () => {
    const html = renderToStaticMarkup(<PromoField promo={null} onApply={noop} onRemove={async () => {}} initiallyOpen />);
    expect(html).toMatch(/<label[^>]*>Promo code<\/label>/);
    expect(html).toMatch(/autocomplete="off"/i);
    expect(text(html)).toContain("Apply");
    expect(html).not.toContain("<form");
    expect(html).toMatch(/<button type="button"[^>]*>Apply<\/button>/);
  });

  it("an applied code shows with a Remove control", () => {
    const t = text(
      renderToStaticMarkup(
        <PromoField
          promo={{ code: "SAVE20", label: "Launch 20%", duration: "once", durationInMonths: null, percentOff: 20, amountOffCents: null }}
          onApply={noop}
          onRemove={async () => {}}
        />,
      ),
    );
    expect(t).toContain("Code SAVE20 applied");
    expect(t).toContain("Remove");
    expect(t).not.toContain("Have a promo code?");
  });
});
