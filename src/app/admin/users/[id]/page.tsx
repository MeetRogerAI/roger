import Link from "next/link";
import { connection } from "next/server";
import { ActionButton, AddRunForm, ChangeEmailForm, CloseAccountForm, DeleteAccountForm, ExcuseForm, LinkContributorForm, NoteEditor, NudgeForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { ATTENTION_LABELS, excuseDefaultWeek, statusKey, stripeCustomerUrl } from "@/lib/admin/ops";
import { userDetail } from "@/lib/admin/user-detail";
import { stripeMode } from "@/lib/billing/stripe";
import { query } from "@/lib/db-query";
import { NUDGES } from "@/lib/mail/templates/admin-user";
import { readV3Settings } from "@/lib/v3-settings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={`${id ?? title}-h`} id={id} className="border-t border-rule pt-6">
      <h2 id={`${id ?? title}-h`} className="text-title">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One user (spec B.12): profile, plan, runs, ideas, emails, the admin log, and every action on them. */
export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  await connection();
  if (!(await isAdmin())) return null;
  const { id } = await params;
  if (!UUID.test(id)) return <p className="text-small text-ink-2">No such user.</p>;
  const settings = await readV3Settings();
  const now = new Date();
  const d = await userDetail(query, id, settings, now);
  if (!d) return <p className="text-small text-ink-2">No such user.</p>;
  const r = d.row;
  const quiz = d.profile as Record<string, unknown>;

  return (
    <article className="max-w-[60rem] space-y-8">
      <header>
        <p className="text-meta">
          <Link href="/admin/users" className="tlink">
            Users
          </Link>
        </p>
        <h1 className="mt-2 text-h3">{r.name || r.email}</h1>
        <p className="mt-1 text-small text-ink-2 [overflow-wrap:anywhere]">
          {r.email} · {statusKey(r)} · {r.plan === "per_run" ? "one at a time" : "monthly"} · sharing {r.sharing} · path {r.path}
          {r.notReady ? " · not_ready" : ""}
        </p>
        {r.attention.length > 0 && <p className="mt-2 text-small text-accent">Needs attention: {r.attention.map((a) => ATTENTION_LABELS[a]).join(", ")}</p>}
      </header>

      <Section title="Now">
        <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-[12rem_1fr]">
          <dt className="text-ink-2">What they see</dt>
          <dd>{d.statusLine}</dd>
          <dt className="text-ink-2">Week of {d.week}</dt>
          <dd>
            Zack: {r.run ? `${r.run.status}, ${when(r.run.receivedAt)} (${r.run.route})` : "missing"} · Cora: {r.cora}
          </dd>
          <dt className="text-ink-2">Money</dt>
          <dd>
            {r.money || "–"}
            {r.missesUsed !== null ? ` · misses this month: ${r.missesUsed}` : ""}
          </dd>
          <dt className="text-ink-2">Eligible plays left</dt>
          <dd>{r.eligible ?? "–"}</dd>
          <dt className="text-ink-2">Free lists used</dt>
          <dd>
            {r.freeListsUsed} of {settings.freeRuns}
          </dd>
          <dt className="text-ink-2">Last seen</dt>
          <dd>
            Sign-in {when(r.lastSignIn)} · idea opened {when(r.lastOpened)}
          </dd>
          <dt className="text-ink-2">Account</dt>
          <dd>
            Made {when(d.createdAt)}
            {d.createdBy ? ` by ${d.createdBy}` : ""} · agent {d.agent || "–"} · {d.timezone}
          </dd>
          <dt className="text-ink-2">Stripe</dt>
          <dd>
            {r.stripeCustomer ? (
              <a href={stripeCustomerUrl(r.stripeCustomer, stripeMode())} target="_blank" rel="noreferrer" className="tlink">
                Open in Stripe
              </a>
            ) : (
              "No customer yet"
            )}
            {d.stripeSubscription ? ` · subscription ${d.stripeSubscription}` : ""}
          </dd>
        </dl>
      </Section>

      <Section title="Note">
        <NoteEditor userId={r.id} note={r.note} />
      </Section>

      <Section title="Actions">
        <div className="space-y-6">
          <ExcuseForm userId={r.id} week={excuseDefaultWeek(now)} />
          {r.status === "trial" && !r.switched && (r.hasCard || r.sponsored) && <ActionButton action="extra" values={{ userId: r.id }} label="Give one extra free list" />}
          <NudgeForm userId={r.id} templates={NUDGES} />
        </div>
      </Section>

      <Section title="Add a run" id="add-run">
        <AddRunForm userId={r.id} />
      </Section>

      <Section title="Seed contributor">
        <p className="mb-3 text-small text-ink-2">
          {d.linkedContributors.length
            ? `Linked to ${d.linkedContributors.map((c) => c.label).join(", ")}: Cora never picks this user a play from those seed runs.`
            : "Not linked. Link the hidden record of this person’s pilot runs, so Cora leaves those plays out of their lists."}{" "}
          A contributor whose email (set on the Cora page) is this account’s address is linked by itself.
        </p>
        <LinkContributorForm userId={r.id} contributors={d.contributors} linked={d.linkedContributors} />
      </Section>

      <Section title="Runs">
        {d.runs.length === 0 ? (
          <p className="text-small text-ink-2">No runs.</p>
        ) : (
          <ul className="divide-y divide-rule text-small">
            {d.runs.map((x) => (
              <li key={x.id} className="py-2">
                <Link href={`/admin/runs?id=${x.id}`} className="tlink">
                  Week of {x.weekOf}
                </Link>{" "}
                · {x.status}
                {x.isTest ? " (test)" : ""} · {x.route} · {x.plays} plays · {when(x.receivedAt)}
                {x.reason ? <span className="text-ink-2"> · {x.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ideas">
        {d.picks.length === 0 ? (
          <p className="text-small text-ink-2">No ideas picked yet.</p>
        ) : (
          <ul className="divide-y divide-rule text-small">
            {d.picks.map((p) => (
              <li key={`${p.weekOf}-${p.position}-${p.dryRun}`} className="py-2">
                {p.weekOf} #{p.position}
                {p.dryRun ? " (dry run)" : ""}: <span className="font-[600]">{p.title}</span> · fit {p.fit} · score {p.personalScore} · {p.deliveredAt ? `sent ${when(p.deliveredAt)}` : "not sent"}
                {p.setupMarkedAt ? ` · set up ${when(p.setupMarkedAt)}` : ""}
                <p className="text-meta text-ink-2">{p.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Emails sent">
        {d.emails.length === 0 ? (
          <p className="text-small text-ink-2">None.</p>
        ) : (
          <ul className="text-small">
            {d.emails.map((e) => (
              <li key={`${e.kind}-${e.ref}`}>
                {when(e.at)} · {e.kind} · {e.status}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Admin log">
        {d.log.length === 0 ? (
          <p className="text-small text-ink-2">No admin actions yet.</p>
        ) : (
          <ul className="text-small">
            {d.log.map((l) => (
              <li key={l.id}>
                {when(l.createdAt)} · {l.adminEmail} · {l.action}
                <span className="text-ink-2"> {JSON.stringify(l.detail)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quiz answers">
        <pre className="overflow-auto whitespace-pre-wrap text-meta [overflow-wrap:anywhere]">{JSON.stringify(quiz, null, 2)}</pre>
      </Section>

      <Section title="Change email address">
        <ChangeEmailForm userId={r.id} />
      </Section>

      <Section title="Close or delete">
        <div className="space-y-6">
          {/* On a closed account, closing again re-runs the clean-up (sessions, links, orders, pending differences). */}
          <CloseAccountForm userId={r.id} />
          {r.status === "closed" && <DeleteAccountForm userId={r.id} />}
        </div>
      </Section>
    </article>
  );
}
