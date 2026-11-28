import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";

// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { addressChangedBySupportEmail, nudgeEmail } = await import("./admin-user");
const { cancelledEmail, cancelUndoneEmail } = await import("./cancelled");
const { amountChangedEmail, chargeDateMovedEmail, chargeFailedEmail, listOrderedEmail, orderFailedEmail, orderNoListEmail, subscribedEmail, trialClosedEmail } = await import("./charges");
const { missedForgivenEmail } = await import("./missed-forgiven");
const { mondayListEmail, noIdeasThisWeekEmail, noRunThisWeekEmail, orderNextEmail } = await import("./monday");
const { orderClosedRogerFailedEmail } = await import("./order-closed");
const { orderPromptEmail } = await import("./order-prompt");
const { backToPerRunEmail, bookedSwitchDroppedEmail, planChangedEmail } = await import("./plan-changed");
const { firstChargeReminderEmail, firstPaidNextEmail, quoteChangedEmail } = await import("./quote");
const { renewalFailedEmail, renewalHeldEmail, renewalPaidEmail } = await import("./renewal");
const { notSharingMonthEmail, secondMissEmail } = await import("./second-miss");
const { startConfirmEmail } = await import("./sign-in");
const { uploadReminderEmail } = await import("./upload-reminder");
const { welcomeEmail } = await import("./welcome");
const { zackConnectedEmail } = await import("./zack-connected");
const { trialNoChargeClosedEmail, trialNoListClosedEmail, zackNotYetEmail } = await import("./zack-not-yet");
const { runDeletedEmail } = await import("./zack-page");

const settings = mergeV3([]);
const WEEK = "2026-12-14";
const amount = { week: WEEK, amountCents: 22600, currency: "USD" as const };
const owed = { higher: "US$400", difference: "US$200", invoiceDate: "2027-01-03" };
const ideas = [{ id: "i1", title: "Inbox triage", reason: "It fits your mornings.", timeLine: null }];
const status = "Free Cora Curation 1 of 2.";

/** Every email a monthly member, or someone signing up, can be sent. */
const monthlyMail = () => ({
  startConfirm: startConfirmEmail("tok"),
  welcome: welcomeEmail({ name: "Ana Diaz", currency: "USD", path: "running", settings }),
  nudgeNoRun: nudgeEmail("no_run", { week: WEEK }),
  nudgeConnect: nudgeEmail("connect_zack", { week: WEEK }),
  nudgeFinish: nudgeEmail("finish_signup", { week: WEEK }),
  addressChanged: addressChangedBySupportEmail({ newEmail: "ana@example.com" }),
  zackConnected: zackConnectedEmail({ test: false, weekOf: WEEK }),
  zackNotYet: zackNotYetEmail({ day: 3, closesOn: "2026-12-28" }),
  trialNoList: trialNoListClosedEmail(),
  trialNoCharge: trialNoChargeClosedEmail(),
  uploadReminder: uploadReminderEmail({ week: WEEK }),
  runDeleted: runDeletedEmail({ weekOf: WEEK }),
  monday: mondayListEmail({ week: WEEK, ideas, status }),
  mondayWithReceipt: mondayListEmail({ week: WEEK, ideas, status, receipt: { url: null } }),
  noRun: noRunThisWeekEmail({ week: WEEK, status }),
  noIdeas: noIdeasThisWeekEmail({ week: WEEK, note: "Nothing was charged, and this week doesn’t use one of your free Cora Curations.", status }),
  firstPaidNext: firstPaidNextEmail(amount),
  firstChargeReminder: firstChargeReminderEmail(amount),
  quoteChanged: quoteChangedEmail(amount),
  subscribed: subscribedEmail({ amountCents: 22600, currency: "USD" }),
  chargeFailed: chargeFailedEmail({ hard: false, retries: ["Tuesday, December 15"] }),
  chargeDateMoved: chargeDateMovedEmail({ nextMonday: "2026-12-21", reason: "no_run" }),
  chargeDateMovedNoPlays: chargeDateMovedEmail({ nextMonday: "2026-12-21", reason: "no_plays" }),
  amountChanged: amountChangedEmail({ amountCents: 22600, currency: "USD" }),
  trialClosed: trialClosedEmail(),
  missedForgiven: missedForgivenEmail({ periodEnd: "2027-01-03", higher: "US$400" }),
  secondMiss: secondMissEmail(owed),
  secondMissCarried: secondMissEmail({ ...owed, ended: { periodEnd: "2027-01-03" } }),
  notSharingMonth: notSharingMonthEmail(owed),
  renewalFailed: renewalFailedEmail({ holdOn: "2027-01-10" }),
  renewalHeld: renewalHeldEmail(),
  renewalPaid: renewalPaidEmail(),
  cancelledNow: cancelledEmail({ when: "now", charged: false }),
  cancelledLater: cancelledEmail({ when: "period_end", accessEnds: "2027-01-03" }),
  cancelUndone: cancelUndoneEmail({ renews: "2027-01-03" }),
  // The one plan change left: an account that was on one at a time moving to monthly.
  planNowMonthly: planChangedEmail({ to: "monthly", effect: "Monthly starts with your next Cora Curation: US$200 plus tax where it applies, charged the Monday it is ready, then every month." }),
});

