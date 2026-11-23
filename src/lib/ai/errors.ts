/**
 * Model errors that retrying cannot fix: the AI Gateway has no credits, or
 * the key is refused. These stop a job with their own name instead of being
 * absorbed by a fallback.
 */
export class ModelUnavailable extends Error {}

export function isModelUnavailable(e: unknown): boolean {
  if (e instanceof ModelUnavailable) return true;
  const status = (e as { statusCode?: unknown; status?: unknown } | null)?.statusCode ?? (e as { status?: unknown } | null)?.status;
  if (status === 401 || status === 402 || status === 403) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /insufficient (?:funds|credits?|balance)|out of credits|credit balance|quota exceeded|payment required|GatewayAuthenticationError|unauthenticated request/i.test(msg);
}

/** Re-throws a model error as ModelUnavailable when retrying cannot help, so it is reported by name. */
export function rethrowIfUnavailable(e: unknown): void {
  if (isModelUnavailable(e)) throw new ModelUnavailable(`AI Gateway refused the request (credits or key): ${e instanceof Error ? e.message : String(e)}`);
}
