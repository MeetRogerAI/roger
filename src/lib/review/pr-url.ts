/** A pull request on MeetRogerAI/roger, and nothing else, is shown as a link (B3 Unit 10 review). Safe for client components. */
export const PR_PREFIX = "https://github.com/MeetRogerAI/roger/pull/";

export function isRepoPullUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith(PR_PREFIX) && /^\d{1,9}$/.test(url.slice(PR_PREFIX.length));
}
