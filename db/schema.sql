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
-- Roger v3 app (B1). Spec: artifacts/v3/Roger v3 - design spec.md, B.14.
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
  admin_note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists users_status on users (status);

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
  position int not null default 0,
  title text not null,
  category text not null,
  body jsonb not null,
  shareable boolean not null default false,
  flag jsonb,
  cleared_by text,
  pool_play_id uuid references pool_plays (id) on delete set null,
  merged_at timestamptz,
  unique (run_id, set_, position)
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
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

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
