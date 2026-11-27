import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { asRead, draftChanges, linkWarnings, listChanges, namesFilled, reviewKey, sectionChanges, wordingWarnings } from "@/lib/site/content/check";
import { PAGES_ADDRESS, editorAddress, fieldAnchor, fieldLabelWith, fieldPlace, listAnchor, placesIn, sectionsAnchor } from "@/lib/site/content/labels";
import { applyOverlay, baseline, readField } from "@/lib/site/content/model";
import { TOGGLE_ON, resolveField, siteRegistry } from "@/lib/site/content/registry";
import { readStored } from "@/lib/site/content/store";
import { Unreadable, count } from "../parts";
import { PublishButton, UndoPublish } from "../publish-controls";

/**
 * Review and publish (plan U5, R15, R16, KTD11): everything a publish would
 * change, each wording rule the drafts break with the rule and the words,
 * and the one button that makes all of it live.
 *
 * Publishing is for the whole site, never one page: the screen says so where
 * the button is. A warning does not block. The button then reads "Publish
 * anyway", and each warning published over is written to the admin log.
 *
 * The button carries a fingerprint of this list. The server publishes only
 * when the drafts, the site and the warnings are still the ones shown here.
 *
 * A PAGE'S SECTIONS (plan U6, R7, R17). A section switched off or on, or
 * moved, is listed with the page's other changes as one plain sentence, and
 * counts as one change. Where a link of the site would then point at a
 * section that is switched off, a second kind of warning says which link.
 * It does not block either, and is not an override of a wording rule, so it
 * is not written to the log.
 *
 * A LIST'S ITEMS (plan U7, R8). An item added, removed, put back or moved is
 * one plain sentence and one change too: "FAQ, Getting started: a new
 * question “…” is added, as number 3 of 6." A new item's texts are shown
 * under its sentence, and are read by the wording rules like any text that
 * is new to the site. The texts of a removed item are not listed: they are
 * on no page.
 *
 * EVERY TEXT IS SHOWN AS A VISITOR WILL READ IT: a name in braces is replaced
 * by its amount ("US$200", never "{monthlyUsd}"), and a line under the text
 * says which name stands there, since the name is what the editor holds. An
 * item of a list is named by its place and its wording, "Question 3 — “What
 * do I have to do each week?” · Answer", so nobody has to count.
 */
