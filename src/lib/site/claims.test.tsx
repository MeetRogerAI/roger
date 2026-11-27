/**
 * The claims and vocabulary check (plan U10, KTD15): each rule on its own,
 * each allow-list entry shown to be as narrow as it says, and then every page
 * of site version 1 rendered to text with no violation, with and without the
 * data that fills its optional sections.
 *
 * For v2 or v3, copy the "every page" part into a file that sets SITE_VERSION
 * to that version: `renderSitePages` and `checkClaims` know nothing about v1.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../db/seeds/sample-play.fixture.json";
import { v3Defaults } from "@/data/config";
import { compoundingNumbers } from "@/data/site/compounding";
import { examples } from "@/data/site/examples";
import { v1Copy } from "@/data/site/v1";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";
import { at, renderSitePages, sitePagePaths, WATCH_TOKEN, type RenderedPage } from "@/test-helpers/site-pages";
import { amountsFrom } from "./amounts";
import { allowed, checkClaims, checkRule, describeViolations, hypeWords, readPage, readSegments, ruleIds, textPage, type ClaimsContext, type PageText, type RuleId, type Zone } from "./claims";
import type { Testimonial } from "./testimonials";

const VERSION = "v1";

// What the optional sections read, set per test: no cleared quote, unless a test says so.
const data = vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
  return { testimonials: [] as unknown[], watch: null as string | null, watchTokens: [] as string[] };
});

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));
// The reader behind the optional section. Everything else about it is real.
vi.mock("@/lib/site/testimonials", async (orig) => {
  const real = await orig<typeof import("./testimonials")>();
  return { ...real, getTestimonials: async (audience: "re" | "agents") => real.forAudience(data.testimonials as Testimonial[], audience) };
});
// The watch a watch page's token finds: its words, or null for a link that no longer works. No database is read.
vi.mock("@/lib/watches", () => {
  const watchFor = async (token: string) => {
    data.watchTokens.push(token);
    return data.watch;
  };
  return { confirmWatch: watchFor, stopWatch: watchFor };
});

const amounts = amountsFrom(v3Defaults);
const context: ClaimsContext = { amounts, compounding: compoundingNumbers };

const check = (page: PageText, extra: Partial<ClaimsContext> = {}) => checkClaims(page, { ...context, ...extra });
const rulesBroken = (page: PageText, extra: Partial<ClaimsContext> = {}) => [...new Set(check(page, extra).map((v) => v.rule))].sort();
/** One line of text on a page, in no zone. */
const line = (text: string, path = "/") => textPage(path, [text]);
const inZone = (text: string, zone: Zone, path = "/") => textPage(path, [text], [zone]);
const broken = (rule: RuleId, page: PageText) => checkRule(rule, page, context).map((v) => v.found);

beforeEach(() => {
  resetNextFakes();
  data.testimonials = [];
  data.watch = null;
  at.path = "/";
});

describe("reading a page", () => {
  it("joins text across tags, so a rule sees the sentence a reader sees", () => {
    expect(readSegments("<p>Your <b>AI</b> <em>agents</em>, smarter<!-- --> every Monday.</p>")).toEqual([{ text: "Your AI agents , smarter every Monday.", zones: [], via: "text" }]);
    expect(check(readPage("/", "<p>Your <b>AI</b> <em>agents</em></p>"))).toEqual([]);
  });

  it("leaves out script, style, template and head content, and reads entities as their characters", () => {
    const segments = readSegments('<html><head><title>save 5 hours!</title></head><body><script>var a = "$200!"</script><style>.a{content:"$5"}</style><template>join hundreds</template><p>Roger&#x27;s &amp; Peter’s &quot;list&quot;</p></body></html>');
    expect(segments.map((s) => s.text)).toEqual([`Roger's & Peter’s "list"`]);
  });

  it("keeps text hidden only by a class or the hidden attribute: a screen reader, or a later swap, shows it", () => {
    const texts = readSegments('<p class="sr-only">Week 26: 78 bricks.</p><div hidden id="S:0"><p>CA$280 / month CAD</p></div>').map((s) => s.text);
    expect(texts.join(" ")).toContain("Week 26: 78 bricks.");
    expect(texts.join(" ")).toContain("CA$280 / month CAD");
  });

  it("reads aria-label, alt, title and placeholder, in the zone of their element", () => {
    const segments = readSegments('<section data-claims="sample"><img alt="A photograph" src="/a.jpg"/><input placeholder="e.g. 3 agents" aria-label="Your agent"></section><button title="Save 5 hours">Go</button>');
    expect(segments).toEqual([
      { text: "A photograph", zones: ["sample"], via: "attribute" },
      { text: "Your agent", zones: ["sample"], via: "attribute" },
      { text: "e.g. 3 agents", zones: ["sample"], via: "attribute" },
      { text: "Save 5 hours", zones: [], via: "attribute" },
      { text: "Go", zones: [], via: "text" },
    ]);
    expect(rulesBroken(readPage("/", '<button title="Save 5 hours">Go</button>'))).toEqual(["number", "time-saved"]);
  });

  it("gives text the zones of every element it sits in, and ends a zone with its element", () => {
    const segments = readSegments('<p>Before</p><section data-claims="compounding"><p>Week 26</p><ul data-bricks="3"><li>Week 1, idea 1: set up</li></ul></section><blockquote data-verbatim="x">my agent system</blockquote><p>After</p>');
    expect(segments.map((s) => [s.text, s.zones])).toEqual([
      ["Before", []],
      ["Week 26", ["compounding"]],
      ["Week 1, idea 1: set up", ["bricks", "compounding"]],
      ["my agent system", ["verbatim"]],
      ["After", []],
    ]);
  });

  it("gives a zone by tag only where asked: every article on /library is a public use case", () => {
    const markup = "<article><h3>$650 saved in four weeks</h3></article><p>33 real things</p>";
    expect(readPage("/library", markup).segments.map((s) => s.zones)).toEqual([["library"], []]);
    expect(readPage("/", markup).segments.map((s) => s.zones)).toEqual([[]]);
  });
});

