import { connection } from "next/server";
import { SampleChooser } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { sampleCandidates } from "@/lib/admin/content";
import { query } from "@/lib/db-query";

/**
 * Sample idea (spec B.12, A.4): one pool play marked as the public sample. Choosing it needs the "I have read this play" tick.
 * No public page reads the choice since November 27, 2026 (src/data/site/examples.ts), and the page says so.
 */
export default async function SamplePage({ searchParams }: PageProps<"/admin/sample">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const plays = await sampleCandidates(query);
  const current = plays.find((p) => p.isSample) ?? null;
  const readId = typeof sp.read === "string" ? sp.read : null;
  const reading = plays.find((p) => p.id === readId) ?? current;

  return (
    <section className="max-w-[56rem] space-y-10">
      <header>
        <h1 className="text-h3">Sample idea</h1>
        <p data-unused role="note" className="mt-3 rounded-[8px] border border-accent p-4 text-small">
          Not used by the public site. Since November 27, 2026 the homepage shows the examples bundled with the site (“Cora Curation Examples”), and no public page reads the play chosen here. The choice is still stored.
        </p>
        <p className="mt-3 text-small text-ink-2">
          {current ? `Chosen: “${current.title}”${current.checkedBy ? `, read by ${current.checkedBy}` : ""}.` : "No play is chosen."}
        </p>
      </header>

      {plays.length === 0 ? (
        <p className="text-small text-ink-2">The pool has no active plays yet.</p>
      ) : (
        <>
          <SampleChooser plays={plays.map((p) => ({ id: p.id, title: p.title, category: p.category, isSample: p.isSample }))} />
          <div>
            <h2 className="text-title">Read a play first</h2>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small">
              {plays.map((p) => (
                <li key={p.id}>
                  <a href={`/admin/sample?read=${p.id}`} className="tlink" aria-current={reading?.id === p.id ? "true" : undefined}>
                    {p.title}
                  </a>
                </li>
              ))}
            </ul>
            {reading && (
              <article className="mt-4 rounded-[8px] border border-rule bg-surface p-5">
                <h3 className="text-title">{reading.title}</h3>
                <p className="mt-1 text-small text-ink-2">{reading.category}</p>
                <p className="mt-3 text-small">{reading.description}</p>
                <pre tabIndex={0} className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-[8px] bg-ground-2 p-4 text-meta [overflow-wrap:anywhere]">
                  {reading.playbookMd}
                </pre>
              </article>
            )}
          </div>
        </>
      )}
    </section>
  );
}
