import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { amountNames, getAmounts } from "@/lib/site/amounts";
import { shortened } from "@/lib/site/content/caption";
import { asRead, draftChanges, draftCount, linksInto, listChanges, pageStatus, sectionChanges, wordingOf } from "@/lib/site/content/check";
import { PAGES_ADDRESS, REVIEW_ADDRESS, destinationOptions, fieldAnchor, fieldLabel, listAnchor, listWords, pageBySlug, placesIn, sectionAnchor, sectionNotes, sectionsAnchor, toggleHint, wordsFor } from "@/lib/site/content/labels";
import { applyOverlay, baseline, layoutOn, listItems, readField, sameLayout, sectionLayout, textAt } from "@/lib/site/content/model";
import { fieldsOfItem, siteRegistry, type Field, type List } from "@/lib/site/content/registry";
import { readStored } from "@/lib/site/content/store";
import { amountPlaceholderNames, asPlaceholder } from "@/lib/site/content/text";
import { PageEditor, type EditorBlock, type EditorField, type EditorList, type EditorSection, type NameHint } from "../field-editor";
import { LaunchListLine } from "../launch-list";
import { Unreadable, count } from "../parts";
import { SectionControls, type SectionRow } from "../section-controls";

/**
 * One page's editing screen (plan U5, R6, R12): every text of the page, under
 * the page's sections in the order the page shows them, in one form with one
 * Save. What is shown is the DRAFT: what the last save stored, or the
 * original wording where nothing was saved.
 *
 * The form is a client component, which must not reach the registry or the
 * text rules, so everything it needs is worked out here and handed over:
 * labels, limits, the original wording, and what each name in braces shows.
 * An item of a list arrives as its place ("Question 3"); the form adds the
 * item's wording as it is typed (src/lib/site/content/caption.ts).
 *
 * THE PAGE'S SECTIONS (plan U6, R7). Above the words is one panel that lists
 * the page's sections in the order the draft has them, each with its switch
 * and its Move up and Move down. The words below follow the same order, and
 * a section that is switched off keeps its words on screen, marked as not on
 * the page. A page's title, and everything under Shared, is not in the panel:
 * it cannot be moved or switched off, and has no control to say so.
 *
 * THE PAGE'S LISTS (plan U7, R8). Where a section's words are a list (the
 * questions of a group, the hero's steps), its items are shown in the order
 * the DRAFT has them, the ones added here among them, each numbered by its
 * place there, with the list's controls around them (list-editor.tsx). An
 * item the draft has removed is not among the boxes: it is listed under the
 * list, with Put back.
 */
const BACK = "All pages";

/** The longest text that still gets a one-line box. Longer fields are lines or paragraphs of the page, and get room to be read. */
const ONE_LINE_MAX = 200;
/** The fewest and the most lines a multi-line box (a playbook) is drawn with. */
const BLOCK_ROWS_MIN = 8;
const BLOCK_ROWS_MAX = 28;

/**
 * What the owner should know about a list beyond its limits (plan U8): for the examples, which one /how-it-works
 * takes apart and that the plays are approved text; for the header's links, where the two buttons are.
 */
function listNote(listId: string): string | null {
  if (listId === "examples") {
    return "The plays are approved text: change them with care. Each text you change is marked “Changed from the original” and has its own reset, and “Put this list back to the original” brings back the three original examples in their order. The first example in this list is also the one the How it works page takes apart, under “The anatomy of an idea”, with a note beside each of its eight parts: move another example first, or change the first one’s playbook, and that page takes apart that one. If its playbook does not have those eight parts in that order, the page shows the notes in a list beside the whole playbook. With every example removed, the homepage has no examples section and How it works takes apart the first original example.";
  }
  if (listId === "nav") {
    return "Sign in and the start button are not in this list: their words are under Buttons, above. When the links do not fit in one row beside them on a laptop’s screen, the header shows them in its menu there too, so the header never runs off the screen.";
  }
  return null;
}

