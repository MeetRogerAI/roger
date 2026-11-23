// Creates the tables and loads the seed data. Run:
//   node --env-file=.env.local db/setup.mjs
//
// Options:
//   --fixtures          Also load made-up test data (the sample play). Refused
//                       unless the database is marked non-production.
//   --mark=<name>       Mark this database as non-production (preview, local
//                       or test). Do this once, when a Neon branch is made.
//                       Never on production.
//
// Safe to run again: every statement is idempotent, and seeds load only once.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { NON_PRODUCTION, splitSchema } from "./schema-split.mjs";

const args = process.argv.slice(2);
const wantFixtures = args.includes("--fixtures");
const mark = args.find((a) => a.startsWith("--mark="))?.slice("--mark=".length);

const sql = neon(process.env.DATABASE_URL);
const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

for (const stmt of splitSchema(read("./schema.sql"))) await sql.query(stmt);
console.log("schema ok");

// The library's seed use cases.
const seed = JSON.parse(read("./seed.json"));
let n = 0;
for (const u of seed) {
  await sql.query(
    `insert into use_cases (id, title, summary, category, persona, for_, tool, handle, url, source, outcome, featured, week_of)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seed',$10,$11,$12) on conflict (id) do nothing`,
    [u.id, u.title, u.summary, u.category, u.persona, u.for, u.tool || "", u.handle, u.url, u.outcome ?? null, !!u.featured, u.weekOf],
  );
  n++;
}
const [{ count }] = await sql.query("select count(*)::int as count from use_cases");
console.log(`seeded ${n}; library has ${count}`);

// Testimonials (spec B.12), only into an empty table so admin edits are never undone.
const [{ t }] = await sql.query("select count(*)::int as t from testimonials");
if (t === 0) {
  for (const q of JSON.parse(read("./seeds/testimonials.json"))) {
    await sql.query(
      `insert into testimonials (person, attribution, quote, said_on, audience, position, cleared) values ($1,$2,$3,$4,$5,$6,$7)`,
      [q.person, q.attribution, q.quote, q.said_on, q.audience, q.position, q.cleared],
    );
  }
  console.log("testimonials seeded");
} else console.log(`testimonials: ${t} already, left alone`);

// Environment marker.
if (mark) {
  if (!NON_PRODUCTION.includes(mark)) throw new Error(`--mark must be one of ${NON_PRODUCTION.join(", ")}`);
  await sql.query(
    `insert into settings (key, value, updated_at) values ('db.environment', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(mark)],
  );
  console.log(`marked this database as ${mark}`);
}
const rows = await sql.query("select value from settings where key = 'db.environment'");
const environment = rows[0]?.value ?? null;
console.log(`database environment: ${environment ?? "not marked (treated as production)"}`);

// Made-up fixtures: only with the flag and the marker, both.
if (wantFixtures) {
  if (!NON_PRODUCTION.includes(environment)) {
    console.log("--fixtures refused: this database is not marked non-production");
  } else {
    const p = JSON.parse(read("./seeds/sample-play.fixture.json"));
    const existing = await sql.query("select 1 from pool_plays where is_public_sample limit 1");
    if (existing.length) console.log("sample play: one is already chosen, left alone");
    else {
      await sql.query(
        `insert into pool_plays (title, category, description, heavy_use_for, playbook_md, paste_to_install, written_on, figures,
           f_hours, f_reach, f_ease, f_proof, f_surprise, score, is_public_sample, sample_checked_by, first_seen, last_seen)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,true,'fixture',$15,$16)`,
        [p.title, p.category, p.description, p.heavy_use_for, p.playbook_md, p.paste_to_install, p.written_on, JSON.stringify(p.figures),
          p.f_hours, p.f_reach, p.f_ease, p.f_proof, p.f_surprise, p.score, p.first_seen, p.last_seen],
      );
      console.log("sample play fixture loaded and chosen");
    }
  }
}
