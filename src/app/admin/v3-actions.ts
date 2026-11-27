"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { stripeGateway } from "@/lib/billing/gateway";
import { closeFailedWeekOrders } from "@/lib/billing/orders";
import { stripeAdjustments, stripeBilling, stripeOrders, stripePlans } from "@/lib/billing/subscriptions";
import { requireAdmin } from "@/lib/admin-auth";
import { chooseSample, clearSample, moveTestimonial, saveTestimonial, setTestimonialCleared, TESTIMONIALS_TAG } from "@/lib/admin/content";
import { chargeAndSendNow } from "@/lib/admin/cora";
import { approvePlay, EDITABLE_FIELDS, editPlay, rejectPlay } from "@/lib/admin/flags";
import { audited, logAdminAction } from "@/lib/admin/log";
import { opsWeek } from "@/lib/admin/ops";
import { addRunForUser, changeUserEmail, closeAccount, deleteAccount, giveExtraFreeList, isMonday, linkContributor, saveNote, sendNudge, type Done } from "@/lib/admin/users";
import { excuseWeek, undoExcuseForEveryone } from "@/lib/billing/contribution";
import { runChargeJob } from "@/lib/billing/charge-job";
import { asOfAllowed, AsOfRefused, currentMonday, jobNow, moneyAsOfAllowed } from "@/lib/clock";
import { gatewayFitModel } from "@/lib/cora/fit";
import { runCoraJob } from "@/lib/cora/job";
import { gatewayMergeModel } from "@/lib/cora/merge";
import { SAMPLE_PLAY_TAG } from "@/lib/cora/sample";
import { importSeedRun, SeedRunExists } from "@/lib/cora/seed-import";
import { runSendJob } from "@/lib/cora/send-job";
import { databaseMarkedNonProduction } from "@/lib/db-environment";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { runHourly } from "@/lib/housekeeping/job";
import { processArrived } from "@/lib/intake/arrival";
import { gatewayModel } from "@/lib/intake/model";
import { rebuildPoints } from "@/lib/growth/points";
import { isNudge } from "@/lib/mail/templates/admin-user";
import { hit } from "@/lib/rate-limit";
import { createPilotLink } from "@/lib/signup/pilot";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * The v3 admin's server actions (spec B.12, plan Unit 17). Server actions are
 * public endpoints: every one calls requireAdmin first, whatever page it
 * sits on, and every action is logged with who did it (in src/lib/admin).
 */
export type V3State = { status: "idle" | "ok" | "error"; message?: string; link?: string; at?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (fd: FormData, name: string) => {
  const v = field(fd, name, 40);
  return UUID.test(v) ? v : null;
};
const state = (d: Done, extra: Partial<V3State> = {}): V3State => ({ status: d.ok ? "ok" : "error", message: d.message, at: Date.now(), ...extra });
const bad = (message: string): V3State => ({ status: "error", message, at: Date.now() });
const mail = { query };

/** Admin "run now" buttons are rate-limited (plan, Key Technical Decisions). */
const JOB_LIMIT = { limit: 10, windowSeconds: 60 };

// ---------------------------------------------------------------------------
// Users and the operations screen

export async function saveNoteAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  const r = await saveNote(query, by, userId, typeof fd.get("note") === "string" ? String(fd.get("note")) : "");
  refresh();
  return state(r);
}

export async function extraFreeListAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  const r = await giveExtraFreeList(query, by, userId);
  refresh();
  return state(r);
}

export async function nudgeAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  const template = field(fd, "template", 40);
  if (!userId || !isNudge(template)) return bad("Pick a template.");
  const r = await sendNudge(query, mail, by, userId, template, opsWeek(new Date()));
  refresh();
  return state(r);
}

export async function addRunAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  const text = typeof fd.get("report") === "string" ? String(fd.get("report")) : "";
  const settings = await readV3Settings();
  const r = await addRunForUser(query, by, userId, text, { cutoff: settings.runCutoff, now: new Date() });
  if (r.ok && r.stored) {
    const stored = r.stored;
    after(() => processArrived(query, stored).catch((e) => console.error("[admin] add run intake", e instanceof Error ? e.message : e)));
  }
  refresh();
  return state(r);
}

