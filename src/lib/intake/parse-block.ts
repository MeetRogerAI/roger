/**
 * The `roger-run` block at the end of a Zack 2.0 report (spec B.5 "What the
 * report must contain"). Returns the parsed JSON, or null when there is no
 * block or it is not valid JSON; the model path then reads the prose.
 */
export function parseRunBlock(text: string): unknown | null {
  const blocks = [...text.matchAll(/```[ \t]*roger-run[^\n]*\n([\s\S]*?)\n[ \t]*```/g)];
  const last = blocks.at(-1);
  if (!last) return null;
  try {
    return JSON.parse(last[1]);
  } catch {
    return null;
  }
}

export function parseProfileBlock(text: string): unknown | null {
  const blocks = [...text.matchAll(/```[ \t]*roger-profile[^\n]*\n([\s\S]*?)\n[ \t]*```/g)];
  const last = blocks.at(-1);
  if (!last) return null;
  try {
    const v = JSON.parse(last[1]);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
