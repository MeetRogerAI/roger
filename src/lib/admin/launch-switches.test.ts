import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { CYCLE_LIVE_SINCE } from "@/lib/v3-settings";
import { readSwitches, setSwitch } from "./launch-switches";

let q: Query;
beforeEach(async () => {
  ({ query: q } = await testDb());
});

describe("go-live switches (launch list g-open)", () => {
  it("start off", async () => {
    expect(await readSwitches(q)).toEqual({ cycleLive: false, signupOpen: false });
  });

  it("turn the cycle on, then sign-up, and record when the cycle first went live", async () => {
    expect(await setSwitch(q, "cycleLive", true)).toEqual({ ok: true, state: { cycleLive: true, signupOpen: false } });
    const [since] = await q<{ value: string }>("select value #>> '{}' as value from settings where key = $1", [CYCLE_LIVE_SINCE]);
    expect(since.value).toBeTruthy();
    expect(await setSwitch(q, "signupOpen", true)).toEqual({ ok: true, state: { cycleLive: true, signupOpen: true } });
    // The stored values are what the jobs' settings reader expects: JSON booleans.
    expect(await q("select key, value from settings where key in ('v3.cycleLive', 'v3.signupOpen') order by key")).toEqual([
      { key: "v3.cycleLive", value: true },
      { key: "v3.signupOpen", value: true },
    ]);
  });

  it("refuses to open sign-up while the cycle is off", async () => {
    const r = await setSwitch(q, "signupOpen", true);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("weekly cycle first") });
    expect(await readSwitches(q)).toEqual({ cycleLive: false, signupOpen: false });
  });

  it("refuses to stop the cycle while sign-up is open, and allows it once sign-up is closed", async () => {
    await setSwitch(q, "cycleLive", true);
    await setSwitch(q, "signupOpen", true);
    expect(await setSwitch(q, "cycleLive", false)).toMatchObject({ ok: false, reason: expect.stringContaining("Close sign-up first") });
    await setSwitch(q, "signupOpen", false);
    expect(await setSwitch(q, "cycleLive", false)).toEqual({ ok: true, state: { cycleLive: false, signupOpen: false } });
  });

  it("never moves the first-live date when the cycle is turned off and on again", async () => {
    await setSwitch(q, "cycleLive", true);
    await q("update settings set value = to_jsonb('2026-12-01T00:00:00Z'::text) where key = $1", [CYCLE_LIVE_SINCE]);
    await setSwitch(q, "cycleLive", false);
    await setSwitch(q, "cycleLive", true);
    expect(await q("select value from settings where key = $1", [CYCLE_LIVE_SINCE])).toEqual([{ value: "2026-12-01T00:00:00Z" }]);
  });

  it("does nothing when a switch is already where it is asked to go", async () => {
    expect(await setSwitch(q, "cycleLive", false)).toEqual({ ok: true, state: { cycleLive: false, signupOpen: false } });
    expect(await q("select count(*)::int as n from settings where key like 'v3.%'")).toEqual([{ n: 0 }]);
  });

  it("closes sign-up again if a change at the same moment stopped the cycle (a race past the check)", async () => {
    await setSwitch(q, "cycleLive", true);
    // Another admin turns the cycle off between this call's check and its write.
    const racing = (async (text: string, params?: unknown[]) => {
      const r = await q(text, params);
      if (/insert into settings/.test(text) && params?.[0] === "v3.signupOpen" && params?.[1] === true) await q("update settings set value = 'false'::jsonb where key = 'v3.cycleLive'");
      return r;
    }) as Query;
    const r = await setSwitch(racing, "signupOpen", true);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("sign-up was closed again") });
    expect(await readSwitches(q)).toEqual({ cycleLive: false, signupOpen: false });
  });
});
