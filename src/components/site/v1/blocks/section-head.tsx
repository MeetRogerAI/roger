/**
 * A section heading in the layout carried from the Circles design (spec 0.7):
 * centred, about 44rem wide, with one or two lines of sub-copy.
 */
export function SectionHead({
  id,
  title,
  sub,
  night = false,
  as: Heading = "h2",
  className = "",
}: {
  id?: string;
  title: string;
  sub?: string;
  /** On a night chapter. */
  night?: boolean;
  /** "h1" where the section opens a page. */
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[44rem] text-center ${className}`}>
      <Heading id={id} className="text-h2">
        {title}
      </Heading>
      {sub && <p className={`mt-4 text-lead ${night ? "text-night-ink-2" : "text-ink-2"}`}>{sub}</p>}
    </div>
  );
}
