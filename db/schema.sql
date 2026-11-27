-- Roger library: use cases, the raw posts they come from, watches, and leads.
create table if not exists use_cases (
  id text primary key,
  title text not null,
  summary text not null,
  category text not null,
  persona text not null default 'everyone',
  for_ text not null check (for_ in ('home', 'work')),
  tool text not null default '',
  handle text not null,
  author text not null default '',
  url text not null unique,
  source text not null default 'seed',
  outcome text check (outcome in ('win', 'honest-miss')),
  featured boolean not null default false,
  posted_at timestamptz,
  week_of date not null default current_date,
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', title || ' ' || summary || ' ' || tool || ' ' || category)) stored
);
create index if not exists use_cases_search on use_cases using gin (search);
create index if not exists use_cases_created on use_cases (created_at desc);
create index if not exists use_cases_category on use_cases (category);

create table if not exists raw_posts (
  source text not null,
  external_id text not null,
  url text not null,
  author text not null default '',
  handle text not null default '',
  text text not null,
  posted_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'error')),
  reason text,
  fetched_at timestamptz not null default now(),
  primary key (source, external_id)
);
create index if not exists raw_posts_status on raw_posts (status);

create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  query text not null,
  token text not null unique,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists watches_active on watches (confirmed_at) where unsubscribed_at is null;

