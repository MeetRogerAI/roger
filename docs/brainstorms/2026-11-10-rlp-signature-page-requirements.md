---
date: 2026-11-10
topic: rlp-signature-page
scope: lightweight
status: completed
---

# RLP Signature page — requirements

## Problem frame

We want a single shareable link, `meetroger.ai/rlpsignature`, to send to RLP Signature members. It shows them the "Roger for RLP Signature" video and asks them to email us to join the RLP Signature group. It should feel like a polished presentation page, not a bare video embed.

## Decisions

- **Unlisted.** Noindex/nofollow, left out of the sitemap and site nav, the same treatment as the `/for/[slug]` prospect pages. People reach it only through the link we send.
- **Minimal copy; the video does the work.** Order: headline, one supporting line and a compact CTA; then the video; then the full CTA block. Claude drafts the wording and the user edits it.
- **Presentation feel.** It uses the existing site design system (ground/copper palette, `text-display` headline, `btn btn-l`), and the video is the visual centerpiece of the page. It must not read as a generic centered SaaS template. Layout:
  1. **Hero band** (`bg-ground`): headline, sub and a compact CTA (`tlink chev`, "Email us to join"). It stays short so that on a phone the top of the video shows in the first viewport.
  2. **Video stage**: the dominant element, a large framed player (rounded-[8px], on a copper or night block in the spirit of the `/for/` hero cut-out).
  3. **Closing band** (`bg-night`, echoing the `/for/` close card): the primary `btn btn-l`, the visible address, and one expectation line ("We'll reply with next steps.").

## Requirements

- **R1. Route.** `/rlpsignature` renders the page. Any other path keeps its current behavior.
- **R2. Video.** Source file: `artifacts/Roger for RLP Signature - v8.mp4` (~8 MB, H.264/AAC, already faststart). It is published as `public/media/rlp-signature.mp4`, following the `public/media/toronto-aerial.mp4` convention. Only that copy is committed; `artifacts/` stays untracked.
  - The visitor starts playback: native controls, sound available, no autoplay with sound.
  - A poster frame at `public/media/rlp-signature-poster.jpg` (~1600px wide) so the area isn't blank before play. Source: the frame at 0:06 of the v8 video.
  - Use `preload="metadata"` so the 8 MB file doesn't download before the visitor presses play. Include fallback text inside the video element ("Video not loading? Email hello@meetroger.ai").
  - Give the player an accessible name (aria-label) and visible keyboard focus on its controls and the CTAs.
  - Responsive at 16:9: full content width on desktop; on phones, full width inside the standard 16px gutter, with no horizontal scroll.
  - Use a normal player, not the silent `VideoLoop` background component.
- **R3. CTA.** The primary button is a `mailto:` to `siteConfig.contactEmail` (hello@meetroger.ai) with the pre-filled subject "Join the RLP Signature group". Show the address as visible text too, so visitors without a mail client can copy it.
- **R4. CTA placement.** A compact text-link CTA in the hero, and the primary button plus visible address in the closing band after the video, so viewers who finish the video meet the ask right away.
- **R5. Metadata.** Use an absolute title, `{ absolute: "Roger for RLP Signature" }`, so it doesn't become "… · Roger" (same pattern as `src/app/for/[slug]/page.tsx`). Override the root layout's canonical and `og:url` with `/rlpsignature` so shared-link unfurls don't point at the homepage. The page is excluded from search through robots metadata, not only by leaving it out of the sitemap. The site's default OG image is fine.
- **R6. Site chrome.** Use the quiet `/for/` chrome: a header with no nav links and no header CTA, and the minimal footer. Today that chrome is selected by the `/for/` path prefix in the shared header and footer components, so `/rlpsignature` must be added to both checks explicitly.

## Draft copy (user to edit)

- Headline: **Roger for RLP Signature**
- Sub: *A short look at what Roger can do for RLP Signature members.*
- CTA button: **Join the group**, with the line *Want in? Email hello@meetroger.ai*

## Success criteria

- A member opens the link on a phone or laptop, plays the video with sound, and can email us in one tap.
- The page doesn't appear in search results or the sitemap.

## Out of scope

- A signup form, a database record, or member tracking. Email is the whole funnel.
- Video hosting on YouTube or Vimeo, and transcoding into multiple formats. Revisit only if members report the video stalling or failing to play.
- Analytics beyond what the site already has.
- Captions or a transcript. The video has none burned in. This is a known accessibility gap, deferred as a follow-up.

## Open questions

- None blocking. The final copy wording can be adjusted during implementation.
- Extracting the poster frame needs ffmpeg, which isn't installed. Planning picks the method (a one-off static binary via npx, or a manual export).
