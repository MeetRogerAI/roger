import { LegalPage } from "@/components/legal-page";
import { siteLegal, type SiteLegalName } from "@/data/site/legal";
import { getAmounts } from "@/lib/site/amounts";
import type { BuiltVersion } from "@/lib/site/version";

/**
 * /privacy or /terms under a site version (plan U9): the version's own
 * document, with its amounts from the settings. Peter reviewed and confirmed
 * both on November 26, 2026, so they render without the "Draft, under
 * review." note. The amounts are cached, so the page keeps its static shell.
 */
export async function SiteLegalPage({ version, name }: { version: BuiltVersion; name: SiteLegalName }) {
  const doc = siteLegal(await getAmounts())[name];
  return (
    // data-claims: a legal document, for the claims check (src/lib/site/claims.ts).
    <div data-site={version} data-claims="legal">
      <LegalPage doc={doc} reviewed />
    </div>
  );
}
