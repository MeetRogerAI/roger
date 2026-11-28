# Releasing the site's content

The words, sections and lists Peter edits in Pages travel to production with each release (plan
`docs/plans/2026-11-27-0941-feat-admin-cms-plan.md`, R19 to R22, KTD1, KTD6, KTD9, KTD13). There is no push
button between the sites and no shared secret.

## How the layers work

A covered page prints three layers, each an overlay on the one below:

1. **The code copy**: `src/data/site/v1.ts`, `examples.ts`, `letter.ts`.
2. **The release file**: `src/data/site/released.json`, written by the release snapshot below. The code copy with
   this file on it is the **baseline**: what Pages calls "the original wording" and what "Differs from the release"
   compares with.
3. **The site's own published edits**, in its database (`settings` row `site.content`).

A stored edit that equals the baseline is not an edit (KTD6). So once a release carries preview's edits in
`released.json`, preview's stored entries stop counting on their own, and nothing needs clearing on preview. They
are tidied away the next time anything is saved there.

## The release checklist

Run these while preparing the release, **before the merge to `main`**, from a checkout of the exact code being
released (the branch that will be merged). In the launch (plan U12) this is step 2. No secret or sign-in is needed.

1. **Make sure preview runs the code being released, and that Peter has published what he wants released.**
   preview.meetroger.ai is the `preview` branch: merge the release branch into it and wait for the deploy. The
   snapshot is checked against this checkout's field, section and list ids; if preview runs other code (an
   experiment on `preview` that adds or renames ids), the check in step 2 fails and nothing is changed. Ask Peter
   not to publish on preview between the snapshot and go-live: anything published after the snapshot stays on
   preview only (take the snapshot again to include it).
2. **Take the snapshot**, from the repo's root:

   ```sh
   npm run snapshot-content
   # the same, said out loud:
   npm run snapshot-content -- https://preview.meetroger.ai
   # or from the environment (PowerShell: $env:SNAPSHOT_FROM = "https://preview.meetroger.ai"):
   SNAPSHOT_FROM=https://preview.meetroger.ai npm run snapshot-content
   ```

   It reads `https://preview.meetroger.ai/api/site-content/published` (public, read-only, published content only,
   read straight from preview's database), writes `src/data/site/released.json` with its keys in order, runs
   `src/data/site/released.test.ts` against it, and prints what changed against the file that was there. Plain
   Node: the same in Git Bash, PowerShell and a POSIX shell. Exit code 0 means the file was written (or already
   held the export) and passed; 1 means nothing changed.

   It writes nothing, or puts the old file back, and exits with 1, when:

   - the address is not `https` (plain `http` is allowed for `localhost` only), or holds a user name or password;
   - preview does not answer within 30 seconds, answers with a redirect (none is followed), with a certificate
     Node does not trust, or with more than 5 MB;
   - preview answers **503**: it could not read its database, or the stored row is not content it can read. A
     snapshot then would drop every unreleased edit. Wait a minute and run it again; if it keeps answering 503,
     look at preview's logs on Vercel for the line "[site content] The release export could not read the
     published content." and its reason, and at the Neon database's status;
   - preview answers **409**: something published there cannot be released as it is. The script prints each one,
     with where to find it in Pages. Two kinds:
     - *A wording longer than its field allows today* (a header label saved under the old 80-character limit, now
       24): Peter shortens it in Pages on preview and publishes.
     - *"Stored as published on this site, and shown on no page because this site's code cannot read it"*: an
       entry under a name preview's code does not have (an id renamed or removed in code, or an experiment's
       field), or a value its field can no longer print. If it is wording to keep, the code must know that name
       again before the snapshot. If not, publish any change in Pages on preview (a publish stores what is
       published afresh, without it; a change and its reset are two publishes), then run the snapshot again;
   - preview answers 401, 403 or 404 (the deploy is protected, or does not have the export yet: check step 1);
   - the answer is not a content overlay of the format this checkout reads;
   - the new file fails the strict test of this checkout's code, or the test cannot be run, takes over ten
     minutes, or is stopped with Ctrl-C. Then the old file is put back as it was.

   The file is written whole or not at all (a new file renamed over the old one), so a crash cannot leave half of
   it.
