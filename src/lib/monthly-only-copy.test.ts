import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { secondMissEmail } from "@/lib/mail/templates/second-miss";

/**
 * Monthly is the only plan (plan 2026-11-26-001, Unit 9; origin R1, R25,
 * R28). No surface a visitor, a trial member or a monthly member can reach
 * offers or mentions one list at a time, and nothing says the card is taken
 * at sign-up.
 *
 * The scan reads the source with comments removed, so it checks words people
 * can see, not notes for developers. It covers:
 * - the public site and every component: `src/data/**`, `src/components/**`,
 *   `src/app/**` (the price block, the FAQ, the trial line, sign-up, Payment,
 *   `/app` and `/app/billing`), except `src/app/admin/**` (admin only) and
 *   `src/app/api/**` (no copy);
 * - every email template in `src/lib/mail/templates`, except the per-run
 *   ones below, which only per-run flows send and which stay dormant with
 *   them until the cleanup after launch (Scope Boundaries).
 */
const ONE_AT_A_TIME = /one (list )?at a time|a list at a time|per list|order a list|\bpay in\b|switch to one|switch plan/i;
/** R25: wording that implies the card is asked for at sign-up. */
const CARD_UP_FRONT = /card at sign|card required|charged only with your third|ask for a card when you start/i;

/** Per-run emails: a file sent only by per-run flows, or one export of a file that also serves monthly members. */
const DORMANT: Record<string, "file" | string[]> = {
  "src/lib/mail/templates/plan-changed.ts": "file",
  "src/lib/mail/templates/order-closed.ts": "file",
  "src/lib/mail/templates/order-prompt.ts": "file",
  "src/lib/mail/templates/monday.ts": ["orderNextEmail"],
  "src/lib/mail/templates/charges.ts": ["listOrderedEmail"],
};

const root = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const rel = (p: string) => relative(root, p).split(sep).join("/");

/** Block comments, whole-line comments and trailing `// ` comments (a URL's `//` has no space before it). */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
}

/** The source of one exported function, from its `export` to the next top-level `export` (or the end). */
function exportBody(text: string, name: string): string | null {
  const start = text.search(new RegExp(`export (async )?function ${name}\\b`));
  if (start < 0) return null;
  const next = text.indexOf("\nexport ", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

function scanned(path: string): string {
  let text = readFileSync(join(root, path), "utf8");
  const dormant = DORMANT[path];
  if (dormant === "file") return "";
  for (const name of dormant ?? []) text = text.replace(exportBody(text, name) ?? "", "");
  return withoutComments(text);
}

const surfaces = [
  ...["src/data", "src/components", "src/app"].flatMap((d) => sourceFiles(join(root, d))),
  ...sourceFiles(join(root, "src/lib/mail/templates")),
]
  .map(rel)
  .filter((p) => !p.startsWith("src/app/admin/") && !p.startsWith("src/app/api/"));

describe("monthly only: no one-at-a-time wording, no card at sign-up (plan 2026-11-26-001, Unit 9)", () => {
  it("scans the public site, the app, sign-up, Payment and the email templates", () => {
    expect(surfaces).toEqual(
      expect.arrayContaining([
        "src/components/circles/price.tsx",
        "src/components/circles/home.tsx",
        "src/components/app/plan-form.tsx",
        "src/components/app/billing-panel.tsx",
        "src/app/app/page.tsx",
        "src/app/app/billing/page.tsx",
        "src/app/start/payment/page.tsx",
        "src/lib/mail/templates/welcome.ts",
        "src/lib/mail/templates/second-miss.ts",
        "src/lib/mail/templates/held.ts",
      ]),
    );
  });

  it("the dormant per-run emails it skips still exist, so the list can't hide a new file or a renamed export", () => {
    for (const [path, names] of Object.entries(DORMANT)) {
      const text = readFileSync(join(root, path), "utf8");
      for (const name of names === "file" ? [] : names) expect(exportBody(text, name), `${path} ${name}`).not.toBeNull();
    }
  });

  it("no surface offers or mentions one list at a time", () => {
    const hits = surfaces.flatMap((p) =>
      scanned(p)
        .split("\n")
        .filter((l) => ONE_AT_A_TIME.test(l))
        .map((l) => `${p}: ${l.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("nothing says the card is asked for at sign-up (R25)", () => {
    const hits = surfaces.flatMap((p) =>
      withoutComments(readFileSync(join(root, p), "utf8"))
        .split("\n")
        .filter((l) => CARD_UP_FRONT.test(l))
        .map((l) => `${p}: ${l.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("the second-miss email, sent to monthly members, no longer offers a switch", () => {
    const m = secondMissEmail({ higher: "US$400", difference: "US$50", invoiceDate: "2027-01-03" });
    expect(`${m.subject}\n${m.text}\n${m.html}`).not.toMatch(ONE_AT_A_TIME);
    expect(m.text).toContain("If you cancel on the billing page");
  });

  it("the guard catches the wording it is for", () => {
    for (const s of ["Or switch to one list at a time.", "Can I buy one list at a time?", "US$30 per list", "Order a list for any Monday", "Pay in full"]) expect(s).toMatch(ONE_AT_A_TIME);
    for (const s of ["Card required. Charged only with your third list.", "We ask for a card when you start"]) expect(s).toMatch(CARD_UP_FRONT);
    expect(withoutComments('const a = "x"; // one list at a time\nconst url = "https://x"; ')).not.toMatch(ONE_AT_A_TIME);
  });
});
