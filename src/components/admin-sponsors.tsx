"use client";

import { useActionState } from "react";
import {
  createSponsorAction,
  prepareInvoiceAction,
  releaseSeatAction,
  revokeSponsorAction,
  sendInvoiceAction,
  setSeatsAction,
  type SponsorFormValues,
  type SponsorState,
} from "@/app/admin/sponsors/actions";

const idle: SponsorState = { status: "idle" };
const label = "block text-meta font-[600] text-ink-2";
const input = "mt-1 w-full rounded-md border border-rule bg-ground px-3 py-2 text-small";
const blank: SponsorFormValues = { name: "", currency: "USD", standard: "", higher: "", seats: "", billingEmail: "", billingCountry: "US", billingPostal: "" };

function Status({ s }: { s: SponsorState }) {
  return (
    <span role="status" className={`text-meta ${s.status === "error" ? "text-error" : "text-ink-2"}`}>
      {s.status === "idle" ? "" : s.message}
    </span>
  );
}

/**
 * New sponsor (B2 plan Unit 10). The code is shown here once, after it is
 * made, and never again: only its hash is stored. On an error the fields keep
 * what was typed (they are keyed on it, so React's reset after the action
 * lands on those values).
 */
export function CreateSponsorForm() {
  const [s, action, pending] = useActionState(createSponsorAction, idle);
  const v = s.status === "error" && s.values ? s.values : blank;
  return (
    <div className="space-y-4">
      {s.code && (
        <div role="status" className="rounded-md border border-ink p-4">
          <p className="text-small font-[600]">The sponsor’s sign-up link. Copy it now: it isn’t shown again.</p>
          <p className="mt-2 font-mono text-small [overflow-wrap:anywhere]">{s.link}</p>
          <p className="mt-1 text-meta text-ink-2">Code: {s.code}</p>
        </div>
      )}
      <form key={`${JSON.stringify(v)}:${s.at ?? ""}`} action={action} className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Name
          <input name="name" defaultValue={v.name} required className={input} />
        </label>
        <label className={label}>
          Currency
          <select name="currency" defaultValue={v.currency} className={input}>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
        <label className={label}>
          Standard price per seat per month
          <input name="standard" inputMode="decimal" defaultValue={v.standard} placeholder="49.00" required className={input} />
        </label>
        <label className={label}>
          Higher price per seat per month
          <input name="higher" inputMode="decimal" defaultValue={v.higher} placeholder="98.00" required className={input} />
        </label>
        <label className={label}>
          Seats
          <input name="seats" inputMode="numeric" defaultValue={v.seats} required className={input} />
        </label>
        <label className={label}>
          Billing email
          <input name="billingEmail" type="email" defaultValue={v.billingEmail} required className={input} />
        </label>
        <label className={label}>
          Billing country
          <select name="billingCountry" defaultValue={v.billingCountry} className={input}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </label>
        <label className={label}>
          Billing postal or ZIP code
          <input name="billingPostal" defaultValue={v.billingPostal} required className={input} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-s min-h-11" disabled={pending}>
            {pending ? "Creating…" : "Create sponsor"}
          </button>
          {!s.code && <Status s={s} />}
          {s.code && <span className="text-meta text-ink-2">{s.message}</span>}
        </div>
      </form>
    </div>
  );
}

const actions = {
  revoke: revokeSponsorAction,
  release: releaseSeatAction,
  prepare: prepareInvoiceAction,
  send: sendInvoiceAction,
} as const;

/** One button on /admin/sponsors, with its hidden fields and a message line that is always in the page. */
export function SponsorButton({ kind, fields, label: text, confirm }: { kind: keyof typeof actions; fields: Record<string, string>; label: string; confirm?: string }) {
  const [s, action, pending] = useActionState(actions[kind], idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className="btn btn-s min-h-11">
        {pending ? "Working…" : text}
      </button>
      <Status s={s} />
    </form>
  );
}

/** The seat count, edited in place. */
export function SeatsForm({ sponsorId, seats }: { sponsorId: string; seats: number }) {
  const [s, action, pending] = useActionState(setSeatsAction, idle);
  return (
    <form key={`${seats}:${s.at ?? ""}`} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="sponsorId" value={sponsorId} />
      <label className={label}>
        Seats
        <input name="seats" inputMode="numeric" defaultValue={String(seats)} className={`${input} w-24`} />
      </label>
      <button type="submit" disabled={pending} className="btn btn-s min-h-11">
        {pending ? "Saving…" : "Save seats"}
      </button>
      <Status s={s} />
    </form>
  );
}
