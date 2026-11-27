import { isRealDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { logAdminAction } from "./log";
import type { Done } from "./users";

/**
 * What the public site reads that an admin edits (spec 0.6, B.12):
 * testimonials (the site shows only cleared rows). The one sample idea was
 * chosen here until November 27, 2026; its columns on pool_plays are kept.
 */

export const TESTIMONIALS_TAG = "testimonials";
export const AUDIENCES = ["re", "agents", "both"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Testimonial = { id: string; person: string; attribution: string; quote: string; saidOn: string | null; audience: Audience; position: number; cleared: boolean };

export async function listTestimonials(q: Query): Promise<Testimonial[]> {
  return q<Testimonial>(
    `select id, person, attribution, quote, to_char(said_on, 'YYYY-MM-DD') as "saidOn", audience, position, cleared from testimonials order by position, person`,
  );
}

/** What the public site reads (spec 0.6): cleared rows only, in order. */
export async function publicTestimonials(q: Query): Promise<Testimonial[]> {
  return (await listTestimonials(q)).filter((t) => t.cleared);
}

export type TestimonialInput = { id?: string | null; person: string; attribution: string; quote: string; saidOn: string; audience: string; position: number; cleared: boolean };

/** Adds (no id) or edits one testimonial. */
export async function saveTestimonial(q: Query, by: string, t: TestimonialInput): Promise<Done> {
  const person = t.person.trim().slice(0, 80);
  const attribution = t.attribution.trim().slice(0, 120);
  const quote = t.quote.trim().slice(0, 1200);
  if (!person || !quote) return { ok: false, message: "Name and quote are required." };
  if (t.saidOn && !isRealDate(t.saidOn)) return { ok: false, message: "The date must be written YYYY-MM-DD." };
  const audience = (AUDIENCES as readonly string[]).includes(t.audience) ? t.audience : "re";
  const position = Number.isInteger(t.position) ? Math.max(0, Math.min(t.position, 999)) : 0;
  const args = [person, attribution, quote, t.saidOn || null, audience, position, t.cleared];
  const rows = t.id
    ? await q<{ id: string }>(
        `update testimonials set person = $1, attribution = $2, quote = $3, said_on = $4, audience = $5, position = $6, cleared = $7 where id = $8 returning id`,
        [...args, t.id],
      )
    : await q<{ id: string }>(
        `insert into testimonials (person, attribution, quote, said_on, audience, position, cleared) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        args,
      );
  if (!rows.length) return { ok: false, message: "That testimonial no longer exists." };
  await logAdminAction(q, { by, action: t.id ? "testimonial_edited" : "testimonial_added", detail: { id: rows[0].id, person, cleared: t.cleared } });
  return { ok: true, message: t.id ? "Saved." : "Added." };
}

/** The cleared switch (spec check 32). */
export async function setTestimonialCleared(q: Query, by: string, id: string, cleared: boolean): Promise<Done> {
  const rows = await q<{ person: string }>(`update testimonials set cleared = $2 where id = $1 returning person`, [id, cleared]);
  if (!rows.length) return { ok: false, message: "That testimonial no longer exists." };
  await logAdminAction(q, { by, action: "testimonial_cleared", detail: { id, person: rows[0].person, cleared } });
  return { ok: true, message: cleared ? "Shown on the site." : "Hidden from the site." };
}

/** Moves a testimonial one place up or down, renumbering all of them so the order is always plain. */
export async function moveTestimonial(q: Query, by: string, id: string, dir: "up" | "down"): Promise<Done> {
  const all = await listTestimonials(q);
  const i = all.findIndex((t) => t.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return { ok: false, message: "It can’t move that way." };
  [all[i], all[j]] = [all[j], all[i]];
  await q(`update testimonials t set position = x.n from unnest($1::uuid[]) with ordinality as x(id, n) where t.id = x.id`, [all.map((t) => t.id)]);
  await logAdminAction(q, { by, action: "testimonial_moved", detail: { id, dir } });
  return { ok: true, message: "Moved." };
}
