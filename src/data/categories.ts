/**
 * The fixed category list (spec B.5). The one list Zack labels plays with, the
 * sign-up quiz offers, and Cora matches on. Launch list D10: the default until
 * Peter confirms it (S3). Changing it means updating the Zack 2.0 files too.
 */
export const categories = [
  "Marketing",
  "Research",
  "Builds",
  "Sales",
  "Operations",
  "Email and calendar",
  "Listings",
  "Client follow-up",
  "Personal errands",
] as const;

export type Category = (typeof categories)[number];

export const isCategory = (s: string): s is Category => (categories as readonly string[]).includes(s);

/** Subjects a user can tell Zack to drop entirely (spec B.5, controls). */
export const sensitiveSubjects = ["health", "legal matters", "money", "family", "children"] as const;
export type SensitiveSubject = (typeof sensitiveSubjects)[number];
