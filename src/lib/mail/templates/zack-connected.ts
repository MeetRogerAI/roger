import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/** Sent once when the first test run arrives, and once when the first real run arrives. */
export function zackConnectedEmail(o: { test: boolean; weekOf: string }): Rendered {
  return o.test
    ? renderEmail({
        subject: "Connected: test received",
        preview: "Zack reached Roger.",
        heading: "Zack is connected.",
        paragraphs: [
          "Your test run arrived. Test runs never go into the shared pool.",
          "From now on Zack runs every Sunday at 6:00 PM and sends his report on his own.",
        ],
        button: { label: "Open Roger", url: appUrl("/app") },
      })
    : renderEmail({
        subject: "Zack’s first report arrived",
        preview: `It counts for your Cora Curation on ${longDate(o.weekOf)}.`,
        heading: "Zack’s first report arrived.",
        paragraphs: [`It counts for your Cora Curation on ${longDate(o.weekOf)}. You don’t need to do anything.`],
        button: { label: "Open Roger", url: appUrl("/app") },
      });
}