/** The emails of the one-at-a-time plan, which only an account already on it can be sent. */
const oneAtATimeMail = () => ({
  orderNext: orderNextEmail({ price: "US$200" }),
  orderPrompt: orderPromptEmail({ week: WEEK, price: "US$200 plus tax where it applies", monthlyLine: "Monthly is US$200 for every Monday." }),
  ordered: listOrderedEmail({ week: WEEK, price: "US$200" }),
  orderNoList: orderNoListEmail({ week: WEEK, reason: "no_run" }),
  orderFailed: orderFailedEmail({ week: WEEK }),
  orderClosed: orderClosedRogerFailedEmail({ week: WEEK }),
  planNowOneAtATime: planChangedEmail({ to: "per_run", effect: "Your paid month has ended." }),
  backToOneAtATime: backToPerRunEmail(),
  switchDropped: bookedSwitchDroppedEmail({ to: "per_run", why: "Pay the open invoice first." }),
  subscribedSwitched: subscribedEmail({ amountCents: 22600, currency: "USD", switched: true }),
});

const all = (r: { subject: string; text: string; html: string }) => `${r.subject}\n${r.text}\n${r.html.replace(/<[^>]+>/g, " ")}`;

beforeEach(() => {
  offer.on = false;
});

describe("the emails, with monthly the only plan (Peter, November 26, 2026)", () => {
  it("never call what arrives a list, in any subject, body or button, on either plan", () => {
    for (const [name, mail] of [...Object.entries(monthlyMail()), ...Object.entries(oneAtATimeMail())]) {
      expect(all(mail), name).not.toMatch(/\blists?\b/i);
      expect(all(mail).match(/cora curations?/gi) ?? [], name).toEqual(all(mail).match(/Cora Curations?/g) ?? []);
    }
    const naming = Object.values(monthlyMail()).filter((mail) => /Cora Curation/.test(all(mail)));
    expect(naming.length).toBeGreaterThan(20);
  });

  it("name no other way to pay to a monthly member: no one at a time, no order, no change of plan", () => {
    for (const [name, mail] of Object.entries(monthlyMail())) {
      expect(all(mail), name).not.toMatch(/one at a time|one-at-a-time|\border(?:s|ed|ing)?\b|change plan|switch to one/i);
    }
  });

  it("the second-miss email offers the fix and cancelling, not a switch of plan", () => {
    const off = secondMissEmail(owed);
    expect(off.text).toContain("If you cancel on the billing page (");
    expect(off.text).toContain("the difference isn’t collected.");
    expect(off.text).not.toMatch(/switch/i);
  });

  it("an account still on one at a time is never told to order again while nothing can be ordered", () => {
    const NOT_OFFERED = "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday.";
    const told = () => [orderNoListEmail({ week: WEEK, reason: "no_run" }), orderNoListEmail({ week: WEEK, reason: "no_plays" }), orderClosedRogerFailedEmail({ week: WEEK }), orderFailedEmail({ week: WEEK }), backToPerRunEmail()];
    for (const mail of told()) {
      expect(all(mail), mail.subject).not.toMatch(/order again|ordering again|you can still order/i);
      expect(mail.text, mail.subject).toContain(NOT_OFFERED);
      expect(mail.text, mail.subject).toMatch(/monthly/);
    }
    // What happened to the order, and that nothing was charged, is said either way.
    expect(orderNoListEmail({ week: WEEK, reason: "no_run" }).text).toMatch(/so nothing was charged\.\s+Your order doesn’t carry over\./);
    expect(orderFailedEmail({ week: WEEK }).text).toContain("so it wasn’t sent and nothing is owed.");
    offer.on = true;
    for (const mail of told()) expect(mail.text, mail.subject).not.toContain(NOT_OFFERED);
    expect(orderNoListEmail({ week: WEEK, reason: "no_run" }).text).toContain("Order again for any Monday you want one.");
    expect(orderClosedRogerFailedEmail({ week: WEEK }).text).toContain("Order again for any Monday you want one.");
    expect(orderFailedEmail({ week: WEEK }).text).toContain("Update your card before ordering again.");
    expect(backToPerRunEmail().text).toContain("You can still order a Cora Curation for any Monday you want one.");
  });

  it("the first-charge emails' button names what the billing page offers", () => {
    for (const mail of [firstPaidNextEmail(amount), firstChargeReminderEmail(amount)]) {
      expect(mail.text).toContain("Cancel or see billing: ");
      expect(mail.text).not.toContain("change plan");
    }
    offer.on = true;
    for (const mail of [firstPaidNextEmail(amount), firstChargeReminderEmail(amount)]) expect(mail.text).toContain("Cancel or change plan: ");
  });

  it("say when the first charge comes in the words the site uses", () => {
    const m = monthlyMail();
    expect(m.welcome.text).toContain("Your first two Cora Curations are free.");
    expect(m.welcome.text).toContain("After that, Roger is US$200 / CA$280 a month plus tax where it applies. Your first charge comes with your third Cora Curation");
    expect(m.firstPaidNext.subject).toBe("Your next Cora Curation is your first paid one");
    expect(m.firstChargeReminder.text).toContain("your third Cora Curation comes on Monday, December 14 and we’ll charge US$226 in total for your first month");
    expect(m.subscribed.text).toContain("Your third Cora Curation is ready now, and a new one arrives every Monday.");
    expect(m.mondayWithReceipt.subject).toBe("Your Cora Curation, and your receipt");
    expect(m.renewalHeld.subject).toBe("Your Cora Curations are paused");
    expect(m.noRun.subject).toBe("No Cora Curation this week");
  });
});
