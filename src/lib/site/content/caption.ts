/**
 * How the Pages screens say WHICH item of a list a field belongs to: by its
 * place and by its current wording, so the owner never has to count.
 *
 *   Question 3 — “What do I have to do each week?” · Answer
 *
 * The place alone ("Question 3") says nothing to someone looking at the page,
 * and the wording alone moves when it is edited. Together they do.
 *
 * Pure and with no imports, so the editing screen's client component can use
 * it on what is being typed (it must not reach the registry: ./labels.ts).
 */

/** The most characters of an item's wording a label shows. */
export const CAPTION_MAX = 60;

/** A text on one line and no longer than `max` characters: cut at a whole word where there is one, with "…" for what was left out. */
export function shortened(text: string, max: number = CAPTION_MAX): string {
  // By code point, so that a cut never leaves half of a character.
  const line = [...text.replace(/\s+/g, " ").trim()];
  if (line.length <= max) return line.join("");
  const cut = line.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  // One long unbroken word has no place to cut but the limit itself.
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?…–—-]+$/, "")}…`;
}

/** An item by its place and its wording: "Question 3 — “What do I have to do each week?”". The place alone when it has no wording. */
export function itemTitle(place: string, wording: string): string {
  const words = shortened(wording);
  return words === "" ? place : `${place} — “${words}”`;
}

/** A field's whole name: its item (when it belongs to one), then what the field is. */
export function fullName(place: string | null, wording: string, name: string): string {
  return place === null ? name : `${itemTitle(place, wording)} · ${name}`;
}
