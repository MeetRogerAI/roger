import Link from "next/link";

/** The signed-in navigation. Sign out is a POST from this page (see /auth/signout). */
export function AppNav() {
  return (
    <nav aria-label="Your account" className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[880px] items-center gap-6 px-4 py-3 text-small sm:px-6">
        <Link href="/app" className="font-semibold">
          Roger
        </Link>
        <Link href="/app/zack" className="tlink">
          Zack
        </Link>
        <Link href="/app/billing" className="tlink">
          Billing
        </Link>
        <Link href="/app/settings" className="tlink">
          Settings
        </Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="tlink">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
