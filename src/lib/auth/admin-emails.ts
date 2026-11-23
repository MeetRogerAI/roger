import { isEmail } from "@/lib/form";

/**
 * Who is an admin (spec B.3): the addresses in ADMIN_EMAILS, comma-separated,
 * lower-cased. Read on every call, so removing an address takes effect on the
 * next request. Also the recipients of admin alerts.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isEmail);
}
