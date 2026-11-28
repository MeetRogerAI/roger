/**
 * The release overlay (plan KTD9, R19): what a site shows a visitor, as ONE
 * overlay on the code copy, ready to be written as src/data/site/released.json
 * of the next release. The public export (src/app/api/site-content/published)
 * answers with it, and the release snapshot (scripts/snapshot-content.mjs)
 * writes it into the repo.
 *
 * WHAT IS IN IT. The site's release file, with what the site has published on
 * top, resolved through the models and written against the code copy
 * (diffToOverlay), so it names only the fields, sections and lists the code
 * has today: an edit stored under an old name (`nav.pricing`, before the
 * header's links were lists) is in it under the names it is read by now
 * (`nav.pricing.label`, `footer.links.pricing.label`).
 *
 * WHAT IS NOT. Only what a visitor can already read is newly carried:
 *
 * - A field of a section the site has switched off shows nowhere, unless
 *   another section that is on prints it too (printedIn: the examples' copy
 *   button on How it works; the price's unit and tax notes, printed only by
 *   Home's Price). Its wording is what the site's own release file says, whatever the database holds, so
 *   hidden text is never made public by a release, and a wording released
 *   earlier is not lost either. A list in such a section is the release
 *   file's too, with its items and their wording, except the part another
 *   page still prints (shownElsewhere: How it works' first example).
 * - A field of a built-in item the site has removed from its list shows
 *   nowhere: it is the release file's wording for the item, if it has one. An
 *   item added in the admin and then removed is gone, wording and all.
 * - Drafts, the previous published content, who published and when: never.
 *   The overlay is handed what is published, nothing else.
 *
 * THE ANSWER IS CANONICAL: every object's keys in order, and no entry that
 * changes nothing. So the export of a site that has published nothing of its
 * own is its release file, byte for byte once written the same way, and a
 * release's commit shows only what changed.
 *
 * NOTHING STORED IS DROPPED WITHOUT A WORD. A page reads the site's stored
 * content leniently and leaves out what the code cannot read (plan R18). The
 * export is handed those entries (`lost`, from readPublishedForRelease) and
 * refuses, listing them, rather than release without them.
 *
 * IT IS HELD TO THE STRICT READING the release file is held to (plan KTD13).
 * A published wording longer than its field allows today (a header label
 * saved under an older, longer limit) still shows on the site, which reads
 * leniently, but cannot be released: the answer is then the list of what to
 * fix, in the owner's words, and no overlay.
 *
 * Pure: nothing here reads the database, the request or the clock.
 */
import { newOverlay, parseOverlay, parseOverlayStrict, type Overlay } from "./format";
import { fieldLabel, fieldPlace } from "./labels";
import { applyOverlay, baseline, codeModel, diffListEdit, diffToOverlay, layoutOn, listItems, readField, releasedOverlay } from "./model";
import { TOGGLE_OFF, fieldsOfItem, isAddedId, resolveField, siteRegistry, type Field, type Registry } from "./registry";
import { canonical } from "./store";

export type ReleaseExport = { ok: true; overlay: Overlay } | { ok: false; problems: string[] };

/**
 * Where a field is printed when that is not just its own section: in every section named here, and nowhere else.
 * Each is a place where a page prints a field of another section, or of Shared (src/components/site/v1/).
 */
const printedIn: Readonly<Record<string, readonly { page: string; section: string }[]>> = {
  // The examples' card's copy button, which How it works' anatomy also has (how-it-works.tsx).
  "sample.install.copy": [
    { page: "home", section: "examples" },
    { page: "howItWorks", section: "anatomy" },
  ],
  // A price's unit and tax notes: words of Shared that only the price block prints, in Home's Price (price-block.tsx).
  "price.perMonth": [{ page: "home", section: "price" }],
  "price.tax.USD": [{ page: "home", section: "price" }],
  "price.tax.CAD": [{ page: "home", section: "price" }],
  // The line under the prices: the price block's, and Use cases' closing band's (closing-band.tsx, closingBandCopy).
  trialLine: [
    { page: "home", section: "price" },
    { page: "library", section: "band" },
  ],
};

/**
 * True when no page prints a field under `own`, a site's published overlay on `base`: every section it is printed in
 * (its own, or those printedIn names) is switched off. A field of Shared otherwise always shows: Shared's sections
 * cannot be switched off. Whether the field's ITEM is shown is not asked here.
 */
export function fieldHidden(own: Overlay, field: Field, base: unknown = baseline, registry: Registry = siteRegistry): boolean {
  const hosts = Object.hasOwn(printedIn, field.id) ? printedIn[field.id] : [{ page: field.page, section: field.section }];
  return hosts.every((host) => layoutOn(own, host.page, base, registry).off.includes(host.section));
}

/**
 * A list another page prints part of, whatever its own section shows: How it works takes apart the FIRST of the
 * homepage's examples (src/components/site/v1/how-it-works.tsx), so with the homepage's examples switched off that
 * example is still on a page, and is released as the site shows it (with its short title, which only the homepage's
 * tabs print). With How it works' anatomy off too, the list is on no page.
 */
const shownElsewhere: Readonly<Record<string, { page: string; section: string }>> = { examples: { page: "howItWorks", section: "anatomy" } };

