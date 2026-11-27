/**
 * The admin sidebar (admin CMS plan, unit U2): five headings and fifteen screens in the order Peter chose,
 * the current screen marked, and the Sample idea screen gone with everything that served it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const at = vi.hoisted(() => ({ path: "/admin" }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => at.path }));
// The sidebar shares a file with the admin's forms, whose actions reach for the database. None is called here.
vi.mock("@/app/admin/actions", () => ({}));

const { AdminSidebar, adminGroups, adminScreenAt } = await import("./admin-ui");

const SRC = path.resolve(__dirname, "..");
const screens = adminGroups.flatMap((group) => group.screens);

const sidebar = (address: string) => {
  at.path = address;
  return renderToStaticMarkup(
    <AdminSidebar>
      <span>Stripe: test mode</span>
    </AdminSidebar>,
  );
};
/** The label of every link that carries aria-current="page". */
const marked = (markup: string) => [...markup.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);

describe("the list of admin screens", () => {
  it("has the five headings, each with its screens, in the agreed order and names", () => {
    expect(adminGroups.map((group) => [group.heading, group.screens.map((screen) => screen.label)])).toEqual([
      ["Today", ["This week", "Needs attention", "Flags"]],
      ["People", ["Users", "Sign-ups", "Interest"]],
      ["Cora", ["This week’s run", "Runs"]],
      ["Website", ["Pages", "Testimonials", "Use cases", "Watches"]],
      ["Setup", ["Settings", "Connections", "Setup file"]],
    ]);
    expect(screens).toHaveLength(15);
    expect(new Set(screens.map((screen) => screen.href)).size).toBe(15);
  });

  it("names no screen by a retired tab name", () => {
    for (const old of ["Sample idea", "Edit Questions", "Overview", "Operations", "Cora"]) expect(screens.map((screen) => screen.label)).not.toContain(old);
  });

  it("points every entry at a page that exists", () => {
    for (const screen of screens) {
      expect(screen.href === "/admin" || screen.href.startsWith("/admin/"), screen.href).toBe(true);
      expect(existsSync(path.join(SRC, "app", ...screen.href.split("/").filter(Boolean), "page.tsx")), screen.href).toBe(true);
    }
  });

  it("leaves no admin page out: every page file is a listed screen or sits beneath one", () => {
    const pagesUnder = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? pagesUnder(path.join(dir, name)) : name === "page.tsx" ? [dir] : []));
    const admin = path.join(SRC, "app", "admin");
    const addresses = pagesUnder(admin).map((dir) => ["/admin", ...path.relative(admin, dir).split(path.sep).filter(Boolean)].join("/"));
    expect(addresses.length).toBeGreaterThanOrEqual(screens.length);
    // A page with a parameter in its address (/admin/users/[id]) is reached from its screen, and marks it.
    for (const address of addresses) expect(adminScreenAt(address.replace(/\[[^\]]+\]/g, "x")), address).not.toBeNull();
  });

  it("matches an address to its screen whatever follows the path", () => {
    expect(adminScreenAt("/admin")?.label).toBe("This week");
    expect(adminScreenAt("/admin/")?.label).toBe("This week");
    expect(adminScreenAt("/admin/users/")?.label).toBe("Users");
    expect(adminScreenAt("/admin/users/abc/more")?.label).toBe("Users");
    expect(adminScreenAt("/admin/runs")?.label).toBe("Runs");
    // The export address is a download, not a screen, and /administrator is not the admin.
    expect(adminScreenAt("/admin/export/leads")).toBeNull();
    expect(adminScreenAt("/administrator")).toBeNull();
    expect(adminScreenAt("/")).toBeNull();
  });
});