describe("rule (a): agent without AI in front", () => {
  it("fails a page that says agents without AI, outside /zack (plan U10)", () => {
    // /agents is not a page any more (Peter, November 27, 2026), so its address has no exemption left.
    for (const path of ["/", "/agents", "/faq", "/how-it-works", "/about", "/library", "/privacy", "/terms"]) {
      expect(broken("vocabulary", line("Works with all your agents.", path)), path).toEqual(["agents"]);
      expect(broken("vocabulary", line("Paste it into your agent.", path)), path).toEqual(["agent"]);
    }
  });

  it("passes AI agent and AI agents, whatever the case of agent", () => {
    expect(check(line("Your AI agents, smarter. One AI agent. An AI Agent."))).toEqual([]);
    // The homepage's closing button (Peter, November 27, 2026) writes it with a capital A.
    expect(check(line("Level up your use of AI Agents Now."))).toEqual([]);
    expect(rulesBroken(line("Level up your use of Agents Now."))).toEqual(["vocabulary"]);
  });

  it("passes on /zack and /zack/[agent], and nowhere that only starts the same way", () => {
    for (const path of ["/zack", "/zack/claude", "/zack/other"]) expect(check(line("Add Zack to your agent.", path)), path).toEqual([]);
    expect(rulesBroken(line("Add Zack to your agent.", "/agents"))).toEqual(["vocabulary"]);
    expect(rulesBroken(line("Add Zack to your agent.", "/zackary"))).toEqual(["vocabulary"]);
  });

  it("passes inside an element marked verbatim, and that mark excuses nothing else", () => {
    expect(check(readPage("/how-it-works", '<blockquote data-verbatim="playbook-preface">so that it works for my agent system</blockquote>'))).toEqual([]);
    expect(rulesBroken(readPage("/how-it-works", '<blockquote data-verbatim="x">my agent saves 5 hours a week for $200!</blockquote>'))).toEqual(["bare-dollar", "exclamation-emoji", "number", "time-saved"]);
    expect(rulesBroken(readPage("/how-it-works", '<blockquote data-verbatim="x">quoted</blockquote><p>my agent system</p>'))).toEqual(["vocabulary"]);
  });
});

describe("rule (b): a dollar sign without its country", () => {
  it("fails $200 without a currency in front (plan U10)", () => {
    expect(broken("bare-dollar", line("It is $200 a month."))).toEqual(["$200"]);
    expect(broken("bare-dollar", line("It is USD $200 a month."))).toEqual(["$200"]);
    expect(broken("bare-dollar", line("Pay in $ or in CAD."))).toEqual(["$"]);
  });

  it("passes US$200 and CA$280", () => {
    expect(check(line("US$200 / month USD plus tax where it applies. CA$280 / month CAD plus HST."))).toEqual([]);
  });
});

describe("rule (c): time saved and productivity", () => {
  it("fails “save 5 hours” (plan U10), in digits or in words, and a range", () => {
    expect(rulesBroken(line("Roger will save 5 hours of your week."))).toEqual(["number", "time-saved"]);
    expect(broken("time-saved", line("Roger will save 5 hours of your week."))).toEqual(["5 hours", "save"]);
    expect(broken("time-saved", line("Get back five hours."))).toEqual(["five hours"]);
    expect(broken("time-saved", line("It takes 20 minutes, not 2-3 hrs."))).toEqual(["20 minutes", "2-3 hrs"]);
    expect(broken("time-saved", line("Done in a few minutes."))).toEqual(["a few minutes"]);
  });

  it("fails a rate, and days or weeks said to be saved", () => {
    expect(broken("time-saved", line("That is hours a week back."))).toEqual(["hours a week"]);
    expect(broken("time-saved", line("It saves three weeks a year."))).toEqual(["saves three weeks", "saves"]);
    expect(broken("time-saved", line("Two days a month, saved."))).toEqual(["days a month", "Two days a month, saved", "saved"]);
    expect(broken("time-saved", line("It gives you back 2 days."))).toEqual(["gives you back 2 days"]);
  });

  it("fails save, saves, saved, saving and savings used as a claim", () => {
    for (const word of ["save", "saves", "saved", "saving", "savings", "Save"]) expect(broken("time-saved", line(`Roger ${word} you time.`)), word).toEqual([word]);
  });

  it("fails productivity words and multipliers", () => {
    expect(broken("time-saved", line("Be more productive. Productivity up 40%. Work 10x faster, twice as fast."))).toEqual(["productive", "Productivity", "10x", "40%", "twice as fast"]);
  });

  it("passes periods that are not savings, with no allow-list entry needed", () => {
    expect(check(line("He reviews your past seven days. Six months in, your AI agents do more. A few months apart. Cancel in one click."))).toEqual([]);
    expect(check(line("If no first list is delivered within 21 days of sign-up, the trial closes. We keep your runs for 90 days after your access ends."))).toEqual([]);
  });

  it("allows the spec’s two half-hour lines, and nothing near them", () => {
    expect(check(line("If you don’t have any, our starter team takes about half an hour to install."))).toEqual([]);
    expect(check(line("Most people finish in about half an hour."))).toEqual([]);
    expect(broken("time-saved", line("Roger gives you back about half an hour."))).toEqual(["half an hour"]);
    expect(broken("time-saved", line("It takes half an hour to install."))).toEqual(["half an hour"]);
  });

  it("allows “hours saved” as the name of a score, and not a figure in front of it", () => {
    expect(check(line("Cora scores every play on hours saved, reach, ease to copy, proof and surprise. Hours saved"))).toEqual([]);
    expect(broken("time-saved", line("That is 5 hours saved."))).toEqual(["5 hours"]);
    expect(broken("time-saved", line("Three hours saved every week."))).toEqual(["Three hours"]);
    expect(broken("time-saved", line("Time saved, every week."))).toEqual(["saved"]);
  });

  it("allows the privacy text’s one-hour count only in a legal document", () => {
    const sentence = "Each count covers one hour and is removed by an hourly clean-up after that hour ends.";
    expect(check(inZone(sentence, "legal", "/privacy"))).toEqual([]);
    expect(broken("time-saved", line(sentence))).toEqual(["one hour"]);
    expect(broken("time-saved", inZone("Roger gives you one hour back.", "legal", "/privacy"))).toEqual(["one hour"]);
  });

  it("allows the example plays’ own “save” (store) only inside an example, and only in the four phrases they use", () => {
    const play = "Save this as a skill called Daily prospect outreach drafts. Save each email as an unsent draft. If the mailbox can’t be reached, save nothing and report the error. Say how many drafts were saved.";
    expect(check(inZone(play, "sample"))).toEqual([]);
    expect(broken("time-saved", line(play))).toEqual(["Save", "Save", "save", "saved"]);
    expect(broken("time-saved", inZone("This play saves 25 minutes a run.", "sample"))).toEqual(["25 minutes", "saves"]);
    // The retired play's phrases have no allowance left, and no other use of the word has one.
    expect(broken("time-saved", inZone("Save a skill called Client email in two tones. Check a saved note first.", "sample"))).toEqual(["Save", "saved"]);
    expect(broken("time-saved", inZone("Save each morning for research.", "sample"))).toEqual(["Save"]);
  });

  it("allows “a 20-minute call”, the length of a meeting an example’s email asks for, only inside an example and only in those words", () => {
    const ask = "What is the one ask (for example “a 20-minute call”)?";
    expect(check(inZone(ask, "sample"))).toEqual([]);
    expect(broken("time-saved", line(ask))).toEqual(["20-minute"]);
    expect(broken("time-saved", inZone("It gives you a 20-minute head start.", "sample"))).toEqual(["20-minute"]);
    expect(broken("time-saved", inZone("Ask for a 30-minute call.", "sample"))).toEqual(["30-minute"]);
  });

  it("allows the free run’s storing and waiting messages only on /zack", () => {
    const messages = ["Save my report", "Saving…", "We could not save this report, because this run link is no longer active.", "Your report is saved.", "It is saved all the same.", "Saving is not switched on here yet.", "Too many tries. Try again in an hour.", "Try again in a minute."];
    for (const message of messages) {
      expect(check(line(message, "/zack/claude")), message).toEqual([]);
      expect(rulesBroken(line(message, "/")), message).toEqual(["time-saved"]);
    }
    expect(broken("time-saved", line("Zack saves you an hour.", "/zack"))).toEqual(["an hour", "saves"]);
  });
});

