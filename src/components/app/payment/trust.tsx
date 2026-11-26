/**
 * The trust block beside the card form (plan 2026-11-26-001, Unit 6; origin
 * R20–R21): a padlock with "Secured by Stripe", the card brands Roger takes,
 * the PCI line (accurate for SAQ A; no badge image), and the policy links,
 * which open in a new tab so the form keeps what was typed (and say so to
 * screen readers); the support address is a plain mailto. No images from
 * other sites: the marks are inline.
 */
export const PCI_LINE = "Payments are processed by Stripe, a PCI DSS Level 1 certified provider. Roger never sees your card number.";

/** Roger has no separate refund page for the monthly plan yet; the terms hold the rule (no refunds; cancel any time), so one link names both. */
const POLICIES = [
  { href: "/terms", label: "Terms and refunds" },
  { href: "/privacy", label: "Privacy" },
];

export function Trust({ supportEmail }: { supportEmail: string }) {
  return (
    <div className="mt-8 border-t border-rule pt-6 text-small text-ink-2">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 font-medium text-ink">
          <Padlock />
          Secured by Stripe
        </span>
        <span className="inline-flex items-center gap-1.5" role="img" aria-label="We take Visa, Mastercard and American Express">
          <Brand label="VISA" />
          <MastercardMark />
          <Brand label="AMEX" />
        </span>
      </p>
      <p className="mt-3">{PCI_LINE}</p>
      <ul className="mt-2 flex flex-wrap gap-x-5">
        {POLICIES.map((p) => (
          <li key={p.label}>
            <a href={p.href} target="_blank" rel="noopener noreferrer" className="tlink-quiet inline-flex min-h-11 items-center">
              {p.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
        <li>
          <a href={`mailto:${supportEmail}`} className="tlink-quiet inline-flex min-h-11 items-center">
            {supportEmail}
          </a>
        </li>
      </ul>
    </div>
  );
}

function Padlock() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
    </svg>
  );
}

function Brand({ label }: { label: string }) {
  return (
    <span aria-hidden="true" className="inline-flex h-6 min-w-10 items-center justify-center rounded-[4px] border border-rule-strong bg-surface px-1.5 text-[11px] font-bold tracking-wide text-ink">
      {label}
    </span>
  );
}

function MastercardMark() {
  return (
    <span aria-hidden="true" className="inline-flex h-6 min-w-10 items-center justify-center rounded-[4px] border border-rule-strong bg-surface px-1.5">
      <svg width="24" height="15" viewBox="0 0 24 15">
        <circle cx="8.5" cy="7.5" r="6.5" fill="#eb001b" />
        <circle cx="15.5" cy="7.5" r="6.5" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
    </span>
  );
}
