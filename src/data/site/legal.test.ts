/**
 * The privacy and terms drafts of a built site version (plan U9, spec A.13):
 * every point the spec says each must state, the free Zack run (KTD12), the
 * passages kept from the earlier privacy text, and the rules both keep
 * (amounts from the settings, no bare "$", no exclamation mark, "AI agent").
 */
import { describe, expect, it, vi } from "vitest";
import { siteConfig, v3Defaults } from "@/data/config";
import { circlesPrivacyPreview } from "@/data/circles-legal";
import { privacy as legacyPrivacy, type LegalDoc } from "@/data/legal";
import { amountsFrom, fillAmounts, hasBareDollar, money } from "@/lib/site/amounts";
import { siteLegal, siteLegalMeta, sitePrivacy, siteTerms, trainingPosition } from "./legal";
import { v1 } from "./v1";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const amounts = amountsFrom(v3Defaults);
const { privacy, terms } = siteLegal(amounts);

/** Everything a reader sees of a document, as one string. */
const textOf = (doc: LegalDoc) => [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.body]), doc.updated].join("\n");
const section = (doc: LegalDoc, id: string) => {
  const found = doc.sections.find((s) => s.id === id);
  expect(found, id).toBeDefined();
  return found!.body.join(" ");
};

const privacyText = textOf(privacy);
const termsText = textOf(terms);
const fill = (text: string) => fillAmounts(text, amounts);

describe("both documents", () => {
  it("are dated November 2026 and titled plainly", () => {
    expect(privacy.updated).toBe("November 2026");
    expect(terms.updated).toBe("November 2026");
    expect(privacy.title).toBe("Privacy");
    expect(terms.title).toBe("Terms");
  });

  it("leave no {name} unfilled", () => {
    expect(privacyText).not.toMatch(/[{}]/);
    expect(termsText).not.toMatch(/[{}]/);
  });

  it("never show a bare dollar sign", () => {
    expect(hasBareDollar(privacyText)).toBe(false);
    expect(hasBareDollar(termsText)).toBe(false);
  });

  it("have no exclamation mark", () => {
    expect(privacyText).not.toContain("!");
    expect(termsText).not.toContain("!");
  });

  it("never say agent without AI in front", () => {
    const bareAgent = /(?<!\bAI )\bagents?\b/i;
    expect(privacyText).not.toMatch(bareAgent);
    expect(termsText).not.toMatch(bareAgent);
    // The rule is being tested on text that does name AI agents.
    expect(privacyText).toContain("AI agent");
  });

  it("do not mention Circles", () => {
    expect(privacyText).not.toMatch(/Circle/i);
    expect(termsText).not.toMatch(/Circle/i);
  });

  it("type no amount in the source: every price, count and period is a {name}", () => {
    const source = textOf(sitePrivacy) + textOf(siteTerms);
    expect(source).not.toMatch(/\$\s?\d/);
    // The only digits typed are the year in the date and the 30-day promise.
    expect(source.match(/\d+/g)).toEqual(["30", "2026", "2026"]);
  });

  it("give the contact email", () => {
    expect(privacyText).toContain(siteConfig.contactEmail);
    expect(termsText).toContain(siteConfig.contactEmail);
  });

  it("have a unique id on every section, and no paragraph twice in a section", () => {
    for (const doc of [privacy, terms]) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every(Boolean)).toBe(true);
      for (const s of doc.sections) expect(new Set(s.body).size, s.heading).toBe(s.body.length);
    }
  });

  it("give search a description with no amount in it", () => {
    expect(siteLegalMeta.privacy).toEqual({ title: "Roger: Privacy", headline: "Privacy", description: sitePrivacy.intro });
    expect(siteLegalMeta.terms).toEqual({ title: "Roger: Terms", headline: "Terms", description: siteTerms.intro });
    expect(JSON.stringify(siteLegalMeta)).not.toMatch(/[{}]\w|\d/);
  });
});