describe("the sidebar as rendered", () => {
  it("prints every heading and every screen once, in order, as one click each", () => {
    const markup = sidebar("/admin");
    expect([...markup.matchAll(/<h2 [^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(adminGroups.map((group) => group.heading));
    expect([...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]])).toEqual(screens.map((screen) => [screen.href, screen.label]));
    expect(markup).toContain("Stripe: test mode");
  });

  it("marks only the current screen: /admin by exact match, the rest by what sits beneath them", () => {
    expect(marked(sidebar("/admin"))).toEqual(["This week"]);
    expect(marked(sidebar("/admin/users/abc"))).toEqual(["Users"]);
    expect(marked(sidebar("/admin/users"))).toEqual(["Users"]);
    expect(marked(sidebar("/admin/use-cases"))).toEqual(["Use cases"]);
    expect(marked(sidebar("/admin/questions"))).toEqual(["Pages"]);
    for (const screen of screens) expect(marked(sidebar(screen.href)), screen.href).toEqual([screen.label]);
    // An address that only starts with a screen's letters is not that screen, and an unknown one marks nothing.
    expect(adminScreenAt("/admin/users-old")).toBeNull();
    expect(marked(sidebar("/admin/nowhere"))).toEqual([]);
  });

  it("folds behind one button on a phone, closed until it is pressed, and says which screen is open", () => {
    const markup = sidebar("/admin/leads");
    const button = markup.match(/<button [^>]*>.*?<\/button>/)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="admin-menu"');
    expect(button).toContain("lg:hidden");
    expect(button).toContain(">Menu<");
    expect(button).toContain("Sign-ups");
    // Closed on a phone, always there from the lg breakpoint.
    expect(markup).toMatch(/<div id="admin-menu" class="hidden lg:block[^"]*">/);
  });

  it("keeps a link to a part of a page clear of the pinned Menu button on a phone", () => {
    // The bar is pinned under the 60px header and is 64px tall (8 + a 48px button + 8), below lg only.
    const bar = sidebar("/admin/users/abc").match(/^<div data-admin-nav="true" class="([^"]*)"/)!;
    expect(bar).not.toBeNull();
    expect(bar[1].split(" ")).toEqual(expect.arrayContaining(["sticky", "top-[60px]", "py-2", "lg:top-[76px]"]));
    expect(sidebar("/admin/users/abc")).toMatch(/<button [^>]*class="[^"]*\bmin-h-12\b[^"]*\blg:hidden\b/);
    // So the page leaves 60 + 64 pixels, and a little air, above whatever it scrolls to, at the widths where the bar is pinned.
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/@media \(max-width: 1023\.98px\) \{\s*html:has\(\[data-admin-nav\]\) \{\s*scroll-padding-top: (\d+)px;\s*\}\s*\}/);
    expect(rule).not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(60 + 64 + 8);
  });
});

describe("a wide table beside the sidebar", () => {
  it("scrolls inside its own box on Needs attention, hidden labels included", () => {
    // Each row's note field has a screen-reader label, which is absolutely placed. Unless the scroller is its
    // containing block, the label of a cell scrolled out of sight still counts toward the document's width.
    const ops = readFileSync(path.join(SRC, "app", "admin", "ops", "page.tsx"), "utf8");
    const scroller = ops.match(/<div className="([^"]*)">\s*<table /)!;
    expect(scroller).not.toBeNull();
    expect(scroller[1].split(" ")).toEqual(expect.arrayContaining(["relative", "overflow-x-auto"]));
    expect(ops).toMatch(/<NoteEditor [^>]*\bcompact\b/);
    expect(readFileSync(path.join(SRC, "components", "app", "admin-v3.tsx"), "utf8")).toContain('className={compact ? "sr-only" : label}');
  });
});

describe("the removed Sample idea screen", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? files(path.join(dir, name)) : [path.join(dir, name)]));

  it("has no page, and its reader is gone", () => {
    expect(existsSync(path.join(SRC, "app", "admin", "sample"))).toBe(false);
    expect(existsSync(path.join(SRC, "lib", "cora", "sample.ts"))).toBe(false);
  });

  it("left nothing behind that names what was deleted", () => {
    // Built from parts so this file does not hold the names it looks for.
    const gone = ["Sample" + "Chooser", "choose" + "SampleAction", "choose" + "Sample", "clear" + "Sample", "sample" + "Candidates", "getPublic" + "SamplePlay", "SAMPLE_PLAY" + "_TAG", "lib/cora/" + "sample", "admin/" + "sample", "Admin" + "Tabs"];
    const found = files(SRC)
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return gone.filter((name) => text.includes(name)).map((name) => `${path.relative(SRC, file)}: ${name}`);
      });
    expect(found).toEqual([]);
  });
});
