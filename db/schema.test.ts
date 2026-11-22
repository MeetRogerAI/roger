import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories } from "../src/data/categories";
import { splitSchema } from "./schema-split.mjs";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const statements: string[] = splitSchema(schema);

describe("schema.sql", () => {
  it("splits into whole statements", () => {
    for (const s of statements) {
      expect(s, s.slice(0, 80)).toMatch(/^(create|alter|drop|insert|update)\b/i);
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
    }
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