describe("privacy says each point in the spec's list", () => {
  it("what sign-up collects", () => {
    expect(section(privacy, "sign-up")).toContain("your name, your email address, your answers to the sign-up quiz, the AI agent you use, your country and your time zone");
  });

  it("a card is collected by Stripe and Roger never sees the number", () => {
    expect(section(privacy, "card")).toBe("Your card is collected by Stripe. Roger never sees the card number.");
  });

  it("Zack runs in the user's own AI agent account, and what it reads is what the connected instructions read", () => {
    const zack = section(privacy, "zack");
    expect(zack).toContain("runs in your own AI agent account");
    expect(zack).toContain("It reads the past seven days of activity across that account, including work finished in that time.");
    // Wider than the week's activity: the setup list, and the notes file, which reaches back eight weeks.
    expect(zack).toContain("It also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services");
    expect(zack).toContain("the notes file your AI agent keeps about the Roger ideas it has installed, from which it reports on ideas from the past eight weeks");
    expect(zack).not.toMatch(/reads only/);
  });

  it("Zack is instructed to remove private details, Roger checks again, and the user agreed at sign-up to the weekly send", () => {
    const zack = section(privacy, "zack");
    expect(zack).toContain("Zack is instructed to remove private details before it writes its report, and Roger checks again when the report arrives.");
    // Not stated as a fact about what an AI agent following instructions always does.
    expect(zack).not.toMatch(/Zack removes private details/);
    expect(zack).toContain("each week, because you agreed to that when you signed up");
  });

  it("Zack sends two files: the report and the private matching profile, with what the profile holds and what happens to it", () => {
    const zack = section(privacy, "zack");
    expect(zack).toContain("Zack sends two files to Roger each week, because you agreed to that when you signed up: the report, and a private matching profile.");
    expect(zack).toContain("The matching profile describes, in general words, the kind of work you do, what your AI agent account has set up, the public services connected to it by name, where your week still took effort, and what became of earlier Roger ideas.");
    expect(zack).toContain("Roger uses it to match ideas to you.");
    expect(zack).toContain("It is not shared with other users.");
    expect(zack).toContain("It is sent on the share and matching only settings.");
    expect(zack).toContain("Its contents are erased when you delete the run it came with, and with your runs after your access ends.");
  });

  it("the user can read the instructions, change what is collected and turn sharing off", () => {
    expect(section(privacy, "zack")).toContain("You can read the instructions your Zack runs, change what it collects and turn sharing off");
  });

  it("the three sharing settings: what each sends, the test run with Zack off, and which two bring the higher rate", () => {
    const zack = section(privacy, "zack");
    expect(zack).toContain("Sharing has three settings: share with the pool, use for your own matching only, or Zack off.");
    expect(zack).toContain("On matching only, Zack still sends both files; they are used to choose your ideas and none of your plays are shared.");
    expect(zack).toContain("With Zack off, Zack is told to send nothing, except in a test run you start yourself, which still sends and is never shared.");
    expect(zack).toContain("On monthly, matching only and Zack off both bring the higher monthly rate, which the Terms describe.");
  });

  it("a run is stored as it arrived, then checked before its plays are shared, and processed by Cora, an AI system, through a model provider", () => {
    const runs = section(privacy, "runs");
    expect(runs).toContain("When a run reaches Roger it is stored as it arrived. It is then checked again for private details before any of its plays are shared.");
    expect(runs).not.toContain("and then stored");
    expect(runs).toContain("processed by Cora, an AI system, through a model provider");
  });

  it("Roger's team can read a run and reviews the plays the check flags", () => {
    expect(section(privacy, "runs")).toContain("Roger’s team can read a run, and reviews any play the check flags before it is shared.");
  });

  it("other users see anonymous plays only, and Roger never shows who a play came from", () => {
    expect(section(privacy, "other-users")).toBe("Other Roger users see anonymous plays only. Roger never shows who a play came from.");
  });

  it("retention: kept while the user has access and for the set days after, and cancelling does not delete the account", () => {
    const kept = section(privacy, "retention");
    expect(kept).toContain(`We keep your runs while you have access to Roger, and for ${v3Defaults.retentionDays} days after your access ends.`);
    expect(kept).not.toContain("while you subscribe");
    expect(kept).toContain("Cancelling does not delete your account.");
    expect(kept).toContain("You can delete any run");
  });

  it("retention: what is erased after the period, and the empty record of a run that stays", () => {
    const kept = section(privacy, "retention");
    expect(kept).toContain("After that period the text of each run and its matching profile are erased, and plays that were never shared are deleted.");
    expect(kept).toContain("An empty record of each run stays until your account is deleted: its week, how it arrived, the AI agent it came from and when it arrived.");
  });

  it("retention: shared plays stay, other users see no identity, and Roger says what it keeps itself", () => {
    const kept = section(privacy, "retention");
    expect(kept).toContain("Plays already shared stay in the pool. Other users see nothing that identifies you.");
    expect(kept).toContain("Roger keeps your own copy of each shared play until your account is deleted, and a private record of which account a shared play came from, so that Cora does not send it back to you.");
    // What Roger keeps is not anonymous, so the document does not say the pool holds nothing that identifies the user.
    expect(kept).not.toContain("stay in the pool, without anything that identifies you");
  });

  it("retention: the record of which account a play came from says 'unknown author' once the account is deleted, in the words the code writes", async () => {
    const kept = section(privacy, "retention");
    const { UNKNOWN_AUTHOR } = await import("@/lib/cora/contributors");
    expect(UNKNOWN_AUTHOR).toBe("unknown author");
    expect(kept).toContain(`so that Cora does not send it back to you. When your account is deleted, that record is changed to say “${UNKNOWN_AUTHOR}”.`);
    // The relabel is part of deleting the account, and the hourly task that catches anything left runs before the paid cycle is live.
    const { HOURLY_TASKS } = await import("@/lib/housekeeping/job");
    expect(HOURLY_TASKS.find((t) => t.name === "unknown_authors")!.always).toBe(true);
  });

  it("names the services that hold the data, each as its own item of the list, and that some store it outside Canada", () => {
    const [list, abroad, ...rest] = privacy.sections.find((s) => s.id === "services")!.body;
    expect(rest).toEqual([]);
    const lead = "These services hold or process what this page describes: ";
    expect(list.startsWith(lead)).toBe(true);
    // The items of the list. Removing one, Google's included, fails here.
    expect(list.slice(lead.length).replace(/\.$/, "").split("; ")).toEqual([
      "Vercel, which runs the site and passes Roger’s requests to the model provider",
      "Neon, which hosts the database",
      "Resend, which sends email",
      "Stripe, which collects your card",
      "Google, if you sign in with Google",
      "and the model provider Cora runs through",
    ]);
    // No Meet feature exists in the code, so the list does not name it.
    expect(list).not.toContain("Meet");
    expect(abroad).toBe("Some of them store data outside Canada.");
  });

  it("how to ask what is held, correct it or delete it, with the 30-day promise", () => {
    const yours = section(privacy, "your-data");
    expect(yours).toContain("to ask what we hold about you, to have it corrected or to have it deleted");
    expect(yours).toContain("within 30 days");
    expect(yours).toContain(siteConfig.contactEmail);
  });
});

