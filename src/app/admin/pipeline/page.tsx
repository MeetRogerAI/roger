import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { loadPipeline, SOURCES, STAGES, type Person, type Source, type Stage } from "@/lib/admin/pipeline";
import { query } from "@/lib/db-query";

const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  invited: "Invited",
  started: "Started sign-up",
  signed_up: "Signed up",
  trial: "Trial",
  paying: "Paying",
  sponsored: "Sponsored",
};
const SOURCE_LABEL: Record<Source, string> = {
  waitlist: "Waitlist",
  pack: "Starter pack",
  interest: "Library interest",
  "not ready": "Not ready",
  guest: "Session guest",
  referral: "Referral",
  "sign-up": "Sign-up",
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: "America/Toronto" }) : "");

function href(o: { stage?: Stage; source?: Source; page?: number }) {
  const p = new URLSearchParams();
  if (o.stage) p.set("stage", o.stage);
  if (o.source) p.set("source", o.source);
  if (o.page && o.page > 1) p.set("page", String(o.page));
  const s = p.toString();
  return s ? `/admin/pipeline?${s}` : "/admin/pipeline";
}

function CameFrom({ p }: { p: Person }) {
  const parts: React.ReactNode[] = [];
  if (p.via) {
    const what = p.via.kind === "guest" ? "Guest of" : "Referral by";
    parts.push(
      p.via.id ? (
        <span key="via">
          {what}{" "}
          <Link href={`/admin/users/${p.via.id}`} className="tlink">
            {p.via.name ?? "a member"}
          </Link>
        </span>
      ) : (
        <span key="via">{what} a deleted member</span>
      ),
    );
  }
  if (p.leadKind) parts.push(<span key="lead">{SOURCE_LABEL[p.leadKind]} lead</span>);
  if (p.sponsor) parts.push(<span key="sponsor">Sponsored by {p.sponsor}</span>);
  if (p.ref) parts.push(<span key="ref">ref {p.ref}</span>);
  if (p.utm) parts.push(<span key="utm">{p.utm}</span>);
  if (parts.length === 0) return <span className="text-ink-2">Direct</span>;
  return (
    <ul>
      {parts.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

const COLUMNS = ["Person", "Stage", "First touch", "Lead", "Guest invited", "Referral invited", "Signed up", "First list", "Card saved", "Paying", "Ended", "Came from"];
const td = "py-2 pr-4 align-top whitespace-nowrap";

/** Pipeline (spec B.16; B3 plan Unit 4): every person from first touch through trial to paying, with dates and where they came from. */
export default async function PipelinePage({ searchParams }: PageProps<"/admin/pipeline">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const stage = STAGES.find((s) => s === sp.stage);
  const source = SOURCES.find((s) => s === sp.source);
  const pageNo = typeof sp.page === "string" && /^\d{1,5}$/.test(sp.page) ? Number(sp.page) : 1;
  const p = await loadPipeline(query, { stage, source, page: pageNo });
  const everyone = STAGES.reduce((n, s) => n + p.counts[s], 0);

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-h3">Pipeline</h1>
        <p className="mt-2 max-w-[56rem] text-small text-ink-2">
          Everyone from their first touch (a lead, a session guest, a referral or a sign-up) through the trial to paying, one row per person. Addresses that differ only by dots or a plus-tag are one person. Admin accounts are left out. Each person’s stage is the furthest they have reached.
        </p>
      </header>

      <div>
        <h2 className="text-title">By stage</h2>
        <nav aria-label="Filter by stage" className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-small">
          <Link href={href({ source })} className="tlink" aria-current={!stage ? "page" : undefined}>
            Everyone · {everyone}
          </Link>
          {STAGES.map((s) => (
            <Link key={s} href={href({ stage: s, source })} className="tlink" aria-current={stage === s ? "page" : undefined}>
              {STAGE_LABEL[s]} · {p.counts[s]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter by first touch" className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-small">
          <span className="text-ink-2">First touch:</span>
          <Link href={href({ stage })} className="tlink" aria-current={!source ? "page" : undefined}>
            Any
          </Link>
          {SOURCES.map((s) => (
            <Link key={s} href={href({ stage, source: s })} className="tlink" aria-current={source === s ? "page" : undefined}>
              {SOURCE_LABEL[s]}
            </Link>
          ))}
        </nav>
        {p.cleared > 0 && (
          <p className="mt-3 text-small text-ink-2">
            Also {p.cleared} invited, details cleared: guests and invitations whose address was removed 90 days on, counted here and not listed.
          </p>
        )}
      </div>

      {p.rows.length === 0 ? (
        <p className="text-small text-ink-2">Nobody here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] border-collapse text-left text-small tabular-nums">
            <caption className="mb-2 text-left text-small text-ink-2">
              {p.total} {p.total === 1 ? "person" : "people"}, newest first touch first{p.pages > 1 ? ` (page ${p.page} of ${p.pages})` : ""}. Dates are Toronto dates.
            </caption>
            <thead>
              <tr className="border-b border-ink text-ink-2">
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="py-2 pr-4 align-bottom font-[500]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.key} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-4 align-top font-[500] [overflow-wrap:anywhere]">
                    {r.userId ? (
                      <Link href={`/admin/users/${r.userId}`} className="tlink">
                        {r.email}
                      </Link>
                    ) : (
                      r.email
                    )}
                  </th>
                  <td className={td}>{STAGE_LABEL[r.stage]}</td>
                  <td className={td}>
                    {day(r.firstTouch.at)}
                    <span className="block text-ink-2">{SOURCE_LABEL[r.firstTouch.source]}</span>
                  </td>
                  <td className={td}>{day(r.leadAt)}</td>
                  <td className={td}>{day(r.guestAt)}</td>
                  <td className={td}>{day(r.invitedAt)}</td>
                  <td className={td}>{day(r.signedUpAt)}</td>
                  <td className={td}>{day(r.firstListAt)}</td>
                  <td className={td}>{r.sponsor ? <span className="text-ink-2">Sponsored</span> : day(r.cardAt)}</td>
                  <td className={td}>{day(r.payingAt)}</td>
                  <td className={td}>
                    {day(r.endedAt)}
                    {r.endedAt && r.status && <span className="block text-ink-2">{r.status}</span>}
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <CameFrom p={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.pages > 1 && (
        <nav aria-label="Pages" className="flex gap-6 text-small">
          {p.page > 1 && (
            <Link href={href({ stage, source, page: p.page - 1 })} className="tlink">
              Newer
            </Link>
          )}
          {p.page < p.pages && (
            <Link href={href({ stage, source, page: p.page + 1 })} className="tlink">
              Older
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
