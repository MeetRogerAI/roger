/**
 * The signed-in hint. Set beside the real (httpOnly) session cookie so the
 * public header can show "Open Roger" without a server round trip. It holds a
 * constant "1" and nothing else, and it gates nothing: every page that shows
 * private data checks the real session itself.
 */
export const SIGNED_IN_HINT_COOKIE = "roger-in";
export const SIGNED_IN_HINT_VALUE = "1";

/** Whether a Cookie header string (or document.cookie) carries the hint. */
export function hasSignedInHint(cookieString: string): boolean {
  return cookieString.split(";").some((c) => c.trim() === `${SIGNED_IN_HINT_COOKIE}=${SIGNED_IN_HINT_VALUE}`);
}

/**
 * The attribute on `<html>` that says "the hint is set", so the prerendered header can show "Open Roger" from the
 * first frame (globals.css, `html[data-signed-in]`). Set before first paint by SIGNED_IN_MARK_SCRIPT, then kept equal
 * to the cookie by useSignedInHint on every render of the header's account links.
 */
export const SIGNED_IN_MARK = "data-signed-in";

/**
 * The root layout's head script adds this: the same test as hasSignedInHint, on the browser's cookies. A fixed string
 * built from the constants above, the same for every visitor: no cookie value is ever written into the page.
 */
export const SIGNED_IN_MARK_SCRIPT =
  `try{if(document.cookie.split(';').some(function(c){return c.trim()==='${SIGNED_IN_HINT_COOKIE}=${SIGNED_IN_HINT_VALUE}'}))` +
  `document.documentElement.setAttribute('${SIGNED_IN_MARK}','')}catch(e){}`;
