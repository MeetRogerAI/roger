import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { GENERATIONS, loadMeasures, type Checkpoint, type Cycle, type Ratio } from "@/lib/admin/measures";
import { query } from "@/lib/db-query";
import { decemberCheckpoint } from "@/data/config";

/** The adoption target (strategy v3.1 decision 32): at least 2 of 3 ideas adopted, compared in whole numbers. */
const TARGET_HIT = 2;
const TARGET_OF = 3;

const ratio = (r: Ratio) => (r.value === null ? "No data" : `${r.value.toFixed(2)} (${r.num} of ${r.den})`);
const pct = (num: number, den: number) => (den === 0 ? "No data" : `${Math.round((100 * num) / den)}%`);
const days = (n: number | null) => (n === null ? "" : n.toFixed(1));
const cycle = (c: Cycle) => (c.n === 0 ? "None" : `${c.n} · median ${days(c.median)} · mean ${days(c.mean)}`);

const table = "w-full border-collapse text-left text-small tabular-nums";
const caption = "mb-2 text-left text-title";
const headRow = "border-b border-ink text-ink-2";
const th = "py-2 pr-4 font-[500] align-bottom";
const td = "py-2 pr-4 whitespace-nowrap";

function CheckpointCard({ c }: { c: Checkpoint }) {
  const value = c.value === null ? "No data" : c.value.toFixed(2);
  const status = c.status === null ? null : c.status === "below" ? "Below the floor" : "At or above the floor";
  const state =
    c.state === "frozen"
      ? `Frozen on ${when(c.frozenAt)}`
      : c.state === "not_started"
        ? "Not started: the first week begins Monday, November 23"
        : `In progress, ${c.weeksCounted} of ${decemberCheckpoint.weeks.length} weeks`;
  return (
    <section aria-labelledby="checkpoint-h" className="rounded-[var(--radius-object)] border border-rule bg-surface p-6">
      <h2 id="checkpoint-h" className="text-title">
        December 14 checkpoint
      </h2>
      <p className="mt-1 text-small text-ink-2">New members brought in by a referral, per member active at the start of each week, pooled over the weeks of November 23, November 30 and December 7.</p>
      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <p>
          <span className="block text-h2 leading-none">{value}</span>
          <span className="mt-2 block text-small text-ink-2">
            {c.num} of {c.den}
          </span>
        </p>
        <p className="text-small">
          Floor {c.floor.toFixed(2)}
          {status && <span className={`block font-[600] ${c.status === "below" ? "text-error" : ""}`}>{status}</span>}
        </p>
        <p className="text-small text-ink-2">{state}</p>
      </div>
      {c.weeks.length > 0 && (
        <ul className="mt-3 text-small text-ink-2">
          {c.weeks.map((w) => (
            <li key={w.week}>
              Week of {w.week}: {w.num} of {w.den}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-small text-ink-2">From app data only. Referrals from before the app went live are in the team’s hand log, which stays the source for December 14.</p>
    </section>
  );
}

/** Loop measures (spec B.16; B3 plan Unit 3): k, cycle time and paid referral rate by generation, the December 14 checkpoint, and adoption against 2 of 3. */
export default async function MeasuresPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const now = new Date();
  const m = await loadMeasures(query, { now, realNow: now });

  return (
    <section className="max-w-[64rem] space-y-12">
      <header>
        <h1 className="text-h3">Measures</h1>
        <p className="mt-2 text-small text-ink-2">
          Worked out from the app’s data each time this page opens, for the last 26 weeks (Toronto, weeks start Monday), newest first. Admin accounts and dry runs are left out. A generation is how far a member is from someone nobody referred: 0 for them, 1 for the people they
          brought in, and so on.
        </p>
      </header>

      <CheckpointCard c={m.checkpoint} />

      <div className="overflow-x-auto">
        <table className={`${table} min-w-[44rem]`}>
          <caption className={caption}>New members per member, by week</caption>
          <thead>
            <tr className={headRow}>
              <th scope="col" className={th}>
                Week
              </th>
              <th scope="col" className={th}>
                All
              </th>
              {GENERATIONS.map((g) => (
                <th key={g} scope="col" className={th}>
                  Referrer generation {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.weeks.map((w) => (
              <tr key={w.week} className="border-b border-rule">
                <th scope="row" className={th}>
                  {w.week}
                </th>
                <td className={td}>{ratio(w.k)}</td>
                {w.kByGen.map((r, i) => (
                  <td key={GENERATIONS[i]} className={td}>
                    {ratio(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-small text-ink-2">Members who finished signing up that week after being referred, out of members active when the week began.</p>
      </div>

      <div className="overflow-x-auto">
        <table className={`${table} min-w-[44rem]`}>
          <caption className={caption}>Days from a name being given to that person’s first list</caption>
          <thead>
            <tr className={headRow}>
              <th scope="col" className={th}>
                Week of first list
              </th>
              <th scope="col" className={th}>
                All
              </th>
              {GENERATIONS.slice(1).map((g) => (
                <th key={g} scope="col" className={th}>
                  Generation {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.weeks.map((w) => (
              <tr key={w.week} className="border-b border-rule">
                <th scope="row" className={th}>
                  {w.week}
                </th>
                <td className={td}>{cycle(w.cycle.all)}</td>
                {w.cycle.byGen.map((c, i) => (
                  <td key={GENERATIONS[i + 1]} className={td}>
                    {cycle(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-small text-ink-2">
          {m.waiting.n === 0 ? "Nobody referred is still waiting for a first list." : `${m.waiting.n} referred ${m.waiting.n === 1 ? "person is" : "people are"} still waiting for a first list; the longest wait so far is ${days(m.waiting.oldestDays)} days.`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className={`${table} min-w-[30rem]`}>
          <caption className={caption}>Paid referrals per paying member, at the end of each week</caption>
          <thead>
            <tr className={headRow}>
              <th scope="col" className={th}>
                Week
              </th>
              <th scope="col" className={th}>
                Paid referrals
              </th>
              <th scope="col" className={th}>
                Paying members
              </th>
              <th scope="col" className={th}>
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {m.weeks.map((w) => (
              <tr key={w.week} className="border-b border-rule">
                <th scope="row" className={th}>
                  {w.week}
                </th>
                <td className={td}>{w.paid.num}</td>
                <td className={td}>{w.paid.den}</td>
                <td className={td}>{w.paid.value === null ? "No data" : w.paid.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-small text-ink-2">Referred members who have paid, sponsored members left out, out of members who have paid and still have access.</p>
      </div>

      <div className="overflow-x-auto">
        <table className={`${table} min-w-[60rem]`}>
          <caption className={caption}>Ideas adopted out of ideas sent, by list week (target: 2 of 3)</caption>
          <thead>
            <tr className={headRow}>
              <th scope="col" className={th}>
                List week
              </th>
              <th scope="col" className={th}>
                Sent
              </th>
              <th scope="col" className={th}>
                Adopted (marked or confirmed)
              </th>
              <th scope="col" className={th}>
                Confirmed
              </th>
              <th scope="col" className={th}>
                Installed (next profile)
              </th>
              <th scope="col" className={th}>
                Used (next profile)
              </th>
              <th scope="col" className={th}>
                Against the target
              </th>
              <th scope="col" className={th}>
                Members at 2 of 3 or better
              </th>
            </tr>
          </thead>
          <tbody>
            {m.weeks.map((w) => {
              const a = w.adoption;
              return (
                <tr key={w.week} className="border-b border-rule">
                  <th scope="row" className={th}>
                    {w.week}
                  </th>
                  <td className={td}>{a.sent}</td>
                  <td className={td}>
                    {a.adopted} ({pct(a.adopted, a.sent)})
                  </td>
                  <td className={td}>
                    {a.confirmed} ({pct(a.confirmed, a.sent)})
                  </td>
                  <td className={td}>
                    {a.installed} ({pct(a.installed, a.sent)})
                  </td>
                  <td className={td}>
                    {a.used} ({pct(a.used, a.sent)})
                  </td>
                  <td className={td}>{a.sent === 0 ? "No data" : a.adopted * TARGET_OF >= a.sent * TARGET_HIT ? "At or above target" : <span className="font-[600] text-error">Below target</span>}</td>
                  <td className={td}>{a.members === 0 ? "No data" : `${a.membersAtTarget} of ${a.members} (${pct(a.membersAtTarget, a.members)})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-small text-ink-2">An idea is adopted when the member marked it set up or Zack confirmed it. The target is 2 of 3 ideas adopted (67%). Installed and used come from the member’s next Zack profile, matched by the idea’s Roger idea ID or its title.</p>
      </div>
    </section>
  );
}
