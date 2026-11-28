import { siteConfig } from "@/data/config";

/**
 * Every automatic email has the same plain shape (spec B.13: "plain and
 * short"): an optional heading, a few paragraphs, at most one button, and a
 * small footer. Built as both HTML and plain text from the same parts, with
 * all text escaped.
 */
/**
 * A paragraph: plain text, or text with one inline link on the words `link.label` (which must appear in `text`).
 * In plain text the link reads "label (url)".
 */
export type Paragraph = string | { text: string; link: { label: string; url: string } };

export type EmailParts = {
  subject: string;
  /** Hidden preview line shown by mail apps after the subject. */
  preview?: string;
  heading?: string;
  paragraphs: Paragraph[];
  button?: { label: string; url: string };
  /** Lines after the button, e.g. the status line or the monthly line. */
  after?: string[];
  /** Footer note, e.g. how to change email settings. */
  footer?: string;
};

export type Rendered = { subject: string; html: string; text: string };

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const P_STYLE = "margin:0 0 16px;font-size:16px;line-height:1.5;color:#1d1d1f";
const p = (s: string) => `<p style="${P_STYLE}">${esc(s)}</p>`;

/** One paragraph's HTML, with its inline link if it has one. */
const para = (x: Paragraph) => {
  if (typeof x === "string") return p(x);
  const at = x.text.indexOf(x.link.label);
  if (at < 0) return p(x.text);
  const a = `<a href="${esc(x.link.url)}" style="color:#9a5226">${esc(x.link.label)}</a>`;
  return `<p style="${P_STYLE}">${esc(x.text.slice(0, at))}${a}${esc(x.text.slice(at + x.link.label.length))}</p>`;
};

/** One paragraph's plain text: an inline link reads "label (url)". */
const plain = (x: Paragraph) => (typeof x === "string" ? x : x.text.includes(x.link.label) ? x.text.replace(x.link.label, `${x.link.label} (${x.link.url})`) : x.text);

export function renderEmail(e: EmailParts): Rendered {
  const html = [
    `<!doctype html><html><body style="margin:0;padding:0;background:#fbfbfd">`,
    e.preview ? `<div style="display:none;max-height:0;overflow:hidden">${esc(e.preview)}</div>` : "",
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">`,
    e.heading ? `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.25;color:#1d1d1f">${esc(e.heading)}</h1>` : "",
    ...e.paragraphs.map(para),
    e.button
      ? `<p style="margin:24px 0"><a href="${esc(e.button.url)}" style="display:inline-block;background:#9a5226;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:16px;font-weight:600">${esc(e.button.label)}</a></p>`
      : "",
    ...(e.after ?? []).map(p),
    `<p style="margin:32px 0 0;font-size:13px;line-height:1.4;color:#5d5d63">${esc(e.footer ?? "Roger support")}<br>${esc(siteConfig.contactEmail)}</p>`,
    `</div></body></html>`,
  ].join("");

  const text = [
    e.heading,
    ...e.paragraphs.map(plain),
    e.button ? `${e.button.label}: ${e.button.url}` : undefined,
    ...(e.after ?? []),
    "--",
    e.footer ?? "Roger support",
    siteConfig.contactEmail,
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n\n");

  return { subject: e.subject, html, text };
}

/**
 * There is no restart path for a closed or cancelled account yet (plan, Unit
 * 18 residual): the closing emails invite the member to write to support.
 */
export const COME_BACK_LINE = `Want to come back? Write to us at ${siteConfig.contactEmail}.`;
export function comeBackButton(): { label: string; url: string } {
  return { label: "Want to come back? Write to us", url: `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Coming back to Roger")}` };
}

/**
 * The base URL for links in emails and redirects, for the environment this
 * code runs in, so a preview never sends people to production.
 */
export function appUrl(path: string): string {
  const env = process.env.VERCEL_ENV;
  let base: string;
  if (process.env.APP_URL) base = process.env.APP_URL;
  else if (env === "preview") base = process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : `https://${process.env.VERCEL_URL}`;
  else if (env === "production") base = process.env.SITE_URL ?? siteConfig.domain;
  // Local work: never production, even when SITE_URL was pulled from Vercel.
  else base = `http://localhost:${process.env.PORT ?? 3000}`;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
