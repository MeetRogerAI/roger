/**
 * The query string the public site hands to /start (spec 0.6, "The handoff
 * point"). Unknown or malformed values are dropped, never an error: a visitor
 * with a mangled link still reaches sign-up.
 */

export type StartParams = {
  /** Which page the visitor came from; preselects the quiz route. */
  path: "re" | "agents" | null;
  /** The currency showing when they clicked. */
  cur: "USD" | "CAD" | null;
  /** A referral code (B2), carried through untouched. */
  ref: string | null;
  /** A free Zack report token from /zack, attached to the new account. */
  zack: string | null;
  /** Campaign tags, stored on the user. */
  utm: string;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function parseStartParams(raw: Raw): StartParams {
  const path = first(raw.path);
  const cur = first(raw.cur).toUpperCase();
  const ref = first(raw.ref);
  const zack = first(raw.zack);
  const utm = first(raw.utm);
  return {
    path: path === "re" || path === "agents" ? path : null,
    cur: cur === "USD" || cur === "CAD" ? cur : null,
    ref: /^[A-Za-z0-9_-]{3,40}$/.test(ref) ? ref : null,
    zack: /^[A-Za-z0-9_-]{16,128}$/.test(zack) ? zack : null,
    // Printable ASCII only, capped, so it is safe to store and to echo back.
    utm: utm.replace(/[^\x20-\x7E]/g, "").slice(0, 200),
  };
}

/** The same parameters as a query string, for carrying them to the next step. */
export function startQuery(p: StartParams): string {
  const q = new URLSearchParams();
  if (p.path) q.set("path", p.path);
  if (p.cur) q.set("cur", p.cur);
  if (p.ref) q.set("ref", p.ref);
  if (p.zack) q.set("zack", p.zack);
  if (p.utm) q.set("utm", p.utm);
  const s = q.toString();
  return s ? `?${s}` : "";
}
