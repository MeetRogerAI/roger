import type { CSSProperties } from "react";
import "./placeholder.css";

/**
 * Stands in for an image, film or illustration that does not exist yet (plan
 * R15, R18b). It is a labelled panel at the final asset's aspect ratio, so the
 * real file can replace it later without moving anything.
 *
 * The label says what the asset is. The pixel size is drawn by CSS from
 * data-size, so no digits enter the page's text or its accessible name (the
 * claims check reads both, and a size is not a claim).
 *
 * `fill` is for an asset that covers its parent, such as a full-bleed hero:
 * the parent sets the box and the asset is cropped to it, as `object-fit:
 * cover` would crop the real file.
 *
 * A sketch tints it with --ph-a, --ph-b (the panel's two tones), --ph-ink (the
 * caption) and --ph-chip (the caption's ground), and may move the caption with
 * --ph-cap-inset.
 *
 * R19: a label may describe a person in a future image. It never names one,
 * and never calls one a Roger user.
 */
export function Placeholder({
  label,
  width,
  height,
  format,
  fill = false,
  compact = false,
  className = "",
  style,
}: {
  /** What the asset is, in words: "Hero photograph: a quiet street at first light". No digits. */
  label: string;
  /** The final asset's size in pixels. */
  width: number;
  height: number;
  /** The file format the asset is expected in, such as "JPG" or "SVG". */
  format: string;
  /** Cover the positioned parent instead of holding its own aspect ratio. */
  fill?: boolean;
  /** A small tile: the label is shown and the size is left to the reference board. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="img"
      aria-label={`Placeholder. ${label}`}
      data-placeholder={fill ? "fill" : "ratio"}
      data-size={`${width} × ${height} ${format}`}
      data-compact={compact ? "" : undefined}
      className={`v2-ph ${className}`}
      style={fill ? style : { aspectRatio: `${width} / ${height}`, ...style }}
    >
      <span className="v2-ph-cap" aria-hidden="true">
        <span className="v2-ph-mark" />
        <span className="v2-ph-label">{label}</span>
      </span>
    </div>
  );
}
