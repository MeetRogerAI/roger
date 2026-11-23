import { appUrl, renderEmail, type Rendered } from "../layout";

/** Sent when a run is rejected at intake (spec B.6 step 3): the reason, in plain words. */
export function runNeedsALookEmail(o: { reason: string }): Rendered {
  return renderEmail({
    subject: "Zack’s report needs a look",
    preview: "This week’s report couldn’t be read.",
    heading: "Zack’s report couldn’t be read.",
    paragraphs: [o.reason, "Zack can send it again any time before Sunday’s cutoff, or you can paste it on the Zack page."],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}
