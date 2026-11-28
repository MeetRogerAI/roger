# Roger · meetroger.ai

A library of real things people's AI agents do, collected from public posts every morning, plus Peter's offers: free starter packs, a $500 custom setup, a $50/month plan, and AI work for family-owned companies.

| Route | What it is |
|---|---|
| `/` | The library home: "I want my agent to…" search and watches, starter packs, shelves by category |
| `/library` | Every use case, searchable (`?q=…&cat=…`) |
| `/packs/solopreneur` | Free starter pack: 10 agents, 3 open, the rest unlocked with an email |
| `/setup` | The $500 custom setup and the $50/month plan |
| `/companies` | AI and automation for family-owned companies |
| `/for/[slug]` | Unlisted pitch pages for one company (noindex) |
| `/watch/confirm`, `/watch/stop` | Links from watch emails |
| `/admin` | Peter's admin: library, sign-ups, watches, connections, settings (password) |
| `/api/push` | Webhook: Peter's own agent sends post links here (token in Admin → Connections) |
| `/api/cron/ingest`, `/api/cron/watches` | Daily jobs (Vercel Cron, see `vercel.json`) |
| `/terms`, `/privacy`, `/refunds`, `/workshops` | Supporting pages |

`/home`, `/families` and `/business` redirect to `/setup`.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill it in
node --env-file=.env.local db/setup.mjs   # once: creates the tables and loads the starting library
npm run dev
```

Next.js 16 (App Router, Cache Components), Tailwind 4, TypeScript, Postgres (Neon), AI SDK through the Vercel AI Gateway.

## Environment variables

Set these in the Vercel project (Settings → Environment Variables), for Production and Preview.

| Name | Needed for |
|---|---|
| `DATABASE_URL` | Everything that saves: library, sign-ups, watches, admin, webhook. Add Neon from the Vercel Marketplace and it is set for you. |
| `ADMIN_PASSWORD` | Signing in to `/admin` |
| `ADMIN_SECRET` | Signs the admin session and encrypts keys saved in admin. Any long random string; keep it stable. |
| `CRON_SECRET` | Lets Vercel Cron run the daily jobs. Any long random string. |
| `REF_SECRET` | Signs the `roger-ref` referral cookie set by `/r/{code}` (B2). Optional: without it a key derived from `ADMIN_SECRET` (or `CRON_SECRET`) is used. Changing it forgets referral links visitors opened before. |
| `UNSUB_SECRET` | Signs the unsubscribe links in the Wednesday stats email (`/u/{token}`, B2) and a guest invitation's opt-out link (`/o/{token}`, its own derived key). Required for both: without it no stats email or guest invitation is sent (the admins are alerted for the stats email); there is no fallback to `ADMIN_SECRET`. Any long random string; keep it stable, because changing it breaks the unsubscribe links in emails already sent. |
| `RESEND_API_KEY` | Watch emails. Optional here: can be pasted in Admin → Connections instead, or set by the Resend integration. |
| `X_BEARER_TOKEN`, `XAI_API_KEY` | Optional X sources for the daily intake. Can also be pasted in Admin → Connections. |
| `SITE_URL` | Optional. Links in emails, e.g. `https://meetroger.ai` |
| `ADMIN_EMAILS` | Who is an admin of the v3 app: the addresses, comma-separated (any capitalisation). Signed in by email link, they can open `/admin`; they also get the admin alerts and are never counted as members in the measures. Read on every request, so removing an address takes effect at once. |
| `GITHUB_REVIEW_TOKEN` | The review bot's write token (B3). **Production only, never Preview.** A fine-grained token for `MeetRogerAI/roger` only, with Contents and Pull requests set to write, from a machine account (not a person's), so a person can be the required reviewer. Without it, or off production, the bot runs in dry run and opens no pull requests. |
| `GITHUB_READ_TOKEN` | Optional, read-only (Contents read and Metadata), for Preview: the review bot's dry-run reads of `main`. Without it those reads are unauthenticated (60 an hour). |
| `REVIEW_BOT_MODEL` | Optional. The review bot's model through the AI Gateway; default `anthropic/claude-opus-5.5`. |
| `CORA_UPGRADE_MODEL` | Optional. The model that judges Cora upgrades (`v3.coraUpgradesOn`); default `anthropic/claude-sonnet-5.5`. |

The scenario tests' variables (`SCENARIO_TARGET`, `SCENARIO_DATABASE_URL` and the Stripe sandbox keys and prices) are never set in Vercel: see `tests/scenarios/README.md`.

The AI step (judging and rewriting posts) uses the Vercel AI Gateway, which works on Vercel with no key.

Without `DATABASE_URL` the site still builds and shows the starting library built into the code; sign-ups, watches and admin say they are not switched on.

## Where the library comes from

- **Daily intake** (`src/lib/ingest`): X (with a key), Grok's X search (with an xAI key) and Hacker News. A model keeps only real use cases and rewrites them in our words.
- **Peter's own agent**: Admin → Connections has a prompt for Grok Bot (or any agent) and a token. It sends X links to `/api/push`; the site opens each link itself, so made-up links never get in.
- **By hand**: Admin → Use cases → Add.

## Where things live

- `src/data/` site copy and config: packs, ladder, company offer, defaults for the settings Peter can change in admin
- `src/lib/` database, settings, secrets, ingest, watches, email, admin auth
- `src/app/admin/` the admin panel
- `db/schema.sql`, `db/seed.json` the database and the starting library