/** An overlay with every object's keys in order, as it is written to the release file. */
export const canonicalOverlay = (overlay: Overlay): Overlay => JSON.parse(canonical(overlay)) as Overlay;

/**
 * The release overlay of a site: `published` is what the site has published, an overlay on its baseline (as the
 * reader gives it: readPublishedForRelease); `released` is the site's own release file and `code` the code copy, both
 * left to the build's own unless a test hands others. `lost` is what the site stores and cannot read; any of it, and
 * the answer is the list of it, in words, and no overlay.
 */
export function releaseExport(published: Overlay, o: { released?: Overlay; code?: unknown; registry?: Registry; lost?: readonly string[] } = {}): ReleaseExport {
  const registry = o.registry ?? siteRegistry;
  const code = o.code ?? codeModel;
  const released = parseOverlay(o.released ?? releasedOverlay, registry);
  const base = applyOverlay(code, released, registry);
  const own = parseOverlay(published, registry);
  const shown = applyOverlay(base, own, registry);
  const out = { ...newOverlay(), ...diffToOverlay(code, shown, registry) };

  /** True for a section the site does not show: switched off in what it has published. */
  const hidden = (pageId: string, sectionId: string) => layoutOn(own, pageId, base, registry).off.includes(sectionId);
  const setText = (field: Field, text: string | undefined, below: string | undefined) => {
    if (text === undefined || text === below) delete out.text[field.id];
    else out.text[field.id] = text;
  };

  // A list in a section that is not shown: the release file's, items and wording. What the site has done to it is on no page,
  // except where another page shows part of the list (shownElsewhere): that part is the site's, as the other page shows it.
  for (const list of registry.lists.values()) {
    if (!hidden(list.page, list.section)) continue;
    const onSite = listItems(shown, list.id, registry);
    for (const item of onSite) for (const field of fieldsOfItem(list, item, registry)) delete out.text[field.id];
    let items = listItems(base, list.id, registry);
    const elsewhere = Object.hasOwn(shownElsewhere, list.id) && !hidden(shownElsewhere[list.id].page, shownElsewhere[list.id].section) ? shownElsewhere[list.id] : undefined;
    const visible = elsewhere ? onSite[0] : undefined;
    // The other page shows the list's first item, or, with none, something of its own: so the release's list starts with the
    // site's first item, or is as empty as the site's.
    if (elsewhere) items = visible === undefined ? [] : [visible, ...items.filter((item) => item !== visible)].slice(0, list.max);
    const edit = diffListEdit(listItems(code, list.id, registry), items);
    if (edit) out.lists[list.id] = edit;
    else delete out.lists[list.id];
    for (const item of items) {
      for (const field of fieldsOfItem(list, item, registry)) {
        const below = isAddedId(item) ? (field.toggle ? TOGGLE_OFF : undefined) : readField(code, field);
        setText(field, readField(item === visible ? shown : base, field), below);
      }
    }
  }

  // Every other field that shows nowhere: one of a section that is off, or of a built-in item the site has removed.
  for (const field of registry.fields.values()) {
    const list = field.item ? registry.lists.get(field.item.array) : undefined;
    if (list && hidden(list.page, list.section)) continue;
    const gone = field.item !== undefined && list !== undefined && !listItems(shown, list.id, registry).includes(field.item.id);
    if (gone) {
      // The release file's wording for it, when it has one: what was released stays released.
      if (Object.hasOwn(released.text, field.id)) out.text[field.id] = released.text[field.id];
      else delete out.text[field.id];
    } else if (fieldHidden(own, field, base, registry)) setText(field, readField(base, field), readField(code, field));
  }

  const overlay = canonicalOverlay(out);
  const strict = parseOverlayStrict(overlay, registry);
  // What the site stores and cannot read (lenientLosses) first: a release taken without it would lose it for good, without a word.
  const problems = [...(o.lost ?? []).map(lostInWords), ...(strict.ok ? [] : strict.problems.map((problem) => inWords(problem, registry)))];
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, overlay };
}

/** An entry the site stores and cannot read, with what to do about it. */
function lostInWords(problem: string): string {
  return `Stored as published on this site, and shown on no page because this site's code cannot read it: ${problem}. A release taken now would lose it for good. If it is wording that should be kept, the code must know that name again before the snapshot; if not, publish any change in Pages on this site (a publish stores what is published afresh, without it), then take the snapshot again.`;
}

/**
 * A problem of the strict reading, with the field it is about named as the owner finds it in Pages: "Shared,
 * Header: Link 1 · Label (nav.pricing.label): 30 characters, and the most is 24. …".
 */
function inWords(problem: string, registry: Registry): string {
  const match = /^text\.([^:]+): (.*)$/.exec(problem);
  const field = match ? resolveField(match[1], registry) : undefined;
  if (!match || !field) return problem;
  const place = fieldPlace(field, registry);
  const fix = /characters, and the most is/.test(match[2]) ? " Shorten it in Pages on this site and publish, then take the snapshot again." : "";
  return `${place.page}, ${place.section}: ${fieldLabel(field, registry).full} (${field.id}): ${match[2]}.${fix}`;
}

