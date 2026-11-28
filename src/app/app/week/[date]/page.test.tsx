import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAFEGUARD_PREAMBLE } from "@/lib/cora/safeguard";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Plan 2026-11-26-001, Unit 3: the week page for a held list (no card yet)
 * renders the titles only. The rendered page is checked for the absence of
 * every detail field.
 */

const db: { query: Query | null; userId: string } = { query: null, userId: "" };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/auth/access", () => ({ requireUser: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});

const { default: Page } = await import("./page");
const WEEK = "2026-12-14";

async function render(date: string, search: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerender(<Page params={Promise.resolve({ date })} searchParams={Promise.resolve(search)} />);
  const html = await new Response(prelude).text();
  return html;
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  const [u] = await query<{ id: string }>("insert into users (email, status, plan) values ('a@example.com', 'trial', 'monthly') returning id");
  db.userId = u.id;
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [u.id, WEEK]);
  for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, heavy_use_for, first_seen, last_seen, figures)
       values ($1, 'Sales', 'Secret description.', '1. Secret step.', 'Secret install.', 'Secret heavy use.', $2, $2, '{"current_hours_week": 2}') returning id`,
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 77, 3, 'Secret reason.')", [u.id, WEEK, i + 1, p.id]);
  }
});

describe("/app/week/[date] for a held list", () => {
  it("shows the titles, locked, and no reason, score, step or install text", async () => {
    const html = await render(WEEK);
    expect(html).toContain("Your first 3 ideas are ready");
    for (const t of ["Inbox triage", "Listing post", "Calendar prep"]) expect(html).toContain(t);
    expect(html).toContain('href="/start/payment"');
    expect(html).not.toMatch(/Secret|your score|Open and install|77/);
  });

  it("shows the ideas in full once the list is delivered", async () => {
    await db.query!("update picks set delivered_at = now()");
    await db.query!("update users set trial_started_at = now()");
    const html = await render(WEEK);
    expect(html).toContain("Secret reason.");
    expect(html).not.toContain("Your first 3 ideas are ready");
  });

  it("shows the safeguard preamble once at the top of a delivered list, and in every idea's paste-to-install text (2026-11-27)", async () => {
    await db.query!("update picks set delivered_at = now()");
    await db.query!("update users set trial_started_at = now()");
    const html = await render(WEEK);
    // The preamble without its apostrophes, which the page escapes.
    const part = "never send, post, pay, delete or share anything without your member";
    expect(SAFEGUARD_PREAMBLE).toContain(part);
    const list = html.slice(html.indexOf('aria-label="Before you set these up"'));
    expect(list.indexOf(part)).toBeLessThan(list.indexOf("Inbox triage"));
    // Once for the list, then once in each of the three sheets' paste-to-install text, right above its own install notes.
    expect(html.split(part)).toHaveLength(1 + 1 + 3);
    expect(html.split("Secret install.")).toHaveLength(1 + 3);
    expect(html.match(/<aside[^>]*Before you set these up/g)).toHaveLength(1);
  });

  it("shows a delivered idea later removed from the pool as withdrawn, with no install text, playbook or copy button (review F4)", async () => {
    await db.query!("update picks set delivered_at = now()");
    await db.query!("update users set trial_started_at = now()");
    await db.query!(
      "update pool_plays set removed_at = now(), playbook_md = '1. Removed step.', paste_to_install = 'Removed install.', description = 'Removed description.', heavy_use_for = 'Removed heavy use.', figures = '{\"current_hours_week\": 2, \"heavy_hours_week\": 4}' where title = 'Listing post'",
    );
    await db.query!("update picks set reason = 'Removed reason.' where pool_play_id = (select id from pool_plays where title = 'Listing post')");
    const html = await render(WEEK);
    expect(html.split("This idea was withdrawn by Roger.")).toHaveLength(1 + 2); // the card and its sheet
    expect(html).toContain("Listing post");
    // Nothing of its text: no description, heavy use, reason, steps or install text (re-review G4).
    expect(html).not.toMatch(/Removed (step|install|description|heavy use|reason)/);
    // The other two are whole: two install texts, two copy buttons.
    expect(html.split("Secret install.")).toHaveLength(1 + 2);
    expect(html.split("Copy prompt and playbook")).toHaveLength(1 + 2);
  });

  it("shows the plain empty state for an earlier, superseded held week: no titles and no Payment link", async () => {
    const PREV = "2026-12-07";
    await db.query!("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [PREV]);
    await db.query!("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, superseded_at) values ($1, $2, 'picked', 1, '2026-12-14T06:05:00Z')", [db.userId, PREV]);
    const [p] = await db.query!<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures) values ('Replaced idea', 'Sales', 'Secret.', '1. Secret step.', 'Secret install.', $1, $1, '{}') returning id",
      [PREV],
    );
    await db.query!("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Secret reason.')", [db.userId, PREV, p.id]);
    const html = await render(PREV);
    expect(html).toContain("There are no ideas for you for that week.");
    expect(html).not.toMatch(/Replaced idea|Inbox triage|Your first|Secret/);
    expect(html).not.toContain('href="/start/payment"');
  });

  it("shows the plain empty state for another week", async () => {
    const html = await render("2026-12-07");
    expect(html).toContain("There are no ideas for you for that week.");
    expect(html).not.toContain("Inbox triage");
  });
});

describe("/app/week/[date] after a card save (Unit 5)", () => {
  beforeEach(async () => {
    await db.query!("update picks set delivered_at = now()");
    await db.query!("update users set trial_started_at = now()");
  });

  it("shows the one-line notice above the unlocked ideas", async () => {
    const html = await render(WEEK, { card: "saved" });
    expect(html).toContain("Your card is saved. Here are your ideas.");
    expect(html).toContain('role="status"');
    expect(await render(WEEK, { card: "promo" })).toContain("Your card is saved; that code couldn’t be applied, so the price is the regular one.");
  });

  it("shows nothing for any other flag, or on a week with no ideas", async () => {
    expect(await render(WEEK, { card: "toString" })).not.toContain("Your card is saved");
    expect(await render(WEEK)).not.toContain("Your card is saved");
    expect(await render("2026-12-07", { card: "saved" })).not.toContain("Your card is saved");
  });
});