/** A long word with no space in it (an address, a paste gone wrong) breaks where the box ends and never widens the page. */
const wrap = "[overflow-wrap:anywhere]";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default async function ReviewScreen() {
  await connection();
  if (!(await isAdmin())) return null;
  let stored: Awaited<ReturnType<typeof readStored>>;
  try {
    stored = await readStored(query);
  } catch (error) {
    console.error("[pages] The stored site content could not be read.", error instanceof Error ? error.message : error);
    return <Unreadable />;
  }
  const amounts = await getAmounts();
  // Every wording that is new to the site is read by the rules: a text that changes, and each text of an item the
  // draft adds to a list or puts back. Only the first kind is a row of its own; the second is told with its item.
  const checked = draftChanges(stored);
  const warnings = wordingWarnings(checked, amounts);
  const changes = checked.filter((change) => !change.fresh);
  // A tick box is not a text: the heading counts the two apart.
  const ticks = changes.filter((change) => change.field.kind === "toggle").length;
  const texts = changes.length - ticks;
  // The page's words as the draft would print them: an item is numbered by its place there, and named by its wording there.
  const draftModel = applyOverlay(baseline, stored.draft);
  const places = placesIn(draftModel);
  /** A field's name, with its item's draft wording as a visitor reads it. */
  const named = (field: Parameters<typeof fieldLabelWith>[0]) =>
    fieldLabelWith(
      field,
      (id) => {
        const caption = resolveField(id);
        return asRead((caption && readField(draftModel, caption)) ?? "", amounts);
      },
      siteRegistry,
      places,
    );
  const moves = sectionChanges(stored);
  const lists = listChanges(stored, baseline, siteRegistry, (text) => asRead(text, amounts));
  const links = linkWarnings(stored);
  const total = changes.length + moves.length + lists.length;
  const pages = siteRegistry.pages.filter((page) => changes.some((change) => change.field.page === page.id) || moves.some((change) => change.page.id === page.id) || lists.some((change) => change.page.id === page.id));
  /** A switch as words: what it is, on or off. */
  const switched = (text: string) => (text === TOGGLE_ON ? "On" : "Off");
  const where = (fieldId: string, pageId: string) => `${editorAddress(pageId)}#${fieldAnchor(fieldId)}`;

  return (
    <section className="max-w-[56rem] space-y-8">
      <header className="space-y-3">
        <p className="text-small">
          <Link href={PAGES_ADDRESS} className="tlink">
            <span aria-hidden="true">← </span>All pages
          </Link>
        </p>
        <h1 className="text-h3">Review and publish</h1>
        <p className="text-small text-ink-2">Read what will change. Nothing here is on the site until you press the publish button at the foot of this screen.</p>
      </header>

      {total === 0 ? (
        <p data-nothing className="text-small">
          Nothing is waiting to be published. Everything you have saved is on the site.
        </p>
      ) : (
        <div data-changes>
          <h2 className="text-title">
            What will change:{" "}
            {[texts > 0 ? count(texts, "text", "texts") : "", ticks > 0 ? count(ticks, "tick box", "tick boxes") : "", moves.length > 0 ? count(moves.length, "change to sections", "changes to sections") : "", lists.length > 0 ? count(lists.length, "change to lists", "changes to lists") : ""]
              .filter(Boolean)
              .join(", ")
              .replace(/, ([^,]*)$/, " and $1")}
          </h2>
          <div className="mt-4 space-y-6">
            {pages.map((page) => (
              <div key={page.id}>
                <h3 className="text-small font-[620]">{page.label}</h3>
                <ul className="mt-2 space-y-3">
                  {moves
                    .filter((change) => change.page.id === page.id)
                    .map((change) => (
                      <li key={`${change.kind}:${change.section.id}`} data-section-change={change.kind} className="min-w-0 rounded-[8px] border border-rule bg-surface p-4">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small">
                          <span data-says className={`min-w-0 font-[600] ${wrap}`}>
                            {change.says}
                          </span>
                          <Link href={`${editorAddress(page.id)}#${sectionsAnchor(page.id)}`} className="tlink">
                            Edit<span className="sr-only">: the sections of {page.label}</span>
                          </Link>
                        </p>
                      </li>
                    ))}
                  {lists
                    .filter((change) => change.page.id === page.id)
                    .map((change) => (
                      <li key={`${change.list.id}:${change.kind}:${change.item}`} data-list-change={change.kind} className="min-w-0 rounded-[8px] border border-rule bg-surface p-4">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small">
                          <span data-says className={`min-w-0 font-[600] ${wrap}`}>
                            {change.says}
                          </span>
                          <Link href={`${editorAddress(page.id)}#${listAnchor(change.list.id)}`} className="tlink">
                            Edit<span className="sr-only">: this list on {page.label}</span>
                          </Link>
                        </p>
                        {/* What a new item, or one put back, will say: each of its texts as a visitor reads it. */}
                        {change.fields.length > 0 && (
                          <dl className="mt-2 space-y-2 text-small">
                            {change.fields.map(({ field, text }) => (
                              <div key={field.id}>
                                <dt className="text-meta font-[600] text-ink-2">{field.name}</dt>
                                <dd data-new-text className={`whitespace-pre-wrap ${wrap}`}>
                                  {field.kind === "toggle" ? switched(text) : asRead(text, amounts)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </li>
                    ))}
                  {changes
                    .filter((change) => change.field.page === page.id)
                    .map((change) => {
                      const label = named(change.field).full;
                      const toggle = change.field.kind === "toggle";
                      const filled = toggle ? [] : namesFilled(change.to, amounts);
                      return (
                        <li key={change.field.id} data-change className="min-w-0 rounded-[8px] border border-rule bg-surface p-4">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small">
                            <span data-label className={`min-w-0 font-[600] ${wrap}`}>
                              {fieldPlace(change.field).section}: {label}
                            </span>
                            <Link href={where(change.field.id, page.id)} className="tlink">
                              Edit<span className="sr-only">: {label}</span>
                            </Link>
                          </p>
                          <dl className="mt-2 space-y-2 text-small">
                            <div>
                              <dt className="text-meta font-[600] text-ink-2">On the site now</dt>
                              <dd data-from className={`whitespace-pre-wrap text-ink-2 ${wrap}`}>
                                {toggle ? switched(change.from) : asRead(change.from, amounts)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-meta font-[600] text-ink-2">After publishing{change.toOriginal ? (toggle ? " (back to the original)" : " (back to the original wording)") : ""}</dt>
                              <dd data-to className={`whitespace-pre-wrap ${wrap}`}>
                                {toggle ? switched(change.to) : asRead(change.to, amounts)}
                              </dd>
                              {filled.length > 0 && (
                                <dd data-filled className={`mt-1 text-meta text-ink-2 ${wrap}`}>
                                  {filled.map((entry, i) => (
                                    <span key={entry.name}>
                                      {i > 0 ? " " : ""}“{entry.shows}” is {entry.fromSettings ? "today’s amount from Settings" : "the number of the last picture"}, typed in the text as <span className="font-mono">{entry.name}</span>.
                                    </span>
                                  ))}
                                </dd>
                              )}
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div data-warnings className="rounded-[8px] border border-error bg-surface p-5">
          <h2 className="text-title">Wording warnings: {warnings.length}</h2>
          <p className="mt-2 text-small text-ink-2">These texts break one of the site’s wording rules. You decide: change the text, or publish anyway. Publishing anyway is noted in the admin log.</p>
          <ul className="mt-4 space-y-4">
            {warnings.map((warning) => {
              const place = fieldPlace(warning.field);
              const label = named(warning.field).full;
              return (
                <li key={`${warning.field.id}:${warning.rule}`} data-warning={warning.rule} className={`min-w-0 text-small ${wrap}`}>
                  <p className="font-[600]">
                    {place.page}, {place.section}: {label}
                  </p>
                  <p className="mt-1">
                    <span className="text-meta font-[600] text-ink-2">The rule: </span>
                    {sentence(warning.says)}.
                  </p>
                  <p className="mt-1">
                    <span className="text-meta font-[600] text-ink-2">The words: </span>
                    {warning.found.map((found, i) => (
                      <span key={i} data-found>
                        {i > 0 ? "; " : ""}“{found.words}”, in “{found.around}”
                      </span>
                    ))}
                  </p>
                  <p className="mt-1">
                    <Link href={where(warning.field.id, warning.field.page)} className="tlink">
                      Change this text<span className="sr-only">: {label}</span>
                    </Link>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div data-link-warnings className="rounded-[8px] border border-error bg-surface p-5">
          <h2 className="text-title">Link warnings: {links.length}</h2>
          <p className="mt-2 text-small text-ink-2">
            {links.length === 1 ? "A link of the site points" : "Links of the site point"} at a section that is switched off. You decide: switch the section back on, or publish anyway. Nothing breaks: the link opens the page at its top.
          </p>
          <ul className="mt-4 space-y-4">
            {links.map((warning) => (
              <li key={warning.href} data-link-warning={warning.href} className={`min-w-0 text-small ${wrap}`}>
                <p>{warning.says}</p>
                <p className="mt-1">
                  <Link href={`${editorAddress(warning.page.id)}#${sectionsAnchor(warning.page.id)}`} className="tlink">
                    Go to the sections of {warning.page.label}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-publish-panel className="space-y-4 rounded-[8px] border border-rule-strong bg-surface p-5">
        <h2 className="text-title">Publish</h2>
        {total > 0 && (
          <p data-all className="text-small">
            <strong className="font-[620]">Publishing is for the whole site, not one page.</strong> It puts {total === 1 ? "the 1 change" : `all ${total} changes`} above on the site at once ({pages.map((page) => page.label).join(", ")}), for every visitor,
            within a few seconds. You can take it back afterwards with Undo last publish.
          </p>
        )}
        {/* Always rendered, so its message stays on screen once the list above is empty. */}
        <PublishButton review={reviewKey(stored, warnings)} count={total} warnings={warnings.length + links.length} />
      </div>

      <div className="space-y-3">
        <h2 className="text-title">Undo</h2>
        <p className="text-small text-ink-2">{stored.previous !== null ? "Undo last publish puts the site back to how it was before the last publish. Your drafts stay." : "There is no publish to undo right now."}</p>
        <UndoPublish available={stored.previous !== null} />
      </div>
    </section>
  );
}
