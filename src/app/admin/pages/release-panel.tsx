import Link from "next/link";
import type { Amounts } from "@/lib/site/amounts";
import { asRead, reviewKey } from "@/lib/site/content/check";
import type { ReleaseDifferences } from "@/lib/site/content/differs";
import type { Overlay } from "@/lib/site/content/format";
import { destinationName, editorAddress, fieldAnchor, fieldLabelWith, fieldPlace, listAnchor, listWords, placesIn, sectionsAnchor } from "@/lib/site/content/labels";
import { applyOverlay, baseline, readField } from "@/lib/site/content/model";
import { TOGGLE_ON, resolveField, siteRegistry, type Field } from "@/lib/site/content/registry";
import { count } from "./parts";
import { ResetToRelease } from "./publish-controls";

/**
 * "Differs from the release" on the Pages screen (plan U10, R21, AE10). Since November 28, 2026 (Peter) the Pages
 * screen shows it only on production, and only when something differs. Production is where it matters: after a release it lists each edit made there that the release did not bring, each with the release's
 * wording and the site's, and one action that resets all of them. On preview, whose published content the release
 * was taken from, it is empty once the release is out, apart from whatever was published there since.
 *
 * Beside the list it says what a release did to this site's own edits without a word: an added item a fuller list
 * pushed out (the next save deletes it), an item the release removed (no site can bring it back), and a page whose
 * moved sections keep a section on that the release switches off.
 */
const wrap = "[overflow-wrap:anywhere]";