describe("rule (d): income, revenue and earnings", () => {
  it("fails each kind of claim", () => {
    for (const claim of ["Grow your income.", "More revenue.", "Earn more.", "Users earned it back.", "Higher earnings.", "It is profitable.", "More commissions.", "Raise your GCI.", "The ROI is clear.", "Make more money.", "Close more deals.", "It pays for itself.", "Win more listings."]) {
      expect(rulesBroken(line(claim)), claim).toEqual(["income"]);
    }
  });

  it("passes ordinary words that only look like them", () => {
    expect(check(line("They involve clients, money, and how the business runs. You learn what works. The price is the same."))).toEqual([]);
  });
});

describe("rule (e): user counts and social proof", () => {
  it("fails join, hundreds, thousands, users love, and a counted crowd", () => {
    expect(broken("user-count", line("Join hundreds of users."))).toEqual(["Join", "hundreds"]);
    expect(broken("user-count", line("Thousands of people in real estate."))).toEqual(["Thousands"]);
    expect(broken("user-count", line("Users love Roger. Trusted by teams."))).toEqual(["Users love", "Trusted by"]);
    expect(broken("user-count", line("Run by 500 users. Used by 2,000+ happy customers and twelve teams."))).toEqual(["500 users", "2,000+ happy customers", "twelve teams"]);
  });

  it("allows the spec’s own FAQ wording, and only those words", () => {
    expect(check(line("A play is described as ‘run by 3 users’, never as yours."))).toEqual([]);
    expect(rulesBroken(line("Roger is run by 30 users."))).toEqual(["number", "user-count"]);
    expect(rulesBroken(line("Loved by 3 users."))).toEqual(["number", "user-count"]);
  });

  it("passes the words the site does use about people", () => {
    expect(check(line("Other Roger users, without your name. What other heavy users ran last week. Most people choose this. Three ideas every Monday."))).toEqual([]);
  });
});