describe("the model provider's position on training (checked November 27, 2026)", () => {
  it("names the provider and the route, and states both positions, in the runs section", () => {
    expect(privacy.sections.find((s) => s.id === "runs")!.body).toContain(trainingPosition);
    // Pinned word for word: a change of provider, route or position has to change this line too.
    expect(trainingPosition).toBe(
      "Cora’s model provider is Anthropic, reached through Vercel’s AI Gateway. Anthropic’s commercial terms do not allow it to train its models on what Roger sends, and Vercel does not use it for training either.",
    );
  });

  it("states it there and nowhere else in the document", () => {
    expect(privacyText.match(/\btrain\w*/gi)).toEqual(["train", "training"]);
  });
});

describe("privacy decisions of November 27, 2026 (launch list S22)", () => {
  it("P1: the deletion and email-change record keeps the email address", () => {
    expect(section(privacy, "your-data")).toContain("When an account is deleted, or its email address is changed, Roger’s admin log keeps a short record of it that includes the email address.");
  });

  it("P2: Roger's team can read a run (reads are not logged, and the page promises nothing more)", () => {
    expect(section(privacy, "runs")).toContain("Roger’s team can read a run");
    expect(privacyText).not.toMatch(/\blog(s|ged)? (each|every) (read|view)/i);
  });

  it("P3: one-at-a-time and held accounts are erased after a year with no run, order, charge or sign-in", () => {
    expect(section(privacy, "retention")).toContain("If you buy lists one at a time, or your account is on hold, the same erasing happens once a year has passed with no run sent, no list ordered, no charge and no sign-in.");
  });

  it("P4: shared plays stay in the pool, anonymous", () => {
    expect(section(privacy, "retention")).toContain("Plays already shared stay in the pool. Other users see nothing that identifies you.");
  });

  it("P5: shared plays are withdrawn on request", () => {
    expect(section(privacy, "your-data")).toContain("You can also ask us to take your shared plays out of the pool, and we will remove them.");
  });

  it("P6: email records a year (welcome kept), payment events eighteen months, unanswered sign-up interest a year", () => {
    const records = section(privacy, "records");
    expect(records).toContain("for a year");
    expect(records).toContain("welcome email went out stays until your account is deleted");
    expect(records).toContain("payment events from Stripe are kept for eighteen months");
    expect(records).toContain("we keep it for a year from the last time you left it");
  });
});

