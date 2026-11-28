/**
 * Renders a page or layout to its complete markup, waiting for async server
 * components and Suspense children the way a prerender does.
 *
 * The caller mocks next/navigation, next/headers, next/cache and
 * next/font/google; nothing here knows about a request.
 */
import type { ReactNode } from "react";
import { prerender } from "react-dom/static";

export async function pageMarkup(el: ReactNode): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(el, { onError: (e) => void errors.push(e) });
  const text = await new Response(prelude).text();
  if (errors.length > 0) throw errors[0];
  return text;
}
