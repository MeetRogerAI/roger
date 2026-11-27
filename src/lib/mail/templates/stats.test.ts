import { describe, expect, it } from "vitest";
import { ordinal, statsEmail, type StatsEmail } from "./stats";

const base: StatsEmail = {
  season: "Season 1 · week 7 of 26 · 5 bricks this Season · 12 in all",
  points: 4,
  rank: 3,
  credit: { cents: 2500, currency: "USD", asOf: "2026-12-14" },
  inviteUrl: "https://meetroger.ai/r/abcdefghij",
  unsubscribeUrl: "https://meetroger.ai/u/TOKEN",
};

describe("the stats email", () => {
  it("has Season and bricks, points and rank, credit as of a date, the invitation link and the unsubscribe link", () => {
    const m = statsEmail(base);
    expect(m.subject).toBe("Your week in numbers");
    expect(m.text).toContain("Season 1 · week 7 of 26 · 5 bricks this Season · 12 in all.");
    expect(m.text).toContain("4 contribution points. You rank 3rd among Roger members.");
    expect(m.text).toContain("Referral credit on your balance: US$25.00, as of Monday, December 14.");
    expect(m.text).toContain("Your invitation link: https://meetroger.ai/r/abcdefghij");
    expect(m.text).toContain("https://meetroger.ai/u/TOKEN");
    expect(m.html).toContain('href="https://meetroger.ai/r/abcdefghij"');
    expect(m.html).toContain('href="https://meetroger.ai/u/TOKEN"');
    expect(m.text).toContain("You get this email on Wednesdays. To stop it (your Monday list is not affected): https://meetroger.ai/u/TOKEN.");
    expect(m.text.indexOf("/u/TOKEN")).toBeLessThan(m.text.indexOf("--"));
    expect(m.html).toContain(">Stop the Wednesday email</a>");
    expect(`${m.text}${m.html}`).not.toMatch(/level/i);
  });

  it("leaves the credit out when there is none, and says so before the first list and with no points", () => {
    const m = statsEmail({ ...base, season: null, points: 0, rank: 9, credit: null });
    expect(m.text).not.toContain("credit");
    expect(m.text).toContain("Your first Season starts with your first list.");
    expect(m.text).toContain("No contribution points yet.");
    expect(m.text).not.toContain("9th");
  });

  it("escapes the links in the unsubscribe line", () => {
    const m = statsEmail({ ...base, unsubscribeUrl: 'https://x/u/a"b<c' });
    expect(m.html).toContain('href="https://x/u/a&quot;b&lt;c"');
    expect(m.html).not.toContain('a"b<c');
  });

  it("says one point, not one points", () => {
    expect(statsEmail({ ...base, points: 1, rank: 1 }).text).toContain("1 contribution point. You rank 1st");
  });

  it("ranks in words", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});