describe("privacy covers the free Zack run (KTD12)", () => {
  const run = section(privacy, "free-run");

  it("what is stored, without a count, and the short-lived record of the visitor's IP address", () => {
    expect(run).toContain("It stores the email you give, the AI agent you choose and the report you paste.");
    expect(run).not.toContain("three things");
    expect(run).toContain("To limit misuse, it also keeps a count of requests from your IP address. Each count covers one hour and is removed by an hourly clean-up after that hour ends.");
  });

  it("the IP record's hour is the limit's own window, and the clean-up that removes it runs before the paid cycle is live", async () => {
    const { limits } = await import("@/lib/rate-limit");
    expect(limits.zackRunPerIp.windowSeconds).toBe(3600);
    expect(limits.zackReportPerIp.windowSeconds).toBe(3600);
    const { HOURLY_TASKS } = await import("@/lib/housekeeping/job");
    expect(HOURLY_TASKS.find((t) => t.name === "expired_cleanup")!.always).toBe(true);
  });

  it("who may read it, with no promise that it is never published", () => {
    expect(run).toContain("Your report may be read by Roger’s team and by Cora, Roger’s ranking AI system.");
    expect(run).not.toContain("never published");
  });

  it("that it is attached to an account only on sign-up with the same email, and then is a run like any other, shared with sharing on", () => {
    expect(run).toContain("attached to an account only if you go on to sign up from that run with the same email");
    expect(run).toContain("It then becomes your first run and is treated like any other run: with sharing on, which is how every account starts, its plays are shared with other users in anonymous form.");
    expect(run).not.toContain("kept like any other run");
  });

  it("the email and the AI agent stay on the record until the account is deleted", () => {
    expect(run).toContain("The email and the AI agent stay on that record until your account is deleted.");
    expect(run).not.toContain("while your account exists");
  });

  it("the run link works for anyone who has it, and who can replace a report without being able to read it", () => {
    expect(run).toContain("The run link works for anyone who has it, so do not share it.");
    expect(run).toContain("Anyone with the link can replace the report, and anyone who enters your email at /zack with the same AI agent can start the run again, which replaces the earlier run and its report.");
    expect(run).toContain("Neither can read a report you pasted.");
  });

  it("states the period the housekeeping job really uses, for a user's runs and for free runs alike", async () => {
    const { HOURLY_TASKS } = await import("@/lib/housekeeping/job");
    const days = 77;
    const seen: Record<string, unknown[]> = {};
    for (const name of ["retention", "free_run_purge"]) {
      const task = HOURLY_TASKS.find((t) => t.name === name)!;
      const q = async (_sql: string, params: unknown[] = []) => {
        seen[name] = params;
        return [{ users: 0, runs: 0, plays: 0, profiles: 0, deleted: 0, cleared: 0, orphaned: 0 }];
      };
      // Each task reads its period from settings.retentionDays and nowhere else.
      await (task.run as (q: unknown, d: unknown, ctx: unknown) => Promise<unknown>)(q, { settings: { ...v3Defaults, retentionDays: days }, now: new Date("2026-11-26T15:00:00Z") }, { deadline: Date.now() + 1000 });
      expect(seen[name][1], name).toBe(days);
    }
    // The document read with the same setting states the same number, in both places.
    const changed = siteLegal(amountsFrom({ ...v3Defaults, retentionDays: days })).privacy;
    expect(section(changed, "retention")).toContain(`for ${days} days after`);
    expect(section(changed, "free-run")).toContain(`the free run is deleted ${days} days after you started it`);
    expect(section(changed, "free-run")).toContain(`cleared after the same ${days} days`);
    expect(textOf(changed)).not.toContain(String(v3Defaults.retentionDays));
  });

  it("states today's period from the setting's default", () => {
    expect(run).toContain(`the free run is deleted ${v3Defaults.retentionDays} days after you started it`);
    expect(run).toContain(`cleared after the same ${v3Defaults.retentionDays} days`);
  });
});

