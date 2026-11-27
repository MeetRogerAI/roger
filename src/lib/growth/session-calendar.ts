import { sessionIcs, type Session } from "./sessions";

/** The calendar file as a download: private, never cached, never indexed (B2 Unit 9 review). */
export function icsResponse(s: Session, link: string, now: Date): Response {
  return new Response(sessionIcs(s, link, now), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="roger-session-${s.date}.ics"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}

/** The same answer for "no such thing" and "not yours", so a route says nothing about why. */
export const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
