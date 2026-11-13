# Still needed from Peter

November 13, 2026 · Owner: Peter Kuperman

Eight things the build depends on that only Peter can supply. Engineering follows up on each one. When an item arrives, tick its box and add the date.

## Open

- [ ] **1. The pilot week and its animation.** The real Cora sort file, turned into `content/pilot/week.json`, and the animation built to the storyboard in spec 7.4.
  Needed for: the homepage "One cycle" section. The section stays hidden without the data file; the poster shows until the animation exists.

- [ ] **2. Photo and signature.** Headshot at `public/media/peter.jpg` and signature at `public/media/peter-signature.svg`.
  Needed for: the letter on the homepage and `/about`. Both have fallbacks (initials and a typed name).

- [ ] **3. The letter.** Peter's edit and approval of the text in spec 10.2.
  Needed for: the letter on the homepage and `/about`.

- [ ] **4. The confidentiality agreement.** Kept off the site. It must say that Cora, an AI, processes members' weekly runs.
  Needed for: seating the first member.

- [ ] **5. Retention and legal read.** A decision on how long reports are kept (`{retention}` in the privacy text), and a read of the privacy text and guarantee terms in spec 6.8.
  Needed for: the privacy and terms pages.

- [ ] **6. Two Stripe payment links.** US$200 a month and CA$280 a month.
  Needed for: the first kickoff.

- [ ] **7. The recurring Google Meet links.**
  Needed for: the kickoff email.

- [ ] **8. Four more Zack files.** Instinct, Muse, Dots and Viktor.
  Needed for: opening those agents. They show as "coming soon" until each file is added to `artifacts/Zack/`.

## Resolved

- [x] **Can Zack for Claude see chats inside Claude projects?** Yes. Confirmed by Peter, November 13, 2026. The Claude instructions page does not show its projects note.
