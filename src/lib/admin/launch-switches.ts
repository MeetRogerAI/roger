import type { Query } from "@/lib/db-query";
import { CYCLE_LIVE_SINCE, mergeV3, V3_PREFIX } from "@/lib/v3-settings";

/**
 * The two go-live switches (launch list g-open; plan R10): `v3.cycleLive`
 * lets the Cora, charge, send and hourly jobs act, and `v3.signupOpen` lets
 * new people sign up. Until now nothing in the admin could change them.
 *
 * Order is enforced, so no state can strand anyone:
 * - sign-up opens only while the cycle is live (people who sign up must get lists);
 * - the cycle stops only while sign-up is closed (paying members keep getting lists).
 * The first time the cycle goes live is recorded once and never moved, as
 * saveV3Settings does (the trial clock starts there at the earliest).
 */
export type LaunchSwitch = "cycleLive" | "signupOpen";

export type SwitchState = { cycleLive: boolean; signupOpen: boolean };

export async function readSwitches(q: Query): Promise<SwitchState> {
  const s = mergeV3(await q<{ key: string; value: unknown }>(`select key, value from settings where key in ($1, $2)`, [`${V3_PREFIX}cycleLive`, `${V3_PREFIX}signupOpen`]));
  return { cycleLive: s.cycleLive, signupOpen: s.signupOpen };
}

export type SwitchResult = { ok: true; state: SwitchState } | { ok: false; reason: string; state: SwitchState };

export async function setSwitch(q: Query, name: LaunchSwitch, on: boolean): Promise<SwitchResult> {
  const before = await readSwitches(q);
  if (before[name] === on) return { ok: true, state: before };
  if (name === "signupOpen" && on && !before.cycleLive) return { ok: false, reason: "Turn on the weekly cycle first: people who sign up must get their lists.", state: before };
  if (name === "cycleLive" && !on && before.signupOpen) return { ok: false, reason: "Close sign-up first: stopping the cycle while sign-up is open strands new members.", state: before };
  await q(`insert into settings (key, value, updated_at) values ($1, to_jsonb($2::boolean), now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [`${V3_PREFIX}${name}`, on]);
  if (name === "cycleLive" && on) await q(`insert into settings (key, value) values ($1, to_jsonb(now())) on conflict (key) do nothing`, [CYCLE_LIVE_SINCE]);
  return { ok: true, state: await readSwitches(q) };
}
