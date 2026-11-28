import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeldIdeas } from "./held-ideas";

/** Plan 2026-11-26-001, Unit 3: a held list on /app, titles only (origin R8). */
describe("HeldIdeas", () => {
  const html = renderToStaticMarkup(<HeldIdeas titles={["Inbox triage", "Listing post", "Calendar prep"]} />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("shows one locked card per title", () => {
    expect(html.match(/<li /g)).toHaveLength(3);
    for (const t of ["Inbox triage", "Listing post", "Calendar prep"]) expect(text).toContain(t);
  });

  it("links to the Payment page with 'Add your card to see them'", () => {
    expect(html).toMatch(/<a[^>]*href="\/start\/payment"[^>]*>Add your card to see them<\/a>/);
  });

  it("has no idea buttons or sheets", () => {
    expect(html).not.toContain("Open and install");
    expect(html).not.toContain("<dialog");
  });
});
