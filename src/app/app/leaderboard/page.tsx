import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LeaderboardControls } from "@/components/app/leaderboard-forms";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { BOARD_LIMIT, leaderboardFor, myBoardStanding, type BoardRow, type MyStanding } from "@/lib/growth/leaderboard";
import { featureOn } from "@/lib/v3-features";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

export const metadata: Metadata = { title: "Leaderboard" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

/** Counts only, never who: "2 users adopted your idea". */
function counts(adopted: number, confirmed: number, mine: boolean) {
  const whose = mine ? "your" : "their";
  return `${plural(adopted, "user", "users")} adopted ${whose} ${adopted === 1 ? "idea" : "ideas"} · ${plural(confirmed, "set-up", "set-ups")} confirmed`;
}

/** The member's own points and rank: private unless they are on the board. Also carried as data attributes for agents. */
function MyStandingCard({ me }: { me: MyStanding }) {
  return (
    <section aria-labelledby="me-h" className="rounded-[var(--radius-control)] border border-rule bg-surface px-4 py-4">
      <h2 id="me-h" className="text-title">
        Your standing
      </h2>
      <dl
        id="my-standing"
        data-points={me.points}
        data-rank={me.rank}
        data-opted-in={me.optedIn ? "true" : "false"}
        className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small"
      >
        <dt className="text-ink-2">Points</dt>
        <dd>{me.points}</dd>
        <dt className="text-ink-2">Rank</dt>
        <dd>{me.points ? ordinal(me.rank) : "Not ranked yet: no points so far"}</dd>
        <dt className="text-ink-2">On the board</dt>
        <dd>{me.optedIn ? `Yes, as ${me.name}` : "No, only you can see this"}</dd>
      </dl>
      <p className="mt-3 text-small text-ink-2">{counts(me.adopted, me.confirmed, true)}</p>
    </section>
  );
}

function Board({ rows }: { rows: BoardRow[] }) {
  if (!rows.length) return <p className="text-small text-ink-2">No one has joined the board yet.</p>;
  return (
    <table className="w-full border-collapse text-left text-small">
      <caption className="sr-only">Members on the leaderboard, best first</caption>
      <thead>
        <tr className="border-b border-rule text-ink-2">
          <th scope="col" className="w-14 py-2 pr-3 font-[600]">
            Rank
          </th>
          <th scope="col" className="py-2 pr-3 font-[600]">
            Member
          </th>
          <th scope="col" className="py-2 text-right font-[600]">
            Points
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.rank}-${i}`} className={`border-b border-rule align-top ${r.isMe ? "bg-ground-2" : ""}`} aria-current={r.isMe ? "true" : undefined}>
            <td className="py-2 pr-3 tabular-nums">
              {r.total ? (
                ordinal(r.rank)
              ) : (
                <>
                  <span aria-hidden="true">–</span>
                  <span className="sr-only">No points yet</span>
                </>
              )}
            </td>
            <td className="py-2 pr-3 [overflow-wrap:anywhere]">
              <span className="font-[600]">
                <bdi>{r.name}</bdi>
                {r.isMe ? " (you)" : ""}
              </span>
              <span className="block text-meta text-ink-2">{counts(r.adopted, r.confirmed, r.isMe)}</span>
            </td>
            <td className="py-2 text-right tabular-nums">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * /app/leaderboard (spec B.15, B2 plan Unit 7): one network-wide, opt-in
 * board. The slots below stay in the same places in every state, so the
 * controls (and their "You've left the board." note) survive the refresh
 * after a leave.
 */
async function Leaderboard() {
  await connection();
  const session = await requireUser("/app/leaderboard");
  const on = featureOn(await getV3SettingsForDisplay(), "leaderboardOn");
  const lb = on ? await leaderboardFor(query, session.userId) : null;
  const me = lb ? lb.me : await myBoardStanding(query, session.userId);
  const paused = !on && me.optedIn;
  return (
    <div className="space-y-10">
      {!on && (
        <p className="text-small text-ink-2">
          {paused ? "The leaderboard is paused. Your name isn’t shown to anyone while it is, and you can still leave." : "The leaderboard is coming soon. We’ll let you know when it opens."}
        </p>
      )}
      {(on || paused) && <MyStandingCard me={me} />}
      <section aria-labelledby={on ? "join-h" : undefined} className="space-y-3">
        {on && (
          <h2 id="join-h" className="text-h3">
            {me.optedIn ? "Your name on the board" : "Join the board"}
          </h2>
        )}
        {on && !me.optedIn && <p className="text-small text-ink-2">You’re not on the board. Choose a name to show other members your rank and points. You can leave any time.</p>}
        <LeaderboardControls current={me.name} onBoard={me.optedIn} paused={!on} />
      </section>
      {lb && (
        <section aria-labelledby="board-h" className="space-y-3">
          <h2 id="board-h" className="text-h3">
            The board
          </h2>
          <p className="text-small text-ink-2">A point when Cora picks one of your plays for another member, and one more when they confirm it’s set up. Ranks count every member, including those not on the board.</p>
          <Board rows={lb.board} />
          {me.optedIn && !lb.meShown && <p className="text-small text-ink-2">You’re not in the top {BOARD_LIMIT}. Your rank is above.</p>}
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h2">Leaderboard</h1>
      </header>
      <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
        <Leaderboard />
      </Suspense>
    </div>
  );
}
