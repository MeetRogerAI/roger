import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { amountNames, getAmounts } from "@/lib/site/amounts";
import { draftChanges, wordingOf } from "@/lib/site/content/check";
import { PAGES_ADDRESS, REVIEW_ADDRESS, fieldAnchor, fieldLabel, pageBySlug, wordsFor } from "@/lib/site/content/labels";
import { baseline, textAt } from "@/lib/site/content/model";
import { readStored } from "@/lib/site/content/store";
import { amountPlaceholderNames, asPlaceholder } from "@/lib/site/content/text";
import { PageEditor, type EditorField, type EditorSection, type NameHint } from "../field-editor";
import { LaunchListLine } from "../launch-list";
import { Unreadable, count } from "../parts";

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
 */
const BACK = "All pages";

/** The longest text that still gets a one-line box. Longer fields are lines or paragraphs of the page, and get room to be read. */
const ONE_LINE_MAX = 200;

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
  const waitingHere = new Set(waiting.filter((change) => change.field.page === page.id).map((change) => change.field.id));

  // The sets of names in braces the page's fields may hold. Nearly every field holds the amounts; a caption holds its own two.
  const sets: (readonly string[])[] = [];
  const setOf = (allowed: readonly string[]) => {
    const at = sets.findIndex((set) => set.join(" ") === allowed.join(" "));
    return at === -1 ? sets.push(allowed) - 1 : at;
  };
  const hint = (name: string): NameHint => ({ name: asPlaceholder(name), shows: wordsFor(name) ?? "an amount from Settings", now: Object.hasOwn(today, name) ? today[name] : null });

  const sections: EditorSection[] = page.sections
    .filter((section) => section.fields.length > 0)
    .map((section) => {
      const groups: EditorSection["groups"] = [];
      for (const field of section.fields) {
        const label = fieldLabel(field);
        const entry: EditorField = {
          id: field.id,
          anchor: fieldAnchor(field.id),
          name: label.name,
          rows: field.kind === "block" || field.max > 400 ? 6 : field.max > ONE_LINE_MAX ? 3 : 1,
          max: field.max,
          value: wordingOf(stored.draft, field.id),
          original: textAt(baseline, field.id) ?? "",
          waiting: waitingHere.has(field.id),
          names: setOf(field.placeholders),
        };
        const open = groups.at(-1);
        if (open && open.title === label.group) open.fields.push(entry);
        else groups.push({ title: label.group, fields: [entry] });
      }
      return { id: section.id, label: section.label, groups };
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
          Change the words, then press Save draft at the foot of the screen. A draft is not on the site: visitors see it only after you publish.
          {live && (
            <>
              {" "}
              <a href={live} target="_blank" rel="noopener noreferrer" className="tlink">
                See the page as it is now (opens in a new tab)
              </a>
            </>
          )}
        </p>
        {waiting.length > 0 && (
          <p data-waiting className="text-small">
            {count(waiting.length, "change is", "changes are")} saved as a draft and not published yet{waitingHere.size === waiting.length ? "" : `, ${waitingHere.size} of them on this page`}.{" "}
            <Link href={REVIEW_ADDRESS} className="tlink">
              Review and publish
            </Link>
          </p>
        )}
        <LaunchListLine page={page.id === "shared" ? "these shared words on each page" : `the ${page.label} page`} />
      </header>

      {sections.length > 1 && (
        <nav aria-label="Sections of this page" className="text-small">
          <p className="text-meta font-[600] text-ink-2">Jump to</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#section-${section.id}`} className="tlink inline-flex min-h-8 items-center">
                  {section.label}
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
