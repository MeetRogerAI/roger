import Link from "next/link";
import { connection } from "next/server";
import { CreateSponsorForm, SeatsForm, SponsorButton } from "@/components/admin-sponsors";
import { isAdmin } from "@/lib/admin-auth";
import { moneyCents } from "@/lib/billing/prices";
import { query } from "@/lib/db-query";
import { invoiceRecord, lastMonth, monthLabel, monthStart, sponsorBill } from "@/lib/sponsors/invoice";
import { listSponsors, sponsorMembers, type SponsorRow } from "@/lib/sponsors/sponsors";
import { featureOn } from "@/lib/v3-features";
import { readV3Settings, type V3Settings } from "@/lib/v3-settings";

/**
 * /admin/sponsors (spec B.15, B2 plan Unit 10): create a sponsor (its code
 * shown once), revoke its code, change its seats, release a member's seat,
 * and each calendar month prepare its Stripe draft invoice, then send it.
 */
export default async function SponsorsAdminPage({ searchParams }: PageProps<"/admin/sponsors">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const now = new Date();
  const month = (typeof sp.month === "string" ? monthStart(sp.month) : null) ?? lastMonth(now);
  const settings = await readV3Settings().catch(() => null);
  const sponsors = await listSponsors(query);
  const months = [0, 1, 2, 3].map((k) => {
    let m = lastMonth(now);
    for (let i = 0; i < k; i++) m = lastMonth(new Date(`${m}T12:00:00Z`));
    return m;
  });

  return (
    <section className="max-w-[60rem] space-y-10">
      <header className="space-y-2">
        <h1 className="text-h3">Sponsors</h1>
        <p className="text-small text-ink-2">
          {settings && featureOn(settings, "sponsorsOn")
            ? "Sponsor sign-up is on: a person who signs up with a sponsor’s link takes a seat and is never asked for a card."
            : "Sponsor sign-up is off (v3.sponsorsOn, with sign-up open and the cycle live). Links work as ordinary sign-ups until it is on."}
        </p>
      </header>

      <div>
        <h2 className="text-title">New sponsor</h2>
        <div className="mt-3">
          <CreateSponsorForm />
        </div>
      </div>

      <nav aria-label="Invoice month" className="flex flex-wrap gap-2">
        {months.map((m) => (
          <Link
            key={m}
            href={`/admin/sponsors?month=${m.slice(0, 7)}`}
            aria-current={m === month ? "page" : undefined}
            className={`chip flex min-h-11 items-center rounded-full border px-4 text-small ${m === month ? "border-ink bg-ink text-ground" : "border-rule text-ink-2 hover:text-ink"}`}
          >
            {monthLabel(m)}
          </Link>
        ))}
      </nav>

      {sponsors.length === 0 && <p className="text-small text-ink-2">No sponsors yet.</p>}
      {sponsors.map((s) => (
        <Sponsor key={s.id} s={s} month={month} settings={settings} />
      ))}
    </section>
  );
}

async function Sponsor({ s, month, settings }: { s: SponsorRow; month: string; settings: V3Settings | null }) {
  const members = await sponsorMembers(query, s.id);
  const bill = settings ? await sponsorBill(query, s.id, month, settings) : null;
  const record = await invoiceRecord(query, s.id, month);
  const price = (c: number) => moneyCents(c, s.currency);
  return (
    <article className="space-y-4 border-t border-rule pt-6">
      <header>
        <h2 className="text-title">
          {s.name} {s.revokedAt && <span className="text-small text-ink-2">(code revoked)</span>}
        </h2>
        <p className="text-small text-ink-2">
          {s.taken} of {s.seats} seats taken · standard {price(s.standardCents)}, higher {price(s.higherCents)} a seat a month · invoices to {s.billingEmail} (
          {s.billingCountry} {s.billingPostal}) · {s.stripeCustomer ?? "no Stripe customer yet"}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-6">
        <SeatsForm sponsorId={s.id} seats={s.seats} />
        {!s.revokedAt && <SponsorButton kind="revoke" fields={{ sponsorId: s.id }} label="Revoke code" confirm={`Revoke ${s.name}’s code? Nobody new can take a seat with it.`} />}
      </div>

      <div>
        <h3 className="text-small font-[600]">Members</h3>
        {members.length ? (
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-small [overflow-wrap:anywhere]">
                  {m.seat != null ? `Seat ${m.seat}: ` : ""}
                  <Link href={`/admin/users/${m.id}`} className="tlink">
                    {m.name || m.email}
                  </Link>{" "}
                  <span className="text-ink-2">({m.status})</span>
                </span>
                <SponsorButton kind="release" fields={{ sponsorId: s.id, userId: m.id }} label="Release seat" confirm={`Release ${m.name || m.email}’s seat? They become an ordinary trial.`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-small text-ink-2">No members yet.</p>
        )}
      </div>

      <div>
        <h3 className="text-small font-[600]">Invoice for {monthLabel(month)}</h3>
        {!bill ? (
          <p className="mt-2 text-small text-error">The v3 settings can’t be read, so the seats can’t be worked out.</p>
        ) : (
          <>
            <p className="mt-2 text-small">
              {bill.standard} at standard, {bill.higher} at higher: {price(bill.subtotalCents)} before tax.
            </p>
            {bill.seats.length > 0 && (
              <ul className="mt-2 text-meta text-ink-2">
                {bill.seats.map((x) => (
                  <li key={x.userId}>
                    {x.name || x.email}: {x.tier}, third list {x.thirdListWeek}
                    {x.weeks.length ? ` · ${x.weeks.map((w) => `${w.week.slice(5)} ${w.result.replace("_", " ")}`).join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-meta text-ink-2">
              {record?.sentAt
                ? `Sent ${record.sentAt} (${record.stripeInvoice}).`
                : record?.stripeInvoice
                  ? `Draft ${record.stripeInvoice} prepared by ${record.preparedBy}. Check it in Stripe, then send it.`
                  : "Not prepared yet."}
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {!record?.sentAt && bill.seats.length > 0 && (
                <SponsorButton kind="prepare" fields={{ sponsorId: s.id, month }} label={record?.stripeInvoice ? "Prepare again" : "Prepare invoice"} />
              )}
              {record?.stripeInvoice && !record.sentAt && (
                <SponsorButton kind="send" fields={{ sponsorId: s.id, month }} label="Send invoice" confirm={`Send the ${monthLabel(month)} invoice to ${s.billingEmail}?`} />
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
