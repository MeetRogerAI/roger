/**
 * A small copy and its spec, for the tests of src/lib/site/content. It has
 * what the site's own copy does not have yet: a field that keeps its line
 * breaks and a link's address. And it is small enough to change in a test,
 * which is how "the code changed later" is told.
 */
import { buildRegistry, type RegistrySpec } from "@/lib/site/content/registry";

export const fixtureCopy = {
  title: "Roger at {monthlyUsd}",
  note: { body: "First line.\nSecond line." },
  link: { label: "Questions", href: "/faq" },
  heard: "A name only a screen reader hears",
  steps: [
    { id: "one", text: "Step one" },
    { id: "two", text: "Step two" },
    { id: "three", text: "Step three" },
  ],
  tags: ["a", "b"],
  count: 3,
};

export type FixtureCopy = typeof fixtureCopy;

export const fixtureSpec: RegistrySpec = {
  pages: [
    {
      id: "page",
      label: "Page",
      path: "/page",
      sections: [
        { id: "head", label: "Title", fixed: true, fields: { title: { label: "Title", max: 40 } } },
        {
          id: "body",
          label: "Body",
          zones: ["sample"],
          fields: {
            "note.body": { label: "Note", max: 100, kind: "block" },
            "link.label": { label: "Link", max: 20, placeholders: [], zones: [] },
            "link.href": { label: "Address", max: 500, kind: "destination" },
          },
        },
        { id: "steps", label: "Steps", fields: { "steps.*.text": { label: "Text", max: 50 } } },
        { id: "band", label: "Band" },
      ],
    },
  ],
  arrays: { steps: { item: "Step", list: "Steps" } },
  notEditable: { heard: "A name only a screen reader hears.", tags: "Not text an admin edits." },
};

export const fixtureRegistry = buildRegistry(fixtureCopy, fixtureSpec);
