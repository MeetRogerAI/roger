import { googleEnabled } from "@/lib/auth/google";

/**
 * "Sign in with Google" on /signin (plan Unit 18). A plain link, not a
 * prefetching <Link>, because following it starts a sign-in. Renders nothing
 * while Google's keys are not set.
 */
export function GoogleSignInLink({ next }: { next: string }) {
  if (!googleEnabled()) return null;
  return (
    <div className="mt-8 max-w-[30rem] border-t border-rule pt-8">
      <a href={`/auth/google?next=${encodeURIComponent(next)}`} className="btn btn-m">
        Sign in with Google
      </a>
    </div>
  );
}
