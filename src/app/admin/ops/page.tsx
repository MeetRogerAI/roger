import Link from "next/link";
import { connection } from "next/server";
import { ActionButton, ExcuseForm, NoteEditor, NudgeForm, UndoExcuseForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { ATTENTION_LABELS, excuseDefaultWeek, filterOps, loadOps, STATUS_KEYS, statusKey, stripeCustomerUrl, type OpsRow } from "@/lib/admin/ops";
import { stripeMode } from "@/lib/billing/stripe";
import { query } from "@/lib/db-query";
import { NUDGES } from "@/lib/mail/templates/admin-user";
import { readV3Settings } from "@/lib/v3-settings";
import { when } from "@/lib/admin/format";

const STATUS_WORDS: Record<(typeof STATUS_KEYS)[number], string> = {
  signup: "Signing up",
  trial: "Trial",
  monthly: "Monthly",
  per_run: "One at a time",
  switching: "Switching to one at a time",
  held: "Payment held",
  sponsored: "Sponsored",
  cancelled: "Cancelled",
  closed: "Closed",
};
const SHARING_WORDS = { share: "Pool", match_only: "Matching only", off: "Off" } as const;

function statusText(r: OpsRow, freeRuns: number) {
  const k = statusKey(r);
  if (k === "trial") return `Trial (${r.freeListsUsed} of ${freeRuns} free lists used)`;
  if (k === "held") return `Payment held${r.holdReason ? `: ${r.holdReason.replace(/_/g, " ")}` : ""}`;
  if (k === "monthly" && r.switched) return "Monthly (first charge to come; was one at a time)";
  return STATUS_WORDS[k] + (r.cancelRequested && k !== "cancelled" && k !== "switching" ? " (cancelling)" : "");
}

function runText(r: OpsRow) {
  if (!r.run) return "Missing";
  const label = { received: "Received", accepted: "Received", flagged: "Flagged", rejected: "Rejected" }[r.run.status];
  return `${label} ${when(r.run.receivedAt)} (${r.run.route})`;
}

/** Needs attention, once "Operations" (spec B.12): one row per user, with "needs attention" (spec check 30) and the row actions. */
export default async function OpsPage({ searchParams }: PageProps<"/admin/ops">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const settings = await readV3Settings();
  const now = new Date();
  const { week, rows } = await loadOps(query, { now, settings });
  const excuseWeek = excuseDefaultWeek(now);
  const filter = { attention: one("attention") === "1", status: (STATUS_KEYS as readonly string[]).includes(one("status")) ? one("status") : undefined, path: ["new", "running"].includes(one("path")) ? one("path") : undefined };
  const shown = filterOps(rows, filter);
  const attentionCount = rows.filter((r) => r.attention.length).length;
  const mode = stripeMode();

  const chip = (href: string, text: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`chip inline-flex min-h-10 items-center rounded-full border px-4 text-small ${on ? "border-ink bg-ink text-ground" : "border-rule-strong text-ink-2 hover:text-ink"}`}>
      {text}
    </Link>
  );

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-h3">Needs attention</h1>
        <p className="mt-2 text-small text-ink-2">
          Week of {week}. {rows.length} users; {attentionCount} need attention.
        </p>
      </header>

      <nav aria-label="Filters" className="flex flex-wrap gap-2">
        {chip("/admin/ops", "Everyone", !filter.attention && !filter.status && !filter.path)}
        {chip("/admin/ops?attention=1", `Needs attention (${attentionCount})`, filter.attention)}
        {STATUS_KEYS.map((k) => chip(`/admin/ops?status=${k}`, STATUS_WORDS[k], filter.status === k))}
        {chip("/admin/ops?path=running", "Path: running", filter.path === "running")}
        {chip("/admin/ops?path=new", "Path: new", filter.path === "new")}
      </nav>

      <div className="mb-2 flex flex-wrap justify-end gap-6">
        <ExcuseForm userId={null} week={excuseWeek} />
        <UndoExcuseForm week={excuseWeek} />
      </div>

      {shown.length === 0 ? (
        <p className="text-small text-ink-2">Nobody here.</p>
      ) : (
        // relative: the note field's screen-reader label is absolutely placed, and without it it sits outside this scroller and widens the page.
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[72rem] border-collapse text-left text-small">
            <thead>
              <tr className="border-b border-ink text-ink-2">
                {["User", "Status", "Sharing", "Zack this week", "Cora this week", "Money", "Eligible", "Last seen", "Note", ""].map((h) => (
                  <th key={h} className="py-2 pr-4 font-[500]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-rule align-top">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/users/${r.id}`} className="tlink font-[600]">
                      {r.name || r.email}
                    </Link>
                    <p className="text-meta text-ink-2 [overflow-wrap:anywhere]">{r.email}</p>
                    <p className="text-meta text-ink-2">
                      {r.path}
                      {r.notReady && <span className="ml-2 rounded-full border border-rule-strong px-2">not_ready</span>}
                    </p>
                    {r.attention.length > 0 && (
                      <ul className="mt-1 text-meta text-accent">
                        {r.attention.map((a) => (
                          <li key={a}>{ATTENTION_LABELS[a]}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3 pr-4">{statusText(r, settings.freeRuns)}</td>
                  <td className="py-3 pr-4">{SHARING_WORDS[r.sharing]}</td>
                  <td className="py-3 pr-4">{runText(r)}</td>
                  <td className="py-3 pr-4">{r.cora}</td>
                  <td className="py-3 pr-4">
                    {r.money}
                    {r.missesUsed !== null && <p className="text-meta text-ink-2">Misses this month: {r.missesUsed}</p>}
                  </td>
                  <td className="py-3 pr-4">{r.eligible ?? "–"}</td>
                  <td className="py-3 pr-4 text-meta">
                    Sign-in: {when(r.lastSignIn)}
                    <br />
                    Idea opened: {when(r.lastOpened)}
                  </td>
                  <td className="w-64 py-3 pr-4">
                    <NoteEditor userId={r.id} note={r.note} compact />
                  </td>
                  <td className="py-3">
                    <details>
                      <summary className="cursor-pointer text-small">Actions</summary>
                      <div className="mt-3 w-80 space-y-4">
                        <Link href={`/admin/users/${r.id}#add-run`} className="tlink block">
                          Add a run for this user
                        </Link>
                        <ExcuseForm userId={r.id} week={excuseWeek} />
                        {r.status === "trial" && !r.switched && <ActionButton action="extra" values={{ userId: r.id }} label="Give one extra free list" />}
                        <NudgeForm userId={r.id} templates={NUDGES} />
                        {r.stripeCustomer && (
                          <a href={stripeCustomerUrl(r.stripeCustomer, mode)} target="_blank" rel="noreferrer" className="tlink block">
                            Open in Stripe
                          </a>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