/** Excuse a week for one member (userId) or for everyone (no userId). */
export async function excuseWeekAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const week = field(fd, "week", 10);
  if (!isMonday(week)) return bad("The week is the Monday of the list, written YYYY-MM-DD.");
  const everyone = field(fd, "everyone", 5) === "yes";
  const userId = everyone ? null : idOf(fd, "userId");
  if (!everyone && !userId) return bad("No such user.");
  const [recorded] = await query<{ n: number }>(`select count(*)::int as n from contribution_weeks where week_of = $1`, [week]);
  // Excusing everyone for a week nobody has been recorded for yet reaches into the future: it must be meant.
  if (everyone && !recorded.n && field(fd, "confirmAhead", 5) !== "yes") {
    return bad(`The week of ${week} isn’t recorded yet. Tick “Excuse it in advance” to excuse everyone who misses it.`);
  }
  const settings = await readV3Settings();
  const n = await excuseWeek(query, { settings, now: new Date(), adjust: stripeAdjustments() ?? undefined, ...mail }, { week, userId, by });
  let message: string;
  if (everyone) message = `Week of ${week} excused for everyone: ${n} recorded miss${n === 1 ? "" : "es"} changed, and anyone recorded later who misses it is excused too.`;
  else if (n) message = `Week of ${week} excused.`;
  else {
    const [p] = await query(`select 1 from week_excuses where week_of = $1 and user_id = $2`, [week, userId]);
    message = p ? `The week of ${week} isn’t recorded yet. If it turns out a miss, it is recorded as excused.` : "Nothing to excuse: that week wasn’t a miss.";
  }
  refresh();
  return { status: "ok", message, at: Date.now() };
}

/** Undoes an excuse for everyone: those weeks count as missed again (Roger's own failures stay excused). */
export async function undoExcuseAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const week = field(fd, "week", 10);
  if (!isMonday(week)) return bad("The week is the Monday of the list, written YYYY-MM-DD.");
  const settings = await readV3Settings();
  const n = await undoExcuseForEveryone(query, { settings, now: new Date(), adjust: stripeAdjustments() ?? undefined, ...mail }, { week, by });
  refresh();
  if (n === null) return bad(`There is no excuse for everyone for the week of ${week}.`);
  return { status: "ok", message: `Excuse for the week of ${week} undone: ${n} week${n === 1 ? "" : "s"} counted again.`, at: Date.now() };
}

/** R11: a new account and the pilot link that opens at Product and Pricing (Step 3). The link is shown once. */
export async function pilotLinkAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const r = await createPilotLink(query, { email: field(fd, "email", 254), name: field(fd, "name", 80), createdBy: by });
  if (!r.ok) {
    const message = { invalid: "Give a name and a real email address.", admin_address: "That is an admin address.", already_signed_up: "That person already has an account past sign-up." }[r.reason];
    return bad(message);
  }
  refresh();
  return { status: "ok", message: "Account made. Send them this link; it works once, for 7 days, and won’t be shown again.", link: r.link, at: Date.now() };
}

/** R25: link a seed contributor to a real account (empty user = unlink). */
export async function linkContributorAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const contributorId = idOf(fd, "contributorId");
  if (!contributorId) return bad("Pick a contributor.");
  const raw = field(fd, "userId", 40);
  const userId = raw ? idOf(fd, "userId") : null;
  if (raw && !userId) return bad("No such user.");
  const r = await linkContributor(query, by, contributorId, userId);
  refresh();
  return state(r);
}

export async function closeAccountAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  if (field(fd, "confirm", 5) !== "yes") return bad("Tick the box to confirm.");
  const settings = await readV3Settings();
  const r = await closeAccount(query, { settings, now: new Date(), adjust: stripeAdjustments() ?? undefined, gw: stripeBilling(), card: stripeGateway(), ...mail }, by, userId);
  refresh();
  return state(r);
}

export async function deleteAccountAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  const r = await deleteAccount(query, by, userId, field(fd, "confirmEmail", 254));
  if (!r.ok) return state(r);
  redirect("/admin/users");
}

export async function changeEmailAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const userId = idOf(fd, "userId");
  if (!userId) return bad("No such user.");
  const r = await changeUserEmail(query, mail, by, userId, field(fd, "email", 254));
  refresh();
  return state(r);
}

// ---------------------------------------------------------------------------
// Flags

export async function flagAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const playId = idOf(fd, "playId");
  if (!playId) return bad("No such play.");
  const decision = field(fd, "decision", 10);
  let r: Done;
  if (decision === "approve") r = await approvePlay(query, by, playId);
  else if (decision === "reject") r = await rejectPlay(query, by, playId);
  else if (decision === "edit") {
    const fields: Record<string, string> = {};
    for (const k of EDITABLE_FIELDS) {
      const v = fd.get(k);
      if (typeof v === "string") fields[k] = v.slice(0, k === "playbook_md" ? 40_000 : 8_000);
    }
    r = await editPlay(query, by, playId, fields);
  } else return bad("Choose approve, edit or reject.");
  refresh();
  return state(r);
}

