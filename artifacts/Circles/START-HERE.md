# Roger Circles: start here

Handoff package · November 13, 2026 · Owner: Peter Kuperman

This folder holds everything needed to build the Circles version of meetroger.ai: the spec, the design, and the agent file that ranks each week's plays. Read this page first.

## What is being built

meetroger.ai changes from a library that sells setups into one pitch: apply for a founding Roger Circle. A Circle is a confidential group of eight people who use AI agents heavily for work. Each Sunday an agent called Zack writes up each member's best plays. Overnight an agent called Cora merges and ranks them. On Monday morning every member is emailed the ranked list and their own top 3. That weekly cycle runs with nobody in the loop.

## What is in this folder

| File or folder | What it is |
|---|---|
| `START-HERE.md` | This page. |
| `Roger (CTA Circles) - design spec.md` | The spec, version 0.6. Features by version, routes, data tables, privacy and terms text, all copy, acceptance checks. |
| `SCREEN-MAP.md` | Every design frame matched to its route and its version. |
| `Cora The Curator v1.1.md` | How Cora merges, scores and sorts. Version 1.0 plus the six changes in spec section 12. |
| `design/` | The source of every frame on the design canvas, plus `canvas.json`, which lists them. |
| `../Zack/` | The four live Zack files (Claude, Grok Bot, Duet, Hark), all version 1.8. Already in the repo, not copied here. |

## The four versions

The spec lists features by version. What to build, and in what order, is the engineering team's decision.

| Version | Scope | Spec section | Half-days |
|---|---|---|---|
| v1a | Public site core: homepage, Zack tool, two-step application, currency toggle, privacy and terms | 6 | 9 |
| v1b | `/how-it-works`, `/about`, `/faq`, and the "One cycle" section with its animation | 7 | 3, plus 2 to 3 to produce the animation |
| v2 | Admin for applications and Circles, and the automatic weekly cycle (run intake, Cora, Monday send, playbook downloads) | 8 | 9 |
| v3 | Internal lead engine on the use-case library: prospects, reply queue, funnel | 9 | 6 |

## Which document wins

- **The spec** decides behaviour, data, rules and copy.
- **The design canvas** decides layout.
- Peter sometimes edits wording directly on the canvas. Where the canvas wording is newer than the spec, the canvas wins and the spec should be updated to match.

## How to look at the design

- **The canvas:** https://claude.ai/artifact/7rNFVNnCAK8ytfbu9wDKDE. Anyone with this link can open it.
- **The source:** each file in `design/` is one frame, written as HTML with inline styles. The files display only inside the canvas, but colours, sizes, spacing and copy can be read straight from the source.
- **Tokens:** every colour and size in the frames is a value from `src/app/globals.css`. No new colours or fonts were added. The frames load Mona Sans from Google Fonts; the site already loads it through `next/font`.
- **States:** most frames carry switches for their states (seats taken, currency, form errors, step 1 or step 2, and so on). They are listed in each frame's `data-props`.
- **Long pages:** a canvas frame is at most 8,000 px tall. The homepage is longer, so it is shown as two desktop frames and three mobile frames. The extra frames import `Main.dc.html`; there is one homepage design, not several.

## What is not final in the design

| Where | What is still a placeholder |
|---|---|
| Homepage, "One cycle" | The animation frame and its four numbers: `[RUNS]`, `[PLAYS]`, `[MERGED]`, `[TOP]`. They come from `content/pilot/week.json` (spec 7.4). |
| `/how-it-works`, "The anatomy of a play" | The sample play. It will be one real play from the pilot sort. |
| `/zack/claude` | The instructions body. It is rendered from the Zack file for that agent. |
| Homepage and `/about` | Peter's photo (initials shown) and signature (typed name shown). |
| Homepage library section | `{total}`, the live count from the database. |
| All admin frames | Sample data. Every person and handle is invented. |

The frames were written without being rendered by their author. Treat spacing as intent, not as pixel-exact.

## Notes on Cora

- `Cora The Curator v1.1.md` is a draft made from version 1.0 and the six changes agreed on November 13. Peter confirms it before it is used.
- Cora's score is a weighted sum of five factors scored 1 to 10, with weights that total 100. The sum is divided by 10, so the final score is out of 100. Peter confirmed this on November 13, and the formula in version 1.1 shows it.
- Cora writes one file per Circle and sends nothing to members. The site splits her file per member and sends it (spec section 8).

## Still needed from Peter

From spec section 11:

1. The pilot week as `content/pilot/week.json`, and the animation built to the storyboard in spec 7.4.
2. His headshot at `public/media/peter.jpg` and his signature at `public/media/peter-signature.svg`.
3. His edit and approval of the letter (spec 10.2).
4. The confidentiality agreement, which must say that Cora, an AI, processes members' weekly runs.
5. A decision on how long reports are kept, and a read of the privacy text and guarantee terms (spec 6.8).
6. Two Stripe payment links: US$200 and CA$280 a month.
7. The recurring Google Meet links.
8. Zack files for Instinct, Muse, Dots and Viktor, when those agents open.
9. A test of whether Zack for Claude can see chats inside Claude projects.

## Before writing code

- Read `AGENTS.md` at the repo root. This Next.js version has breaking changes.
- Branch from `main`.
- The whole change sits behind one switch, `siteConfig.flags.circlesMode`. Turning it off restores today's site.
- The old offer pages are hidden, not deleted (spec 6.2).