describe("rule (f): every number is explained", () => {
  it("fails a number nothing explains", () => {
    expect(broken("number", line("Over 40 playbooks, since 2019, rated 4.8."))).toEqual(["40", "2019", "4.8"]);
  });

  it("allows the prices from the amounts, each with its own country, and no other amount", () => {
    expect(check(line("US$200 a month, or US$200 for one list. CA$280 in Canada. The price becomes US$400 a month (CA$560 in Canada)."))).toEqual([]);
    expect(broken("number", line("About US$50 a list."))).toEqual(["50"]);
    expect(broken("number", line("US$2000 a year."))).toEqual(["2000"]);
    // A real amount under the wrong country is not a price the site charges.
    expect(broken("number", line("CA$200 a month."))).toEqual(["200"]);
    expect(broken("number", line("It costs 200 a month."))).toEqual(["200"]);
  });

  it("follows the amounts it is given", () => {
    const other = { amounts: amountsFrom({ ...v3Defaults, priceUsd: 150, trialCloseDays: 14 }) };
    expect(check(line("US$150 a month. Within 14 days of sign-up."), other)).toEqual([]);
    expect(checkRule("number", line("Within 21 days of sign-up."), { ...context, ...other }).map((v) => v.found)).toEqual(["21"]);
  });

  it("allows the trial and retention periods, as periods", () => {
    expect(check(line("Within 21 days of sign-up. For 90 days after your access ends."))).toEqual([]);
    expect(broken("number", line("In 21 steps. Within 121 days. Within 7 days."))).toEqual(["21", "121", "7"]);
  });

  it("passes the compounding section’s seven weeks and seven brick counts (plan U10), and fails them anywhere else", () => {
    const story = "Week 1: 3 bricks. Week 2: 6 bricks. Week 3: 9 bricks. Week 4: 12 bricks. Week 10: 30 bricks. Week 17: 51 bricks. Week 26: 78 bricks.";
    expect(check(readPage("/", `<section data-claims="compounding"><p>${story}</p></section>`))).toEqual([]);
    expect(broken("number", line(story))).toEqual(["1", "3", "2", "6", "3", "9", "4", "12", "10", "30", "17", "51", "26", "78"]);
    // The loop ends at 78 (Peter's decision of November 26, 2026): a week 27 or an 81 is not one of its numbers.
    expect(broken("number", readPage("/", '<section data-claims="compounding"><p>Week 27: 81 bricks.</p></section>'))).toEqual(["27", "81"]);
    expect(broken("number", readPage("/", '<section data-claims="compounding"><p>Week 26</p></section><p>By week 26 you have 78.</p>'))).toEqual(["26", "78"]);
  });

  it("allows exactly the loop’s numbers there, the ones the data lists, and no week or count between them", () => {
    expect([...context.compounding].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 9, 10, 12, 17, 26, 30, 51, 78]);
    const section = (text: string) => readPage("/", `<section data-claims="compounding"><p>${text}</p></section>`);
    // Weeks the loop skips, and their counts, are not excused by being plausible.
    expect(broken("number", section("Week 5: 15 bricks. Week 11: 33 bricks. Week 18: 54 bricks. Week 25: 75 bricks."))).toEqual(["5", "15", "11", "33", "18", "54", "25", "75"]);
    // A longer number that only contains one of them is not that number.
    expect(broken("number", section("Week 126. 780 bricks. 3.5 bricks."))).toEqual(["126", "780", "3.5"]);
    // With no numbers given, nothing is excused.
    expect(checkRule("number", section("Week 26: 78 bricks."), { ...context, compounding: [] }).map((v) => v.found)).toEqual(["26", "78"]);
  });

  it("allows only the loop’s own numbers inside the compounding section, and no number about time or money", () => {
    const section = (text: string) => readPage("/", `<section data-claims="compounding"><p>${text}</p></section>`);
    expect(broken("number", section("Week 52: 156 bricks."))).toEqual(["52", "156"]);
    expect(rulesBroken(section("Week 26: 78 bricks, and 3 hours saved a week."))).toEqual(["time-saved"]);
    expect(rulesBroken(section("78 bricks, worth $2,600."))).toEqual(["bare-dollar", "number"]);
  });

  it("allows a brick’s own label inside a brick stack only", () => {
    const stack = '<ul data-bricks="6"><li><span class="sr-only">Week 2, idea 3: set up</span></li><li><span class="sr-only">Week 14, idea 1: not set up yet</span></li></ul>';
    expect(check(readPage("/", stack))).toEqual([]);
    expect(broken("number", line("Week 2, idea 3: set up"))).toEqual(["2", "3"]);
    expect(broken("number", readPage("/", '<ul data-bricks="6"><li>78 bricks</li></ul>'))).toEqual(["78"]);
  });

  it("allows the sample play’s own numbers and Cora’s scores inside the sample, and still no time figure", () => {
    const card = '<article data-claims="sample"><p>Read sections 1 to 8 before pasting this.</p><h4>4. Steps</h4><dd>7 of 10</dd></article>';
    expect(check(readPage("/", card))).toEqual([]);
    expect(broken("number", line("Read sections 1 to 8. Hours saved 7 of 10"))).toEqual(["1", "8", "7", "10"]);
    expect(rulesBroken(readPage("/", '<article data-claims="sample"><p>3.5 hours a week, estimated</p></article>'))).toEqual(["time-saved"]);
  });

  it("allows the years of Peter’s letter inside the letter only", () => {
    const letter = "I made my first real estate investment at 17 and still own it, 35+ years later. I also spent 18+ years in real estate finance.";
    expect(check(inZone(letter, "letter", "/about"))).toEqual([]);
    expect(broken("number", line(letter, "/about"))).toEqual(["17", "35", "18"]);
    expect(broken("number", inZone("Since 2008 I have run 12 companies.", "letter", "/about"))).toEqual(["2008", "12"]);
  });

  it("allows a legal document’s date and its 30-day promise inside the document only", () => {
    expect(check(inZone("We will answer within 30 days. Last updated November 2026.", "legal", "/privacy"))).toEqual([]);
    expect(broken("number", line("We will answer within 30 days. Last updated November 2026.", "/faq"))).toEqual(["30", "2026"]);
    expect(broken("number", inZone("Since November 2026 we have served 30 clients.", "legal", "/terms"))).toEqual(["2026", "30"]);
  });

  it("allows a step’s numeral where the mark holds little else", () => {
    expect(check(readPage("/", '<p aria-hidden="true" data-claims="numeral">4</p><h3>Paste to install</h3>'))).toEqual([]);
    expect(check(readPage("/zack/claude", '<h2><span data-claims="numeral">02</span><span data-claims="numeral" class="sr-only">Step 2: </span>Your email</h2>'))).toEqual([]);
    expect(broken("number", readPage("/", "<p>4</p><h3>Paste to install</h3>"))).toEqual(["4"]);
    expect(broken("number", readPage("/", '<p data-claims="numeral">Used by 40 teams in 12 cities</p>'))).toEqual(["40", "12"]);
    expect(broken("number", readPage("/", '<p data-claims="numeral">2026</p>'))).toEqual(["2026"]);
  });

  it("allows the footer’s year, a Zack file’s version on /zack, and the library’s live count on /library", () => {
    expect(check(line("© 2026"))).toEqual([]);
    expect(broken("number", line("Since 2026"))).toEqual(["2026"]);
    expect(check(line("Zack file for Claude Version 2.0", "/zack"))).toEqual([]);
    expect(broken("number", line("Version 2.0"))).toEqual(["2.0"]);
    expect(check(line("1,204 real things people’s AI agents did. Showing the newest 60 of 1,204 use cases. 12 of 33 use cases match.", "/library"))).toEqual([]);
    expect(broken("number", line("Over 1,204 posts read.", "/library"))).toEqual(["1,204"]);
    expect(broken("number", line("33 use cases.", "/"))).toEqual(["33"]);
  });
});

describe("rule (g): exclamation marks and emoji", () => {
  it("fails an exclamation mark (plan U10)", () => {
    expect(broken("exclamation-emoji", line("Start free today!"))).toEqual(["!"]);
  });

  it("fails an emoji, and passes the signs that are text", () => {
    expect(broken("exclamation-emoji", line("Smarter every Monday 🚀"))).toEqual(["🚀"]);
    expect(broken("exclamation-emoji", line("Done ✔️ and loved ❤️"))).toHaveLength(2);
    expect(check(line("© Roger™ ® → ‘quoted’ “quoted” – … ·"))).toEqual([]);
  });
});

describe("rule (h): hype words", () => {
  it("fails each word on the list, as a whole word", () => {
    for (const word of hypeWords) expect(broken("hype", line(`A ${word} week.`)), word).toEqual([word]);
    expect(broken("hype", line("Revolutionary. SEAMLESS."))).toEqual(["Revolutionary", "SEAMLESS"]);
  });

  it("stays short, so plain copy is not flagged", () => {
    expect(hypeWords.length).toBeLessThan(30);
    expect(check(line("Plain, direct, exact. A powerful, simple way to unlock what works. Smarter every Monday."))).toEqual([]);
  });
});

describe("rule (i): a named brokerage", () => {
  it("finds nothing while the list is empty, which is how it ships", () => {
    expect(context.brokerages).toBeUndefined();
    expect(checkRule("brokerage", line("Used at Example Realty Group."), context)).toEqual([]);
    expect(checkRule("brokerage", line("Used at Example Realty Group."), { ...context, brokerages: [] })).toEqual([]);
  });

  it("finds a listed name as a whole word, in any case, in every zone", () => {
    const brokerages = ["Example Realty"];
    expect(checkRule("brokerage", line("Used at EXAMPLE REALTY every day."), { ...context, brokerages }).map((v) => v.found)).toEqual(["EXAMPLE REALTY"]);
    expect(checkRule("brokerage", line("An example realtyish word."), { ...context, brokerages })).toEqual([]);
    for (const zone of ["testimonial", "library", "sample", "verbatim", "legal"] as const) {
      expect(checkRule("brokerage", inZone("I work at Example Realty.", zone), { ...context, brokerages }), zone).toHaveLength(1);
    }
  });
});