create table if not exists watch_hits (
  watch_id uuid not null references watches (id) on delete cascade,
  use_case_id text not null references use_cases (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (watch_id, use_case_id)
);

create table if not exists leads (
  id bigserial primary key,
  email text not null,
  kind text not null,          -- 'pack' (got a starter pack) or 'interest' (asked for a coming-soon persona)
  persona text not null,
  utm text not null default '',
  created_at timestamptz not null default now(),
  unique (email, kind, persona)
);

create table if not exists ingest_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched int not null default 0,
  accepted int not null default 0,
  notes text not null default ''
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- API keys Peter pastes into /admin. Encrypted with ADMIN_SECRET; a Vercel env var of the same name wins.
create table if not exists secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- One row per post in the Lomax sheet. The sheet is the source of truth; this
-- tracks what Roger has done with each row so the hourly sync only rewrites
-- what's new or changed. state: pending (needs the AI rewrite), live (in
-- use_cases), excluded (tag or tab not for the library), hidden (deleted in
-- /admin, so not re-added), error (rewrite failed; retried next run).
create table if not exists sheet_posts (
  post_id text primary key,
  url text not null,
  tab text not null default '',
  category text,
  tag text not null default '',
  handle text not null default '',
  agent text not null default '',
  summary text not null default '',
  posted_at timestamptz,
  likes int,
  views int,
  reposts int,
  used_in_post text not null default '',
  state text not null default 'pending' check (state in ('pending', 'live', 'excluded', 'hidden', 'error')),
  use_case_id text,
  error text,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sheet_posts_state on sheet_posts (state);

-- ===========================================================================
-- Roger v3 app (B1). Spec: artifacts/Roger v3 - design spec.md, B.14.
-- Plan: docs/plans/2026-11-22-001-feat-roger-v3-app-b1-plan.md, Unit 2.
--
-- FREEZE RULE. Once a table below has been applied to a database, do not edit
-- its create statement: "if not exists" would silently skip the change there.
-- Append every later change at the end of this file as its own idempotent
-- statement (alter table ... add column if not exists, drop constraint if
-- exists then create unique index if not exists, and so on).
--
-- setup.mjs splits this file on a semicolon at the end of a line and strips
-- everything after two dashes, so never end a comment line with a semicolon,
-- and never put two dashes inside a string.
-- ===========================================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  display_name text not null default '',
  path text not null default 'new' check (path in ('new', 'running')),
  not_ready boolean not null default false,
  profile jsonb not null default '{}',
  agent text not null default '',
  status text not null default 'signup' check (status in ('signup', 'trial', 'active', 'held', 'cancelled', 'closed')),
  hold_reason text check (hold_reason in ('first_charge_failed', 'renewal_unpaid', 'amount_changed')),
  plan text not null default 'monthly' check (plan in ('monthly', 'per_run')),
  sharing text not null default 'share' check (sharing in ('share', 'match_only', 'off')),
  consent_at timestamptz,
  currency text check (currency in ('USD', 'CAD')),
  country text not null default '',
  timezone text not null default 'America/Toronto',
  signup_step text not null default 'quiz' check (signup_step in ('quiz', 'account', 'plan', 'card', 'done')),
  email_verified_at timestamptz,
  google_sub text unique,
  stripe_customer text unique,
  stripe_subscription text,
  free_lists_used int not null default 0,
  trial_started_at timestamptz,
  first_charge_at timestamptz,
  quote jsonb,
  cancel_requested_at timestamptz,
  access_ends_at timestamptz,
  email_prefs jsonb not null default '{}',
  zack_key_hash text unique,
  zack_key_prefix text not null default '',
  sponsor_id uuid,
  referral_code text unique,
  referred_by uuid,
  ref text not null default '',
  utm text not null default '',
  pending_zack_token text,
  admin_note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists users_status on users (status);
-- Every path writes lower-cased emails; this makes a slip impossible, not just unlikely.
create unique index if not exists users_email_lower on users (lower(email));

create table if not exists sessions (
  id_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  method text not null check (method in ('email', 'google', 'pilot')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions (user_id);

create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  purpose text not null default 'signin' check (purpose in ('signin', 'pilot', 'email_change')),
  user_id uuid references users (id) on delete cascade,
  next_path text not null default '',
  payload jsonb,
  created_by text,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_tokens_email on login_tokens (lower(email), created_at desc);

create table if not exists zack_settings (
  user_id uuid primary key references users (id) on delete cascade,
  skip_categories text[] not null default '{}',
  skip_sensitive text[] not null default '{}',
  never_words text[] not null default '{}',
  outline_categories text[] not null default '{}',
  plays_per_week int not null default 4 check (plays_per_week between 1 and 4),
  extra_rules text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists zack_settings_history (
  id bigserial primary key,
  user_id uuid not null references users (id) on delete cascade,
  sharing text not null,
  skip_categories text[] not null default '{}',
  skip_sensitive text[] not null default '{}',
  never_words text[] not null default '{}',
  outline_categories text[] not null default '{}',
  plays_per_week int not null,
  extra_rules text not null default '',
  changed_at timestamptz not null default now()
);
create index if not exists zack_settings_history_user on zack_settings_history (user_id, changed_at desc);

-- One hidden record per person whose pilot runs seed the pool (requirements
-- R25). Never shown. user_id links it to that person's real account so Cora
-- leaves their own plays out of their lists.
create table if not exists seed_contributors (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  user_id uuid unique references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  contributor_id uuid references seed_contributors (id) on delete cascade,
  week_of date not null,
  route text not null check (route in ('connector', 'upload', 'free_tool', 'admin', 'seed')),
  agent text not null default '',
  sharing text not null check (sharing in ('share', 'match_only', 'off')),
  raw_text text not null,
  parsed jsonb,
  parsed_by text check (parsed_by in ('block', 'model')),
  status text not null default 'received' check (status in ('received', 'accepted', 'flagged', 'rejected', 'deleted')),
  reason text not null default '',
  is_test boolean not null default false,
  zack_version text not null default '',
  attempts int not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  check ((user_id is null) <> (contributor_id is null)),
  check ((route = 'seed') = (contributor_id is not null))
);
create unique index if not exists runs_user_week on runs (user_id, week_of, is_test) where user_id is not null and status <> 'deleted';
create unique index if not exists runs_seed_week on runs (contributor_id, agent, week_of) where contributor_id is not null;
create index if not exists runs_status on runs (status);

create table if not exists pool_plays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null,
  heavy_use_for text not null default '',
  playbook_md text not null,
  paste_to_install text not null,
  written_on text not null default '',
  figures jsonb not null default '{}',
  f_hours int,
  f_reach int,
  f_ease int,
  f_proof int,
  f_surprise int,
  score int,
  active boolean not null default true,
  is_public_sample boolean not null default false,
  sample_checked_by text,
  first_seen date not null,
  last_seen date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists pool_plays_one_sample on pool_plays (is_public_sample) where is_public_sample;

create table if not exists plays (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  user_id uuid references users (id) on delete cascade,
  contributor_id uuid references seed_contributors (id) on delete cascade,
  week_of date not null,
  set_ text not null check (set_ in ('A', 'B', 'runner_up')),
  position int not null,
  title text not null,
  category text not null,
  body jsonb not null,
  shareable boolean not null default false,
  flag jsonb,
  cleared_by text,
  pool_play_id uuid references pool_plays (id) on delete set null,
  merged_at timestamptz,
  unique (run_id, set_, position),
  check ((user_id is null) <> (contributor_id is null))
);
create index if not exists plays_pool on plays (pool_play_id);
create index if not exists plays_unmerged on plays (week_of) where pool_play_id is null and shareable;

create table if not exists cora_weeks (
  week_of date primary key,
  status text not null default 'running' check (status in ('running', 'ready', 'sent', 'failed')),
  phase text not null default 'started' check (phase in ('started', 'intake_closed', 'merged', 'scored', 'picked', 'ready')),
  dry_run boolean not null default false,
  lease_until timestamptz,
  runs_read int not null default 0,
  plays_merged int not null default 0,
  pool_size int not null default 0,
  users_picked int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sent_at timestamptz
);

-- One row per user per week Cora considered: where the job is in its batch
-- and what came of it (picked, short, none, not eligible).
create table if not exists cora_user_weeks (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  outcome text not null check (outcome in ('picked', 'short', 'none', 'not_eligible')),
  eligible_count int not null default 0,
  picked_count int not null default 0,
  note text not null default '',
  dry_run boolean not null default false,
  decided_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (user_id, week_of)
);

create table if not exists picks (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  position int not null check (position between 1 and 3),
  pool_play_id uuid not null references pool_plays (id),
  personal_score int not null,
  fit int not null,
  reason text not null,
  dry_run boolean not null default false,
  delivered_at timestamptz,
  is_free_list boolean not null default false,
  opened_at timestamptz,
  setup_marked_at timestamptz,
  setup_confirmed_at timestamptz,
  primary key (user_id, week_of, position)
);
create index if not exists picks_play on picks (pool_play_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  status text not null default 'ordered' check (status in ('ordered', 'cancelled', 'charged', 'sent', 'no_run', 'failed')),
  amount_cents int,
  currency text,
  stripe_invoice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_of)
);

-- Claim rows for every charge. A charge goes ahead only after its row is
-- inserted. Outcome "unknown" means the Stripe call may have happened and must
-- be looked up by claim id before anything is retried.
create table if not exists charge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('first_charge', 'order', 'amount_changed')),
  week_of date not null,
  attempt int not null default 1,
  outcome text not null default 'claimed' check (outcome in ('claimed', 'succeeded', 'declined', 'hard_declined', 'unknown', 'error')),
  amount_cents int,
  currency text,
  stripe_object text,
  decline_code text,
  error text,
  claimed_at timestamptz not null default now(),
  settled_at timestamptz,
  next_attempt_at timestamptz,
  unique (user_id, purpose, week_of, attempt)
);
create index if not exists charge_attempts_open on charge_attempts (claimed_at) where outcome in ('claimed', 'unknown');

create table if not exists contribution_weeks (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  result text not null check (result in ('contributed', 'missed', 'by_choice', 'excused')),
  excused_by text,
  period_start date,
  primary key (user_id, week_of)
);

create table if not exists pending_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  period_start date not null,
  amount_cents int not null,
  currency text not null,
  stripe_item text,
  status text not null default 'pending' check (status in ('pending', 'deleted', 'invoiced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live adjustment per billing period. A deleted or invoiced one does not block a new one.
create unique index if not exists pending_adjustments_one_live on pending_adjustments (user_id, period_start) where status = 'pending';

-- At most one automatic email per (recipient, kind, ref). recipient is a user
-- id, or "admins" for alerts. A failed send can be claimed again, up to three
-- attempts. A sent row is never claimed again.
create table if not exists notifications (
  id bigserial primary key,
  recipient text not null,
  kind text not null,
  ref text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  unique (recipient, kind, ref)
);

create table if not exists admin_actions (
  id bigserial primary key,
  admin_email text not null,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_user on admin_actions (user_id, created_at desc);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  status text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  claimed_at timestamptz not null default now(),
  done_at timestamptz,
  error text
);

create table if not exists rate_events (
  key text not null,
  window_start bigint not null,
  count int not null default 1,
  expires_at timestamptz not null,
  primary key (key, window_start)
);
create index if not exists rate_events_expiry on rate_events (expires_at);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  attribution text not null,
  quote text not null,
  said_on date,
  audience text not null default 're' check (audience in ('re', 'agents', 'both')),
  position int not null default 0,
  cleared boolean not null default false
);

create table if not exists free_runs (
  token text primary key,
  email text not null,
  agent text not null,
  report text,
  report_at timestamptz,
  claimed_by uuid,
  utm text not null default '',
  created_at timestamptz not null default now(),
  unique (email, agent)
);

create table if not exists setup_files (
  id uuid primary key default gen_random_uuid(),
  slug text not null default 'real-estate-starter',
  version int not null,
  body_md text not null,
  note text not null,
  saved_by text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (slug, version)
);
create unique index if not exists setup_files_one_published on setup_files (slug) where published;

-- ===========================================================================
-- Changes after first application go below this line, newest last.
-- ===========================================================================

-- 2026-11-22, Unit 8 (Zack 2.0): the private matching profile Zack sends after
-- each run. Matching only for every user, whatever their sharing mode: never
-- pooled, never shown to anyone else.
create table if not exists zack_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  route text not null check (route in ('connector', 'upload', 'admin')),
  raw_text text not null,
  parsed jsonb,
  status text not null default 'received' check (status in ('received', 'accepted', 'rejected', 'deleted')),
  reason text not null default '',
  is_test boolean not null default false,
  revision int not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index if not exists zack_profiles_user_week on zack_profiles (user_id, week_of, is_test) where status <> 'deleted';

-- 2026-11-22, Unit 8: a replaced run gets a new revision, so intake writes its
-- result only for the text it read (where id = $1 and revision = $read).
alter table runs add column if not exists revision int not null default 0;

-- 2026-11-23, Unit 9: each play records the run revision it was made from, so
-- plays from a replaced text are removed even if a replacement races intake.
alter table plays add column if not exists revision int not null default 0;

-- 2026-11-23, Unit 10: when the current Zack key was made, so the Zack page
-- says "connected" only for reports sent with this key.
alter table users add column if not exists zack_key_created_at timestamptz;

-- 2026-11-23, Unit 11a: the job line of a pool play, which merging compares
-- (Cora 2.0 change 3: same job, not same title).
alter table pool_plays add column if not exists job text not null default '';

-- 2026-11-23, Unit 11a: a short lease, so only one process places plays in
-- the pool at a time (the Cora job, a seed import).
create table if not exists leases (
  name text primary key,
  holder text not null,
  until timestamptz not null
);

-- 2026-11-23, Unit 11c: who holds the week (so only that worker writes it),
-- consecutive errors before a week fails, merge attempts per play, and a
-- lasting record of who contributed to each pool play (spec check 13).
alter table cora_weeks add column if not exists holder text;
alter table cora_weeks add column if not exists error_count int not null default 0;
alter table plays add column if not exists merge_attempts int not null default 0;
create table if not exists pool_play_contributors (
  pool_play_id uuid not null references pool_plays (id) on delete cascade,
  contributor text not null,
  primary key (pool_play_id, contributor)
);
create index if not exists pool_play_contributors_who on pool_play_contributors (contributor);

-- 2026-11-23, Unit 12a: the price a claim was made with, so a takeover repeats
-- exactly the call that was claimed.
alter table charge_attempts add column if not exists price text;

-- 2026-11-23, Unit 13: the link to an order's receipt (Stripe's hosted invoice page).
alter table orders add column if not exists receipt_url text;

-- 2026-11-23, Unit 14 (the contributor rule): the missed week that raised an
-- adjustment, the invoice it goes on, when its Stripe item may be made (a
-- carried one waits for the renewal), and why it was deleted. A deletion
-- for an excuse or a cancellation does not stop the period's adjustment being
-- raised again, every other reason does.
alter table pending_adjustments add column if not exists week_of date;
alter table pending_adjustments add column if not exists invoice_at timestamptz;
alter table pending_adjustments add column if not exists create_after timestamptz;
alter table pending_adjustments add column if not exists deleted_reason text;

-- 2026-11-23, Unit 14 review: when a deleted adjustment's Stripe item was
-- confirmed gone (a failed delete is retried hourly), and the billing cycle
-- anchor of the member's current subscription, which billing months are
-- counted from (overwritten on every new subscription).
alter table pending_adjustments add column if not exists stripe_deleted_at timestamptz;
alter table users add column if not exists billing_anchor timestamptz;

-- 2026-11-23, Unit 14 (one mechanism): why a month owes the higher rate's
-- difference (two_misses, or not_sharing when any of its cutoffs found
-- sharing off), and the difference a first charge added to its first invoice.
alter table pending_adjustments add column if not exists reason text not null default 'two_misses';
alter table charge_attempts add column if not exists extra_cents int not null default 0;

-- 2026-11-23, Unit 14 final review: when the Stripe item was first asked
-- for. After that the row's wording is frozen, and a row with no stored item
-- looks for one carrying its id before anything else.
alter table pending_adjustments add column if not exists attempted_at timestamptz;
-- 2026-11-23, Unit 16: what the onboarding checklist has seen that no other
-- table records (the startup page viewed, the setup file shown, the daily goal
-- agreed, the Zack controls opened), each as the time it first happened.
alter table users add column if not exists onboarding jsonb not null default '{}';

-- 2026-11-23, Unit 16: the live setup file is one row per file, so publishing
-- is a single upsert with no window where two versions (or none) are live.
-- This replaces setup_files.published, which is no longer read or written.
create table if not exists setup_file_live (
  slug text primary key,
  version int not null,
  published_at timestamptz not null default now(),
  foreign key (slug, version) references setup_files (slug, version)
);
insert into setup_file_live (slug, version) select slug, version from setup_files where published on conflict (slug) do nothing;

-- 2026-11-23, Unit 16: email changes are approved from the current address
-- first (email_approve), then confirmed from the new one (email_change). The
-- purpose check is replaced whatever its name: every check on login_tokens
-- that mentions purpose is dropped, then the new one is added. One line, so
-- setup.mjs keeps it whole. Run setup.mjs on production BEFORE deploying the
-- code that issues email_approve links.
do $$ declare c record; begin for c in select conname from pg_constraint where conrelid = 'login_tokens'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%purpose%' loop execute format('alter table login_tokens drop constraint %I', c.conname); end loop; alter table login_tokens add constraint login_tokens_purpose_check check (purpose in ('signin', 'pilot', 'email_change', 'email_approve')); end $$;

-- 2026-11-23, Unit 16: whether Stripe's customer has the user's current email.
-- Set false when the address changes, true once Stripe has it; the hourly pass
-- retries and tells admins after repeated failures.
alter table users add column if not exists stripe_email_synced boolean not null default true;
alter table users add column if not exists stripe_email_attempts int not null default 0;

-- 2026-11-23, Unit 15 (the billing page): the answer to "Why are you leaving?",
-- a plan switch still to happen (plan_change_to, from plan_change_at: the end
-- of the paid month, or the Tuesday after a Monday whose cutoff had passed),
-- when a renewal first failed and its invoice (held after 7 days unpaid), and
-- when a cancelled account's saved cards were removed in Stripe.
alter table users add column if not exists cancel_reason text;
alter table users add column if not exists plan_change_to text check (plan_change_to in ('monthly', 'per_run'));
alter table users add column if not exists plan_change_at timestamptz;
alter table users add column if not exists renewal_failed_at timestamptz;
alter table users add column if not exists renewal_invoice text;
alter table users add column if not exists cards_removed_at timestamptz;

-- 2026-11-23, Unit 15: each "Update card" Checkout session acts once (the
-- return page and the webhook both see it), so a held charge is retried once
-- per new card, not once per caller.
create table if not exists card_updates (
  session_id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2026-11-23, Unit 15 review: a card update is claimed before anything is
-- done with it (claimed_at), and done only once its follow-up ran (done_at,
-- with the outcome shown to the member), so a failed follow-up runs again on
-- Stripe's retry. When the plan last changed (a first-charge repair never
-- reaches back past it), and when a paying one-at-a-time member switched to
-- monthly (if that first charge fails for good they go back to one at a
-- time, not "trial closed").
alter table card_updates add column if not exists claimed_at timestamptz not null default now();
alter table card_updates add column if not exists done_at timestamptz;
alter table card_updates add column if not exists outcome text;
alter table users add column if not exists plan_switched_at timestamptz;
alter table users add column if not exists switched_from_per_run_at timestamptz;

-- 2026-11-23, Unit 17 (the admin): weeks an admin excused before they were
-- recorded, for one member (user_id) or for everyone (user_id null). When
-- recordWeek records the week, a result that would be "missed" becomes
-- "excused"; by choice and contributed are never overridden. An excuse for
-- everyone also excuses the weeks already recorded, and its row is what an
-- undo removes.
create table if not exists week_excuses (
  id bigserial primary key,
  week_of date not null,
  user_id uuid references users (id) on delete cascade,
  excused_by text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists week_excuses_one on week_excuses (week_of, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 2026-11-23, Unit 17: the answer to the one optional question when a member
-- cancels (the Interest page counts them). Unit 15's cancel writes it.
alter table users add column if not exists cancel_reason text;

-- 2026-11-23, Unit 15 re-review: a month's difference dropped by a switch to
-- one at a time (deleted_reason switch) is carried to the first charge when
-- the member comes back to monthly within 62 days (carried_at), so switching
-- away and back never dodges it. The first charge bills it and marks it
-- invoiced.
alter table pending_adjustments add column if not exists carried_at timestamptz;

-- 2026-11-23, Unit 18 (housekeeping): why housekeeping closed an account
-- (no_first_list, the 21-day trial close), so its closing email is tried
-- again on later passes until it is sent. Closing also sets access_ends_at,
-- which the retention clock counts from.
alter table users add column if not exists closed_reason text;

-- 2026-11-23, Unit 18 (Google sign-in): one row per sign-in started with
-- Google. Only the hash of the state value is stored, and the browser holds
-- the state itself in a cookie. The callback uses a row once (used_at), so a
-- replayed callback finds nothing. payload carries a sign-up's details, as
-- the email sign-up link does. Expired rows are removed hourly.
create table if not exists oauth_states (
  state_hash text primary key,
  verifier text not null,
  nonce text not null,
  next_path text not null default '',
  payload jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_states_expiry on oauth_states (expires_at);

-- 2026-11-23, Unit 18 review: the Google address a sign-in was linked with
-- (shown on the settings page). Cleared with google_sub on unlink and on any
-- change of the Roger email address.
alter table users add column if not exists google_email text;

-- 2026-11-26, payment at first list, Unit 1: sign-up ends without a card. A
-- trial with trial_started_at null has no card yet ("has card" is
-- trial_started_at not null, or sponsor_id set). first_teaser_at is when the
-- first held list's teaser was sent (the no-card close counts from it).
-- setup_session is the open embedded card session, reused until complete or
-- expired. promo_code, promo_coupon and promo_label hold the promotion code
-- locked in at card save (Stripe has no customer-level discounts since
-- Basil, so the coupon is applied at preview and at subscription create).
alter table users add column if not exists first_teaser_at timestamptz;
alter table users add column if not exists setup_session text;
alter table users add column if not exists promo_code text;
alter table users add column if not exists promo_coupon text;
alter table users add column if not exists promo_label text;

-- 2026-11-26, payment at first list, Unit 1: a held week replaced by a newer
-- one for a no-card trial. Superseded weeks are never delivered (not late,
-- not at the unlock).
alter table cora_user_weeks add column if not exists superseded_at timestamptz;

-- 2026-11-26, payment at first list, Unit 1: Roger counts promotion code uses
-- itself, because a coupon applied directly never counts a redemption in
-- Stripe. One row per code and member, written in the card-save claim. The
-- unique (promotion_code, user_id) index also serves lookups by code alone.
create table if not exists promo_reservations (
  id bigserial primary key,
  promotion_code text not null,
  user_id uuid not null references users (id) on delete cascade,
  card_fingerprint text,
  reserved_at timestamptz not null,
  unique (promotion_code, user_id)
);

-- 2026-11-26, payment at first list, Unit 5: the last use of a limited code
-- is taken by one member only. A reservation for a code with a limit takes
-- the next slot number; two members saving at once both ask for the same
-- slot and the unique index lets one of them have it (a code with no limit
-- leaves slot null, which never conflicts). promo_refused_at is when a
-- pending code could not be applied at card save (used up, or first-time
-- only); the card is saved at the regular price and the return page says so.
alter table promo_reservations add column if not exists slot integer;
create unique index if not exists promo_reservations_slot on promo_reservations (promotion_code, slot);
create index if not exists promo_reservations_fingerprint on promo_reservations (card_fingerprint) where card_fingerprint is not null;
alter table users add column if not exists promo_refused_at timestamptz;

-- 2026-11-26, payment at first list, Unit 5 review fixes: when the hourly
-- unlock_pending sweep last tried to unlock this member's list (job clock).
-- The sweep takes members never tried first, then the longest since their
-- last try, and skips those tried in the last 50 minutes, so members whose
-- unlock keeps failing cannot take every place in a pass.
alter table users add column if not exists unlock_attempted_at timestamptz;

-- 2026-11-26, payment at first list, Unit 8 review fixes: charge_attempts.coupon
-- is the coupon the claimed subscription create was sent with, so a takeover
-- repeats exactly that call (same parameters, same idempotency key) even if
-- the member's promo_coupon changed meanwhile. users.promo_ended_label names
-- a locked-in discount Stripe stopped applying (dropped at a preview), kept
-- until the amount-changed hold or the first charge, so the email can say the
-- discount ended even if the hold comes on a later pass. promo_duration
-- (once, repeating or forever) and promo_duration_months are the coupon's
-- duration, stored with the pending code and at card save, for the Price Box
-- and the first-charge emails.
alter table charge_attempts add column if not exists coupon text;
alter table users add column if not exists promo_ended_label text;
alter table users add column if not exists promo_duration text;
alter table users add column if not exists promo_duration_months integer;

-- 2026-11-26, payment at first list, whole-branch review: signup_finished_at
-- is when Step 3 moved the account to a trial (job clock, stamped once by
-- finishSignup). A legacy sign-up resumed at Step 3 keeps its first, older
-- consent, so the never-teasered no-card clock, its nudges and the welcome
-- retry count from this stamp instead (rows without it fall back to
-- consent_at). card_fingerprint is the member's saved card (Stripe's
-- fingerprint, the same card number gives the same value), written at every
-- card save and card update, so a first-time-only promo code refuses a card
-- another member has saved.
alter table users add column if not exists signup_finished_at timestamptz;
alter table users add column if not exists card_fingerprint text;
create index if not exists users_card_fingerprint on users (card_fingerprint) where card_fingerprint is not null;

-- 2026-11-27, B2 (growth), Unit 1. Plan:
-- docs/plans/2026-11-27-001-feat-roger-v3-b2-growth-plan.md. Every B2 table
-- and column. Each feature is also behind its own v3 switch (referralsOn,
-- leaderboardOn, statsOn, sponsorsOn), all off by default.
--
-- referrals: one row per person a member brought in, by link or as a session
-- guest. referred_user_id is set once the person has an account (one
-- referrer per account, first referrer wins). referred_email holds a guest's
-- normalised address until they sign up: Unit 3 clears it once the account
-- is linked, and the retention job (Unit 9) clears it 90 days after the
-- session if they never do. Stages move invited, trial, paying, or void
-- (self-referral by card, with void_reason). generation is 1 for a direct
-- referral. A deleted referrer leaves referrer_id null, so the row and its
-- credits stay for reconciliation.
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references users (id) on delete set null,
  referred_user_id uuid references users (id) on delete set null,
  referred_email text,
  source text not null check (source in ('link', 'guest')),
  generation int not null default 1 check (generation >= 1),
  stage text not null default 'invited' check (stage in ('invited', 'trial', 'paying', 'void')),
  void_reason text,
  created_at timestamptz not null default now(),
  trial_at timestamptz,
  paying_at timestamptz,
  voided_at timestamptz,
  check (referred_user_id is null or referred_user_id <> referrer_id)
);
create unique index if not exists referrals_referred_user_id on referrals (referred_user_id) where referred_user_id is not null;
create unique index if not exists referrals_referrer_email on referrals (referrer_id, lower(referred_email)) where referred_email is not null;
create index if not exists referrals_referrer on referrals (referrer_id, created_at desc);

-- credits: the ledger behind the Stripe customer balance. user_id is the
-- member whose balance the row moves (the referrer). A grant is posted once
-- per referral, a clawback once per Stripe refund or dispute, and a lapse
-- once per account close event (each keyed by source_object_id), zeroing an
-- unused balance. Amounts are cents and never negative: the kind gives the
-- direction. uncollected_cents is the part of a clawback the balance could
-- not cover, and offset_cents the part of a grant's gross used to cover
-- earlier shortfalls. reason says why a row was made or changed.
-- source_payment_intent links a grant to the charge a refund or dispute
-- names. The row id is the Stripe idempotency key and
-- metadata.credit_ledger_id, and stripe_txn the balance transaction once
-- posted. The ledger outlives accounts: deleting a user or a referral sets
-- user_id or referral_id null and keeps the Stripe ids. Because of that the
-- database cannot require a referral on grants and clawbacks: Unit 4 code
-- always sets it when inserting them.
create table if not exists credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  referral_id uuid references referrals (id) on delete set null,
  kind text not null check (kind in ('grant', 'clawback', 'lapse')),
  amount_cents int not null check (amount_cents >= 0),
  uncollected_cents int not null default 0 check (uncollected_cents >= 0),
  offset_cents int not null default 0 check (offset_cents >= 0),
  currency text not null check (currency in ('USD', 'CAD')),
  status text not null default 'pending_customer' check (status in ('pending_customer', 'pending_switch', 'frozen', 'posted', 'lapsed')),
  reason text,
  stripe_txn text,
  source_payment_intent text,
  source_object_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  check (kind not in ('clawback', 'lapse') or source_object_id is not null)
);
create unique index if not exists credits_one_grant on credits (referral_id) where kind = 'grant';
create unique index if not exists credits_one_clawback on credits (referral_id, source_object_id) where kind = 'clawback';
create unique index if not exists credits_one_lapse on credits (user_id, source_object_id) where kind = 'lapse';
create unique index if not exists credits_stripe_txn on credits (stripe_txn) where stripe_txn is not null;
create index if not exists credits_user on credits (user_id, created_at desc);
create index if not exists credits_unposted on credits (status) where status in ('pending_customer', 'pending_switch');
create index if not exists credits_payment_intent on credits (source_payment_intent) where source_payment_intent is not null;

-- points: a cache of each member's weekly points (computed from picks and
-- pool_play_contributors), for rank and history. total = adopted +
-- confirmed. A past week is authoritative once written.
create table if not exists points (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  adopted int not null default 0,
  confirmed int not null default 0,
  total int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, week_of)
);
create index if not exists points_week on points (week_of, total desc);