// ---------------------------------------------------------------------------
// Testimonials and the sample idea (both read by the public site)

export async function saveTestimonialAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const rawId = field(fd, "id", 40);
  const id = rawId ? idOf(fd, "id") : null;
  if (rawId && !id) return bad("No such testimonial.");
  const r = await saveTestimonial(query, by, {
    id,
    person: field(fd, "person", 80),
    attribution: field(fd, "attribution", 120),
    quote: field(fd, "quote", 1200),
    saidOn: field(fd, "saidOn", 10),
    audience: field(fd, "audience", 10),
    position: Number(field(fd, "position", 4) || "0"),
    cleared: fd.get("cleared") === "on",
  });
  if (r.ok) updateTag(TESTIMONIALS_TAG);
  refresh();
  return state(r);
}

export async function testimonialSwitchAction(fd: FormData) {
  const by = await requireAdmin();
  const id = idOf(fd, "id");
  if (!id) return;
  const move = field(fd, "move", 4);
  if (move === "up" || move === "down") await moveTestimonial(query, by, id, move);
  else await setTestimonialCleared(query, by, id, field(fd, "cleared", 5) === "on");
  updateTag(TESTIMONIALS_TAG);
  refresh();
}

export async function chooseSampleAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  if (field(fd, "clear", 5) === "yes") {
    const r = await clearSample(query, by);
    updateTag(SAMPLE_PLAY_TAG);
    refresh();
    return state(r);
  }
  const playId = idOf(fd, "playId");
  if (!playId) return bad("Pick a play.");
  const r = await chooseSample(query, by, playId, fd.get("readIt") === "on");
  if (r.ok) updateTag(SAMPLE_PLAY_TAG);
  refresh();
  return state(r);
}

// ---------------------------------------------------------------------------
// Cora and the Monday jobs

/**
 * "As of" from the form, only where the cron routes accept it (preview or
 * local, test Stripe, a test database). A job that can charge (`money`) also
 * needs a Stripe test key in place (clock.ts `moneyAsOfAllowed`, which also
 * says why a Stripe test clock is needed to move through billing months).
 */
async function jobClock(fd: FormData, o: { money?: boolean } = {}): Promise<Date> {
  const asOf = field(fd, "asOf", 40);
  if (!asOf) return new Date();
  const c = { deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() };
  if (o.money && asOfAllowed(c) && !moneyAsOfAllowed(c)) throw new AsOfRefused("A charge “as of” another time needs a Stripe test key and a database marked non-production.");
  return jobNow(asOf, asOfAllowed(c));
}

async function limited(by: string): Promise<boolean> {
  return !(await hit(`admin-job:${by}`, JOB_LIMIT));
}

const summary = (o: unknown) => JSON.stringify(o).slice(0, 600);

/**
 * "Run Cora now", "Dry run", and on non-production "run as of" for each job.
 * `job` is cora, dry, charge, send or hourly.
 */
export async function runJobAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  if (await limited(by)) return bad("Too many runs in a minute. Wait a moment.");
  const job = field(fd, "job", 10);
  let now: Date;
  try {
    now = await jobClock(fd, { money: job === "charge" || job === "hourly" });
  } catch (e) {
    if (e instanceof AsOfRefused) return bad(e.message);
    throw e;
  }
  const asOf = field(fd, "asOf", 40) || null;
  if (!["cora", "dry", "charge", "send", "hourly"].includes(job)) return bad("Unknown job.");
  if (job !== "cora" && job !== "dry" && !asOf) return bad("Charge, send and the hourly pass run on their own schedule; here they run only “as of” a time, off production.");
  const gw = stripeBilling();
  if ((job === "charge" || job === "hourly") && !gw) return bad("Stripe is not set up.");
  const settings = await readV3Settings();
  const week = currentMonday(now);
  const result = await audited(query, { by, action: `run_${job}`, detail: { week, asOf } }, async (): Promise<unknown> => {
    if (job === "cora" || job === "dry") {
      return runCoraJob(query, { intake: gatewayModel, merge: gatewayMergeModel, fit: gatewayFitModel }, { now, settings, week, dryRun: job === "dry", budgetMs: 240_000 });
    }
    if (job === "send") return runSendJob(query, { settings, now, gw: gw ?? undefined, adjust: stripeAdjustments() ?? undefined }, { week });
    if (job === "charge") return runChargeJob(query, { gw: gw!, orders: stripeOrders() ?? undefined, settings, now }, { week });
    return runHourly(query, { gw: gw!, orders: stripeOrders() ?? undefined, adjust: stripeAdjustments() ?? undefined, plans: stripePlans() ?? undefined, settings, now });
  });
  refresh();
  return { status: "ok", message: `${job} for the week of ${week}: ${summary(result)}`, at: Date.now() };
}

