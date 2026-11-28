/**
 * Whether the header's links fit in a row beside "Sign in" and the start button (plan U8), worked out from the
 * words, so that no label an admin types can make the header wider than the window.
 *
 * The header shows its links in a row from 1024 pixels (Tailwind's `lg`) and in the menu below that. At 1024 the
 * five built-in links leave 34 pixels free: a sixth link, or a longer label, does not fit. No limit on counts or
 * lengths can promise a fit (one label of twenty "W"s is 324 pixels), so the header is told where its row starts:
 *
 *   "lg"    from 1024, as built: the links and both buttons fit at 1024.
 *   "xl"    from 1280: they fit at 1280 and not at 1024. Up to 1280 the links are in the menu.
 *   "menu"  never: they do not fit at 1280 either. The links are in the menu at every width.
 *
 * HOW IT IS MEASURED. Each character's width in the type the header prints it in, measured in Chrome on
 * November 27, 2026 (Mona Sans at 16px: weight 400 for the links, 550 with -0.16px letter spacing for the buttons),
 * for every printable ASCII character. A character outside ASCII counts as 20 pixels, wider than any of them. The
 * sum for each built-in label is within two pixels of what the browser draws. The rest are the header's own
 * measures at those two widths: the room the logo, the gaps and the buttons' padding leave, less a margin of 6.
 *
 * Pure, and with no imports: chrome.ts works it out on the server and hands the header the answer.
 */

/** The width of each character from " " (32) to "~" (126), in the links' type. */
const LINK = [
  3.66, 3.93, 5.92, 10.42, 10.5, 13.54, 12.5, 2.94, 4.63, 4.63, 5.25, 9.28, 3.15, 5.96, 3.01, 4.52, 10.16, 5.81, 9.17, 9.43, 10.35, 9.51, 10.01, 9.49, 9.88, 10.01, 3.01, 3.15, 8.73, 9.6, 8.73, 8.82, 14.74,
  11.84, 11.12, 12.45, 11.92, 9.95, 9.77, 13.13, 12.46, 4.05, 6.13, 10.83, 8.88, 14.3, 12.34, 13.37, 10.58, 13.49, 11.3, 10.71, 10.16, 11.84, 11.94, 16.22, 11.89, 11.36, 10.54, 5.73, 4.44, 5.73, 9.6, 6.91,
  3.63, 9.76, 9.76, 8.99, 9.76, 8.71, 4.66, 9.48, 9.6, 3.73, 3.78, 8.83, 3.73, 15.39, 9.6, 9.83, 9.76, 9.76, 5.86, 8.33, 5.29, 9.62, 8.74, 11.74, 9.17, 8.68, 8.19, 6.27, 4.37, 5.96, 9.6,
];
/** The same, in the buttons' type. */
const BUTTON = [
  3.38, 3.99, 6.27, 10.46, 10.45, 13.49, 12.26, 3.01, 4.62, 4.62, 5.07, 9.14, 3.2, 6.03, 3.06, 4.72, 10.04, 6.11, 9.18, 9.39, 10.35, 9.48, 9.99, 9.49, 9.81, 9.99, 3.06, 3.2, 8.83, 9.44, 8.83, 8.8, 14.42,
  11.89, 11.04, 12.25, 11.82, 9.9, 9.71, 13.02, 12.42, 4.22, 6.19, 11.04, 8.86, 14.3, 12.27, 13.18, 10.5, 13.34, 11.3, 10.69, 10.2, 11.74, 12.02, 16.3, 12.06, 11.49, 10.38, 5.73, 4.61, 5.73, 9.44, 6.92,
  3.92, 9.81, 9.81, 8.96, 9.81, 8.86, 5.29, 9.54, 9.68, 3.89, 3.97, 9.15, 3.89, 15.31, 9.68, 9.71, 9.81, 9.81, 6.02, 8.38, 6.04, 9.7, 8.98, 12.28, 9.49, 8.88, 8.22, 6.32, 4.4, 5.97, 9.44,
];
const WIDE = 20;

/** A text's width in pixels in a type, by the table. */
export function textWidth(text: string, table: "link" | "button"): number {
  const widths = table === "link" ? LINK : BUTTON;
  let out = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 32 && code < 127 ? widths[code - 32] : WIDE;
  }
  return out;
}

/** Each link's own padding (px-0.5 on both sides), and the gap between two links (lg:gap-7). */
const LINK_PADDING = 4;
const LINK_GAP = 28;
/** "Sign in" and the start button around their words: each button's padding and border, and the gap between them (sm:gap-3). */
const OUTLINE_AROUND = 45.7;
const BUTTON_AROUND = 43.1;
const BUTTONS_GAP = 12;
/** What the links and the two buttons share at each width: the header's row less the logo and the two gaps beside the links, measured, less 6 pixels to spare. */
const ROOM = { lg: 830.8 - 6, xl: 1001.9 - 6 } as const;

export type NavRow = "lg" | "xl" | "menu";

/**
 * Where the header's row of links starts, for these words. `labels` are the links' words as printed, amounts filled in.
 * `openApp` is the button a signed-in visitor sees in place of the two: the header keeps the room of the wider.
 */
export function navRow(labels: readonly string[], signIn: string, start: string, openApp = ""): NavRow {
  if (labels.length === 0) return "lg";
  const links = labels.reduce((sum, label) => sum + textWidth(label, "link") + LINK_PADDING, 0) + LINK_GAP * (labels.length - 1);
  const pair = textWidth(signIn, "button") + OUTLINE_AROUND + BUTTONS_GAP + textWidth(start, "button") + BUTTON_AROUND;
  const buttons = Math.max(pair, openApp === "" ? 0 : textWidth(openApp, "button") + BUTTON_AROUND);
  const width = links + buttons;
  if (width <= ROOM.lg) return "lg";
  return width <= ROOM.xl ? "xl" : "menu";
}
