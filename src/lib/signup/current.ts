import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import type { Currency, Plan } from "@/lib/billing/prices";

export type SignupRow = {
  id: string;
  email: string;
  name: string;
  status: string;
  plan: Plan;
  currency: Currency | null;
  agent: string;
  path: string;
  signup_step: string;
  consent_at: string | null;
};

/** The signed-in user's sign-up state, for the plan, card and done pages. Redirects to sign in if needed. */
export async function signupUser(next: string): Promise<SignupRow> {
  const session = await requireUser(next);
  const rows = await query<SignupRow>(
    `select id, email, name, status, plan, currency, agent, path, signup_step, consent_at from users where id = $1`,
    [session.userId],
  );
  if (!rows[0]) throw new Error("Signed-in user not found");
  return rows[0];
}

export { zackFileFor } from "@/lib/zack/agents";