describe("the passages kept from the earlier privacy text", () => {
  const from = (doc: LegalDoc, heading: string) => doc.sections.find((s) => s.heading === heading)!;

  it("the library passage is the current one, word for word", () => {
    const now = from(circlesPrivacyPreview, "The public library");
    const kept = from(sitePrivacy, "The public library");
    expect(kept.body).toEqual(now.body);
  });

  it("the watch passage is the current one, word for word, but for its opening: the Circles sentence is gone and its subject replaces the 'It' that followed", () => {
    const now = from(circlesPrivacyPreview, "Existing library sign-ups");
    const kept = from(sitePrivacy, "Existing library sign-ups");
    const subject = "The library's optional watch sign-up";
    const circlesOpening = `${subject} is separate from Circles. It `;
    expect(now.body[0].startsWith(circlesOpening)).toBe(true);
    // The only difference: the passage names what collects the email, and nothing after that changes.
    expect(kept.body).toEqual([`${subject} ${now.body[0].slice(circlesOpening.length)}`]);
    expect(kept.body[0].startsWith("The library's optional watch sign-up collects the email and search you provide")).toBe(true);
  });

  it("the analytics passage is the current one, word for word", () => {
    const now = from(legacyPrivacy, "Analytics");
    const kept = from(sitePrivacy, "Analytics");
    expect(kept.body).toEqual(now.body);
    // It is still true: analytics are off.
    expect(siteConfig.analytics.enabled).toBe(false);
  });
});

describe("terms say each point in the spec's list", () => {
  it("the trial: two free Cora Curations, a card on file, the charge with the third and monthly after it, the 21-day close", () => {
    const trial = section(terms, "trial");
    expect(trial).toContain("Your first two Cora Curations are free.");
    expect(trial).toContain("A Cora Curation is the set of ideas Roger sends you on a Monday.");
    expect(trial).toContain("Only a Cora Curation that is delivered to you counts as one of them.");
    expect(trial).toContain("We ask for a card when you sign up, and it is kept on file. It is not charged then.");
    expect(trial).toContain("Your card is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing.");
    expect(trial).toContain("If no first Cora Curation is delivered within 21 days of sign-up, the trial closes without a charge.");
  });

  it("one plan, monthly, at one price in both currencies", () => {
    const price = section(terms, "price");
    expect(price).toContain("Roger has one plan, monthly. It costs US$200 a month (CA$280 in Canada).");
    expect(price).toContain("It is charged once a month and brings a Cora Curation every Monday.");
  });

  it("the weeks monthly brings no Cora Curation", () => {
    expect(section(terms, "price")).toContain(
      "A week has no Cora Curation when Roger has no new ideas for you or the week fails on our side, and Cora Curations are held while a payment is unpaid.",
    );
  });

  it("describes monthly only (Peter, November 26, 2026): no other way to pay, no price for one, and never a list", () => {
    expect(termsText).not.toMatch(/one at a time|one-at-a-time|you order|ordered|On monthly/i);
    expect(termsText).not.toMatch(/\blists?\b/i);
    // Both words capitalised, wherever it is named.
    expect(termsText.match(/cora curations?/gi) ?? []).toEqual(termsText.match(/Cora Curations?/g) ?? []);
    expect((termsText.match(/Cora Curation/g) ?? []).length).toBeGreaterThanOrEqual(8);
    // The same promises as the line under the price, /how-it-works and the FAQ make (src/data/site/v1.ts).
    expect(fill(v1.trialLine)).toBe("Your first two Cora Curations are free. Payment starts in week 3.");
    expect(fill(v1.howItWorks.firstWeeks.steps[4])).toBe("Your card is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing.");
    expect(fill(v1.questions.flatMap((group) => group.items).find((item) => item.id === "card-charged")!.a)).toContain("The first charge comes with your third Cora Curation, and the charge repeats once a month after that.");
  });

  it("the contributor rule", () => {
    const rule = section(terms, "contributing");
    expect(rule).toContain("the first miss each billing month is forgiven");
    expect(rule).toContain("A second miss makes that month US$400 (CA$560 in Canada).");
    expect(rule).toContain("A miss caused by Roger never counts.");
  });

  it("the higher monthly rate and the two cases where it applies", () => {
    const rule = section(terms, "contributing");
    // Both settings that are not "share" carry it, as the contributor rule bills them.
    expect(rule).toContain("If you set sharing to matching only or to Zack off in your dashboard, the monthly price is US$400 a month (CA$560 in Canada).");
    expect(rule).toContain("Those are the only two cases where the higher rate applies.");
    expect(rule).toContain("It is not a plan you can choose.");
  });

  it("how the difference is billed", () => {
    expect(section(terms, "contributing")).toContain("the difference is added to your next invoice as its own line");
  });

  it("no refunds, cancel any time, access to the end of the paid month", () => {
    const refunds = section(terms, "refunds");
    expect(refunds).toContain("There are no refunds.");
    expect(refunds).toContain("You can cancel any time");
    expect(refunds).toContain("Your access continues to the end of the month you have paid for.");
  });

  it("tax is added where it applies", () => {
    expect(section(terms, "tax")).toContain("tax is added where it applies");
  });

  it("plays are shared, the user keeps the right to their own work and grants Roger the right to share the anonymised play", () => {
    const plays = section(terms, "plays");
    expect(plays).toContain("Your plays are shared so that other users can use them.");
    expect(plays).toContain("You keep the right to your own work.");
    expect(plays).toContain("You grant Roger the right to share the anonymised play.");
  });

  it("the ideas are other people's working methods, offered as they are, with no promise of a result", () => {
    expect(section(terms, "ideas")).toBe("The ideas Roger sends you are other people’s working methods. They are offered as they are, with no promise of a result.");
  });
});

