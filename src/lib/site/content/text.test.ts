/**
 * What stored site text goes through before it is kept: the tidy, the names
 * in braces, and the address of a link (plan KTD10, KTD12). The one-line tidy
 * is also held by ./check.test.ts, as a save applies it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { amountNames, amountsFrom, fillAmounts } from "../amounts";
import { DESTINATION_MAX, amountPlaceholderNames, amountPlaceholders, placeholdersIn, plainBlock, plainLine, unknownPlaceholder, usableDestination } from "./text";

const char = (code: number) => String.fromCharCode(code);

describe("plainLine", () => {
  it("makes one line: line breaks, tabs and runs of spaces become one space, and the ends are trimmed", () => {
    expect(plainLine(`  Yes.${char(13)}${char(10)}${char(10)}You can${char(9)}cancel   any time. `)).toBe("Yes. You can cancel any time.");
    expect(plainLine("")).toBe("");
  });

  it("removes the characters that print nothing, so a word cannot be hidden from the wording rules", () => {
    for (const code of [0x00ad, 0x034f, 0x061c, 0x180e, 0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x206f, 0xfeff, 0xfff9, 0xfffb]) expect(plainLine(`ag${char(code)}ent`), code.toString(16)).toBe("agent");
    expect(plainLine(`A${char(0)}B${char(127)}C${char(0x85)}D`)).toBe("A B C D");
    expect(plainLine("Café, naïve, 日本語, עברית")).toBe("Café, naïve, 日本語, עברית");
  });
});

describe("what both tidies remove and join", () => {
  const point = (code: number) => String.fromCodePoint(code);
  const both = [plainLine, plainBlock];

  it("removes the fillers, the variation selectors and the tag characters, which print nothing either", () => {
    for (const code of [0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180f, 0x3164, 0xffa0, 0xfe00, 0xfe0f, 0x1d173, 0x1d17a, 0xe0001, 0xe0041, 0xe007f, 0xe0100, 0xe01ef]) {
      for (const tidy of both) expect(tidy(`ag${point(code)}ent`), code.toString(16)).toBe("agent");
    }
  });

  it("removes half of a pair, which Postgres refuses inside JSON, and keeps a whole pair", () => {
    const whole = point(0x1d4b3);
    expect(whole).toHaveLength(2);
    for (const tidy of both) {
      expect(tidy(`a${char(0xd800)}b${char(0xdc00)}c`)).toBe("abc");
      expect(tidy(`a${whole}b`)).toBe(`a${whole}b`);
      // The text can be written as JSON and read back as itself.
      expect(JSON.parse(JSON.stringify(tidy(`${char(0xdfff)}x${char(0xdbff)}`)))).toBe("x");
    }
  });

  it("writes a letter and its accent as one character, so the same word typed two ways is the same text", () => {
    const apart = `Cafe${char(0x301)}, nai${char(0x308)}ve`;
    const together = `Caf${char(0xe9)}, na${char(0xef)}ve`;
    expect(apart).not.toBe(together);
    for (const tidy of both) {
      expect(tidy(apart)).toBe(together);
      expect(tidy(together)).toBe(together);
    }
  });

  it("gives the same text when run again on what it gave", () => {
    const messy = `  ${char(0xfeff)}First${char(0x2028)}line.${char(13)}${char(10)}${char(9)}Second${char(0xa0)}${char(0xa0)}line${char(0x200b)}, cafe${char(0x301)}.${char(0xd800)}  ${char(10)}${char(10)}${char(10)}Third.  `;
    for (const tidy of both) expect(tidy(tidy(messy))).toBe(tidy(messy));
    // An unseen character between a letter and its accent goes first, so the two are joined in one pass.
    for (const tidy of both) expect(tidy(`cafe${char(0x200b)}${char(0x301)}`)).toBe(`caf${char(0xe9)}`);
    expect(plainLine(messy)).toBe(`First line. Second line, caf${char(0xe9)}. Third.`);
  });

  it("is written in this file's source with escapes only, so the file shows what it removes", () => {
    const source = readFileSync(fileURLToPath(new URL("./text.ts", import.meta.url)), "utf8");
    const unseenLine = source.split("\n").find((line) => line.startsWith("const UNSEEN = "))!;
    expect(unseenLine).toMatch(/^[\x20-\x7e]+\r?$/);
  });
});

describe("plainBlock", () => {
  it("reads Unicode's own line and paragraph separators as line breaks", () => {
    expect(plainBlock(`One.${char(0x2028)}Two.${char(0x2029)}Three.`)).toBe("One.\nTwo.\nThree.");
    expect(plainLine(`One.${char(0x2028)}Two.`)).toBe("One. Two.");
  });

  it("keeps the lines, whatever line break was typed, and trims the end of each", () => {
    expect(plainBlock(`## 1. Play  ${char(13)}${char(10)}First line.${char(13)}Second line.${char(9)}`)).toBe("## 1. Play\nFirst line.\nSecond line.");
  });

  it("keeps the spaces at the start of a line and inside it, since a playbook's lists are indented", () => {
    expect(plainBlock("- one\n  - two  words\n    - three")).toBe("- one\n  - two  words\n    - three");
  });

  it("leaves one empty line where several were typed, and none at the start or the end", () => {
    expect(plainBlock("\n\n  \nFirst.\n\n\n\n\nSecond.\n \n\n")).toBe("First.\n\nSecond.");
    expect(plainBlock(" \n \n ")).toBe("");
  });

  it("removes the characters that print nothing, and turns every other control character into a space", () => {
    expect(plainBlock(`ag${char(0x200b)}ent${char(10)}next${char(0)}line${char(0x202e)}`)).toBe("agent\nnext line");
  });
});

describe("the names a text holds in braces", () => {
  const amounts = amountsFrom(v3Defaults);

  it("are the amounts fillAmounts knows, whatever the settings hold", () => {
    expect([...amountPlaceholderNames]).toEqual(Object.keys(amountNames(amounts)));
    expect(amountPlaceholderNames).toContain("monthlyUsd");
    expect(amountPlaceholders).toContain("{monthlyUsd}");
    expect(amountPlaceholders).toHaveLength(amountPlaceholderNames.length);
    // The names of a brick-stack caption are not amounts.
    expect(amountPlaceholderNames).not.toContain("week");
    expect(amountPlaceholderNames).not.toContain("bricks");
  });

  it("are read as fillAmounts reads them: a word in braces, each once, in order", () => {
    expect(placeholdersIn("{monthlyUsd} a month, {monthlyCad} in Canada. {monthlyUsd} again.")).toEqual(["monthlyUsd", "monthlyCad"]);
    // Braces that hold no single word are printed as typed, by fillAmounts too.
    expect(placeholdersIn("An empty {} pair, a {two words} pair, a lone { and a lone }.")).toEqual([]);
    expect(fillAmounts("An empty {} pair, a {two words} pair.", amounts)).toBe("An empty {} pair, a {two words} pair.");
  });

  it("names the first one that is not allowed, as it was typed, and nothing when all are", () => {
    expect(unknownPlaceholder("{monthlyUsd} a month.", amountPlaceholderNames)).toBeNull();
    expect(unknownPlaceholder("No names here.", [])).toBeNull();
    expect(unknownPlaceholder("{monthlyUsd} and {monthlyUsdd} and {nope}.", amountPlaceholderNames)).toBe("{monthlyUsdd}");
    expect(unknownPlaceholder("Week {week}", amountPlaceholderNames)).toBe("{week}");
    expect(unknownPlaceholder("Week {week}", ["week", "bricks"])).toBeNull();
    // A name every object has is not an amount.
    expect(unknownPlaceholder("{constructor} {toString}", amountPlaceholderNames)).toBe("{constructor}");
  });

  it("agrees with fillAmounts: a text with no unknown name is filled without an error", () => {
    const text = `Every amount: ${amountPlaceholders.join(" ")}`;
    expect(unknownPlaceholder(text, amountPlaceholderNames)).toBeNull();
    expect(fillAmounts(text, amounts)).not.toMatch(/[{}]/);
    expect(() => fillAmounts("{monthlyUsdd}", amounts)).toThrow();
  });
});

describe("the address a link may point at", () => {
  it("is a path on this site, an https address or a mailto address", () => {
    for (const ok of ["/", "/faq", "/#price", "/how-it-works#zack", "/library?tool=claude", "https://x.test", "https://x.test/a/b?c=d#e", "mailto:a@b.test"]) expect(usableDestination(ok), ok).toBe(true);
  });

  it("is nothing else: no script, no other scheme, no other site written as a path", () => {
    const refused = [
      "",
      "faq",
      "#price",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,x",
      "//evil.test",
      "///evil.test",
      "http://x.test",
      "HTTPS://x.test",
      "https://",
      "https:x.test",
      "mailto:",
      "ftp://x.test",
      "tel:5550100",
      "/a b",
      "/faq ",
      " /faq",
      `/${char(92)}evil.test`,
      `${char(92)}${char(92)}evil.test`,
      `/${char(9)}/evil.test`,
      `/${char(10)}/evil.test`,
      `/faq${char(0)}`,
      `/fa${char(0x200b)}q`,
      `/faq${char(0xa0)}`,
      `https://x.test/${char(0x202e)}`,
      `/faq${String.fromCodePoint(0xe0041)}`,
      `https://x.test${char(0x3164)}`,
      `/faq${char(0xd800)}`,
    ];
    for (const bad of refused) expect(usableDestination(bad), JSON.stringify(bad)).toBe(false);
  });

  it("is text, and not longer than an address may be", () => {
    for (const bad of [null, undefined, 7, true, ["/faq"], { href: "/faq" }]) expect(usableDestination(bad), JSON.stringify(bad)).toBe(false);
    expect(usableDestination(`/${"a".repeat(DESTINATION_MAX - 1)}`)).toBe(true);
    expect(usableDestination(`/${"a".repeat(DESTINATION_MAX)}`)).toBe(false);
  });
});
