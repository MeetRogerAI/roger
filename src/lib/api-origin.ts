/** A request carrying an Origin from another host: refused by session-cookie write endpoints, so a cross-site form can't post. */
export function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}
