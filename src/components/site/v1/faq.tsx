import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { Overlay } from "@/lib/site/content/format";
import { v1Copy } from "@/lib/site/content/model";
import { getSiteContent } from "@/lib/site/content/read";
import type { BuiltVersion } from "@/lib/site/version";
import { Questions } from "./blocks/questions";
import { PageHead, StartBand } from "./blocks/reading";

/**
 * /faq on site version 1 (spec A.9): every question in the copy file, under
 * its group's heading, in the copy's order, then the start button. Wording
 * published in the admin is shown in place of the built-in wording.
 *
 * Each group is the questions accordion the homepage uses, so an answer opens
 * by keyboard with no script. A group's id is its id in the copy.
 */

/** Reads the amounts the answers name and the published content, both cached, so the page keeps its static shell. */
export async function V1Faq({ version }: { version: BuiltVersion }) {
  const [amounts, content] = await Promise.all([getAmounts(), getSiteContent()]);
  return <V1FaqView version={version} amounts={amounts} content={content} />;
}

export function V1FaqView({
  version,
  amounts,
  content,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  /** Everything stored that the page should show, as one overlay on the code copy (getSiteContent). Left out, the page prints the code copy alone. */
  content?: Overlay;
}) {
  const { copy } = v1Copy(amounts, content);

  return (
    <div data-site={version}>
      <PageHead title={copy.faq.title} />
      <div className="bg-ground pb-10 pt-6 md:pb-14 md:pt-10">
        {copy.questions.map((group) => (
          // One name for every group: one question open on the whole page, and opening another closes it.
          <Questions key={group.id} id={group.id} title={group.title} items={group.items} group accordion="faq-questions" />
        ))}
      </div>
      <StartBand start={copy.buttons.start} cardLine={copy.cardLine} />
    </div>
  );
}
