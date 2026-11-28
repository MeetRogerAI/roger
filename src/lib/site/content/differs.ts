/**
 * "Differs from the release" (plan U10, R21, AE10): everything a site has
 * published of its own, on top of the release it runs. The release is the
 * baseline (plan KTD1): the code copy with src/data/site/released.json on it.
 *
 * A site's published content is stored as an overlay on the baseline, and an
 * entry equal to the baseline is no edit (plan KTD6). So after a release that
 * carried a site's edit, the entry stops differing and is not listed: on
 * preview, whose published content the release was taken from, the list is
 * empty; on production it is exactly the edits made there since, or kept from
 * before.
 *
 * It is told the way the review tells a publish (./check.ts), from the release
 * to the site: draftChanges, sectionChanges and listChanges, handed what is
 * published as the "draft" and nothing as what "the site shows now".
 *
 * Three things a release does to a site's own edits are said beside the list,
 * because each would otherwise happen without a word:
 *
 * - pushedOut: an item the site added to a list that the release has filled.
 *   A list never shows more items than its page can draw, so the site's item
 *   is not shown, and the next save on the site deletes it.
 * - releaseRemoved: an item the release takes out of a list. A site's Pages
 *   can only put back what the release has, so no site can bring it back.
 * - wholeOrder: a page whose sections the site has moved. Its entry names every
 *   section of the page, on or off, so it does not follow a release that
 *   switches a section off: that section stays on here.
 *
 * Pure. Nothing here reads the database.
 */
import { draftChanges, listChanges, sectionChanges, type Change } from "./check";
import { emptyOverlay, newOverlay, parseOverlay, type Overlay } from "./format";
import { fieldHidden } from "./export";
import { applyOverlay, baseline, codeModel, layoutOn, listItems, readField, releasedOverlay } from "./model";
import { fieldsOfItem, isAddedId, siteRegistry, type Field, type List, type Page, type Registry, type Section } from "./registry";

export type SectionDifference = { page: Page; section: Section; kind: "off" | "on" | "moved"; says: string };
export type ListDifference = { page: Page; section: Section; list: List; item: string; kind: "added" | "removed" | "moved" | "back"; says: string; fields: { field: Field; text: string }[] };
export type PushedOut = { page: Page; section: Section; list: List; item: string; fields: { field: Field; text: string }[] };
export type ReleaseRemoved = { page: Page; section: Section; list: List; items: { id: string; text: string }[] };