-- session_guests: one guest a member invited to a group session (one per
-- member per session). Only the hash of the /g token is stored. The
-- retention job (Unit 9) purges name and email 90 days after session_date if
-- the guest never signed up.
create table if not exists session_guests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  inviter_id uuid not null references users (id) on delete cascade,
  referral_id uuid references referrals (id) on delete set null,
  session_date date not null,
  name text,
  email text,
  rsvp_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists session_guests_one_per_session on session_guests (inviter_id, session_date);
create index if not exists session_guests_created on session_guests (created_at);
create index if not exists session_guests_purge on session_guests (session_date) where email is not null;

-- session_attendance: who an admin ticked as attending a group session, a
-- member or a guest (exactly one). marked_by holds the admin's email. (The
-- name "sessions" is taken by sign-in sessions.)
create table if not exists session_attendance (
  id bigserial primary key,
  session_date date not null,
  user_id uuid references users (id) on delete cascade,
  guest_id uuid references session_guests (id) on delete cascade,
  marked_by text not null,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (guest_id is null))
);
create unique index if not exists session_attendance_member on session_attendance (session_date, user_id) where user_id is not null;
create unique index if not exists session_attendance_guest on session_attendance (session_date, guest_id) where guest_id is not null;

-- sponsors: a company that pays for its members' seats by monthly invoice.
-- Only the hash of the sign-up code is stored (it is shown once). Prices are
-- cents per seat per month, standard and higher (the contributor rule, per
-- seat). alerted_80_at is when admins were told 80% of the seats are taken.
-- users.sponsor_id points here, and a sponsor cannot be deleted while a
-- member does (revoke it instead).
create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null check (currency in ('USD', 'CAD')),
  standard_cents int not null check (standard_cents > 0),
  higher_cents int not null check (higher_cents > 0),
  seats int not null check (seats >= 0),
  code_hash text not null unique,
  billing_email text not null,
  billing_country text not null default '',
  billing_postal text not null default '',
  stripe_customer text unique,
  alerted_80_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists users_sponsor on users (sponsor_id) where sponsor_id is not null;
