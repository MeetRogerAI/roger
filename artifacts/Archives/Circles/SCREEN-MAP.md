# Screen map

Every frame on the design canvas, matched to its route and version. Frame files are in `design/`.

## Public site

| Frame file | Screen | Route | Version | States shown by its switches |
|---|---|---|---|---|
| `Main.dc.html` | Homepage, desktop | `/` | v1a | Seats taken (0 to 24), currency, launch note (manual or auto), founder photo present or missing |
| `Home-2.dc.html` | Homepage, desktop, lower part | `/` | v1a | None. It imports `Main.dc.html` and shows it from 7,900 px down. |
| `Home-mobile.dc.html` | Homepage, mobile, part 1 | `/` | v1a | Same as `Main.dc.html`, at 390 px wide |
| `Home-mobile-2.dc.html` | Homepage, mobile, part 2 | `/` | v1a | None. Imports `Main.dc.html`, from 7,900 px down. |
| `Home-mobile-3.dc.html` | Homepage, mobile, part 3 | `/` | v1a | None. Imports `Main.dc.html`, from 15,800 px down. |
| `Zack.dc.html` | Agent picker and email gate | `/zack` | v1a | Agent picked (live or coming soon), before and after sending |
| `Zack-claude.dc.html` | Instructions and paste-back | `/zack/[agent]` | v1a | Valid token or not, Claude projects note, report saved |
| `Apply.dc.html` | Two-step application | `/apply` | v1a | Step 1, "not yet", step 2; report pre-filled; errors; currency; database not configured |
| `Apply-thanks.dc.html` | Confirmation | `/apply/thanks` | v1a | First application or an update |
| `Chrome.dc.html` | Header and footer reference | Every page | v1a | Desktop, no-button variant, mobile closed and open |
| `How-it-works.dc.html` | The week in detail | `/how-it-works` | v1b | None |
| `About.dc.html` | Peter's letter in full | `/about` | v1b | Founder photo present or missing |
| `FAQ.dc.html` | All questions | `/faq` | v1b | None |

The homepage's "One cycle" section is designed inside `Main.dc.html`. Its frame and numbers are part of v1a's homepage; its data file and animation are specified in v1b (spec 7.4).

## Admin

| Frame file | Screen | Route | Version | States shown |
|---|---|---|---|---|
| `Admin-applications.dc.html` | Applications list and detail | `/admin/applications` | v2 | Filter by status; click a row for its detail |
| `Admin-circles.dc.html` | Circles board and "This week" | `/admin/circles` | v2 | A forming Circle, a Circle with its eighth seat filled, a running Circle on a Monday morning |
| `Admin-overview.dc.html` | Overview numbers and Zack runs | `/admin`, `/admin/zack` | v2 | The banner shown after a deploy adds an agent |
| `Admin-prospects.dc.html` | Prospects and score weights | `/admin/prospects` | v3 | None |
| `Admin-replies.dc.html` | Today's replies | `/admin/replies` | v3 | Mark sent and undo |
| `Admin-funnel.dc.html` | Funnel and weekly best-plays post | `/admin/funnel` | v3 | None |

## Not designed

These are specified in the spec but have no frame.

| Item | Spec section |
|---|---|
| Every email (instructions link, step 2 link, run received, Monday's list, no run this week, accepted, waitlist, declined, Circle full, failure alert) | 6.5, 6.6, 8 |
| Privacy and terms pages (text only; they use the existing legal page layout) | 6.8 |
| The Circles call-to-action band on `/library` | 6.1 |
| The downloaded playbook file | 8 |
| Admin: CSV export and the new settings fields | 6.8, 8 |
