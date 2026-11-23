// The decisions db/setup.mjs makes, kept apart so tests can run them.

/** Marker values that say a database is not production. */
export const NON_PRODUCTION = ["preview", "local", "test"];

/** Counts live data. A production database has some; a new branch has none. */
export const LIVE_DATA_SQL = `select (select count(*) from leads)::int as leads,
  (select count(*) from use_cases where source <> 'seed')::int as synced,
  (select count(*) from users where status <> 'signup')::int as accounts`;

/** Why marking would be refused, or null when it is allowed. */
export function markRefusal(mark, live) {
  if (!NON_PRODUCTION.includes(mark)) return `--mark must be one of ${NON_PRODUCTION.join(", ")}`;
  if (live.leads || live.synced || live.accounts) {
    return `Refusing to mark this database "${mark}": it holds live data (${live.leads} sign-ups, ${live.synced} synced posts, ${live.accounts} accounts). That is what production looks like. Point DATABASE_URL at the new branch and run again.`;
  }
  return null;
}

/** Whether made-up fixtures may load: the flag and a non-production marker, both. */
export function fixturesAllowed(wantFixtures, environment) {
  return Boolean(wantFixtures) && NON_PRODUCTION.includes(environment);
}

/**
 * Seeds the testimonials once, in one statement: all rows or none, only into
 * an empty table, and records that it ran so a later run never adds them back.
 * $1 is the JSON array from seeds/testimonials.json.
 */
export const SEED_TESTIMONIALS_SQL = `with seed as (
    select * from json_to_recordset($1::json)
      as q(person text, attribution text, quote text, said_on date, audience text, position int, cleared boolean)
  ), added as (
    insert into testimonials (person, attribution, quote, said_on, audience, position, cleared)
    select person, attribution, quote, said_on, audience, position, cleared from seed
    where not exists (select 1 from testimonials)
      and not exists (select 1 from settings where key = 'seed.testimonials')
    returning 1
  )
  insert into settings (key, value, updated_at)
  values ('seed.testimonials', to_jsonb((select count(*) from added)), now())
  on conflict (key) do nothing`;
