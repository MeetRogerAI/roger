/**
 * The leaderboard's display-name rules (B2 plan Unit 7), with no database or
 * server imports so the form can share the limits.
 *
 * Impersonation (Unit 7 review, decided): names are Latin script only, and
 * both the reserved-name check and uniqueness compare a "skeleton" that folds
 * the usual look-alikes (accents, case, 0/o, 1/l, rn/m …). The skeleton is
 * stored in users.leaderboard_name_key, and the unique index on it (among
 * opted-in members) is the one source of truth for "That name is taken".
 */

export const NAME_MIN = 2;
export const NAME_MAX = 30;
export const NAME_TAKEN = "That name is taken. Try another.";
/** The unique index the database raises on a clash (db/schema.sql). */
export const NAME_INDEX = "users_leaderboard_name_key";

const DIGIT_LOOKALIKES: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t" };
/** Letters that do not decompose to a base letter plus accents, folded to what they look like. */
const LETTER_FOLDS: Record<string, string> = {
  ø: "o",
  ł: "l",
  ı: "i",
  đ: "d",
  ð: "d",
  ħ: "h",
  ŧ: "t",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ŋ: "n",
  ĸ: "k",
  ſ: "s",
};
const FOLDABLE = new RegExp(`[${Object.keys(LETTER_FOLDS).join("")}]`, "g");

/**
 * The comparison form of a name: NFKC, combining marks removed, lower case,
 * non-decomposing letters folded (ø → o, ß → ss …), i, l, 1 and | all l,
 * look-alike digits mapped to letters, rn → m and vv → w, and everything that
 * is not a letter or digit dropped. "R0ger", "Røger" and "ROGER" are all "roger".
 */
export function skeleton(s: string): string {
  return s
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(FOLDABLE, (c) => LETTER_FOLDS[c])
    .replace(/[il1|]/g, "l")
    .replace(/[03457]/g, (d) => DIGIT_LOOKALIKES[d])
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Whole names (as skeletons) that only Roger may use. */
const RESERVED_WHOLE = new Set(
  [
    "roger",
    "rogerai",
    "meetroger",
    "teamroger",
    "zack",
    "cora",
    "admin",
    "administrator",
    "official",
    "moderator",
    "mod",
    "support",
    "staff",
    "team",
    "help",
    "helpdesk",
    "bot",
    "hq",
    "system",
    "root",
  ].map((w) => skeleton(w)),
);
/** Joined staff forms that may not appear anywhere in a name's key ("RogerAdmin", "MeetRogerAI"). */
const RESERVED_INSIDE = ["rogeradmin", "rogerteam", "rogersupport", "rogerhq", "rogerbot", "rogerstaff", "meetroger", "moderator"].map((w) => skeleton(w));
/** Words that may not start or end any word of a name ("TheAdmin", "AdminKen", "Admins"); in the middle is fine ("Badminton"). */
const RESERVED_EDGES = ["admin", "official"].map((w) => skeleton(w));
/**
 * Whole words that may not follow "Roger" as the next word ("Roger Bot",
 * "Roger HQ", "Roger AI", folded so "Roger Al" and "Roger A1" too);
 * "Roger Tremblay" and "Roger Alvarez" are fine.
 */
const AFTER_ROGER = new Set(["staff", "support", "team", "help", "bot", "hq", "ai"].map((w) => skeleton(w)));
const ROGER = skeleton("roger");

/** Invisible or blank characters that render as nothing (fillers, braille blank, zero-width, bidi controls). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\u115F\u1160\u3164\uFFA0\u2800]/u;
/**
 * The letters allowed besides A–Z: Latin-1 Supplement letters, Latin
 * Extended-A, and the common Extended-B letters (Vietnamese horn vowels,
 * pinyin caron vowels, Ǿ ǿ Ǻ ǻ Ǽ ǽ, Romanian Ș ș Ț ț). IPA Extensions,
 * spacing modifier letters, phonetic extensions and small capitals are not
 * allowed. Any other precomposed letter is allowed only if it is an A–Z
 * letter with accents (Vietnamese ế, Welsh ŵ …).
 */
const LETTER_SET = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u01A0\u01A1\u01AF\u01B0\u01CD-\u01DC\u01FA-\u01FF\u0218-\u021B]$/u;
const OTHER = /^[0-9 .'&-]$/;
function allowedChar(c: string): boolean {
  if (LETTER_SET.test(c) || OTHER.test(c) || /^\p{M}$/u.test(c)) return true;
  return /^[A-Za-z]\p{M}+$/u.test(c.normalize("NFD"));
}

export type NameCheck = { ok: true; name: string; key: string } | { ok: false; message: string };

/**
 * The board's name rules: NFKC-normalised (a curly apostrophe becomes a
 * straight one), spaces collapsed and trimmed, 2–30 characters, the allowed
 * Latin letters, digits, spaces and . ' - & only, at most one combining mark
 * on a letter, no invisible characters, at least two letters or digits, and
 * not a reserved name. Returns the name to store and its skeleton key;
 * uniqueness is the database's.
 */
export function checkLeaderboardName(raw: string): NameCheck {
  const n = raw.normalize("NFKC").replace(/\u2019/g, "'");
  const plain = "Use Latin letters (accents are fine), numbers, spaces and . ' - & only.";
  if (INVISIBLE.test(n)) return { ok: false, message: plain };
  const name = n.replace(/\s+/gu, " ").trim();
  const len = Array.from(name).length;
  if (len < NAME_MIN || len > NAME_MAX) return { ok: false, message: `Use ${NAME_MIN} to ${NAME_MAX} characters.` };
  if (!Array.from(name).every(allowedChar) || /\p{M}{2,}/u.test(name) || /(?:^|[^\p{L}])\p{M}/u.test(name)) return { ok: false, message: plain };
  if ((name.match(/[\p{L}0-9]/gu) ?? []).length < 2) return { ok: false, message: "Include at least two letters or numbers." };
  const key = skeleton(name);
  const words = name.split(/[ .'&-]+/).map(skeleton).filter(Boolean);
  const reserved =
    RESERVED_WHOLE.has(key) ||
    RESERVED_INSIDE.some((r) => key.includes(r)) ||
    words.some((w) => RESERVED_EDGES.some((r) => w.startsWith(r) || w.endsWith(r))) ||
    words.some((w, i) => w === ROGER && i + 1 < words.length && AFTER_ROGER.has(words[i + 1]));
  if (reserved) return { ok: false, message: "That name is reserved. Try another." };
  return { ok: true, name, key };
}

/** A unique violation on the board-name index, and only that index (Neon and PGlite carry `code` and `constraint`). */
export function isNameTaken(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, constraint } = e as { code?: unknown; constraint?: unknown };
  return code === "23505" && constraint === NAME_INDEX;
}