/** The recovery button: charge first, then send, for a week Cora finished. */
export async function chargeAndSendAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  if (await limited(by)) return bad("Too many runs in a minute. Wait a moment.");
  let now: Date;
  try {
    now = await jobClock(fd, { money: true });
  } catch (e) {
    if (e instanceof AsOfRefused) return bad(e.message);
    throw e;
  }
  const gw = stripeBilling();
  if (!gw) return bad("Stripe is not set up.");
  const settings = await readV3Settings();
  const week = currentMonday(now);
  const r = await audited(query, { by, action: "charge_and_send", detail: { week, asOf: field(fd, "asOf", 40) || null } }, () =>
    chargeAndSendNow(query, { gw, orders: stripeOrders() ?? undefined, adjust: stripeAdjustments() ?? undefined, settings, now }, week),
  );
  refresh();
  if (!r.done) return bad(`${r.charge?.status === "done" ? "Charged, but nothing sent." : "Nothing charged or sent."} ${r.reason}`);
  return { status: "ok", message: `Charged, then sent, for the week of ${week}: ${summary({ charge: r.charge, send: r.send })}`, at: Date.now() };
}

/** Orders left "ordered" in a failed week: closed with no charge, members told (also hourly). */
export async function closeFailedOrdersAction(): Promise<V3State> {
  const by = await requireAdmin();
  const n = await closeFailedWeekOrders(query, mail);
  await logAdminAction(query, { by, action: "close_failed_week_orders", detail: { closed: n } });
  refresh();
  return { status: "ok", message: n ? `${n} order${n === 1 ? "" : "s"} closed with no charge.` : "No open orders in a failed week.", at: Date.now() };
}

/** B2 Unit 6: recompute every week of the points cache from scratch, closed weeks included. */
export async function rebuildPointsAction(): Promise<V3State> {
  const by = await requireAdmin();
  if (await limited(by)) return bad("Too many in a minute. Wait a moment.");
  const r = await rebuildPoints(query, { now: new Date() });
  await logAdminAction(query, { by, action: "rebuild_points", detail: { result: "busy" in r ? "busy" : `${r.written} written, ${r.removed} removed` } });
  refresh();
  if ("busy" in r) return bad("Points are being refreshed right now. Try again in a minute.");
  return { status: "ok", message: `Points rebuilt: ${r.written} member-weeks written, ${r.removed} removed.`, at: Date.now() };
}

/** The seed-import tool (R23): one run file under a hidden contributor. */
export async function seedImportAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  if (await limited(by)) return bad("Too many runs in a minute. Wait a moment.");
  const text = typeof fd.get("text") === "string" ? String(fd.get("text")) : "";
  if (!text.trim()) return bad("Paste the run file.");
  if (text.length > 80_000) return bad("The file is over 80,000 characters.");
  const input = { label: field(fd, "label", 80), agent: field(fd, "agent", 40), ranOn: field(fd, "ranOn", 10), text, replace: fd.get("replace") === "on" };
  try {
    const r = await audited(
      query,
      { by, action: "seed_import", detail: { label: input.label, agent: input.agent, ranOn: input.ranOn, replace: input.replace } },
      () => importSeedRun(query, input, { model: gatewayModel, merge: gatewayMergeModel, ...mail }),
      (r) => ({ runId: r.runId, contributorId: r.contributorId, week: r.weekOf, replaced: r.replaced, intake: r.intake }),
    );
    refresh();
    return { status: "ok", message: `Imported for the week of ${r.weekOf}${r.replaced ? " (replaced)" : ""}. Intake: ${r.intake}. Merge: ${summary(r.merge)}.`, at: Date.now() };
  } catch (e) {
    if (e instanceof SeedRunExists) return bad(e.message);
    if (e instanceof Error && /seed run needs|must be YYYY/.test(e.message)) return bad(e.message);
    throw e;
  }
}
