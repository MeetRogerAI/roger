import { v1Copy } from "@/data/site/v1";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { BuiltVersion } from "@/lib/site/version";
import { Questions } from "./blocks/questions";
import { PageHead, StartBand } from "./blocks/reading";

/**
 * /faq on site version 1 (spec A.9): every question in the copy file, under
 * its group's heading, in the copy's order, then the start button.
 *
 * Each group is the questions accordion the homepage uses, so an answer opens
 * by keyboard with no script. A group's id is its id in the copy.
 */

/** Reads the amounts the answers name, cached, so the page keeps its static shell. */
export async function V1Faq({ version }: { version: BuiltVersion }) {
  return <V1FaqView version={version} amounts={await getAmounts()} />;
}

export function V1FaqView({
  version,
  amounts,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
}) {
  const { copy } = v1Copy(amounts);

  return (
    <div data-site={version}>
      <PageHead title={copy.faq.title} />
      <div className="bg-ground pb-10 pt-6 md:pb-14 md:pt-10">
        {copy.questions.map((group) => (
          <Questions key={group.id} id={group.id} title={group.title} items={group.items} group />
        ))}
      </div>
      <StartBand start={copy.buttons.start} cardLine={copy.cardLine} />
    </div>
  );
}
