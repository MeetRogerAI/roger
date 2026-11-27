import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { secondMissEmail } from "@/lib/mail/templates/second-miss";

/**
 * Monthly is the only plan (plan 2026-11-26-001, Unit 9; origin R1, R25,
 * R28). No surface a visitor, a trial member or a monthly member can reach
 * offers or mentions one list at a time, and nothing says the card is taken
 * at sign-up.
 *
 * The scan reads the source with comments removed (by the TypeScript parser,
 * so text inside strings, templates and JSX is never taken for a comment), so
 * it checks words people can see, not notes for developers. It covers:
 * - the public site and every component: `src/data/**`, `src/components/**`,
 *   `src/app/**` (the price block, the FAQ, the trial line, sign-up, Payment,
 *   `/app`, `/app/billing` and the settings forms), except `src/app/admin/**`
 *   (admin only) and `src/app/api/**` (no copy);
 * - the status line under every list (`src/lib/app/status.ts`), shown on
 *   `/app`, the week pages and in the Monday email;
 * - every email template in `src/lib/mail/templates`, except the per-run
 *   ones below, which only per-run flows send and which stay dormant with
 *   them until the cleanup after launch (Scope Boundaries).
 */
const ONE_AT_A_TIME =
  /one[- ](list[- ])?at[- ]a[- ]time|a list at a time|per[- ]list|per[- ]run|single list|order a list|order (your )?next (list|monday)|\bpay in\b|switch to one|switch plan/i;
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

/**
 * Who may import each dormant module or export (review fixes Unit 9, F4): only
 * the per-run flows that already send it. A new importer is a dormant per-run
 * path coming back to life, and must be a deliberate change to this list.
 * `src/app/app/order-actions.ts` (the per-run order actions) has no importer.
 */
const DORMANT_IMPORTERS: Record<string, { names?: string[]; from: string[] }> = {
  "src/lib/mail/templates/plan-changed.ts": { from: ["src/lib/billing/cancel.ts", "src/lib/billing/first-charge.ts", "src/lib/billing/renewals.ts", "src/lib/billing/switch.ts"] },
  "src/lib/mail/templates/order-closed.ts": { from: ["src/lib/billing/orders.ts"] },
  "src/lib/mail/templates/order-prompt.ts": { from: ["src/lib/billing/orders.ts"] },
  // Whole-branch review W2: the Monday send no longer sends "order your next list", so nothing imports it.
  "src/lib/mail/templates/monday.ts": { names: ["orderNextEmail"], from: [] },
  "src/lib/mail/templates/charges.ts": { names: ["listOrderedEmail"], from: ["src/lib/billing/orders.ts"] },
  "src/app/app/order-actions.ts": { from: [] },
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
const parse = (text: string, name = "x.tsx") => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);

/**
 * The text with every comment blanked (newlines kept), found from the parsed
 * tree's trivia: a `//` or `/*` inside a string, a template or JSX text is
 * part of a token, never trivia, so it stays. Trivia is never read from where
 * JSX text starts (JSX text has no comments).
 */
function withoutComments(text: string, name?: string): string {
  const sf = parse(text, name);
  const jsxStarts = new Set<number>();
  const scanFrom = new Set<number>();
  const visit = (n: ts.Node) => {
    if (n.kind === ts.SyntaxKind.JsxText) jsxStarts.add(n.pos);
    scanFrom.add(n.pos);
    scanFrom.add(n.end);
    for (const c of n.getChildren(sf)) visit(c);
  };
  visit(sf);
  const ranges = new Map<number, number>();
  for (const at of scanFrom) {
    if (jsxStarts.has(at)) continue;
    for (const r of [...(ts.getLeadingCommentRanges(text, at) ?? []), ...(ts.getTrailingCommentRanges(text, at) ?? [])]) ranges.set(r.pos, r.end);
  }
  let out = text;
  for (const [pos, end] of ranges) out = out.slice(0, pos) + out.slice(pos, end).replace(/[^\n]/g, " ") + out.slice(end);
  return out;
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
  return withoutComments(text, path);
}

const surfaces = [
  ...["src/data", "src/components", "src/app"].flatMap((d) => sourceFiles(join(root, d))),
  ...sourceFiles(join(root, "src/lib/mail/templates")),
  join(root, "src/lib/app/status.ts"),
]
  .map(rel)
  .filter((p) => !p.startsWith("src/app/admin/") && !p.startsWith("src/app/api/"));

/** The one scan both rules use: every surface line (comments removed, dormant per-run emails skipped) matching `re`. */
const hits = (re: RegExp) =>
  surfaces.flatMap((p) =>
    scanned(p)
      .split("\n")
      .filter((l) => re.test(l))
      .map((l) => `${p}: ${l.trim()}`),
  );

