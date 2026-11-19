# Still needed from Peter

November 13, 2026 · Owner: Peter Kuperman

Seven things the build depends on that only Peter can supply. Engineering follows up on each one. When an item arrives, tick its box and add the date.

## Open

- [ ] **1. The pilot week and its animation.** The real Cora sort file, turned into `content/pilot/week.json`, and the animation built to the storyboard in spec 7.4.
  Needed for: the homepage "One cycle" section. The section stays hidden without the data file; the poster shows until the animation exists.

- [ ] **2. Photo and signature.** Headshot at `public/media/peter.jpg` and signature at `public/media/peter-signature.svg`.
  Needed for: the letter on the homepage and `/about`. Both have fallbacks (initials and a typed name).

- [ ] **4. The confidentiality agreement.** Kept off the site. It must say that Cora, an AI, processes members' weekly runs.
  Needed for: seating the first member.

- [ ] **5. Legal read.** A read of the privacy text and guarantee terms in spec 6.8. Also check the model provider's terms on not training on members' runs.
  Needed for: the privacy and terms pages.

- [ ] **6. Two Stripe payment links.** US$200 a month and CA$280 a month.
  Needed for: the first kickoff.

- [ ] **7. The recurring Google Meet links.**
  Needed for: the kickoff email.

- [ ] **8. Four more Zack files.** Instinct, Muse, Dots and Viktor.
  Needed for: opening those agents. They show as "coming soon" until each file is added to `artifacts/Zack/`.

## Resolved

- [x] **The letter.** Peter edited and approved it, November 15, 2026. Final text is in spec 10.2; one version for the homepage and `/about`.
- [x] **Report retention.** Decided by Peter, November 15, 2026: 90 days after we answer the application; members' reports are kept as long as they are members. Reports must be deleted on that schedule, so a hand-run admin action or scheduled job is needed before launch.
- [x] **Can Zack for Claude see chats inside Claude projects?** Yes. Confirmed by Peter, November 13, 2026. The Claude instructions page does not show its projects note.
