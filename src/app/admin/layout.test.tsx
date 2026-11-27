/**
 * The admin layout's gate (admin CMS plan, unit U2): the sidebar, the Stripe badge, "Sign out" and the page
 * itself reach an admin only, and the gate asks for a live request before it checks who is there.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";

const who = vi.hoisted(() => ({ admin: false, hasDb: true, asked: [] as string[] }));

vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => "/admin/users" }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => void who.asked.push("connection"),
}));
vi.mock("@/lib/admin-auth", () => ({
  isAdmin: async () => {
    who.asked.push("isAdmin");
    return who.admin;
  },
}));
vi.mock("@/lib/db", () => ({ hasDb: () => who.hasDb }));
// The layout's forms name these actions; none is called here.
vi.mock("@/app/admin/actions", () => ({ signOutAction: async () => {}, signInAction: async () => ({ status: "idle" }) }));

const { default: AdminLayout, instant } = await import("./layout");
const { adminGroups } = await import("@/components/admin-ui");

const PAGE = "The page an admin opened";
const render = () =>
  pageMarkup(
    <AdminLayout params={Promise.resolve({})}>
      <p>{PAGE}</p>
    </AdminLayout>,
  );
/** Everything that belongs to a signed-in admin: the navigation, each screen's name, the badge, the way out and the page. */
const adminOnly = ['aria-label="Admin"', "admin-menu", "Sign out", "Stripe:", PAGE, ...adminGroups.flatMap((group) => [`>${group.heading}<`, ...group.screens.map((screen) => `href="${screen.href}"`)])];

beforeEach(() => {
  who.admin = false;
  who.hasDb = true;
  who.asked = [];
  vi.stubEnv("ADMIN_PASSWORD", "hunter2");
  vi.stubEnv("ADMIN_EMAILS", "peter@example.com");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
});

describe("the admin layout", () => {
  it("shows a visitor who is not an admin the two ways to sign in, and nothing that belongs to the admin", async () => {
    const markup = await render();
    expect(markup).toContain('type="password"');
    expect(markup).toContain('href="/signin?next=/admin"');
    for (const part of adminOnly) expect(markup, part).not.toContain(part);
  });

  it("shows nothing that belongs to the admin while the admin is not switched on", async () => {
    who.hasDb = false;
    who.admin = true;
    const markup = await render();
    expect(markup).toContain("Admin isn’t switched on yet");
    for (const part of adminOnly) expect(markup, part).not.toContain(part);
  });

  it("gives an admin the sidebar with the badge and “Sign out” in it, beside the page", async () => {
    who.admin = true;
    const markup = await render();
    for (const part of adminOnly) expect(markup, part).toContain(part);
    expect(markup).not.toContain('type="password"');
    // The badge and the way out sit inside the folding menu, so a phone has them too.
    const menu = markup.slice(markup.indexOf('id="admin-menu"'), markup.indexOf(PAGE));
    expect(menu).toContain("Stripe: test mode");
    expect(menu).toMatch(/<form[^>]*>\s*<button type="submit"[^>]*>Sign out<\/button>/);
    // The page column may shrink below its content, so a wide table scrolls inside it and not the document.
    expect(markup).toMatch(/<div class="[^"]*\bmin-w-0\b[^"]*"><p>The page an admin opened<\/p>/);
  });

  it("is not the only check: every admin page and download still asks who is there before it reads anything", () => {
    // A layout is not rendered again on a navigation between its pages, so each page checks for itself.
    const under = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? under(path.join(dir, name)) : [path.join(dir, name)]));
    const entries = under(__dirname).filter((file) => /[\\/](page\.tsx|route\.ts)$/.test(file));
    expect(entries.length).toBeGreaterThanOrEqual(adminGroups.flatMap((group) => group.screens).length + 2);
    for (const file of entries) {
      const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const check = /\n  if \(!\(await isAdmin\(\)\)\) return (null|new Response\("Not signed in", \{ status: 401 \}\));\n/.exec(body);
      expect(check, file).not.toBeNull();
      // The check opens the function it sits in: waiting for the request may come first, and nothing else is awaited before it.
      const start = body.lastIndexOf("async function ", check!.index);
      expect(start, file).toBeGreaterThan(-1);
      expect(body.slice(start, check!.index).replace("await connection();", ""), file).not.toMatch(/\bawait\b/);    }
  });

  it("renders per request: it waits for the request before it checks who is there, and keeps no instant shell", async () => {
    who.admin = true;
    await render();
    expect(who.asked).toEqual(["connection", "isAdmin"]);
    expect(instant).toBe(false);
  });
});
