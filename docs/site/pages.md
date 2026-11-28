# Pages: changing the website's words yourself

For Peter. Pages is in the admin, under **Website, Pages**. It changes the words, sections and lists of the homepage, How it works, Use cases (its headings and lines; the rows stay on the Use cases screen), FAQ and About, and the header, the footer and the buttons every page shares (**Shared**).

It does not change Privacy, Terms, the free Zack run at `/zack`, sign-up, the app, the emails, or page titles and search descriptions. Those are changed in code.

## The idea in one line

Everything you save is a **draft**. Nobody else sees a draft. **Publish** puts all drafts on the site at once. **Undo last publish** takes the last publish back.

## Changing words

1. Open **Pages**. Each page shows whether it has drafts waiting and whether its words differ from the original.
2. Pick a page. Its words are grouped by section, top to bottom. "Jump to" at the top takes you to a section.
3. Change the text and press **Save draft**. The box is then marked as a draft.
4. To go back to the built-in words, press **Reset to the original wording** under that box. "Show the original wording" shows them first.

Write plain text. To print a price or a count from Settings, type its name in braces, such as `{monthlyUsd}`; the page lists the names you can use. That way a price is changed once, in Settings, and every page follows.

A save is refused only when the page could not print it: an empty box, text over the box's limit, a name in braces that does not exist, or a link with no label or an address the site cannot use. What you typed stays in the box.

## Sections and lists

- **Sections**: at the top of each page, every section has a switch and **Move up** / **Move down**. Switching one off takes it off the page.
- **Lists** (the questions, the problem statements, the hero steps, the control columns, the examples, the days of "The week" and the steps on How it works, the header and footer links): each item has **Move up**, **Move down** and **Remove**. A removed built-in item waits under "Removed from this list" with **Put back**. New items are added at the foot of the list with **Add**. A question has "Show on the homepage".
- A header or footer link points at a page, a section of a page, or an address you type (starting with `/`, `https://` or `mailto:`).

Each press is saved straight away as a draft, like a text.

## Looking before you publish

Press **Preview** on a page (or in the review). The real page opens in a new tab with every draft on it, header and footer included, and a coloured bar at the foot: "Preview: you are seeing unpublished drafts." You can click around the site in that tab. **Exit preview** ends it; **Back to Pages** returns. Visitors never see the preview.

## Publishing

1. On Pages, press **Review and publish**. The **Publish** card with that button is there only while a saved draft would change the site.
2. The review lists every change, as a visitor will read it, and two kinds of warning:
   - **Wording warnings**, at the top of the review: a line that breaks one of the site's wording rules (for example "agent" without "AI", a time saved, a number). Each names the rule and the words. Press **Dismiss** on one once you have read it and it is fine: it leaves the box (the box goes with the last one), the text stays as it is, and it is still written in the admin log when you publish. A reload of the same review keeps it dismissed; a new save brings every warning back. Once all are dismissed, and there is no link or page warning, the button reads "Publish".
   - **Link warnings**: a link that would point at a section you switched off or an item you removed, or a page left with no main heading.
3. Warnings never stop you. Press the publish button at the foot ("Publish this 1 change", or "Publish anyway" when there are warnings). Publishing is for the whole site: every draft on every page goes live together. Each wording warning you publish over is written in the admin log.
4. Visitors see the changes from their next page view, within a few seconds.

If someone saved something in another tab after you opened the review, nothing is published and the review shows the new list: read it and publish again.

If the screen says a change "could not be written in the admin log", the change is on the site; only its log entry is missing.

## Taking it back

**Undo last publish** (on Pages, in the Publish card, or on its own under the heading when nothing is waiting) puts the site back to what it showed before the last publish. Your drafts stay, to fix and publish again. Only the last publish can be undone.

## Preview, production and releases

Preview (preview.meetroger.ai) and meetroger.ai each have their own Pages and their own drafts. Nothing you do on one changes the other.

- Make your changes **on preview** and publish them there.
- At each release, what is published on preview becomes the site's built-in wording, and meetroger.ai shows it after the release. You do not type anything twice.
- A change you publish **on meetroger.ai** between releases is live there at once, but it is never copied back to preview. Repeat it on preview if it should survive the next release.
- After a release, **Differs from the release** on meetroger.ai's Pages lists every edit made there that the release did not bring, with both wordings. It appears only on meetroger.ai, and only when something differs; preview never shows it. Keep them, or press **Reset all to the release** to make meetroger.ai match the release. Reset also throws away meetroger.ai's unpublished drafts, and says how many first. Undo last publish brings the edits back.
- Ask the developer not to take the release while you are still publishing on preview: anything published after the release is taken waits for the next one.

The developer's side of a release is in `docs/site/content-release.md`.
