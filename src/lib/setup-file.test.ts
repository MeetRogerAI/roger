import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SetupStep, versionLine } from "@/components/app/setup-step";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { checkVersion, listVersions, publishVersion, readPublished, readVersion, restoreVersion, saveVersion } from "./setup-file";

let q: Query;
beforeEach(async () => {
  ({ query: q } = await testDb());
});

const save = (bodyMd: string, note = "first draft") => saveVersion(q, { bodyMd, note, savedBy: "peter@example.com" });

describe("the setup file", () => {
  it("saving twice creates versions 1 and 2, and neither overwrites the other (spec check 33)", async () => {
    expect(await save("one")).toBe(1);
    expect(await save("two", "second")).toBe(2);
    expect((await readVersion(q, 1))?.bodyMd).toBe("one");
    expect((await readVersion(q, 2))).toMatchObject({ bodyMd: "two", note: "second", savedBy: "peter@example.com", published: false });
    expect((await listVersions(q)).map((v) => v.version)).toEqual([2, 1]);
  });

  it("two saves at once each get their own number", async () => {
    const got = await Promise.all([save("a"), save("b"), save("c")]);
    expect([...got].sort()).toEqual([1, 2, 3]);
  });

  it("refuses an empty file or a missing note", async () => {
    expect(checkVersion("  ", "x")).toBe("empty");
    expect(checkVersion("text", " ")).toBe("no_note");
    await expect(save("text", "")).rejects.toThrow();
    expect(await listVersions(q)).toEqual([]);
  });

  it("publishing version 2 makes it the one the public page reads, with its number and date", async () => {
    await save("one");
    await save("two");
    expect(await readPublished(q)).toBeNull();
    expect(await publishVersion(q, 1)).toBe(true);
    expect((await readPublished(q))?.version).toBe(1);
    expect(await publishVersion(q, 2)).toBe(true);
    const live = await readPublished(q);
    expect(live).toMatchObject({ version: 2, bodyMd: "two" });
    expect(live!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(versionLine(live!)).toMatch(/^Version 2, updated [A-Z][a-z]+ \d{1,2}, \d{4}\.$/);
    expect((await listVersions(q)).filter((v) => v.published).map((v) => v.version)).toEqual([2]);
    // Publishing the live one again, or one that doesn't exist, changes nothing.
    expect(await publishVersion(q, 2)).toBe(true);
    expect(await publishVersion(q, 9)).toBe(false);
    expect((await readPublished(q))?.version).toBe(2);
  });

  it("restoring version 1 creates version 3 with version 1's text, unpublished", async () => {
    await save("one");
    await save("two");
    await publishVersion(q, 2);
    expect(await restoreVersion(q, 1, "ehab@example.com")).toBe(3);
    expect(await readVersion(q, 3)).toMatchObject({ bodyMd: "one", note: "Restored from version 1", savedBy: "ehab@example.com", published: false });
    expect((await readPublished(q))?.version).toBe(2);
    expect(await restoreVersion(q, 7, "x")).toBeNull();
  });

  it("with nothing published the page has no setup block, and no error", () => {
    expect(renderToStaticMarkup(createElement("ol", null, createElement(SetupStep, { file: null })))).toBe("<ol></ol>");
    const html = renderToStaticMarkup(createElement("ol", null, createElement(SetupStep, { file: { version: 4, bodyMd: "# Team", updatedAt: "2026-11-23T15:00:00Z" } })));
    expect(html).toContain("# Team");
    expect(html).toContain("Version 4, updated November 23, 2026.");
  });
});
