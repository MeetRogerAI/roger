import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { buildChecklist, loadChecklist, noteOnboarding, recordGetStartedView, type Facts } from "./onboarding";

let q: Query;
const user = async (path: "new" | "running", status = "trial") =>
  (await q<{ id: string }>(`insert into users (email, path, status) values ($1, $2, $3) returning id`, [`${path}-${status}@example.com`, path, status]))[0].id;
const run = (userId: string, o: { test?: boolean; route?: string } = {}) =>
  q(`insert into runs (user_id, week_of, route, sharing, raw_text, is_test) values ($1, '2026-11-30', $2, 'share', 'report', $3)`, [userId, o.route ?? "connector", o.test ?? true]);
const done = async (userId: string) => (await loadChecklist(q, userId))!.steps.filter((s) => s.done).map((s) => s.key);

beforeEach(async () => {
  ({ query: q } = await testDb());
});

const none: Facts = { getstartedViewed: false, setupSeen: false, goalAgreed: false, keyMade: false, runReceived: false, controlsOpened: false, listDelivered: false };

describe("the onboarding checklist", () => {
  it("has six steps on the new path and four on the running path", () => {
    expect(buildChecklist("new", none).steps.map((s) => s.label)).toEqual([
      "Install your AI agent",
      "Set up your starter team",
      "Agree your daily goal",
      "Connect Zack",
      "Send a test run",
      "Wait for Monday",
    ]);
    expect(buildChecklist("running", none).steps.map((s) => s.label)).toEqual(["Connect Zack", "Send a test run", "Check your Zack controls", "Wait for Monday"]);
    expect(buildChecklist("new", none).steps[0].href).toBe("/getstarted#install");
  });

  it("receiving a test run ticks its step without the user doing anything", async () => {
    const id = await user("running");
    expect(await done(id)).toEqual([]);
    await run(id, { test: true });
    // Only its own step: nothing ticks backwards.
    expect(await done(id)).toEqual(["test_run"]);
  });

  it("ticks each step from stored facts on the new path", async () => {
    const id = await user("new");
    await noteOnboarding(q, id, "getstarted_at");
    expect(await done(id)).toEqual(["install"]);
    await noteOnboarding(q, id, "goal_at");
    // The goal only from its own button; the starter team still waits for the setup file.
    expect(await done(id)).toEqual(["install", "goal"]);
    await noteOnboarding(q, id, "setup_version", 2);
    expect(await done(id)).toEqual(["install", "starter_team", "goal"]);
    await q(`update users set zack_key_created_at = now() where id = $1`, [id]);
    expect(await done(id)).toEqual(["install", "starter_team", "goal", "connect"]);
    expect((await loadChecklist(q, id))!.complete).toBe(false);
  });

  it("making a key ticks only Connect Zack, and opening the controls page only its own step", async () => {
    const id = await user("running");
    await q(`update users set zack_key_created_at = now() where id = $1`, [id]);
    expect(await done(id)).toEqual(["connect"]);
    const other = await user("running", "active");
    await noteOnboarding(q, other, "controls_at");
    expect(await done(other)).toEqual(["controls"]);
  });

  it("a signed-in view of /getstarted records the view, and the setup version only when one is published", async () => {
    const id = await user("new");
    await recordGetStartedView(q, id, null);
    expect(await done(id)).toEqual(["install"]);
    await recordGetStartedView(q, id, { version: 3 });
    const [u] = await q<{ v: string }>(`select onboarding->>'setup_version' as v from users where id = $1`, [id]);
    expect(u.v).toBe("3");
    expect(await done(id)).toEqual(["install", "starter_team"]);
  });

  it("a free-tool report from before connecting does not count as a test run", async () => {
    const id = await user("running");
    await run(id, { test: false, route: "free_tool" });
    expect(await done(id)).toEqual([]);
  });

  it("is complete, and so hidden, once a list is delivered; a dry run does not count", async () => {
    const id = await user("new");
    const [{ id: play }] = await q<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('P', 'Sales', 'd', 'p', 'i', '2026-11-30', '2026-11-30') returning id",
    );
    await q(`insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at) values ($1, '2026-11-30', 1, $2, 80, 3, 'r', true, now())`, [id, play]);
    expect((await loadChecklist(q, id))!.complete).toBe(false);
    await q(`update picks set dry_run = false where user_id = $1`, [id]);
    // A delivered list ticks everything, even steps never seen.
    expect((await loadChecklist(q, id))!.complete).toBe(true);
    expect(await done(id)).toHaveLength(6);
  });

  it("keeps the first time a fact was seen", async () => {
    const id = await user("new");
    await noteOnboarding(q, id, "setup_version", 1);
    await noteOnboarding(q, id, "setup_version", 2);
    const [u] = await q<{ v: string }>(`select onboarding->>'setup_version' as v from users where id = $1`, [id]);
    expect(u.v).toBe("1");
  });

  it("shows nothing for an account still signing up or closed", async () => {
    expect(await loadChecklist(q, await user("new", "signup"))).toBeNull();
    expect(await loadChecklist(q, await user("new", "closed"))).toBeNull();
  });
});