-- One line, so setup.mjs keeps it whole. No code wrote users.sponsor_id before B2.
do $$ begin if not exists (select 1 from pg_constraint where conname = 'users_sponsor_id_fkey') then alter table users add constraint users_sponsor_id_fkey foreign key (sponsor_id) references sponsors (id) on delete restrict; end if; end $$;

-- sponsor_invoices: one invoice per sponsor per calendar month (month is its
-- first day). Prepare makes the Stripe draft once, Send finalizes it.
create table if not exists sponsor_invoices (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors (id) on delete restrict,
  month date not null,
  stripe_invoice text,
  prepared_by text,
  prepared_at timestamptz,
  sent_at timestamptz,
  unique (sponsor_id, month)
);

-- users: when the member joined the leaderboard (set only from its prompt,
-- their display_name is unique, ignoring case, among opted-in members), and
-- a cache of their Stripe customer balance as credit in cents (positive is
-- credit they can spend) with when it was read.
alter table users add column if not exists leaderboard_opt_in_at timestamptz;
alter table users add column if not exists credit_balance_cents int;
alter table users add column if not exists credit_balance_at timestamptz;
create unique index if not exists users_leaderboard_name on users (lower(display_name)) where leaderboard_opt_in_at is not null;

-- pool_play_contributors: when the contributor was added (job clock). A pick
-- counts toward a contributor's points only if they contributed before it
-- was delivered. Rows from before B2 stay null, earlier than everything.
alter table pool_play_contributors add column if not exists contributed_at timestamptz;

