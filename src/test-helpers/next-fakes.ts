/**
 * Stand-ins for next/headers and next/navigation, so server actions, route
 * handlers and the access check can be called directly in tests.
 *
 *   vi.mock("next/headers", () => nextHeaders);
 *   vi.mock("next/navigation", () => nextNavigation);
 */

export const jar = new Map<string, string>();
export const headerValues = new Map<string, string>();

export class Redirected extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}

export function resetNextFakes(cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  jar.clear();
  headerValues.clear();
  for (const [k, v] of Object.entries(cookies)) jar.set(k, v);
  for (const [k, v] of Object.entries(headers)) headerValues.set(k.toLowerCase(), v);
}

export const nextHeaders = {
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(Object.fromEntries(headerValues)),
};

export const nextNavigation = {
  redirect: (url: string): never => {
    throw new Redirected(url);
  },
};

/** Runs a server action or check and returns where it redirected, or its result. */
export async function outcome<T>(fn: () => Promise<T>): Promise<{ redirect: string } | { value: T }> {
  try {
    return { value: await fn() };
  } catch (e) {
    if (e instanceof Redirected) return { redirect: e.url };
    throw e;
  }
}