export type ReleaseDifferences = {
  /** Each field whose wording (or tick box) the site shows otherwise than the release: `from` is the release's, `to` the site's. */
  texts: Change[];
  sections: SectionDifference[];
  lists: ListDifference[];
  /** How many rows the list has: texts, sections and lists. */
  count: number;
  pushedOut: PushedOut[];
  releaseRemoved: ReleaseRemoved[];
  /** The pages whose sections the site has moved, so that it names all of them (see above). */
  wholeOrder: Page[];
  /**
   * What no visitor reads on this site, whoever switched its section off (the site or the release): the sections that
   * are off, as "<page>.<section>", and the ids of the fields among `texts` that no page prints (fieldHidden). Such a
   * difference is an edit made before its section went off, or one a release did not carry because the section was off
   * on preview (plan KTD9). The list says so beside it.
   */
  hidden: { sections: string[]; fields: string[] };
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What a site's published content changes in the release. `published` is an overlay on `base` (readStored);
 * `written` is the draft and the published content as stored, read leniently and not held against the baseline
 * (readStoredAsWritten), for the items a release pushed out. `released` is the release file `base` was made with.
 * `read` turns a text into what a visitor reads (amounts filled in).
 */
export function releaseDifferences(
  published: Overlay,
  o: { written?: { draft: Overlay; published: Overlay }; base?: unknown; released?: Overlay; code?: unknown; registry?: Registry; read?: (text: string) => string } = {},
): ReleaseDifferences {
  const registry = o.registry ?? siteRegistry;
  const base = o.base ?? baseline;
  const code = o.code ?? codeModel;
  const released = o.released ?? releasedOverlay;
  const read = o.read ?? ((text: string) => text);
  const content = { draft: published, published: newOverlay() };

  const texts = draftChanges(content, base, registry).filter((change) => !change.fresh);
  const sections: SectionDifference[] = sectionChanges(content, base, registry).map((change) => {
    const name = `“${change.section.label}”`;
    const says =
      change.kind === "off"
        ? `${name} is switched off on this site. The release shows it.`
        : change.kind === "on"
          ? `${name} is shown on this site. The release has it switched off.`
          : `${change.says.slice(change.page.label.length + 2).replace(" moves up,", " is moved up on this site,").replace(" moves down,", " is moved down on this site,")}`;
    return { page: change.page, section: change.section, kind: change.kind, says };
  });
  const lists: ListDifference[] = listChanges(content, base, registry, read).map((change) => {
    const rest = change.says.slice(`${change.page.label}, ${change.section.label}: `.length);
    const says = capital(rest.replace(" is removed.", " is removed on this site.").replace(" is added, as", " is added on this site, as").replace(" is put back, as", " is put back on this site, as").replace(" moves up,", " is moved up on this site,").replace(" moves down,", " is moved down on this site,"));
    return { page: change.page, section: change.section, list: change.list, item: change.item, kind: change.kind, says: `${change.section.label}: ${says}`, fields: change.fields };
  });

  const pushedOut: PushedOut[] = [];
  for (const overlay of o.written ? [o.written.published, o.written.draft] : []) {
    const read = parseOverlay(overlay, registry);
    const model = applyOverlay(base, read, registry);
    for (const [listId, edit] of Object.entries(read.lists)) {
      const list = registry.lists.get(listId)!;
      const shown = listItems(model, listId, registry);
      const below = listItems(base, listId, registry);
      for (const item of edit.added) {
        if (!isAddedId(item) || shown.includes(item) || below.includes(item) || pushedOut.some((entry) => entry.list.id === listId && entry.item === item)) continue;
        const fields = fieldsOfItem(list, item, registry).filter((field) => !field.toggle);
        // An item that is missing one of its texts was never shown at all: nothing a release did.
        if (!fields.every((field) => Object.hasOwn(read.text, field.id))) continue;
        const where = placeOf(list, registry);
        pushedOut.push({ ...where, list, item, fields: fields.map((field) => ({ field, text: read.text[field.id] })) });
      }
    }
  }

  const releaseRemoved: ReleaseRemoved[] = [];
  for (const [listId, edit] of Object.entries(parseOverlay(released, registry).lists)) {
    const list = registry.lists.get(listId)!;
    const inCode = listItems(code, listId, registry);
    const items = edit.removed.filter((item) => inCode.includes(item)).map((id) => ({ id, text: read(readField(code, fieldsOfItem(list, id, registry)[0]) ?? "") }));
    if (items.length > 0) releaseRemoved.push({ ...placeOf(list, registry), list, items });
  }

  // A page's entry names every section only when the site has MOVED one (diffSectionEdit). An entry that only switches
  // back on what the baseline has off names those sections alone, and follows a release for every other one.
  const wholeOrder = registry.pages.filter((page) => {
    if (!Object.hasOwn(published.sections, page.id)) return false;
    const offBelow = layoutOn(emptyOverlay, page.id, base, registry).off;
    return published.sections[page.id].order.some((id) => !offBelow.includes(id));
  });

  const hidden = {
    sections: registry.pages.flatMap((page) => layoutOn(published, page.id, base, registry).off.map((section) => `${page.id}.${section}`)),
    fields: texts.filter((change) => fieldHidden(published, change.field, base, registry)).map((change) => change.field.id),
  };

  return { texts, sections, lists, count: texts.length + sections.length + lists.length, pushedOut, releaseRemoved, wholeOrder, hidden };
}

function placeOf(list: List, registry: Registry): { page: Page; section: Section } {
  const page = registry.pages.find((entry) => entry.id === list.page)!;
  return { page, section: page.sections.find((entry) => entry.id === list.section)! };
}