describe("a testimonial’s own words", () => {
  const quote = "My agent drafts every listing email now. It saves me about 3 hours a week!";

  it("may say agent, state time saved, and keep their own numbers and punctuation, inside the quote only", () => {
    expect(check(readPage("/", `<figure><blockquote data-claims="testimonial"><p>“${quote}”</p></blockquote><figcaption>Sample P.</figcaption></figure>`))).toEqual([]);
    expect(rulesBroken(line(quote))).toEqual(["exclamation-emoji", "number", "time-saved", "vocabulary"]);
  });

  it("does not excuse the same figure restated beside the quote (spec 0.4)", () => {
    const page = readPage("/", `<blockquote data-claims="testimonial"><p>“${quote}”</p></blockquote><figcaption>Sample P., who saves 3 hours a week</figcaption>`);
    expect(rulesBroken(page)).toEqual(["number", "time-saved"]);
  });

  it("still catches income, a user count, a bare dollar sign, hype and a listed brokerage inside a quote", () => {
    const loud = "I earned $4,000 more, like thousands of others. Game-changing. Ask Example Realty.";
    expect(rulesBroken(inZone(loud, "testimonial"), { brokerages: ["Example Realty"] })).toEqual(["bare-dollar", "brokerage", "hype", "income", "user-count"]);
  });
});

describe("the allow-list", () => {
  it("gives every entry a rule and a reason", () => {
    expect(allowed.length).toBeGreaterThan(10);
    for (const entry of allowed) {
      expect(ruleIds).toContain(entry.rule);
      expect(entry.why.length, entry.why).toBeGreaterThan(30);
    }
  });

  it("allows “Payment starts in week 3”, the line under the price, with the week the settings give and no other number", () => {
    expect(check(line("Your first two Cora Curations are free. Payment starts in week 3."))).toEqual([]);
    // Only that phrase: the same number anywhere else is a violation.
    expect(broken("number", line("Payment begins in week 3."))).toEqual(["3"]);
    expect(broken("number", line("You pay from week 3 on."))).toEqual(["3"]);
    // Only that week: another number in the phrase is one.
    expect(broken("number", line("Payment starts in week 4."))).toEqual(["4"]);
    expect(broken("number", line("Payment starts in week 30."))).toEqual(["30"]);
    // The week follows the settings: with three free Cora Curations it is week 4, and week 3 is then a violation.
    const three = { ...context, amounts: amountsFrom({ ...v3Defaults, freeRuns: 3 }) };
    expect(checkRule("number", line("Payment starts in week 4."), three)).toEqual([]);
    expect(checkRule("number", line("Payment starts in week 3."), three).map((v) => v.found)).toEqual(["3"]);
  });

  it("allows the short title “20 new prospects every day”, in those words only", () => {
    expect(check(line("20 new prospects every day"))).toEqual([]);
    expect(broken("number", line("20 new prospects every week"))).toEqual(["20"]);
    expect(broken("number", line("25 new prospects every day"))).toEqual(["25"]);
    // It names what a play drafts, never people who use Roger: that is still caught.
    expect(rulesBroken(line("20 new users every day"))).toEqual(["number", "user-count"]);
  });

  it("excuses nothing for the rules that have no exception by wording", () => {
    expect([...new Set(allowed.map((entry) => entry.rule))].sort()).toEqual(["number", "time-saved", "user-count"]);
  });
});

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

// Made up, for these tests only: no testimonial is cleared, so the real list is empty.
const quotes: Testimonial[] = [
  { id: "a", person: "Sample P.", attribution: "Made-up attribution", quote: "My agent drafts every listing email now. It saves me about 3 hours a week!", saidOn: null, audience: "re", position: 0, cleared: true },
  { id: "b", person: "Sample Q.", attribution: "", quote: "I stopped working this out alone. Cora’s picks fit what my agents already do.", saidOn: null, audience: "agents", position: 1, cleared: true },
  { id: "c", person: "Sample R.", attribution: "Made-up attribution", quote: "Two of the three ideas were running by Tuesday.", saidOn: null, audience: "both", position: 2, cleared: true },
];

/** What a visitor typed into the library's watch sentence: the words the two watch pages print back. */
const WATCH = "book a table";

const failures = (pages: RenderedPage[]) =>
  pages.flatMap((page) => [...check(readPage(page.path, page.markup)), ...check(textPage(page.path, page.meta))]);

/** Which pages hold text in a zone. */
const pagesWith = (pages: RenderedPage[], zone: Zone) => pages.filter((page) => readPage(page.path, page.markup).segments.some((s) => s.zones.includes(zone))).map((page) => page.path);

