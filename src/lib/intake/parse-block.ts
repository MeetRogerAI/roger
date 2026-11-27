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

/** The blocks intake reads. Every other `roger-*` fence is private to its own pipeline (Zack 2.1's `roger-level`, build spec 1.1). */
const READ_BLOCKS = new Set(["roger-run", "roger-profile"]);

/** A fence line as Markdown reads it: up to three spaces, then three or more backticks or tildes, then an info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** `Roger_Level` and `roger-level` are the same block name. */
const blockName = (info: string) => info.trim().split(/\s+/)[0].toLowerCase().replace(/_/g, "-");
const isPrivateName = (name: string) => name.startsWith("roger-") && !READ_BLOCKS.has(name);

/**
 * The report with every other `roger-*` fenced block removed, so text the run
 * pipeline hands to a model, or searches for stated figures, never includes a
 * private block (build spec T3).
 *
 * It walks the lines the way Markdown pairs fences: a block closes only on a
 * bare fence of the same character, at least as long as its opener, so an
 * inner ``` line cannot end a private block early. Fences of any length, ~~~
 * fences and any capitalisation count. An unclosed private block runs to the
 * end of the text. A private opener inside a kept roger-run or roger-profile
 * block (one left unclosed by mistake) starts a private block there.
 */
export function withoutPrivateBlocks(text: string): string {
  const out: string[] = [];
  let open: { char: string; len: number; drop: boolean; keptRoger: boolean } | null = null;
  for (const line of text.split("\n")) {
    const bare = line.replace(/\r$/, "");
    const fence = FENCE.exec(bare);
    if (open) {
      const closes = fence && fence[1][0] === open.char && fence[1].length >= open.len && fence[2].trim() === "";
      if (closes) {
        if (!open.drop) out.push(line);
        open = null;
        continue;
      }
      if (open.keptRoger && fence && isPrivateName(blockName(fence[2]))) {
        open = { char: fence[1][0], len: fence[1].length, drop: true, keptRoger: false };
        continue;
      }
      if (!open.drop) out.push(line);
      continue;
    }
    if (fence) {
      const name = blockName(fence[2]);
      const drop = isPrivateName(name);
      open = { char: fence[1][0], len: fence[1].length, drop, keptRoger: READ_BLOCKS.has(name) };
      if (!drop) out.push(line);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
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
