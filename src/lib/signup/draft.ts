import { z } from "zod";
import { quizSchema, type QuizAnswers, type SignupPath } from "./quiz";

/**
 * Sign-up progress before an account exists: the quiz answers and the query
 * string from /start, kept in an httpOnly cookie for 7 days. These are the
 * visitor's own answers, so the cookie is validated on the way back in but
 * not signed: changing it only changes their own profile.
 */
export const DRAFT_COOKIE = "roger-signup";
export const DRAFT_DAYS = 7;

const draftSchema = z.object({
  answers: quizSchema,
  path: z.enum(["running", "new", "not_ready"]),
  continuedAnyway: z.boolean().default(false),
  source: z.enum(["re", "agents"]).nullable(),
  cur: z.enum(["USD", "CAD"]),
  ref: z.string().max(40).nullable(),
  zack: z.string().max(128).nullable(),
  utm: z.string().max(200),
});

export type SignupDraft = {
  answers: QuizAnswers;
  path: SignupPath;
  continuedAnyway: boolean;
  source: "re" | "agents" | null;
  cur: "USD" | "CAD";
  ref: string | null;
  zack: string | null;
  utm: string;
};

export function encodeDraft(d: SignupDraft): string {
  return Buffer.from(JSON.stringify(d), "utf8").toString("base64url");
}

export function decodeDraft(raw: string | undefined): SignupDraft | null {
  if (!raw || raw.length > 8000) return null;
  try {
    const r = draftSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return r.success ? (r.data as SignupDraft) : null;
  } catch {
    return null;
  }
}

/** The path the account is created on. "Start anyway" goes on the new path with the tag kept (spec B.4). */
export function accountPath(d: SignupDraft): { path: "running" | "new"; notReady: boolean } {
  if (d.path === "not_ready") return { path: "new", notReady: true };
  return { path: d.path, notReady: false };
}