export function ReleasePanel({ differences, stored, drafts, amounts }: { differences: ReleaseDifferences; stored: { draft: Overlay; published: Overlay }; drafts: number; amounts: Amounts }) {
  const { texts, sections, lists, pushedOut, releaseRemoved, wholeOrder, hidden } = differences;
  /**
   * A note for a difference no page shows on this site: without it, an edit nobody can see reads like one on the page.
   * `section` names the section that is off; null for words printed in other sections (a copy button, a price's unit).
   */
  const unseen = (off: boolean, section: string | null) =>
    off ? (
      <p data-release-hidden className="mt-2 text-small text-ink-2">
        {section
          ? `No visitor sees this: “${section}” is switched off on this site. It shows if the section is switched on again.`
          : "No visitor sees this: every section that shows it is switched off on this site. It shows if one of them is switched on again."}
      </p>
    ) : null;
  const ownSectionOff = (field: Field) => hidden.sections.includes(`${field.page}.${field.section}`);
  const model = applyOverlay(baseline, stored.published);
  const places = placesIn(model);
  const named = (field: Field) =>
    fieldLabelWith(
      field,
      (id) => {
        const caption = resolveField(id);
        return asRead((caption && readField(model, caption)) ?? "", amounts);
      },
      siteRegistry,
      places,
    );
  const shown = (field: Field, text: string) => {
    if (field.kind === "toggle") return text === TOGGLE_ON ? "On" : "Off";
    if (field.kind === "destination") {
      const name = destinationName(text);
      return name ? `${name} (${text})` : text;
    }
    return asRead(text, amounts);
  };
  const pages = siteRegistry.pages.filter((page) => texts.some((change) => change.field.page === page.id) || sections.some((change) => change.page.id === page.id) || lists.some((change) => change.page.id === page.id));
  const notes = pushedOut.length + releaseRemoved.length + wholeOrder.length;
  const box = "min-w-0 rounded-[8px] border border-rule bg-surface p-4";

  return (
    <div data-release-panel className="space-y-4 rounded-[8px] border border-rule bg-surface p-5">
      <h2 className="text-title">Differs from the release</h2>
      <p className="text-small text-ink-2">
        The release is the wording, sections and lists this site was last released with: what preview had published when the release was made. What this site has published on top of it is listed here. Each stays in force through later releases until it is reset. Nothing here is copied to preview: to keep an edit for the next release, make it on preview too.
      </p>

      {differences.count === 0 ? (
        <p data-release-none className="text-small">
          Nothing differs: this site shows the release as it is.
        </p>
      ) : (
        <div data-release-list className="space-y-6">
          <p className="text-small">
            <strong className="font-[620]">{count(differences.count, "difference", "differences")}</strong> from the release on this site.
          </p>
          {pages.map((page) => (
            <div key={page.id}>
              <h3 className="text-small font-[620]">{page.label}</h3>
              <ul className="mt-2 space-y-3">
                {sections
                  .filter((change) => change.page.id === page.id)
                  .map((change) => (
                    <li key={`section:${change.kind}:${change.section.id}`} data-release-section={change.kind} className={box}>
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
                    <li key={`list:${change.list.id}:${change.kind}:${change.item}`} data-release-list-change={change.kind} className={box}>
                      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small">
                        <span data-says className={`min-w-0 font-[600] ${wrap}`}>
                          {change.says}
                        </span>
                        <Link href={`${editorAddress(page.id)}#${listAnchor(change.list.id)}`} className="tlink">
                          Edit<span className="sr-only">: this list on {page.label}</span>
                        </Link>
                      </p>
                      {change.fields.length > 0 && (
                        <dl className="mt-2 space-y-2 text-small">
                          {change.fields.map(({ field, text }) => (
                            <div key={field.id}>
                              <dt className="text-meta font-[600] text-ink-2">{field.name}</dt>
                              <dd className={`whitespace-pre-wrap ${wrap}`}>{shown(field, text)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {unseen(hidden.sections.includes(`${change.page.id}.${change.section.id}`), change.section.label)}
                    </li>
                  ))}
                {texts
                  .filter((change) => change.field.page === page.id)
                  .map((change) => {
                    const label = named(change.field).full;
                    return (
                      <li key={`text:${change.field.id}`} data-release-text={change.field.id} className={box}>
                        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small">
                          <span data-label className={`min-w-0 font-[600] ${wrap}`}>
                            {fieldPlace(change.field).section}: {label}
                          </span>
                          <Link href={`${editorAddress(page.id)}#${fieldAnchor(change.field.id)}`} className="tlink">
                            Edit<span className="sr-only">: {label}</span>
                          </Link>
                        </p>
                        <dl className="mt-2 space-y-2 text-small">
                          <div>
                            <dt className="text-meta font-[600] text-ink-2">In the release</dt>
                            <dd data-release-from className={`whitespace-pre-wrap text-ink-2 ${wrap}`}>
                              {shown(change.field, change.from)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-meta font-[600] text-ink-2">On this site</dt>
                            <dd data-release-to className={`whitespace-pre-wrap ${wrap}`}>
                              {shown(change.field, change.to)}
                            </dd>
                          </div>
                        </dl>
                        {unseen(hidden.fields.includes(change.field.id), ownSectionOff(change.field) ? fieldPlace(change.field).section : null)}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {notes > 0 && (
        <div data-release-notes className="space-y-3">
          <h3 className="text-small font-[620]">What the release did to this site’s own changes</h3>
          <ul className="space-y-3">
            {pushedOut.map((entry) => (
              <li key={`out:${entry.list.id}:${entry.item}`} data-release-pushed-out={entry.list.id} className={`${box} text-small ${wrap}`}>
                <p>
                  {entry.page.label}, {entry.section.label}: the {entry.list.item.toLowerCase()} this site added, “{asRead(entry.fields[0]?.text ?? "", amounts)}”, is no longer shown. The release fills the list to the most it can hold ({entry.list.max} {listWords(entry.list).many}), so there is no room for it. The next save on this site deletes it. To keep it, copy its wording now, remove another {entry.list.item.toLowerCase()} and add it again.
                </p>
                <dl className="mt-2 space-y-2">
                  {entry.fields.map(({ field, text }) => (
                    <div key={field.id}>
                      <dt className="text-meta font-[600] text-ink-2">{field.name}</dt>
                      <dd className="whitespace-pre-wrap">{shown(field, text)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
            {releaseRemoved.map((entry) => (
              <li key={`removed:${entry.list.id}`} data-release-removed={entry.list.id} className={`${box} text-small ${wrap}`}>
                {entry.page.label}, {entry.section.label}: the release takes out {entry.items.map((item) => `“${item.text.replace(/[.]$/, "")}”`).join(", ")}. No site can put {entry.items.length === 1 ? "it" : "them"} back from Pages: only a change to the release file in the code can.
              </li>
            ))}
            {wholeOrder.map((page) => (
              <li key={`order:${page.id}`} data-release-whole-order={page.id} className={`${box} text-small ${wrap}`}>
                {page.label}: this site has moved sections, so it keeps its own order and its own on and off for every section of the page. A section a release switches off stays on here until{" "}
                <Link href={`${editorAddress(page.id)}#${sectionsAnchor(page.id)}`} className="tlink">
                  the page’s sections
                </Link>{" "}
                are reset.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Always rendered, so its message stays on screen once the list above is empty. */}
      <ResetToRelease seen={reviewKey(stored, [])} differences={differences.count} drafts={drafts} />
    </div>
  );
}