-- users.pending_referrer_id (B2 Unit 3): the referrer resolved at sign-up,
-- written by the same insert that creates the account, and cleared once
-- attribution has run (or definitely refused). A row still holding one is
-- retried by the hourly referral_pending task, so a failed attempt is never
-- lost. A deleted referrer clears it.
alter table users add column if not exists pending_referrer_id uuid;
create index if not exists users_pending_referrer on users (pending_referrer_id) where pending_referrer_id is not null;
-- One line, so setup.mjs keeps it whole.
do $$ begin if not exists (select 1 from pg_constraint where conname = 'users_pending_referrer_id_fkey') then alter table users add constraint users_pending_referrer_id_fkey foreign key (pending_referrer_id) references users (id) on delete set null; end if; end $$;

-- 2026-11-27, B2 Unit 4. users.pending_referrer_attempts: failed passes of the
-- hourly referral_pending retry. A row that has failed REFERRAL_RETRY_ATTEMPTS
-- times is no longer picked (admins are told once), so rows that keep failing
-- cannot starve newer ones.
alter table users add column if not exists pending_referrer_attempts int not null default 0;
-- 2026-11-27, B2 Unit 4 review. credits_unposted covers the rows waiting to
-- post (pending_*); a frozen row is held by a dispute and is not waiting.
-- credits_waiting orders the posting sweep by when a row was last tried
-- (updated_at), so rows that cannot post never starve the rest.
create index if not exists credits_waiting on credits (updated_at, id) where status in ('pending_customer', 'pending_switch');
-- referrals.grant_checked_at / grant_attempts: the hourly late-grant sweep
-- (a referral still in trial whose member has paid) stamps each look and counts
-- failures, and gives up after a few.
alter table referrals add column if not exists grant_checked_at timestamptz;
alter table referrals add column if not exists grant_attempts int not null default 0;
-- users.credit_lapse_tried_at: when the hourly credit lapse last tried this
-- closed account without finishing; the lapse takes the least recently tried
-- first, so an account that keeps failing never starves the rest.
alter table users add column if not exists credit_lapse_tried_at timestamptz;
-- 2026-11-27, B2 Unit 6 review. pool_play_contributors.contributed_week: the
-- list week (runs.week_of) of the run that made this contributor. Points use
-- it, not contributed_at, so the rule never compares stamps from two clocks: a
-- pick counts for a contributor only if contributed_week is null (from before
-- B2) or earlier than the pick's week_of. contributed_at stays as an audit stamp.
alter table pool_play_contributors add column if not exists contributed_week date;
