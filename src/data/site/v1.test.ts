import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZACK_AGENTS } from "@/lib/zack/agents";
import { sitePrivacy } from "./legal";
import { v1 } from "./v1";

/**
 * Approved by Peter on November 26, 2026: the site's wording follows the Zack
 * 2.0 instructions. These tests hold the marketing sentences about what Zack
 * reads, skips, removes and sends to the four instruction files in
 * content/zack, so that neither can change without the other.
 */
const instructions = ZACK_AGENTS.map((agent) => ({ agent, text: readFileSync(path.join(process.cwd(), "content/zack", `${agent}.md`), "utf8").replace(/\r\n/g, "\n") }));

const answer = (q: string) => {
  const found = v1.questions.flatMap((group) => group.items).find((item) => item.q === q);
  if (!found) throw new Error(`No question "${q}"`);
  return found.a;
};
const point = (title: string) => {
  const found = v1.howItWorks.zack.points.find((p) => p.title === title);
  if (!found) throw new Error(`No point "${title}"`);
  return found.body;
};

const reads =
  "The past seven days of activity across your AI agent account, including work finished in that time. He also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes your AI agent keeps about the Roger ideas it has installed.";
const skips = "He skips email, calendar and Drive, chats and projects shared with other people, and other people’s messages. He reads no other account.";

describe("the site's wording about Zack follows the Zack 2.0 instructions", () => {
  it("has the four instruction files to compare with", () => {
    expect(instructions.map((i) => i.agent).sort()).toEqual(["claude", "duet", "grok-bot", "hark"]);
  });

  it("'What does Zack read?' says what he reads and what he skips, and no longer the narrower sentence", () => {
    expect(answer("What does Zack read?")).toBe(`${reads} ${skips}`);
    expect(point("What he reads")).toBe(reads);
    expect(point("What he never reads")).toBe(skips);
    const all = JSON.stringify(v1);
    expect(all).not.toContain("Only your own activity inside your AI agent account");
    expect(all).not.toContain("He does not read your email, calendar or files");
  });

  it.each(instructions)("$agent: reads the week across the account with finished work, the setup list and the notes file", ({ text }) => {
    expect(text).toMatch(/Every Zack run reviews the past 7 days of activity across /);
    expect(text).toMatch(/finished work \(files, /);
    expect(text).toMatch(/It also reads the account's list of (skills|specialties), [^.]*connected services \(names only\), and the file "Roger Upgrade Notes" if it exists\./);
    expect(text).toContain('**"Roger Upgrade Notes":** the file the member\'s agent keeps when it installs Roger ideas.');
  });

  it.each(instructions)("$agent: skips exactly what 'What he never reads' names", ({ text }) => {
    // Each file names the shared things in its own words; all of them are chats or projects shared with other people.
    expect(text).toMatch(/(Shared chats, shared projects|Group chats, shared projects|Anything shared with other people), other people's messages, email, calendar and Drive are skipped\. No other accounts, and no lookback longer than 7 days\./);
    // Files in the account are read as finished work, so the site must not say he does not read files.
    expect(skips).not.toMatch(/\bfiles?\b/i);
  });

  it.each(instructions)("$agent: is told to replace private details with placeholders, which is all the site claims", ({ text }) => {
    expect(text).toContain("**Banned** (replace each with a placeholder, see below):");
    expect(text).toContain("- Names of people other than the member, and the member's own first name.");
    expect(text).toContain("- The member's own companies, clients, customers, products, brands and projects.");
    expect(text).toContain("- Addresses and specific places tied to the member");
    expect(text).toContain("- Amounts, prices and figures tied to a person or deal.");
    expect(text).toContain("**Replace, don't delete.**");
  });

  it("'What he removes' says Zack is instructed to, and that Roger checks again, as the privacy page does", () => {
    expect(point("What he removes")).toBe("Zack is instructed to replace names, clients, addresses, amounts and other private details with placeholders, and Roger checks again when the report arrives.");
    const privacy = sitePrivacy.sections.find((s) => s.id === "zack")!.body.join(" ");
    expect(privacy).toContain("Zack is instructed to remove private details before it writes its report, and Roger checks again when the report arrives.");
  });

  it.each(instructions)("$agent: writes two files, the report and a private profile, which 'What leaves my account?' names", ({ text }) => {
    expect(text).toContain("**Zack writes two files and nothing else.**");
    expect(text).toContain("**The profile is private.** The matching profile is never shared with other members");
    expect(text).toMatch(/## The private matching profile\nGeneral words throughout\./);
  });

  it("'What leaves my account?' names both files and does not state removal as a fact", () => {
    const a = answer("What leaves my account?");
    expect(a).toBe(
      "Two files each week. Zack’s report is a write-up of your most useful plays, which he is instructed to write with names, clients, addresses, amounts and other private details replaced by placeholders. A private matching profile describes your work and your setup in general words, and is not shared with other users. You agree to this when you sign up, and you can turn it off.",
    );
  });

  it.each(instructions)("$agent: lets the user add the restrictions 'What you can change' lists", ({ text }) => {
    expect(text).toContain("These add restrictions (skip a category, skip a subject, never include these words, outline only, fewer plays).");
    expect(point("What you can change")).toContain("skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself");
  });
});