export default async function PageEditorScreen({ params }: PageProps<"/admin/pages/[page]">) {
  await connection();
  if (!(await isAdmin())) return null;
  const { page: slug } = await params;
  const page = pageBySlug(slug);
  if (!page) {
    return (
      <p className="text-small text-ink-2">
        There is no such page to edit.{" "}
        <Link href={PAGES_ADDRESS} className="tlink">
          {BACK}
        </Link>
      </p>
    );
  }

  let stored: Awaited<ReturnType<typeof readStored>>;
  try {
    stored = await readStored(query);
  } catch (error) {
    console.error("[pages] The stored site content could not be read.", error instanceof Error ? error.message : error);
    return <Unreadable />;
  }
  const amounts = await getAmounts();
  const today: Record<string, string> = amountNames(amounts);
  const waiting = draftChanges(stored);
  // Every field whose wording is a draft: a text that would change, and each text of an item that is new to the site.
  const waitingHere = new Set(waiting.filter((change) => change.field.page === page.id).map((change) => change.field.id));
  const moving = sectionChanges(stored);
  const movingHere = moving.filter((change) => change.page.id === page.id);
  const listing = listChanges(stored).filter((change) => change.page.id === page.id);
  const waitingAll = draftCount(stored);
  const waitingOnPage = pageStatus(stored).get(page.id)?.drafts ?? 0;
  // The page's words as the draft would print them: which items each list has, and in which order.
  const draftModel = applyOverlay(baseline, stored.draft);
  const places = placesIn(draftModel);
  const listsOf = (sectionId: string) => [...siteRegistry.lists.values()].filter((list) => list.page === page.id && list.section === sectionId);
  const hasLists = [...siteRegistry.lists.values()].some((list) => list.page === page.id);

  // The page's sections as the draft has them: the ones an admin may move in the draft's order, each fixed one where it is.
  const layout = layoutOn(stored.draft, page.id);
  const original = sectionLayout(baseline, page.id);
  const inOrder = [...layout.order];
  const ordered = page.sections.map((section) => {
    if (section.fixed) return section;
    const id = inOrder.shift();
    return page.sections.find((entry) => entry.id === id) ?? section;
  });
  const rows: SectionRow[] = ordered
    .filter((section) => !section.fixed)
    .map((section) => ({
      id: section.id,
      label: section.label,
      off: layout.off.includes(section.id),
      waiting: movingHere.some((change) => change.section.id === section.id),
      jump: section.fields.length > 0 || listsOf(section.id).length > 0 ? sectionAnchor(page.id, section.id) : null,
      notes: [...sectionNotes(page.id, section.id), ...linksInto(stored, page.id, section.id).map((link) => `The ${link} lands here.`)],
    }));

  // The sets of names in braces the page's fields may hold. Nearly every field holds the amounts; a caption holds its own two.
  const sets: (readonly string[])[] = [];
  const setOf = (allowed: readonly string[]) => {
    const at = sets.findIndex((set) => set.join(" ") === allowed.join(" "));
    return at === -1 ? sets.push(allowed) - 1 : at;
  };
  const hint = (name: string): NameHint => ({ name: asPlaceholder(name), shows: wordsFor(name) ?? "an amount from Settings", now: Object.hasOwn(today, name) ? today[name] : null });

  /** A playbook's box is as tall as its text, within reason: it is read and edited as a whole. */
  const rowsFor = (field: { kind: string; max: number }, value = "") =>
    field.kind === "block" ? Math.min(BLOCK_ROWS_MAX, Math.max(BLOCK_ROWS_MIN, value.split("\n").length + 1)) : field.max > 400 ? 6 : field.max > ONE_LINE_MAX ? 3 : 1;
  const options = destinationOptions();
  // The first example is the one /how-it-works takes apart, with a note for each part of its playbook (the last note is the install prompt's).
  const noteParts = draftModel.howItWorks.anatomy.notes.slice(0, -1).map((note) => note.part);
  const firstExample = places("examples")[0];
  const isPlaybook = (field: { item?: { array: string }; path: readonly string[] }) => field.item?.array === "examples" && field.path.at(-1) === "playbook";
  const boxFor = (field: Field): EditorField => {
    const original = textAt(baseline, field.id);
    const value = readField(draftModel, field) ?? wordingOf(stored.draft, field.id);
    return {
      id: field.id,
      anchor: fieldAnchor(field.id),
      name: field.name,
      kind: field.kind === "toggle" ? "toggle" : field.kind === "destination" ? "destination" : "text",
      hint: field.kind === "toggle" ? toggleHint(field) : null,
      rows: rowsFor(field, value),
      max: field.max,
      value,
      ...(field.kind === "destination" ? { options } : {}),
      ...(isPlaybook(field) ? { playbook: { pairs: field.item?.id === firstExample ? noteParts : null } } : {}),
      // A field of an item added here has no original, its tick box included: a new question is not "changed from
      // the original" because it is ticked, and unticking it is how it goes back.
      original: original ?? null,
      waiting: waitingHere.has(field.id),
      names: setOf(field.placeholders),
    };
  };
  /** A list as the draft has it: its items in the draft's order, each numbered by its place, and the original items the draft has removed. */
  const listFor = (list: List): EditorList => {
    const items = places(list.id);
    const original = listItems(baseline, list.id);
    const words = listWords(list);
    const changes = listing.filter((change) => change.list.id === list.id);
    const mark = (item: string) => {
      const kinds = changes.filter((change) => change.item === item).map((change) => change.kind);
      if (kinds.includes("added")) return "New: a draft, not published yet";
      if (kinds.includes("back")) return "Put back: a draft, not published yet";
      return kinds.includes("moved") ? "Moved: a draft, not published yet" : null;
    };
    /** A removed item by the wording the draft keeps for it, as a visitor would read it. */
    const wording = (item: string) => shortened(asRead(wordingOf(stored.draft, fieldsOfItem(list, item)[0]?.id ?? ""), amounts));
    return {
      id: list.id,
      anchor: listAnchor(list.id),
      title: words.title,
      one: words.one,
      many: words.many,
      limits: words.limits,
      canAdd: items.length < list.max,
      canRemove: items.length > list.min,
      fixed: list.min === list.max,
      items: items.map((item, i) => ({ key: item, title: `${list.item} ${i + 1}`, fields: fieldsOfItem(list, item).map(boxFor), added: !original.includes(item), waiting: mark(item) })),
      removed: original.filter((item) => !items.includes(item)).map((item) => ({ id: item, wording: wording(item), live: changes.some((change) => change.item === item && change.kind === "removed") })),
      note: listNote(list.id),
      fresh: list.fields.map((field) => ({
        name: field.name,
        label: field.label,
        kind: field.kind === "toggle" ? ("toggle" as const) : field.kind === "destination" ? ("destination" as const) : ("text" as const),
        rows: field.kind === "block" ? 12 : rowsFor(field),
        max: field.max,
        hint: field.kind === "toggle" ? toggleHint({ item: { array: list.id }, path: [field.name] }) : null,
        ...(field.kind === "destination" ? { options } : {}),
        // A new example joins at the foot: it is the first only in an empty list.
        ...(list.id === "examples" && field.name === "playbook" ? { playbook: { pairs: items.length === 0 ? noteParts : null } } : {}),
      })),
      changed: Object.hasOwn(stored.draft.lists, list.id),
      waiting: changes.length,
    };
  };

  const sections: EditorSection[] = ordered
    .filter((section) => section.fields.length > 0 || listsOf(section.id).length > 0)
    .map((section) => {
      const blocks: EditorBlock[] = [];
      const drawn = new Set<string>();
      for (const field of section.fields) {
        // A field of a list's item: the whole list is drawn once, where its first field is, as the draft has it.
        const list = field.item ? siteRegistry.lists.get(field.item.array) : undefined;
        if (list) {
          if (!drawn.has(list.id)) blocks.push({ kind: "list", list: listFor(list) });
          drawn.add(list.id);
          continue;
        }
        const label = fieldLabel(field);
        const open = blocks.at(-1);
        if (open?.kind === "fields" && open.group.title === label.group) open.group.fields.push(boxFor(field));
        else blocks.push({ kind: "fields", group: { key: field.id, title: label.group, fields: [boxFor(field)] } });
      }
      // A list with no built-in item left in the code has no field to stand for it, and may still hold added ones.
      for (const list of listsOf(section.id)) if (!drawn.has(list.id)) blocks.push({ kind: "list", list: listFor(list) });
      return { id: section.id, label: section.label, blocks, off: layout.off.includes(section.id), anchor: sectionAnchor(page.id, section.id) };
    });
  const names = sets.map((set) => set.map(hint));
  const amountHints = amountPlaceholderNames.map(hint);
  // The page as visitors see it. Shared has no page of its own.
  const live = page.id === "shared" ? null : page.path;

  return (
    <section className="max-w-[56rem] space-y-8">
      <header className="space-y-3">
        <p className="text-small">
          <Link href={PAGES_ADDRESS} className="tlink">
            <span aria-hidden="true">← </span>
            {BACK}
          </Link>
        </p>
        <h1 className="text-h3">{page.label}</h1>
        <p className="text-small text-ink-2">
          Change the words, then press Save draft at the foot of the screen.{hasLists ? " Where the words are a list, you can also move, remove and add its items." : ""} A draft is not on
          the site: visitors see it only after you publish.
          {live && (
            <>
              {" "}
              <a href={live} target="_blank" rel="noopener noreferrer" className="tlink">
                See the page as it is now (opens in a new tab)
              </a>
            </>
          )}
        </p>
        {waitingAll > 0 && (
          <p data-waiting className="text-small">
            {count(waitingAll, "change is", "changes are")} saved as a draft and not published yet{waitingOnPage === waitingAll ? "" : `, ${waitingOnPage} of them on this page`}.{" "}
            <Link href={REVIEW_ADDRESS} className="tlink">
              Review and publish
            </Link>
          </p>
        )}
        <LaunchListLine page={page.id === "shared" ? "these shared words on each page" : `the ${page.label} page`} />
      </header>

      {rows.length > 0 && (
        <SectionControls
          key={`sections-${page.id}`}
          page={page.id}
          headingId={sectionsAnchor(page.id)}
          rows={rows}
          rearranged={!sameLayout(layout, original)}
          // "Original" is the last release's. Where that already has a section off, "switch all back on" would not be true.
          resetLabel={original.off.length === 0 ? "Put the sections back in their original order and switch all back on" : "Put the sections back as they were originally"}
          waiting={movingHere.length}
          reviewAddress={REVIEW_ADDRESS}
        />
      )}

      {sections.length > 1 && (
        <nav aria-label="Words of this page, by section" className="text-small">
          <p className="text-meta font-[600] text-ink-2">Jump to</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.anchor}`} className="tlink inline-flex min-h-8 items-center">
                  {section.label}
                  {section.off ? " (switched off)" : ""}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <details data-amounts className="rounded-[8px] border border-rule bg-surface p-4 text-small">
        <summary className="cursor-pointer font-[600]">Prices and other amounts you can put in a text</summary>
        <p className="mt-2 text-ink-2">Type one of these names, with its braces, where the amount should appear. The site fills it in from Settings, so a price is changed in one place.</p>
        <ul className="mt-2 space-y-1">
          {amountHints.map((entry) => (
            <li key={entry.name}>
              <span className="font-mono">{entry.name}</span> shows {entry.shows}
              {entry.now ? ` (${entry.now} today)` : ""}.
            </li>
          ))}
        </ul>
      </details>

      {/* Keyed by the page: another page's typing never shows in this one's boxes. */}
      <PageEditor key={page.id} page={page.id} sections={sections} names={names} reviewAddress={REVIEW_ADDRESS} />
    </section>
  );
}