/** Every module a source file imports (static, re-export or dynamic), as a repo path without extension, with the names it takes. */
function importsOf(path: string): { module: string; names: string[] | "all" }[] {
  const sf = parse(readFileSync(join(root, path), "utf8"), path);
  const resolve = (spec: string) => {
    const p = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? join(dirname(path), spec).split(sep).join("/") : null;
    return p?.replace(/\.(ts|tsx)$/, "") ?? null;
  };
  const out: { module: string; names: string[] | "all" }[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const target = resolve(n.moduleSpecifier.text);
      if (target) {
        let names: string[] | "all" = "all";
        if (ts.isImportDeclaration(n)) {
          const b = n.importClause?.namedBindings;
          if (b && ts.isNamedImports(b)) names = b.elements.map((e) => (e.propertyName ?? e.name).text);
          if (n.importClause?.name) names = "all";
        } else if (n.exportClause && ts.isNamedExports(n.exportClause)) {
          names = n.exportClause.elements.map((e) => (e.propertyName ?? e.name).text);
        }
        out.push({ module: target, names });
      }
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const target = resolve(n.arguments[0].text);
      if (target) out.push({ module: target, names: "all" });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("monthly only: no one-at-a-time wording, no card at sign-up (plan 2026-11-26-001, Unit 9)", () => {
  it("scans the public site, the app, sign-up, Payment, settings, the status line and the email templates", () => {
    expect(surfaces).toEqual(
      expect.arrayContaining([
        "src/components/circles/price.tsx",
        "src/components/circles/home.tsx",
        "src/components/app/plan-form.tsx",
        "src/components/app/billing-panel.tsx",
        "src/components/app/settings-forms.tsx",
        "src/app/app/page.tsx",
        "src/app/app/billing/page.tsx",
        "src/app/app/settings/page.tsx",
        "src/app/start/payment/page.tsx",
        "src/lib/app/status.ts",
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

  it("the dormant per-run modules and exports are imported only by their own per-run flows (review fixes Unit 9, F4)", () => {
    const live = sourceFiles(join(root, "src")).map(rel);
    for (const [path, { names, from }] of Object.entries(DORMANT_IMPORTERS)) {
      const target = path.replace(/\.(ts|tsx)$/, "");
      const importers = live.filter((f) =>
        importsOf(f).some((i) => i.module === target && (!names || i.names === "all" || i.names.some((n) => names.includes(n)))),
      );
      expect(importers.sort(), path).toEqual([...from].sort());
    }
  });

  it("no surface offers or mentions one list at a time", () => {
    expect(hits(ONE_AT_A_TIME)).toEqual([]);
  });

  it("nothing says the card is asked for at sign-up (R25)", () => {
    expect(hits(CARD_UP_FRONT)).toEqual([]);
  });

  it("the second-miss email, sent to monthly members, no longer offers a switch", () => {
    const m = secondMissEmail({ higher: "US$400", difference: "US$50", invoiceDate: "2027-01-03" });
    expect(`${m.subject}\n${m.text}\n${m.html}`).not.toMatch(ONE_AT_A_TIME);
    expect(m.text).toContain("If you cancel on the billing page");
  });

  it("the guard catches the wording it is for", () => {
    for (const s of [
      "Or switch to one list at a time.",
      "Can I buy one list at a time?",
      "Lists one-at-a-time",
      "US$30 per list",
      "a per-run plan",
      "Pay per run",
      "Buy a single list",
      "Order a list for any Monday",
      "Order your next list whenever you want one",
      "Order next Monday’s list",
      "Pay in full",
    ])
      expect(s).toMatch(ONE_AT_A_TIME);
    for (const s of ["Card required. Charged only with your third list.", "We ask for a card when you start"]) expect(s).toMatch(CARD_UP_FRONT);
    // Identifiers and data values are not copy.
    for (const s of ['plan === "per_run"', "perRun={u.plan}"]) expect(s).not.toMatch(ONE_AT_A_TIME);
  });

  it("removes comments but never text inside strings, templates or JSX", () => {
    const strip = (t: string) => withoutComments(t, "x.tsx");
    expect(strip('const a = "x"; // one list at a time\nconst url = "https://x"; ')).not.toMatch(ONE_AT_A_TIME);
    expect(strip("/* order a list */ const b = 1;")).not.toMatch(ONE_AT_A_TIME);
    expect(strip("const j = <p>{/* one list at a time */}Hi</p>;")).not.toMatch(ONE_AT_A_TIME);
    // A ' // ' inside a string, a template or JSX text is copy, and is still checked.
    expect(strip('const s = "Monthly // or one list at a time";')).toMatch(ONE_AT_A_TIME);
    expect(strip("const t = `a // ${x} order your next list`;")).toMatch(ONE_AT_A_TIME);
    expect(strip("const j = <p>Plans // one list at a time</p>;")).toMatch(ONE_AT_A_TIME);
    expect(strip("const r = /a/; const u = 'https://x.test/a'; // per list")).not.toMatch(ONE_AT_A_TIME);
    // Line numbers are kept.
    expect(strip("a\n/* x\ny */\nb").split("\n")).toHaveLength(4);
  });
});
