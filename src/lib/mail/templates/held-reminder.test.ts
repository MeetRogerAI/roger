import { describe, expect, it } from "vitest";
import { heldReminderEmail } from "./held-reminder";

/** Plan 2026-11-26-001, Unit 7: "Your ideas are waiting" (origin R11). */
describe("heldReminderEmail", () => {
  const url = "https://preview.example/start/payment";

  it("lists the titles, the close date and one button to the Payment page", () => {
    const m = heldReminderEmail({ week: "2026-12-14", titles: ["Inbox triage", "Listing post", "Calendar prep"], closesOn: "2026-12-28", paymentUrl: url });
    expect(m.subject).toBe("Your ideas are waiting");
    expect(m.text).toContain("Your first 3 ideas are ready. Cora picked these ideas for you for the week of Monday, December 14:");
    expect(m.text).toContain("1. Inbox triage\n\n2. Listing post\n\n3. Calendar prep");
    expect(m.text).toContain("If no card is added by Monday, December 28, your trial closes.");
    expect(m.text).toContain(`Add your card to see them: ${url}`);
    expect(m.html.match(/<a /g)).toHaveLength(1);
  });

  it("words a short week and escapes titles", () => {
    const m = heldReminderEmail({ week: "2026-12-14", titles: ["<b>Bold</b> & more"], closesOn: "2026-12-28", paymentUrl: url });
    expect(m.text).toContain("Your first ideas are ready. Cora picked this idea");
    expect(m.html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; more");
  });
});
