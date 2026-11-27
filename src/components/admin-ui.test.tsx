/**
 * The admin sidebar (admin CMS plan, unit U2): five headings and fifteen screens in the order Peter chose,
 * the current screen marked, and the Sample idea screen gone with everything that served it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const at = vi.hoisted(() => ({ path: "/admin" }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => at.path }));
// The sidebar shares a file with the admin's forms, whose actions reach for the database. None is called here.
vi.mock("@/app/admin/actions", () => ({}));

const { AdminNavList, AdminSidebar, adminFoldedKey, adminGroups, adminScreenAt, headingMarked, parseFolded, saveFolded, storedFolded, subscribeFolded, toggleFolded } = await import("./admin-ui");

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
    // The one page file that is no screen: the retired Edit Questions address, which only sends its visitor on into Pages.
    const retired = "/admin/questions";
    expect(addresses).toContain(retired);
    expect(adminScreenAt(retired)).toBeNull();
    expect(readFileSync(path.join(admin, "questions", "page.tsx"), "utf8")).toMatch(/\bredirect\(editorAddress\("faq"\)\)/);
    // A page with a parameter in its address (/admin/users/[id]) is reached from its screen, and marks it.
    for (const address of addresses.filter((entry) => entry !== retired)) expect(adminScreenAt(address.replace(/\[[^\]]+\]/g, "x")), address).not.toBeNull();
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
    expect([...markup.matchAll(/<h2 [^>]*><button [^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(adminGroups.map((group) => group.heading));
    expect([...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]])).toEqual(screens.map((screen) => [screen.href, screen.label]));
    expect(markup).toContain("Stripe: test mode");
  });

  it("marks only the current screen: /admin by exact match, the rest by what sits beneath them", () => {
    expect(marked(sidebar("/admin"))).toEqual(["This week"]);
    expect(marked(sidebar("/admin/users/abc"))).toEqual(["Users"]);
    expect(marked(sidebar("/admin/users"))).toEqual(["Users"]);
    expect(marked(sidebar("/admin/use-cases"))).toEqual(["Use cases"]);
    // Every screen of Pages marks Pages: the list, a page's editing screen, and the review.
    expect(marked(sidebar("/admin/pages/faq"))).toEqual(["Pages"]);
    expect(marked(sidebar("/admin/pages/review"))).toEqual(["Pages"]);
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

describe("folding the sidebar's groups (unit U2b)", () => {
  const headings = adminGroups.map((group) => group.heading);
  const listId = (heading: string) => `admin-group-${heading.toLowerCase()}-screens`;
  /** Each heading's button and its list, as printed. */
  const groupsIn = (markup: string) =>
    [...markup.matchAll(/<h2 id="([^"]*)"><button ([^>]*)>(.*?)<\/button><\/h2><ul ([^>]*)>(.*?)<\/ul>/g)].map((m) => ({ id: m[1], button: m[2], inside: m[3], list: m[4], links: m[5] }));
  const list = (address: string, folded: string[]) => renderToStaticMarkup(<AdminNavList current={adminScreenAt(address)} folded={folded} />);

  it("sends every group open from the server, so with no script every link can be reached", () => {
    for (const address of ["/admin", "/admin/users/abc", "/admin/nowhere"]) {
      const markup = sidebar(address);
      const groups = groupsIn(markup);
      expect(groups.map((g) => g.id)).toEqual(headings.map((h) => `admin-group-${h.toLowerCase()}`));
      for (const g of groups) {
        expect(g.button).toContain('type="button"');
        expect(g.button).toContain('aria-expanded="true"');
        expect(g.button).toContain(`aria-controls="${g.id}-screens"`);
        expect(g.list).toContain(`id="${g.id}-screens"`);
        expect(g.list).toContain(`aria-labelledby="${g.id}"`);
      }
      // The attribute, not the class name of the closed phone menu.
      expect(markup).not.toMatch(/<[^>]* hidden=""/);
      expect([...markup.matchAll(/<a /g)]).toHaveLength(15);
    }
  });

  it("makes the whole heading row the button, tall enough for a thumb, with an arrow that turns", () => {
    for (const g of groupsIn(sidebar("/admin"))) {
      expect(g.button.match(/class="([^"]*)"/)![1].split(" ")).toEqual(expect.arrayContaining(["flex", "w-full", "min-h-11", "lg:min-h-8"]));
      expect(g.inside).toMatch(/<svg [^>]*class="[^"]*\bgroup-aria-expanded:rotate-90\b[^"]*"[^>]*aria-hidden="true"/);
    }
  });

  it("hides a folded group's links from the tab order and from being read out, and no other group's", () => {
    const groups = groupsIn(list("/admin", ["People", "Setup"]));
    expect(groups.map((g) => [g.button.match(/data-admin-fold="([^"]*)"/)![1], g.button.includes('aria-expanded="false"'), g.list.includes('hidden=""')])).toEqual([
      ["Today", false, false],
      ["People", true, true],
      ["Cora", false, false],
      ["Website", false, false],
      ["Setup", true, true],
    ]);
    // The links stay in the markup (hidden takes them out of the tab order), so unfolding needs no fetch.
    expect(groups[1].links).toContain('href="/admin/users"');
  });

  it("reads the stored choice, and folds nothing for anything it does not understand", () => {
    expect(parseFolded('["People","Setup"]')).toEqual(["People", "Setup"]);
    // The sidebar's order, each heading once.
    expect(parseFolded('["Setup","Today","Setup"]')).toEqual(["Today", "Setup"]);
    expect(parseFolded(JSON.stringify(headings))).toEqual(headings);
    // Unknown names (a heading since renamed, another case, not a string) are dropped; the known ones beside them are kept.
    expect(parseFolded('["Sample idea","People","people",5,null,["Cora"],{"heading":"Setup"}]')).toEqual(["People"]);
    for (const bad of [null, undefined, "", "People", "[", '{"People":true}', '"People"', "true", "null", "7", "[]", '["__proto__","constructor","toString"]']) expect(parseFolded(bad), String(bad)).toEqual([]);
  });

  it("folds an open heading and opens a folded one, and what it stores reads back the same", () => {
    expect(toggleFolded([], "Cora")).toEqual(["Cora"]);
    expect(toggleFolded(["Cora"], "Today")).toEqual(["Today", "Cora"]);
    expect(toggleFolded(["Today", "Cora"], "Cora")).toEqual(["Today"]);
    expect(toggleFolded(["Today"], "Nowhere")).toEqual(["Today"]);
    let folded: string[] = [];
    for (const heading of headings) folded = toggleFolded(folded, heading);
    expect(parseFolded(JSON.stringify(folded))).toEqual(headings);
    expect(adminFoldedKey).toBe("roger-admin-folded");
  });

  it("marks a heading only when it is folded and the current screen is inside it", () => {
    const people = adminGroups[1];
    const users = adminScreenAt("/admin/users/abc");
    expect(headingMarked(people, users, ["People"])).toBe(true);
    expect(headingMarked(people, users, [])).toBe(false);
    expect(headingMarked(people, users, ["Setup"])).toBe(false);
    expect(headingMarked(adminGroups[4], users, ["People", "Setup"])).toBe(false);
    expect(headingMarked(people, null, ["People"])).toBe(false);
    for (const group of adminGroups) for (const screen of group.screens) expect(adminGroups.filter((g) => headingMarked(g, screen, headings)).map((g) => g.heading)).toEqual([group.heading]);
  });

  it("prints the mark in the folded heading that holds the current screen, and says the screen's name", () => {
    const mark = (inside: string) => inside.match(/<span data-admin-here="true" class="([^"]*)">.*?<span class="sr-only">([^<]*)<\/span>/);
    const folded = groupsIn(list("/admin/users/abc", ["People", "Setup"]));
    expect(folded.map((g) => mark(g.inside) !== null)).toEqual([false, true, false, false, false]);
    expect(mark(folded[1].inside)![1].split(" ")).toContain("inline-flex");
    expect(mark(folded[1].inside)![1].split(" ")).not.toContain("hidden");
    expect(mark(folded[1].inside)![2]).toBe(", you are on Users");
    // Going to a screen in a folded group does not open the group: its link is still hidden, and still the current one.
    expect(folded[1].list).toContain('hidden=""');
    expect(marked(list("/admin/users/abc", ["People", "Setup"]))).toEqual(["Users"]);
    // Open, the mark is in the markup but not shown, until the heading says it is folded.
    const open = groupsIn(list("/admin/users/abc", []));
    expect(mark(open[1].inside)![1].split(" ")).toEqual(expect.arrayContaining(["hidden", "group-aria-[expanded=false]:inline-flex"]));
    // No current screen, no mark anywhere.
    expect(list("/admin/nowhere", headings)).not.toContain("data-admin-here");
  });

  /** The script, run against a stand-in for the page as the browser has it when the tag is read. */
  function page(stored: string | null | Error, { full = false } = {}) {
    const script = sidebar("/admin").match(/<script>(.*?)<\/script>/)![1];
    let value = stored;
    const lists: Record<string, { hidden: boolean }> = Object.fromEntries(headings.map((h) => [listId(h), { hidden: false }]));
    const buttons = headings.map((h) => {
      const attrs: Record<string, string> = { "data-admin-fold": h, "aria-controls": listId(h), "aria-expanded": "true" };
      return { getAttribute: (name: string) => attrs[name] ?? null, setAttribute: (name: string, to: string) => void (attrs[name] = to) };
    });
    const clicks: ((e: { target: { closest: (selector: string) => unknown } }) => void)[] = [];
    const tag = { isConnected: true, parentNode: { querySelectorAll: () => buttons, addEventListener: (type: string, fn: (typeof clicks)[number]) => void (type === "click" && clicks.push(fn)) } };
    const storage = {
      getItem: () => {
        if (value instanceof Error) throw value;
        return value;
      },
      setItem: (_: string, to: string) => {
        if (full) throw new Error("storage is full");
        value = to;
      },
    };
    new Function("document", "localStorage", script)({ currentScript: tag, getElementById: (id: string) => lists[id] ?? null }, storage);
    return {
      folded: () => headings.filter((h, i) => lists[listId(h)].hidden && buttons[i].getAttribute("aria-expanded") === "false"),
      // A list and its heading never disagree.
      press: (heading: string | null) => {
        for (const fn of clicks) fn({ target: { closest: () => (heading === null ? null : buttons[headings.indexOf(heading)]) } });
        for (const [i, h] of headings.entries()) expect(lists[listId(h)].hidden).toBe(buttons[i].getAttribute("aria-expanded") === "false");
      },
      stored: () => value as string,
      listeners: () => clicks.length,
      reactTakesOver: () => void (tag.isConnected = false),
    };
  }

  it("folds a remembered group as the server's markup is read, before the page's scripts load", () => {
    const markup = sidebar("/admin");
    const script = markup.match(/<script>(.*?)<\/script>/)![1];
    expect(script).toContain(JSON.stringify(adminFoldedKey));
    // It runs after the list it folds, and a fault in it (no storage, broken JSON) is swallowed.
    expect(markup.indexOf("<script>")).toBeGreaterThan(markup.indexOf("</nav>"));
    expect(script.startsWith("(function(){try{") && script.endsWith("}catch(e){}})()")).toBe(true);
    // Fixed text: the key is the only thing put into it, and nothing in it can end the tag or start another.
    expect(script).not.toMatch(/<\/|<!--/);
    expect(script.split(JSON.stringify(adminFoldedKey))).toHaveLength(2);
    // Only the stored, known headings fold.
    expect(page('["People","Setup"]').folded()).toEqual(["People", "Setup"]);
    for (const stored of [null, "", "[", '{"People":true}', '["Sample idea"]', new Error("storage is off")]) expect(page(stored).folded(), String(stored)).toEqual([]);
    for (const stored of ['["People","Sample idea",5]', '["Setup","Today"]']) expect(page(stored).folded(), stored).toEqual(parseFolded(stored));
  });

  it("opens a folded group on a press while the page's scripts have not arrived, so a heading is never dead", () => {
    const slow = page('["People","Sample idea","Setup"]');
    // Pressed on the arrow inside the heading: the heading is found from there.
    slow.press("People");
    expect(slow.folded()).toEqual(["Setup"]);
    // What React will read when it arrives agrees. Names it does not know are left as they were.
    expect(slow.stored()).toBe('["Sample idea","Setup"]');
    expect(parseFolded(slow.stored())).toEqual(slow.folded());
    // It only opens. An open heading is left alone, and so is a press that is on no heading.
    slow.press("People");
    slow.press("Today");
    slow.press(null);
    expect(slow.folded()).toEqual(["Setup"]);
    expect(slow.stored()).toBe('["Sample idea","Setup"]');
    // Once React has read the stored choice the tag is gone, and the script leaves every press to React.
    slow.reactTakesOver();
    slow.press("Setup");
    expect(slow.folded()).toEqual(["Setup"]);
    expect(slow.stored()).toBe('["Sample idea","Setup"]');
  });

  it("still opens a folded group when the opened state cannot be stored, and listens for nothing when storage is off", () => {
    const full = page('["Cora"]', { full: true });
    full.press("Cora");
    expect(full.folded()).toEqual([]);
    expect(full.stored()).toBe('["Cora"]');
    const off = page(new Error("storage is off"));
    expect(off.listeners()).toBe(0);
  });
});