describe(`every page of site version ${VERSION}, as rendered`, () => {
  let bare: RenderedPage[];
  let full: RenderedPage[];

  beforeAll(async () => {
    resetNextFakes();
    data.testimonials = [];
    // A watch link that no longer works the first time, and one that finds its watch the second.
    data.watch = null;
    data.watchTokens = [];
    bare = await renderSitePages(VERSION);
    data.testimonials = quotes;
    data.watch = WATCH;
    full = await renderSitePages(VERSION);
  }, 120_000);

  it("renders all of them, each with the header and the footer", () => {
    // /agents and /pricing are not pages any more (Peter, November 27, 2026).
    expect(sitePagePaths).toEqual(["/", "/faq", "/how-it-works", "/about", "/zack", "/zack/claude", "/zack/other", "/library", "/privacy", "/terms", "/watch/confirm", "/watch/stop", "/a-page-that-is-not-there"]);
    for (const pages of [bare, full]) {
      expect(pages.map((page) => page.path)).toEqual(sitePagePaths);
      for (const page of pages) {
        expect(page.markup, page.path).toContain("<header");
        expect(page.markup, page.path).toContain("<footer");
        // The footer's "Pricing" goes to the homepage's price section, and nothing links to either deleted page.
        expect(page.markup, page.path).toContain('href="/#price"');
        expect(page.markup, page.path).not.toMatch(/href="\/(?:pricing|agents)["?#]/);
        expect(page.markup, page.path).not.toContain("For people who run AI agents");
        // Not an empty page. The shortest, an expired watch link, is the header, one sentence, one link and the footer, which lost a link with /agents.
        expect(readPage(page.path, page.markup).segments.map((s) => s.text).join(" ").length, page.path).toBeGreaterThan(250);
        expect(page.meta.length, page.path).toBeGreaterThan(0);
      }
    }
  });

  it("has no violation with no testimonial: the site as a preview shows it", () => {
    expect(describeViolations(failures(bare))).toBe("");
  });

  it("has no violation with testimonials: the site as production may show it", () => {
    expect(describeViolations(failures(full))).toBe("");
  });

  it("really did render the optional section the second time, and shows the bundled examples with no score and no time figure", () => {
    const home = (pages: RenderedPage[]) => pages.find((page) => page.path === "/")!.markup;
    expect(home(bare)).not.toContain("What people say");
    // The homepage shows the quote for its audience and the one for both, and not the one for the audience of the deleted /agents page.
    expect(home(full)).toContain("It saves me about 3 hours a week!");
    expect(home(full)).toContain("Two of the three ideas were running by Tuesday.");
    expect(home(full)).not.toContain("I stopped working this out alone.");
    // No page shows Cora's scores or a time figure for a play. The admin screen that once chose a pool play for the site is gone.
    for (const pages of [bare, full]) {
      for (const page of pages) {
        expect(page.markup, page.path).not.toContain("data-score=");
        expect(page.markup, page.path).not.toContain("hours a week,");
        expect(page.markup, page.path).not.toContain("25 minutes");
      }
      for (const example of examples) expect(home(pages), example.id).toContain(example.play.title);
    }
  });

  it("marks each zone only on the pages that have that content", () => {
    expect(pagesWith(full, "compounding")).toEqual(["/"]);
    expect(pagesWith(full, "testimonial")).toEqual(["/"]);
    expect(pagesWith(bare, "testimonial")).toEqual([]);
    expect(pagesWith(full, "sample")).toEqual(["/", "/how-it-works"]);
    // Peter's letter is on /about only: "Who runs this" is gone from the homepage.
    expect(pagesWith(full, "letter")).toEqual(["/about"]);
    expect(pagesWith(full, "legal")).toEqual(["/privacy", "/terms"]);
    expect(pagesWith(full, "verbatim")).toEqual(["/how-it-works"]);
    expect(pagesWith(full, "library")).toEqual(["/library"]);
    expect(pagesWith(full, "bricks")).toEqual(["/"]);
    expect(pagesWith(full, "numeral")).toEqual(["/", "/how-it-works", "/zack", "/zack/claude", "/zack/other"]);
  });

  it("keeps a numeral mark to a numeral: no sentence hides in one", () => {
    for (const page of full) {
      for (const segment of readPage(page.path, page.markup).segments.filter((s) => s.zones.includes("numeral"))) {
        expect(segment.text, page.path).toMatch(/^(?:(?:\p{L}+ )?\d{1,2}[.:]?(?: |$))+$/u);
      }
    }
  });

  it("would catch a testimonial’s figure if the quote lost its mark, so the pass above is the mark’s doing", () => {
    const home = full.find((page) => page.path === "/")!;
    const unmarked = home.markup.replaceAll(' data-claims="testimonial"', "");
    expect(unmarked).not.toBe(home.markup);
    expect(rulesBroken(readPage("/", unmarked))).toEqual(["exclamation-emoji", "number", "time-saved", "vocabulary"]);
  });

  // --- Peter's homepage review, November 26, 2026 ---

  /** The pages that sell: every page but the two legal documents, which state what billing does, and the library, whose rows are other people's public posts. */
  const marketing = (pages: RenderedPage[]) => pages.filter((page) => !["/privacy", "/terms", "/library"].includes(page.path));
  /** A page's words, without the header and footer scripts. Peter's letter is left out where asked: it is his own history, word for word. */
  const words = (page: RenderedPage, { letter = true } = {}) =>
    readPage(page.path, page.markup)
      .segments.filter((s) => letter || !s.zones.includes("letter"))
      .map((s) => s.text)
      .join(" ");

  it("says “Monday list” and “one list at a time” on no marketing page, and on the library only what its rows say", () => {
    for (const pages of [bare, full]) {
      expect(marketing(pages).map((page) => page.path)).toEqual(["/", "/faq", "/how-it-works", "/about", "/zack", "/zack/claude", "/zack/other", "/watch/confirm", "/watch/stop", "/a-page-that-is-not-there"]);
      for (const page of marketing(pages)) {
        expect(words(page), page.path).not.toMatch(/monday lists?\b/i);
        expect(words(page), page.path).not.toMatch(/one list at a time|one at a time|one-at-a-time/i);
        for (const meta of page.meta) expect(meta, page.path).not.toMatch(/monday lists?\b|one list at a time|real estate/i);
      }
      // The library's own words (its heading, its band, the header and footer) are held to the same; its rows are not the site's words.
      const library = pages.find((page) => page.path === "/library")!;
      const own = readPage(library.path, library.markup).segments.filter((s) => !s.zones.includes("library")).map((s) => s.text).join(" ");
      expect(own).not.toMatch(/monday lists?\b|one list at a time|real estate/i);
    }
  });

  it("says “real estate” on no marketing page, outside Peter’s own letter", () => {
    for (const pages of [bare, full]) {
      for (const page of marketing(pages)) expect(words(page, { letter: false }), page.path).not.toMatch(/real estate|realtor|brokerage/i);
    }
    // The documented exception: the paragraph of his letter about his own background, on /about, which is his to change.
    // The homepage no longer prints the letter, so nothing on it names a trade at all.
    const withLetter = marketing(bare).filter((page) => /real estate/i.test(words(page)));
    expect(withLetter.map((page) => page.path)).toEqual(["/about"]);
    for (const page of withLetter) expect(words(page)).toContain("I made my first real estate investment at 17");
  });

  it("the terms describe monthly only, in terms of Cora Curations, as the marketing pages do (copy changes, section 8)", () => {
    for (const pages of [bare, full]) {
      const terms = pages.find((page) => page.path === "/terms")!;
      expect(words(terms)).toContain("Roger has one plan, monthly.");
      expect(words(terms)).toContain("Your card is charged with your third Cora Curation, and once a month after that.");
      expect(words(terms)).not.toMatch(/monday lists?\b|one list at a time|one at a time|one-at-a-time|\blists\b/i);
    }
  });

  it("gives every start link, on every page and in the header, exactly the words “Get two free Cora Curations”, but for the homepage's closing button", () => {
    const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const closing = "Level up your use of AI Agents Now.";
    for (const pages of [bare, full]) {
      for (const page of pages) {
        const starts = [...page.markup.matchAll(/<a\b[^>]*href="\/start(?:[?#][^"]*)?"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => plain(m[1]));
        // The header's button is on every page, so every page has at least one.
        expect(starts.length, page.path).toBeGreaterThanOrEqual(1);
        // The one exception, in Peter's words (November 27, 2026): the last start button of the homepage, once.
        if (page.path === "/") {
          expect(starts.filter((label) => label === closing), page.path).toHaveLength(1);
          // It is the closing band's: the last start link of the page's shell (a copy of the price block for the visitor's country streams in after it).
          const shell = page.markup.split('<div hidden id="S:')[0];
          expect(shell.slice(shell.lastIndexOf('href="/start')), page.path).toContain(`>${closing}</a>`);
        }
        for (const label of starts.filter((l) => !(page.path === "/" && l === closing))) expect(label, page.path).toBe("Get two free Cora Curations");
        if (page.path !== "/") expect(page.markup, page.path).not.toContain(closing);
        expect(page.markup, page.path).not.toContain("Start free");
      }
    }
    const count = (path: string) => bare.find((page) => page.path === path)!.markup.match(/href="\/start(?:[?#][^"]*)?"/g)!.length;
    // The header's, then the page's own: hero, price and closing band on the homepage.
    // The price block is in the markup twice where it streams: in the shell, and again for the visitor's country.
    expect(count("/")).toBe(5);
    expect(count("/faq")).toBe(2);
  });

  it("prints the note under the price in Peter's words on every page that has it, and the old note nowhere", () => {
    const note = "Your first two Cora Curations are free. Payment starts in week 3.";
    for (const pages of [bare, full]) {
      // Under the homepage's price, and under the button of /library's closing band.
      expect(pages.filter((page) => words(page).includes(note)).map((page) => page.path)).toEqual(["/", "/library"]);
      for (const page of marketing(pages)) expect(words(page), page.path).not.toMatch(/We ask for a card when you start\. It is charged with/);
      // The homepage says a card is asked for in one place only: the answer to “When is my card charged?”.
      const home = words(pages.find((page) => page.path === "/")!);
      expect(home).not.toContain("Card required.");
      expect(home.match(/\bcard\b/gi)).toHaveLength(1);
    }
  });

  it("passes Peter’s two lines with no exception: the hero’s “battle-tested” line and the line under the price", () => {
    const lines = [
      "Roger makes your AI agents smarter every week, with battle-tested ideas that have already worked for real people in the network.",
      "Get two Cora Curations for free and pay only after you have tried the product for two full weeks.",
    ];
    const home = bare.find((page) => page.path === "/")!;
    for (const text of lines) {
      expect(words(home)).toContain(text);
      expect(check(line(text))).toEqual([]);
    }
    // No entry on the allow-list names either line, so neither is passing by exception.
    const where = { segment: { text: lines.join(" "), zones: [], via: "text" as const }, path: "/", context };
    for (const entry of allowed) {
      const pattern = entry.words(where);
      expect(pattern ? [...lines.join(" ").matchAll(pattern)].map((m) => m[0]) : [], entry.why).toEqual([]);
    }
    // A claim of value in the same place is still caught.
    expect(rulesBroken(line("Pay only if you have received hundreds in value."))).toEqual(["user-count"]);
    expect(rulesBroken(line("Pay only after it pays for itself."))).toEqual(["income"]);
    expect(rulesBroken(line("Try it for 2 full weeks."))).toEqual(["number"]);
  });

  it("keeps every folded example readable to the check: its text is in the page, in the sample zone, whichever example is showing", () => {
    const page = bare.find((p) => p.path === "/")!;
    const sample = readPage("/", page.markup).segments.filter((s) => s.zones.includes("sample")).map((s) => s.text).join(" ");
    for (const example of examples) {
      expect(sample, example.id).toContain(example.play.description);
      expect(sample, example.id).toContain(example.play.pasteToInstall);
      expect(sample, example.id).toContain(`${example.label} ${example.play.title} The Idea Summary`);
    }
    expect(sample).toContain("Never post or schedule anything on social media.");
    expect(sample).toContain("Never send. Drafts only, and the member sends.");
    expect(sample).not.toContain("Written on");
    // Folded as it arrives: no row is open in the markup.
    expect(page.markup).not.toMatch(/<details[^>]*\sopen(?:[\s=>])/);
    // The short titles in the row above the cards are outside the zone, and pass on their own.
    const outside = readPage("/", page.markup).segments.filter((s) => !s.zones.includes("sample")).map((s) => s.text).join(" ");
    expect(outside).toContain("On-demand video creation 20 new prospects every day");
  });

  it("would catch an example’s numbers and its “save” if a card lost its mark, so the pass above is the mark’s doing", () => {
    const home = bare.find((page) => page.path === "/")!;
    const unmarked = home.markup.replaceAll(' data-claims="sample"', "");
    expect(unmarked).not.toBe(home.markup);
    expect(rulesBroken(readPage("/", unmarked))).toEqual(["number", "time-saved"]);
  });

  it("would catch the compounding labels if the section lost its mark", () => {
    const home = bare.find((page) => page.path === "/")!;
    const unmarked = home.markup.replace(' data-claims="compounding"', "");
    expect(unmarked).not.toBe(home.markup);
    const found = checkRule("number", readPage("/", unmarked), context).map((v) => v.found);
    expect(found).toEqual(expect.arrayContaining(["26", "78"]));
  });

  it("holds /library’s own words to the vocabulary rule: AI agent in the intro, the watch sentence and a row with no tool", () => {
    const library = bare.find((page) => page.path === "/library")!;
    const own = readPage("/library", library.markup)
      .segments.filter((s) => !s.zones.includes("library"))
      .map((s) => s.text)
      .join(" ");
    expect(own).toContain("real things people’s AI agents did");
    expect(own).toContain("the morning someone’s AI agent can");
    expect(own).toContain("The morning someone’s AI agent does it, you get one email with the link.");
    expect(library.markup).toContain("Any AI agent<");
    expect(library.markup).not.toContain("Any agent<");
    // The rows themselves are public posts in summary: they do carry figures, which is why they are a zone of their own.
    const rows = readPage("/library", library.markup).segments.filter((s) => s.zones.includes("library"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((s) => s.text).join(" ")).toMatch(/\$\d/);
  });

  it("holds the two pages the library’s watch email leads to: AI agent, and the closing link to /library", () => {
    const main = (pages: RenderedPage[], path: string) => pages.find((page) => page.path === path)!.markup.match(/<main[\s\S]*?<\/main>/)![0];
    const words = (markup: string) => readPage("/watch", markup).segments.map((s) => s.text).join(" ").replace(/\s+/g, " ");
    // Each page was rendered with its token, and looked the watch up with it: twice each, once for each state.
    expect(data.watchTokens).toEqual([WATCH_TOKEN, WATCH_TOKEN, WATCH_TOKEN, WATCH_TOKEN]);
    // The watch found: the confirmed page names the software in full, around the visitor's own words.
    const confirmed = words(main(full, "/watch/confirm"));
    expect(confirmed).toContain("You’re watching for it.");
    expect(confirmed).toContain("We’ll email you the day someone’s AI agent does");
    expect(confirmed).toContain(WATCH);
    expect(confirmed).not.toMatch(/someone’s agent\b/);
    const stopped = words(main(full, "/watch/stop"));
    expect(stopped).toContain("Watch stopped.");
    expect(stopped).toContain(WATCH);
    // A link that no longer works: both pages say so.
    for (const path of ["/watch/confirm", "/watch/stop"]) {
      expect(words(main(bare, path)), path).toContain("That link has expired. Set the watch again from the library and we’ll send a fresh link.");
    }
    // In every state the page ends on one link, to the library itself and not to the homepage.
    for (const pages of [bare, full]) {
      for (const path of ["/watch/confirm", "/watch/stop"]) {
        expect(main(pages, path), path).toMatch(/<a class="tlink chev" href="\/library">Back to the library<\/a>/);
        expect([...main(pages, path).matchAll(/href="([^"]*)"/g)].map((m) => m[1]), path).toEqual(["/library"]);
      }
    }
    // The rule has teeth here: the old wording on the same page is a violation.
    const old = main(full, "/watch/confirm").replace("someone’s AI agent", "someone’s agent");
    expect(old).not.toBe(main(full, "/watch/confirm"));
    expect(rulesBroken(readPage("/watch/confirm", old))).toEqual(["vocabulary"]);
  });

  it("leaves the watch sentence’s two fields their focus ring: no class switches the outline off (U10 acceptance, open defect 3)", () => {
    const library = bare.find((page) => page.path === "/library")!;
    const fields = [...library.markup.matchAll(/<input\b[^>]*\bname="(email|query)"[^>]*>/g)].filter((m) => m[0].includes("bg-ground-2"));
    expect(fields.map((m) => m[1]).sort()).toEqual(["email", "query"]);
    for (const [field] of fields) {
      expect(field).not.toMatch(/\boutline-(none|hidden|0)\b/);
      expect(field).not.toContain("focus:outline-none");
    }
  });
});

describe("the free Zack run’s later steps", () => {
  it("has no violation at the paste step and on the summary after it", async () => {
    const { FlowView } = await import("@/components/site/v1/zack");
    const { FreeRunReportView } = await import("@/components/site/shared/free-run-form");
    const { freeRunAgent, zackFile } = await import("./zack-files");
    const { zack, copy } = v1Copy(amounts);
    const TOKEN = "Zk3-run_token-Zk3-run_token-Zk3-run_token-0";
    at.path = "/zack/claude";
    for (const slug of ["claude", "other"]) {
      const agent = freeRunAgent(slug)!;
      const file = await zackFile(agent.file);
      for (const hasReport of [false, true]) {
        const markup = await pageMarkup(<FlowView agent={agent} file={file} zack={zack} warning={copy.zackWarning} start={copy.buttons.start} cardLine={copy.cardLine} db token={TOKEN} run={{ agent: agent.slug, hasReport }} />);
        expect(markup).toContain(copy.zackWarning);
        expect(describeViolations(check(readPage(`/zack/${slug}`, markup))), `${slug} ${hasReport}`).toBe("");
      }
    }
    const reportCopy = {
      label: zack.paste.label,
      submit: zack.paste.submit,
      pending: zack.paste.pending,
      startAgain: zack.paste.startAgain,
      warning: copy.zackWarning,
      summaryTitle: zack.afterPaste.title,
      saved: zack.afterPaste.saved,
      noPlays: zack.afterPaste.noPlays,
      next: zack.afterPaste.next,
      already: zack.afterPaste.already,
      again: zack.afterPaste.again,
      start: copy.buttons.start,
      cardLine: copy.cardLine,
    };
    for (const titles of [["Client email in two tones", "Zoning lookup in plain words"], []]) {
      const markup = await pageMarkup(<FreeRunReportView agent="claude" token={TOKEN} hasReport={false} copy={reportCopy} state={{ status: "ok", titles }} />);
      expect(markup).toContain(zack.afterPaste.saved);
      expect(describeViolations(check(readPage("/zack/claude", markup)))).toBe("");
    }
    for (const state of [
      { status: "error" as const, errors: { report: zack.paste.empty }, values: { report: "" } },
      { status: "error" as const, message: zack.paste.limited, values: { report: "x" } },
      { status: "gone" as const, message: zack.paste.notSaved, values: { report: "x" } },
    ]) {
      const markup = await pageMarkup(<FreeRunReportView agent="claude" token={TOKEN} hasReport={false} copy={reportCopy} state={state} />);
      expect(describeViolations(check(readPage("/zack/claude", markup)))).toBe("");
    }
  });
});

describe(`every line of the ${VERSION} copy file, rendered or not`, () => {
  /** Every string under a value, with where it is. Addresses and ids are not words. */
  function strings(value: unknown, path = ""): { path: string; text: string }[] {
    if (typeof value === "string") return [{ path, text: value }];
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
    if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (["on", "href", "id"].includes(k) ? [] : strings(v, path ? `${path}.${k}` : k)));
    return [];
  }

  it("passes the text rules: an error message that no test renders is still held to them", () => {
    const { copy, zack } = v1Copy(amounts);
    // The rules that need no zone to judge a line. Numbers are judged on the pages, where each has its zone.
    const textRules = ruleIds.filter((rule) => rule !== "number");
    const failuresOf = (value: unknown, path: string, skip: string[] = []) =>
      strings(value)
        .filter((s) => !skip.includes(s.path))
        .flatMap((s) => textRules.flatMap((rule) => checkRule(rule, line(s.text, path), context).map((v) => `${s.path}: [${v.rule}] “${v.found}”`)));
    // The Zack warning is printed on /zack only (spec A.11), and the brick caption’s {week} and {bricks} are filled per stack.
    expect(failuresOf(copy, "/", ["zackWarning"])).toEqual([]);
    expect(failuresOf(copy.zackWarning, "/zack")).toEqual([]);
    expect(failuresOf(zack, "/zack")).toEqual([]);
  });
});

describe("a play is data, not copy", () => {
  it("is read by the same rules: the made-up seed play would fail the homepage on its wording", () => {
    // db/seeds/sample-play.fixture.json says "the agent reads yesterday's buyer inquiries". An example added to
    // src/data/site/examples.ts is held to the rule on every page that prints it, by the tests above.
    const card = renderToStaticMarkup(
      <article data-claims="sample">
        <p>{fixture.description}</p>
      </article>,
    );
    expect(rulesBroken(readPage("/", card))).toEqual(["vocabulary"]);
    expect(rulesBroken(readPage("/how-it-works", card))).toEqual(["vocabulary"]);
  });
});
