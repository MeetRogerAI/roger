import { cookies } from "next/headers";
import { isEmail } from "@/lib/form";

/**
 * The email address this browser last typed into Roger (the sign-in page, the
 * waitlist, or sign-up step 2), so sign-up doesn't ask for it twice. It is a
 * convenience only: it proves nothing, and the account is still made only
 * when the emailed link is opened. Set whether or not the address has an
 * account, so it says nothing about which addresses do.
 */
export const KNOWN_EMAIL_COOKIE = "roger-email";
const DAYS = 30;

/** Never throws: the email has already gone out, and a cookie that can't be set just means asking again. */
export async function rememberEmail(email: string) {
  try {
    (await cookies()).set(KNOWN_EMAIL_COOKIE, email.trim().toLowerCase(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DAYS * 86_400,
    });
  } catch (e) {
    console.error("[signup] email not remembered", e instanceof Error ? e.message : e);
  }
}

export async function knownEmail(): Promise<string | null> {
  const v = ((await cookies()).get(KNOWN_EMAIL_COOKIE)?.value ?? "").slice(0, 254);
  return isEmail(v) ? v : null;
}
