import type { HTMLAttributes } from "react";

/**
 * An element whose children come in once as it enters the screen (the reveal
 * observer in src/components/reveals.tsx, styled in globals.css).
 *
 * It also takes suppressHydrationWarning, which is why this wrapper exists:
 * the observer adds its "is-in" class as soon as the element is on screen,
 * which on a page that streams can be before React hydrates that element, and
 * React then reports the class as a mismatch.
 */
export function Reveal({ as: Tag = "div", ...rest }: { as?: "div" | "ul" | "ol" | "section" } & HTMLAttributes<HTMLElement>) {
  return <Tag data-reveal suppressHydrationWarning {...rest} />;
}
