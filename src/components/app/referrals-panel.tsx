import { CopyTextButton } from "@/components/app/copy-text-button";
import { stageLabel, type ReferralLine } from "@/lib/referrals/stage";

/** The referral script, word for word from spec A (1.4), for members to send or say. */
export const REFERRAL_SCRIPT =
  "I’ve been using Roger with my AI agents for a few weeks. Every Monday it sends me three ideas that are working for other real estate people, and I set them up in a few minutes. The first two lists are free, then it’s $200 a month for a list every Monday, and you can cancel any time. They ask for a card when your first list is ready, and it isn’t charged until the third one. They run a short group call to get you set up. Want me to connect you?";

const box = "mt-3 rounded-[var(--radius-control)] border border-rule bg-surface px-3 py-2 text-small";

/**
 * /app/referrals (spec B.15): the member's link with Copy, the referral
 * script, and the people they referred with each one's stage. Credit comes
 * with the credit ledger (B2 Unit 4); until then the column shows a dash.
 */
export function ReferralsPanel({ link, people }: { link: string; people: ReferralLine[] }) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="link-h">
        <h2 id="link-h" className="text-h3">
          Your link
        </h2>
        <p className="mt-2 text-small text-ink-2">Anyone who signs up within 60 days of opening it counts as yours.</p>
        <p className={`${box} break-all font-mono`}>{link}</p>
        <CopyTextButton text={link} label="Copy link" className="btn btn-s mt-3" />
      </section>

      <section aria-labelledby="script-h">
        <h2 id="script-h" className="text-h3">
          What to say
        </h2>
        <p className={box}>{REFERRAL_SCRIPT}</p>
        <CopyTextButton text={REFERRAL_SCRIPT} label="Copy the script" className="btn btn-s mt-3" />
      </section>

      <section aria-labelledby="people-h">
        <h2 id="people-h" className="text-h3">
          People you referred
        </h2>
        {people.length ? (
          <table className="mt-4 w-full border-collapse text-left text-small">
            <thead>
              <tr className="border-b border-rule text-ink-2">
                <th scope="col" className="py-2 pr-4 font-[600]">
                  Who
                </th>
                <th scope="col" className="py-2 pr-4 font-[600]">
                  Stage
                </th>
                <th scope="col" className="py-2 font-[600]">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-rule">
                  <td className="py-2 pr-4">{p.who}</td>
                  <td className="py-2 pr-4">{stageLabel[p.stage]}</td>
                  <td className="py-2">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">None yet</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-small text-ink-2">No one yet. When someone signs up through your link, they show here.</p>
        )}
      </section>
    </div>
  );
}

/** What the page shows while referrals are switched off. Links already shared still count. */
export function ReferralsComingSoon() {
  return <p className="text-small text-ink-2">Referral links are coming soon. We’ll let you know when yours is ready.</p>;
}