describe("the stored folds while the page is open (unit U2b)", () => {
  afterEach(() => vi.unstubAllGlobals());
  /** A window that only carries events, and a storage that can be full. */
  function browser({ full = false } = {}) {
    const values = new Map<string, string>();
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, to: string) => {
        if (full) throw new Error("storage is full");
        values.set(key, to);
      },
    });
    return { values, fire: (type: string, props: object) => win.dispatchEvent(Object.assign(new Event(type), props)) };
  }

  it("reads the stored folds again when another tab changes or clears them, and on a page brought back, and for nothing else", () => {
    const { values, fire } = browser();
    let heard = 0;
    const stop = subscribeFolded(() => void heard++);
    saveFolded(["People"]);
    expect([heard, storedFolded()]).toEqual([1, '["People"]']);
    // The other tab has written by the time the event arrives.
    values.set(adminFoldedKey, '["Setup"]');
    fire("storage", { key: "something-else" });
    expect([heard, storedFolded()]).toEqual([1, '["People"]']);
    fire("storage", { key: adminFoldedKey });
    expect([heard, storedFolded()]).toEqual([2, '["Setup"]']);
    saveFolded(["Cora"]);
    values.delete(adminFoldedKey);
    fire("storage", { key: null });
    expect([heard, storedFolded()]).toEqual([4, ""]);
    saveFolded(["Cora"]);
    values.set(adminFoldedKey, '["Today"]');
    fire("pageshow", { persisted: false });
    expect([heard, storedFolded()]).toEqual([5, '["Cora"]']);
    fire("pageshow", { persisted: true });
    expect([heard, storedFolded()]).toEqual([6, '["Today"]']);
    stop();
    fire("storage", { key: adminFoldedKey });
    saveFolded([]);
    expect(heard).toBe(6);
  });

  it("keeps a choice that could not be saved when some other key changes in another tab", () => {
    const { fire } = browser({ full: true });
    const stop = subscribeFolded(() => {});
    saveFolded(["Website"]);
    fire("storage", { key: "something-else" });
    expect(parseFolded(storedFolded())).toEqual(["Website"]);
    // The next press builds on it.
    expect(toggleFolded(parseFolded(storedFolded()), "Today")).toEqual(["Today", "Website"]);
    fire("storage", { key: adminFoldedKey });
    expect(storedFolded()).toBe("");
    stop();
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
