/**
 * The pattern passes of spec B.6 step 4, plus the harm check for whoever
 * pastes a playbook. Pure functions over text; the caller records what was
 * found. Replacements keep the step useful ("ban who, not how"). Patterns are
 * the first line only: a model pass follows for names and for harm.
 */
export type Finding = { kind: string; found: string; placeholder?: string; flag?: string };

type Rule = { kind: string; re: RegExp; placeholder: string };

/** Zero-width and direction-control characters hide words from every check, so they go first. */
export function normalise(input: string): string {
  return input.normalize("NFKC").replace(/[​-‏‪-‮⁠-⁤﻿]/g, "");
}

const TLD = "(?:com|net|org|io|co|ca|us|uk|ai|app|dev|me|info|biz|xyz|so|ly|gg|tv|to|in|de|fr|au|nz|ie|eu|cloud|site|online|store|shop|tech|link|page)";

// Order matters: emails before links, links before bare domains, phones before long digit strings.
const REPLACE: Rule[] = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, placeholder: "[an email address]" },
  { kind: "link", re: /(?:\b(?:https?|ftp|javascript|data|file):|(?<![\w/])\/\/|\bwww\.)[^\s<>()"'\]]+/gi, placeholder: "[a link]" },
  { kind: "link", re: new RegExp(`(?<![\\w@.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+${TLD}(?:/[^\\s<>()"'\\]]*)?(?![\\w-])`, "gi"), placeholder: "[a link]" },
  { kind: "phone", re: /(?<![\w-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}(?![\w-])/g, placeholder: "[a phone number]" },
  { kind: "phone", re: /(?<![\w-])\+\d{1,3}(?:[\s.-]?\d){7,12}(?![\w-])/g, placeholder: "[a phone number]" },
  { kind: "phone", re: /(?<![\w.:-])\d{3}-\d{4}(?![\w-])/g, placeholder: "[a phone number]" },
  { kind: "postal_code", re: /\b(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\s+\d{5}\b/g, placeholder: "[a state and ZIP code]" },
  {
    kind: "street_address",
    // Capitalised names take any suffix ("120 King Street", "4 Elm Ct", "456 5th Avenue").
    re: /\b\d{1,6}\s+(?:(?:[A-Z][A-Za-z'’-]*|\d+(?:st|nd|rd|th))\.?\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Crescent|Cres|Place|Pl|Terrace|Parkway|Pkwy|Highway|Hwy|Circle|Cir|Trail)\b\.?/g,
    placeholder: "[an address]",
  },
  {
    // Lower case only with abbreviations, which are not everyday words ("12 main st" yes, "2 hours on the road" no).
    kind: "street_address",
    re: /\b\d{1,6}\s+(?:[a-z0-9][a-z0-9'’-]*\.?\s+){1,3}(?:st|ave|rd|blvd|ln|cres|pkwy|hwy)\b\.?/g,
    placeholder: "[an address]",
  },
  { kind: "street_address", re: /\b\d{1,6},?\s+(?:rue|chemin|boulevard|avenue|calle|via)\s+[A-Za-zÀ-ÿ'-]+(?:[\s-][A-Za-zÀ-ÿ'-]+){0,3}/gi, placeholder: "[an address]" },
  { kind: "postal_code", re: /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, placeholder: "[a postal code]" },
  { kind: "postal_code", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/g, placeholder: "[a postal code]" },
  { kind: "postal_code", re: /\b\d{5}-\d{4}\b/g, placeholder: "[a postal code]" },
  { kind: "long_number", re: /(?<![\w.])\d(?:[\s-]?\d){7,}(?!\w|\.\d)/g, placeholder: "[a number]" },
];

/** Things in a playbook that could hurt whoever pastes it. The play is dropped (2026-11-27); never auto-fixed. */
const HARM: { flag: string; re: RegExp }[] = [
  { flag: "contains a link", re: /(?:\b(?:https?|ftp|javascript|data|file):|(?<![\w/])\/\/\w|\bwww\.)/i },
  { flag: "contains a link", re: new RegExp(`(?<![\\w@.-])(?:[a-z0-9-]+\\.)+${TLD}\\b`, "i") },
  {
    flag: "tells the agent to send data somewhere",
    re: /\b(?:send|email|e-mail|forward|upload|post|share|export|transfer|sync|copy|bcc|cc)\b[^\n]{0,100}\b(?:to|into|with|at)\b[^\n]{0,60}(?:@|\[an email address\]|\[a link\]|\b(?:outside|external|third[- ]party|this address|the following address|webhook|endpoint|server|pastebin|personal (?:inbox|account|email))\b)/i,
  },
  {
    flag: "mentions credentials",
    // Asking for a secret to be handed over, not a setup step that signs in to a site ("Site logins: 1" is in every play).
    re: /\b(?:paste|share|send|reveal|tell|give|post|email|copy|type|include|read out|print|show)\b[^\n]{0,50}\b(?:api[ _-]?keys?|passwords?|passcodes?|secret keys?|access tokens?|auth(?:entication)? tokens?|credentials?|cookies?|session (?:ids?|keys?|tokens?)|ssh keys?|private keys?|\.env|seed phrases?|recovery codes?|2fa codes?|one[- ]time codes?|bank (?:details|account numbers?|logins?)|card numbers?)\b|\b(?:api[ _-]?keys?|passwords?|private keys?|seed phrases?|\.env)\b[^\n]{0,30}\b(?:into|in) (?:the|this|a|your) (?:chat|reply|message|report|file|doc)/i,
  },
  {
    flag: "tries to override the agent's rules",
    re: /\b(?:ignore|disregard|forget|override|bypass|skip|turn off|disable)\b[^\n]{0,60}\b(?:instructions?|rules?|guardrails?|prompts?|approvals?|confirmations?|safety|restrictions?|policy|policies)\b|\b(?:from now on|you are now|new instructions|system prompt|developer mode|maintenance mode)\b/i,
  },
  {
    flag: "runs code or commands",
    re: /\b(?:curl|wget|powershell|iex|invoke-expression|bash|sh|zsh|chmod|sudo|npx|pip install|npm install|eval|exec)\b[^\n]{0,80}(?:\||https?:|\.sh\b|-c\b|install|\$\()|\|\s*(?:sh|bash|zsh|iex)\b|\b(?:run|execute|paste)\b[^\n]{0,40}\b(?:script|command|terminal|shell|console)\b/i,
  },
  { flag: "hides text", re: /[​-‏‪-‮⁠-⁤]|base64|<!--/i },
];

export function replacePatterns(input: string): { text: string; findings: Finding[] } {
  const findings: Finding[] = [];
  let text = normalise(input);
  for (const r of REPLACE) {
    text = text.replace(r.re, (m) => {
      findings.push({ kind: r.kind, found: m, placeholder: r.placeholder });
      return r.placeholder;
    });
  }
  return { text, findings };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text without accents: "Zoë" → "Zoe". */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/** Each plain Latin letter with every accented letter that folds to it ("e" → "èéêë…"), for phrasePattern. */
const ACCENTED = (() => {
  const m = new Map<string, string>();
  for (let cp = 0xc0; cp <= 0x24f; cp++) {
    const ch = String.fromCodePoint(cp);
    const base = stripDiacritics(ch).toLowerCase();
    if (base !== ch.toLowerCase() && /^[a-z]$/.test(base)) m.set(base, (m.get(base) ?? "") + ch);
  }
  return m;
})();

/**
 * A phrase as a pattern: any capitalisation, any accents ("Zoe Park" finds
 * "Zoë Park" and the other way round, composed or not), any run of spaces,
 * straight or curly apostrophes, whole words.
 */
export function phrasePattern(phrase: string): RegExp {
  const letter = (c: string) => {
    if (c === "'" || c === "’") return "['’]";
    const accented = ACCENTED.get(c.toLowerCase());
    return accented ? `[${c}${accented}]\\p{M}*` : escapeRe(c);
  };
  const body = stripDiacritics(phrase)
    .trim()
    .split(/\s+/)
    .map((w) => [...w].map(letter).join(""))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

/**
 * For comparing names: no accents, lower case, punctuation as single spaces;
 * apostrophes both dropped ("O'Brien" as "obrien") and as a space ("Zoë's"
 * as "zoe s"), so either spelling is found.
 */
function foldForNames(s: string): string[] {
  const base = stripDiacritics(normalise(s)).toLowerCase();
  const words = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [...new Set([words(base.replace(/['’‘`]/g, "")), words(base)])].filter(Boolean);
}

/**
 * True when `text` still holds any of `names`, ignoring case, accents and
 * punctuation: as whole words, or (a name of two words or more) run together
 * ("DanaWhitfield"). Used on what is left of a privacy outline: its title.
 */
export function holdsAnyName(text: string, names: string[]): boolean {
  const texts = foldForNames(text);
  for (const n of names) {
    const forms = foldForNames(n);
    if (forms.some((f) => texts.some((t) => ` ${t} `.includes(` ${f} `)))) return true;
    // Run together: only a name of whole words ("Dana Whitfield"), not one split at an apostrophe.
    const [f] = forms;
    if (f?.includes(" ") && texts.some((t) => t.replaceAll(" ", "").includes(f.replaceAll(" ", "")))) return true;
  }
  return false;
}

/** The member's own "never include" list, whole words, any capitalisation (spec check 10). */
export function replaceNeverWords(input: string, words: string[]): { text: string; findings: Finding[] } {
  const findings: Finding[] = [];
  let text = input;
  const sorted = [...new Set(words.map((w) => w.trim()).filter((w) => w.length > 0))].sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    text = text.replace(phrasePattern(w), (m) => {
      findings.push({ kind: "never_include", found: m, placeholder: "[removed]" });
      return "[removed]";
    });
  }
  return { text, findings };
}

/** "Never send...", "Don't paste your password": a guardrail, not harm. Looks back to the start of the clause. */
const NEGATED = /\b(?:never|don't|do not|doesn't|does not|no|not|nothing|without|avoid|refuse|stop)\b[^.;:!?\n]*$/i;

function matchesUnnegated(re: RegExp, text: string): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const before = text.slice(Math.max(0, m.index - 80), m.index);
    if (!NEGATED.test(before)) return true;
  }
  return false;
}

/**
 * Run on the text as received (before replacement), so a link still flags the
 * play. Returns the reasons only; the text itself is never copied. Links and
 * hidden text flag whatever surrounds them.
 */
export function harmFlags(input: string): string[] {
  const flat = normalise(input);
  const hit = (h: (typeof HARM)[number]) =>
    h.flag === "contains a link" || h.flag === "hides text" ? h.re.test(flat) || h.re.test(input) : matchesUnnegated(h.re, flat);
  return [...new Set(HARM.filter(hit).map((h) => h.flag))];
}
