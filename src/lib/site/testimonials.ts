/**
 * The testimonials a public page may show (marketing spec, "What the public
 * site reads"): cleared rows only, for the page's audience. With no database,
 * or on any error, the list is empty and the section is absent (plan R13).
 *
 * Cached and tagged "testimonials": the admin's save, clear and move actions
 * call updateTag with the same tag.
 */
import { cacheLife, cacheTag } from "next/cache";
import { publicTestimonials, TESTIMONIALS_TAG, type Testimonial } from "@/lib/admin/content";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import type { SiteAudience } from "./start-link";

export type { Testimonial };

async function clearedTestimonials(): Promise<Testimonial[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(TESTIMONIALS_TAG);
  if (!hasDb()) return [];
  try {
    return await publicTestimonials(query);
  } catch {
    return [];
  }
}

/** A row marked for both audiences shows on either page. */
export function forAudience(rows: Testimonial[], audience: SiteAudience): Testimonial[] {
  return rows.filter((t) => t.audience === audience || t.audience === "both");
}

export async function getTestimonials(audience: SiteAudience): Promise<Testimonial[]> {
  return forAudience(await clearedTestimonials(), audience);
}
