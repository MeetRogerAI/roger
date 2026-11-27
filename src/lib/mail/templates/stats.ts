import { moneyExact } from "@/lib/billing/credit-lines";
import type { Currency } from "@/lib/billing/prices";
import { longDate } from "@/lib/dates";
import { appUrl, esc, renderEmail, type Rendered } from "../layout";

/**
 * Spec B.13 email 20, "Your week in numbers" (spec B.15, B2 plan Unit 8):
 * Season and bricks, contribution points and rank, referral credit (only when
 * there is some a display may show), and one invitation link. Says "Season", never "Level" (spec
 * check 51: B4 adds the Level line). Ends with its own unsubscribe link,
 * which switches off this email only.
 */
export type StatsEmail = {
  /** brickSummary() of the member's brick graph, or null before their first list. */
  season: string | null;
  points: number;
  /** Rank among members with points (standard competition ranking); ignored at 0 points. */
  rank: number;
  /** Referral credit a display may show (displayCredit), with the Toronto date it was read ("YYYY-MM-DD"); null when there is none. */
  credit: { cents: number; currency: Currency; asOf: string } | null;
  /** The member's /r/{code} link. */
  inviteUrl: string;
  unsubscribeUrl: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function statsEmail(o: StatsEmail): Rendered {
  const lines = [
    o.season ? `${o.season}.` : "Your first Season starts with your first list.",
    o.points > 0
      ? `${plural(o.points, "contribution point", "contribution points")}. You rank ${ordinal(o.rank)} among Roger members.`
      : "No contribution points yet. You earn them when an idea you shared is picked for another member.",
    ...(o.credit && o.credit.cents > 0 ? [`Referral credit on your balance: ${moneyExact(o.credit.cents, o.credit.currency)}, as of ${longDate(o.credit.asOf)}.`] : []),
  ];
  const settingsUrl = appUrl("/app/settings");
  return renderEmail({
    subject: "Your week in numbers",
    preview: lines[0],
    heading: "Your week in numbers",
    paragraphs: lines,
    button: { label: "Invite someone to Roger", url: o.inviteUrl },
    after: [`Your invitation link: ${o.inviteUrl}`],
    raw: {
      text: `${UNSUB_LEAD} To stop it (your Monday list is not affected): ${o.unsubscribeUrl}. Or choose your emails in Settings: ${settingsUrl}`,
      html:
        `<p style="margin:0 0 16px;font-size:13px;line-height:1.4;color:#5d5d63">${esc(UNSUB_LEAD)} ` +
        `<a href="${esc(o.unsubscribeUrl)}" style="color:#5d5d63">Stop the Wednesday email</a> (your Monday list is not affected), ` +
        `or choose your emails in <a href="${esc(settingsUrl)}" style="color:#5d5d63">Settings</a>.</p>`,
    },
  });
}

const UNSUB_LEAD = "You get this email on Wednesdays.";
