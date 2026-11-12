---
date: 2026-11-12
topic: hampton-zack-instructions
scope: lightweight
status: completed
---

# /hampton: Zack The Collector instructions page

## Problem frame

We want one link, `meetroger.ai/hampton`, to send to the Hampton group. It explains how to run Zack The Collector by hand in their own agent, produce a `.md` output file, and email it to us before the deadline. The page should look polished and match the rest of the site, not read like a bare checklist.

## Decisions

- **Unlisted**, treated the same way as `/rlpsignature`: noindex/nofollow robots metadata, left out of the sitemap, and the quiet chrome (a header with no nav links and no CTA, plus the minimal footer).
- **Three agent files are offered**: for Claude, for Duet and for Hark. Each has Download and Copy.
- **Dates are shown on the page.** The page itself does not change after the deadline.

## Requirements

- **R1. Route.** `/hampton` renders the page. Every other path behaves as it does today.
- **R2. Hero.** The headline is exactly "Instructions for Zack The Collector". Directly below it is a short date strip with three items:
  - Date: November 12, 2026
  - Deadline: end of Friday, November 13
  - Results: Monday, November 16
- **R3. Steps.** A numbered step list (1–4), styled in the site's design system (ground/copper/night palette, existing type scale and `btn` styles). It must feel like a guided sequence and not a generic SaaS template.
  1. **Download or copy the .md file that works with your agent.** Show one card per agent: Claude (v0.6), Duet (v0.1) and Hark (v1.8). Each card has:
     - a **Download** button that saves the `.md` file and keeps its original filename, e.g. `Zack The Collector (for Claude).md`;
     - a **Copy** button that puts the full file text on the clipboard and briefly confirms it ("Copied").
  2. **Prompt.** Show the prompt in a code-style block with a Copy button: `Run Zack the Collector now from the attached file and create a .md output file.` Add one line telling visitors to attach or paste the file from Step 1.
  3. **Email the output file to hello@meetroger.ai.** Include the note: "This goes directly to Peter Kuperman, no one else." Give a mailto button with the subject "Zack results" and say to attach the `.md` file. Show the address as visible, copyable text as well.
  4. **(Optional) Review and offer feedback.** Ask visitors to look over the process, the input file and the result, and tell us how to make it better. Give a mailto button with the subject "Zack feedback". Mark this step clearly as optional.
- **R4. Source files.** The three files come from `artifacts/Zack/`. `artifacts/` stays untracked, so copies are published under `public/` and committed. Download and Copy must both serve exactly the published file contents.
- **R5. Metadata.** Use an absolute title (no "· Roger" suffix), set the canonical and `og:url` to `/hampton`, and add the robots noindex.
- **R6. Responsive and accessible.** The page works at phone width with a 16px gutter and no horizontal scroll. Focus is visible on every button. Each Copy confirmation is announced to screen readers.

## Success criteria

- A Hampton member opens the link, picks their agent's file, runs it with the given prompt, and emails the result in a few minutes without asking us anything.
- The page does not appear in search results or in the sitemap.

## Out of scope

- An upload form or any server-side handling of results. Email is the whole funnel.
- Changing the page automatically after the deadline.
- Editing the Zack files themselves.

## Open questions

- None blocking. Planning decides the exact copy polish and how the file text reaches the Copy button.
