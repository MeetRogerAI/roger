import { LegalPage } from "@/components/legal-page";
import { siteLegal, type SiteLegalName } from "@/data/site/legal";
import { getAmounts } from "@/lib/site/amounts";
import type { BuiltVersion } from "@/lib/site/version";

/**
 * /privacy or /terms under a site version (plan U9): the version's own draft,
 * with its amounts from the settings and the "Draft, under review." note,
 * until Peter has it read. The amounts are cached, so the page keeps its
 * static shell.
 */
export async function SiteLegalPage({ version, name }: { version: BuiltVersion; name: SiteLegalName }) {
  const doc = siteLegal(await getAmounts())[name];
  return (
    <div data-site={version}>
      <LegalPage doc={doc} reviewed={false} />
    </div>
  );
}
