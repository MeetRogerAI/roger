// How setup.mjs turns schema.sql into statements. Kept separate so a test can
// check that every statement in the file survives it.

/** Splits on a semicolon at the end of a line, then drops comments and blanks. */
export function splitSchema(text) {
  return text
    .split(/;\s*\n/)
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

/** The marker value that says a database is not production. */
export const NON_PRODUCTION = ["preview", "local", "test"];
