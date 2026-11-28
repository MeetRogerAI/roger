/** Where /app sends someone whose sign-up is not finished: an admin to the admin, everyone else back to sign-up. */
export function unfinishedSignupGoesTo(admin: boolean): "/admin" | "/start" {
  return admin ? "/admin" : "/start";
}
