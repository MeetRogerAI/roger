import { appUrl, esc, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/**
 * Spec B.8 item 3: the Monday email. Each idea with its title, the reason it
 * fits, the time line and one button; then the status line, always. Nothing
 * says where a play came from (spec check 14).
 */
export type EmailIdea = { id: string; title: string; reason: string; timeLine: string | null };

function ideasBlock(week: string, ideas: EmailIdea[]): { html: string; text: string } {
  const url = (id: string) => appUrl(`/app/week/${week}#idea-${id}`);
  const html = ideas
    .map(
      (i, n) =>
        `<div style="margin:0 0 24px"><p style="margin:0;font-weight:600;font-size:17px">${n + 1}. ${esc(i.title)}</p>` +
        `<p style="margin:4px 0 0;color:#444">${esc(i.reason)}</p>` +
        (i.timeLine ? `<p style="margin:4px 0 0;color:#444">${esc(i.timeLine)}</p>` : "") +
        `<p style="margin:10px 0 0"><a href="${esc(url(i.id))}" style="display:inline-block;background:#9a5226;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:15px;font-weight:600">Open and install</a></p></div>`,
    )
    .join("");
  const text = ideas.map((i, n) => [`${n + 1}. ${i.title}`, i.reason, i.timeLine, `Open and install: ${url(i.id)}`].filter(Boolean).join("\n")).join("\n\n");
  return { html, text };
}

export function mondayListEmail(o: { week: string; ideas: EmailIdea[]; status: string; receipt?: { url: string | null } | null }): Rendered {
  const short = o.ideas.length < 3 ? [`This week there ${o.ideas.length === 1 ? "is one idea" : `are ${o.ideas.length} ideas`} that fit you, not three. We only send ideas that fit.`] : [];
  const base = renderEmail({
    subject: o.receipt
      ? "Your Cora Curation, and your receipt"
      : `Your ${o.ideas.length === 3 ? "three ideas" : o.ideas.length === 2 ? "two ideas" : "idea"} for the week of ${longDate(o.week)}`,
    preview: o.ideas.map((i) => i.title).join(" · ").slice(0, 120),
    heading: `Your ideas for the week of ${longDate(o.week)}`,
    paragraphs: ["{{IDEAS}}", ...short],
    after: [o.status, ...(o.receipt ? [o.receipt.url ? `Your receipt: ${o.receipt.url}` : "Stripe emails your receipt separately."] : [])],
  });
  const block = ideasBlock(o.week, o.ideas);
  return { subject: base.subject, html: base.html.replace(/<p[^>]*>\{\{IDEAS\}\}<\/p>/, block.html), text: base.text.replace("{{IDEAS}}", block.text) };
}

/** Spec B.8 item 6: a trial user with Zack on and no report: no list, and no free list used. */
export function noRunThisWeekEmail(o: { week: string; status: string }): Rendered {
  return renderEmail({
    subject: "No Cora Curation this week",
    preview: "No free Cora Curation was used.",
    heading: "No Cora Curation this week.",
    paragraphs: ["Zack hasn’t sent a report yet, so there is no Cora Curation this week and no free one was used. Here is how to connect him."],
    button: { label: "Connect Zack", url: appUrl("/app/zack") },
    after: [o.status],
  });
}

/** R15: no idea fit this week. A paying monthly user is not told about charges at all. */
export function noIdeasThisWeekEmail(o: { week: string; note: string; status: string }): Rendered {
  return renderEmail({
    subject: "No new ideas for you this week",
    preview: `For ${longDate(o.week)}.`,
    heading: "No new ideas for you this week.",
    paragraphs: ["Every idea in the pool this week is one you already run or have had. The pool grows every week, so there will be new ones soon.", o.note].filter(Boolean),
    button: { label: "Open Roger", url: appUrl("/app") },
    after: [o.status],
  });
}

/** Spec B.13 email 7 (one at a time): after the second free list, how to order the next one. */
export function orderNextEmail(o: { price: string }): Rendered {
  return renderEmail({
    subject: "Your free Cora Curations are done",
    preview: "Order a Cora Curation whenever you want one.",
    heading: "Your free Cora Curations are done.",
    paragraphs: [`Order a Cora Curation for any Monday you want one, until Sunday night: ${o.price}. Nothing is charged unless you order.`],
    button: { label: "Order next Monday’s Cora Curation", url: appUrl("/app") },
  });
}