describe("the amounts in the terms", () => {
  it("are the defaults' and no others", () => {
    const allowed = new Set([
      money("USD", v3Defaults.priceUsd),
      money("CAD", v3Defaults.priceCad),
      money("USD", v3Defaults.priceHigherUsd),
      money("CAD", v3Defaults.priceHigherCad),
    ]);
    const shown = termsText.match(/(?:US|CA)\$[\d,]+/g) ?? [];
    // The monthly price once, and the higher rate in its two cases, each in both currencies. The price of one at a time is not stated.
    expect(shown).toHaveLength(6);
    for (const amount of shown) expect(allowed.has(amount), amount).toBe(true);
    // Every other number is the trial's close or the year.
    const others = termsText.replace(/(?:US|CA)\$[\d,]+/g, "").match(/\d+/g);
    expect(others).toEqual([String(v3Defaults.trialCloseDays), "2026"]);
  });

  it("state every US price with the Canadian one beside it", () => {
    for (const sentence of termsText.split(/(?<=\.)\s+/)) {
      if (sentence.includes("US$")) expect(sentence, sentence).toMatch(/US\$[\d,]+[^.]*\(CA\$[\d,]+ in Canada\)/);
    }
  });

  it("follow the settings: each named amount lands in its own sentence", () => {
    const other = siteLegal(amountsFrom({ ...v3Defaults, priceUsd: 311, priceCad: 433, priceRunUsd: 322, priceRunCad: 444, priceHigherUsd: 655, priceHigherCad: 877, freeRuns: 3, trialCloseDays: 30 })).terms;
    expect(section(other, "price")).toContain("It costs US$311 a month (CA$433 in Canada).");
    // The settings still hold a price for one at a time; the terms do not print it.
    expect(textOf(other)).not.toMatch(/US\$322|CA\$444/);
    expect(section(other, "contributing")).toContain("A second miss makes that month US$655 (CA$877 in Canada).");
    expect(section(other, "contributing")).toContain("the monthly price is US$655 a month (CA$877 in Canada)");
    expect(section(other, "trial")).toContain("Your first three Cora Curations are free.");
    expect(section(other, "trial")).toContain("charged with your fourth Cora Curation");
    expect(section(other, "trial")).toContain("within 30 days of sign-up");
    expect(textOf(other)).not.toMatch(/US\$200|CA\$280|US\$400|CA\$560/);
  });
});