3. **Read the diff**: `git diff src/data/site/released.json`. Every entry is wording, a tick box, a link, a section
   switch or order, or a list change that preview shows today. Compare it with what Peter expects to go live.
4. **Run the gates**: `npm run lint`, `npx next typegen && npx tsc --noEmit`, `npm test`,
   `npm run test:scenarios`, `npm run build`. The tests that pin the code copy read the release file as empty
   (`src/test-helpers/empty-release.ts`), so a snapshot cannot break them; `src/data/site/released.test.ts` holds
   the real file to the strict reading and renders every covered page with it. Nothing else runs these tests
   before a deploy (Vercel runs `next build` only, and the site reads the file leniently), so do not skip them.
5. **Verify on a local build with no database**: `npm run build`, then `npm run start` with no `DATABASE_URL`
   (and `SITE_VERSION=v1` if your environment sets another). The homepage, How it works, FAQ, About and Use cases
   show preview's published wording, sections and lists, the header and footer its links. Stop the server.
6. **Commit it with the release** (`feat(site): release snapshot of preview's content`, or as part of the release
   commit). If `main` is merged into the branch after this, the file is unaffected; run the gates again.
7. **After go-live**: open Admin, Website, Pages on **production** and read **Differs from the release**. It lists
   every edit made on production that the release did not bring, with the release's wording and production's.
   Keep them, or press **Reset all to the release** so production matches preview. Reset also throws away
   production's unpublished drafts, and says how many before it runs; **Undo last publish** brings the edits back
   until the next publish, and the drafts as long as nothing is saved first. Then open Pages on **preview**: the
   same panel lists only what was published there since the snapshot, and edits in sections switched off on
   preview (marked "No visitor sees this"), which a release never carries.
8. **Check the export on production once**: `https://meetroger.ai/api/site-content/published` answers 200 with
   the release file's content (plus any production edits), and `Cache-Control: no-store`.

## What the snapshot carries, and what it does not

- Only what a visitor to preview can already read. A field in a section preview has switched off, or of an item it
  has removed, keeps the wording the previous `released.json` had for it: hidden text is never made public by a
  release, and a wording released earlier is not lost. A list in a switched-off section is the previous release's,
  except that How it works takes apart the first of the homepage's examples: with the homepage's examples off and
  How it works' anatomy on, that first example travels as preview shows it. Words printed in more than one section
  (the examples' copy button, the line under the prices) count as hidden only when every section that prints them
  is off (`printedIn` in `src/lib/site/content/export.ts`).
- What preview has switched off and moved, and its tick boxes ("Show on the homepage"): a visitor can see each.
- Never drafts, the previous published content, an admin's name or a time.
- Field ids as the code names them today (`nav.pricing.label`, never the old `nav.pricing`).

When a page starts printing a field of another section (or stops), update `printedIn` or `shownElsewhere` in
`src/lib/site/content/export.ts`: `src/lib/site/content/export.render.test.tsx` renders every page before and after
a release and fails on wording a release loses or exposes.

## Things a release does to a site's own edits

"Differs from the release" says each of these when it happens:

- **An item a release removes from a list cannot be put back by any site.** Pages can only put back what the
  baseline has. To bring one back, take it out of the list's `removed` in `released.json` in a commit (or put it
  back on preview before the snapshot).
- **An item a site added to a list that the release fills to its limit is no longer shown**, and the next save on
  that site deletes it. The panel shows its wording so it can be added again after making room.
- **A page whose sections a site has moved keeps its own order and its own on and off for every section.** A
  section a later release switches off stays on there until that page's sections are reset.
- **An edit in a section switched off on the site is listed, marked "No visitor sees this".** It was never
  released, and a reset takes it away with the rest.
- **An edit made on production is never copied to preview.** Repeat it on preview if it should survive the next
  release (R22).

## Changing released wording in code

An entry in `released.json` wins over the code copy. When a later code change rewrites a field that the release
file also holds, change that entry or delete it in the same commit, or the code change will not show.

## Checking a snapshot locally

The export answers on any build: `npm run build`, `npm run start`, then
`npm run snapshot-content -- http://localhost:3000`. Rebuild after the file changes: the release file is part of
the build. Put `released.json` back to the empty overlay afterwards unless the snapshot is the release's.
