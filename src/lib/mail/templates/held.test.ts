import { describe, expect, it } from "vitest";
import { firstListHeldEmail } from "./held";

/** Plan 2026-11-26-001, Unit 3: the held list's teaser email (origin R8). */
describe("firstListHeldEmail", () => {
  const url = "https://preview.example/start/payment";

  it("lists the titles, with one button to the Payment page", () => {
    const m = firstListHeldEmail({ week: "2026-12-14", titles: ["Inbox triage", "Listing post", "Calendar prep"], paymentUrl: url });
    expect(m.subject).toBe("Your first 3 ideas are ready");
    expect(m.text).toContain("Your first 3 ideas are ready");
    expect(m.text).toContain("1. Inbox triage\n\n2. Listing post\n\n3. Calendar prep");
    expect(m.text).toContain(`Add your card to see them: ${url}`);
    expect(m.html).toContain(`href="${url}"`);
    expect(m.html.match(/<a /g)).toHaveLength(1);
    expect(m.text).toContain("Monday, December 14");
  });

  it("says 'Your first ideas are ready' on a short week", () => {
    const m = firstListHeldEmail({ week: "2026-12-14", titles: ["Inbox triage"], paymentUrl: url });
    expect(m.subject).toBe("Your first ideas are ready");
    expect(m.text).toContain("this idea");
  });

  it("escapes titles", () => {
    const m = firstListHeldEmail({ week: "2026-12-14", titles: ["<b>Bold</b> & more"], paymentUrl: url });
    expect(m.html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; more");
  });
});
