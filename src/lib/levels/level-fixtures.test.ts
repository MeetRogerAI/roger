import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { levelItems } from "@/data/roger-levels";
import { validateLevelBlock } from "@/lib/levels/contract";
import { blockForLevel, fixtureText, levelFixtures, scoreBuilt, type LevelFixture } from "@/test-helpers/level-fixtures";

const DIR = join(__dirname, "..", "..", "..", "tests", "fixtures", "roger-level", "levels");
const WRITE = process.env.WRITE_LEVEL_FIXTURES === "1";
const normalise = (s: string) => s.replace(/\r\n/g, "\n");

describe("level fixtures (B4 Unit 2)", () => {
  const fixtures = levelFixtures();
  const named = (n: string) => fixtures.find((f) => f.name === n) as LevelFixture;

  it("covers every level 0 to 9 and every boundary", () => {
    const names = fixtures.map((f) => f.name);
    for (let L = 0; L <= 9; L++) expect(names).toContain(`level-${L}`);
    for (let L = 1; L <= 9; L++) for (const kind of ["missing-core", "elective-short", "self-only-core"]) expect(names).toContain(`level-${L}-${kind}`);
    expect(names.filter((n) => n.endsWith("over-fallback-cap"))).toEqual([1, 2, 7, 8, 9].map((L) => `level-${L}-over-fallback-cap`));
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("%s is a valid contract v1 block and scores as labelled", (_n, f) => {
    expect(validateLevelBlock(JSON.stringify(f.block), f.receivedOn)).toMatchObject({ ok: true });
    expect(scoreBuilt({ block: f.block, roger: f.roger, receivedOn: f.receivedOn })).toEqual(f.expect);
    const L = Number(/^level-(\d)/.exec(f.name)?.[1]);
    expect(f.expect.level).toBe(f.name === `level-${L}` ? L : L - 1);
  });

  it("level-L has every core item of Levels 1 to L live, and the next level's core isn't all live", () => {
    for (let L = 0; L <= 9; L++) {
      const f = named(`level-${L}`);
      const core = (k: number) => levelItems.filter((i) => i.level === k && i.kind === "core").map((i) => i.id);
      for (let k = 1; k <= L; k++) for (const id of core(k)) expect(f.expect.live, `${f.name}: ${id}`).toContain(id);
      if (L < 9) expect(core(L + 1).every((id) => f.expect.live.includes(id)), f.name).toBe(false);
    }
  });

  it("missing-core leaves its named core item at 0", () => {
    for (let L = 1; L <= 9; L++) {
      const f = named(`level-${L}-missing-core`);
      const id = /core item (\S+):/.exec(f.description)?.[1] ?? "";
      expect(levelItems.find((i) => i.id === id)?.level, f.name).toBe(L);
      expect(f.expect.live, f.name).not.toContain(id);
    }
  });

  it("self-only-core: self-reports for every item of L leave L's Zack- and Roger-settled core items unearned", () => {
    for (let L = 1; L <= 9; L++) {
      const f = named(`level-${L}-self-only-core`);
      const items = levelItems.filter((i) => i.level === L);
      expect(items.every((i) => f.block.self_report.some((r) => r.item === i.id && r.answer === 1)), f.name).toBe(true);
      for (const i of items.filter((x) => x.kind === "core" && (x.status === "self" || x.status === "fallback"))) expect(f.expect.live, `${f.name}: ${i.id}`).toContain(i.id);
      const verified = items.filter((i) => i.kind === "core" && (i.status === "full" || i.status === "proxy"));
      expect(verified.some((i) => !f.expect.live.includes(i.id)), f.name).toBe(true);
    }
  });

  it("is deterministic: building twice gives the same blocks", () => {
    expect(JSON.stringify(levelFixtures())).toBe(JSON.stringify(fixtures));
    expect(blockForLevel(4)).toEqual(blockForLevel(4));
  });

  it("regenerating gives byte-identical checked-in files, with none left over", () => {
    if (WRITE) {
      mkdirSync(DIR, { recursive: true });
      for (const f of fixtures) writeFileSync(join(DIR, `${f.name}.json`), fixtureText(f));
    }
    expect(readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()).toEqual(fixtures.map((f) => `${f.name}.json`).sort());
    for (const f of fixtures) expect(normalise(readFileSync(join(DIR, `${f.name}.json`), "utf8")), f.name).toBe(fixtureText(f));
  });

  it("are named in the fixtures README", () => {
    const readme = readFileSync(join(DIR, "..", "README.md"), "utf8");
    for (const f of fixtures) expect(readme, f.name).toContain(`\`${f.name}\``);
  });
});
