import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories } from "../src/data/categories";
import { splitSchema } from "./schema-split.mjs";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const statements: string[] = splitSchema(schema);

describe("schema.sql", () => {
  it("splits into whole statements", () => {
    for (const s of statements) {
      expect(s, s.slice(0, 80)).toMatch(/^(create|alter|drop|insert|update|do)\b/i);
      // Balanced parentheses: a split inside a statement would break this.
      const open = (s.match(/\(/g) ?? []).length;
      const close = (s.match(/\)/g) ?? []).length;
      expect(open, s.slice(0, 80)).toBe(close);
    }
  });

  it("has no two dashes inside a string literal", () => {
    for (const s of statements) expect(s).not.toMatch(/'[^']*--[^']*'/);
  });

  it("is idempotent statement by statement", () => {
    for (const s of statements) {
      if (/^create (unique )?(table|index)/i.test(s)) expect(s, s.slice(0, 80)).toMatch(/if not exists/i);
      if (/^alter table/i.test(s)) expect(s, s.slice(0, 80)).toMatch(/if (not )?exists/i);
      // A do block must be one line (the splitter cuts at a semicolon that ends a line).
      if (/^do\b/i.test(s)) expect(s.includes("\n"), s.slice(0, 80)).toBe(false);
      // So must a function or trigger (a plpgsql body has semicolons), and a re-run must replace it, not fail.
      if (/^create (or replace )?(function|trigger)/i.test(s)) {
        expect(s.includes("\n"), s.slice(0, 80)).toBe(false);
        expect(s, s.slice(0, 80)).toMatch(/^create or replace/i);
      }
    }
  });

  it("has the leaderboard trigger as one statement each for its function and trigger, with no drop", () => {
    expect(statements.filter((s) => /^create or replace (function|trigger) users_leave_board_on_close/i.test(s))).toHaveLength(2);
    expect(statements.some((s) => /^drop trigger/i.test(s))).toBe(false);
  });

  it("creates every B1 table", () => {
    const tables = statements.map((s) => /^create table if not exists (\w+)/i.exec(s)?.[1]).filter(Boolean);
    for (const t of [
      "users", "sessions", "login_tokens", "zack_settings", "zack_settings_history", "seed_contributors", "runs",
      "pool_plays", "plays", "cora_weeks", "cora_user_weeks", "picks", "orders", "charge_attempts",
      "contribution_weeks", "pending_adjustments", "notifications", "admin_actions", "stripe_events",
      "rate_events", "testimonials", "free_runs", "setup_files",
    ]) expect(tables).toContain(t);
  });

  it("creates every B2 table, and never a second sessions table", () => {
    const tables = statements.map((s) => /^create table if not exists (\w+)/i.exec(s)?.[1]).filter(Boolean);
    for (const t of ["referrals", "credits", "points", "session_guests", "session_attendance", "sponsors", "sponsor_invoices", "email_suppressions"]) expect(tables).toContain(t);
    expect(tables.filter((t) => t === "sessions")).toHaveLength(1);
  });

  it("never creates the superseded lower(display_name) board index (only drops it), and adds the sponsor key NOT VALID", () => {
    expect(statements.some((s) => /^create unique index if not exists users_leaderboard_name(?!_key)/i.test(s))).toBe(false);
    expect(statements).toContain("drop index if exists users_leaderboard_name");
    const fk = statements.find((s) => s.includes("users_sponsor_id_fkey"));
    expect(fk).toMatch(/references sponsors \(id\) on delete restrict not valid;/);
  });
});

describe("seeds", () => {
  it("seeds the four testimonials from spec B.12, cleared", () => {
    const rows = JSON.parse(readFileSync(new URL("./seeds/testimonials.json", import.meta.url), "utf8"));
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.cleared).toBe(true);
      expect(r.attribution).toBe("Real estate, Toronto");
    }
  });

  it("gives the sample play fixture a category from the fixed list and every card field", () => {
    const p = JSON.parse(readFileSync(new URL("./seeds/sample-play.fixture.json", import.meta.url), "utf8"));
    expect(categories).toContain(p.category);
    for (const k of ["title", "description", "playbook_md", "paste_to_install", "first_seen"]) expect(p[k]).toBeTruthy();
    expect(p._note).toMatch(/MADE UP/);
  });
});
