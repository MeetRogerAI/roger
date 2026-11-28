// @vitest-environment happy-dom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SIGNED_IN_MARK, SIGNED_IN_MARK_SCRIPT } from "./hint-cookie";
import { useSignedInHint } from "./signed-in-hint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  return <b>{useSignedInHint() ? "in" : "out"}</b>;
}

const html = () => document.documentElement;
const setCookie = (on: boolean) => void (document.cookie = on ? "roger-in=1; path=/" : "roger-in=; path=/; max-age=0");

afterEach(() => {
  setCookie(false);
  html().removeAttribute(SIGNED_IN_MARK);
  document.body.innerHTML = "";
});

/** Hydrates the prerendered (signed-out) markup the way the browser does, after the head script ran. */
async function hydrate() {
  new Function(SIGNED_IN_MARK_SCRIPT)();
  const host = document.createElement("div");
  host.innerHTML = renderToString(<Probe />);
  document.body.append(host);
  const removed: string[] = [];
  const watch = new MutationObserver((records) => {
    for (const r of records) if (r.attributeName === SIGNED_IN_MARK && !html().hasAttribute(SIGNED_IN_MARK)) removed.push(host.textContent ?? "");
  });
  watch.observe(html(), { attributes: true });
  await act(async () => void hydrateRoot(host, <Probe />));
  return { host, removed, stop: () => watch.disconnect() };
}

describe("the signed-in mark on <html>", () => {
  it("is set by the head script for a signed-in visitor and never taken away while React hydrates", async () => {
    setCookie(true);
    const { host, removed, stop } = await hydrate();
    await act(async () => {});
    stop();
    expect(host.textContent).toBe("in");
    expect(html().hasAttribute(SIGNED_IN_MARK)).toBe(true);
    expect(removed).toEqual([]);
  });

  it("is never set for a signed-out visitor", async () => {
    const { host, stop } = await hydrate();
    stop();
    expect(host.textContent).toBe("out");
    expect(html().hasAttribute(SIGNED_IN_MARK)).toBe(false);
  });

  it("goes when the hint is cleared in another tab and this one comes back, and comes back with a sign-in", async () => {
    setCookie(true);
    const { host, stop } = await hydrate();
    stop();
    setCookie(false);
    await act(async () => void window.dispatchEvent(new Event("focus")));
    expect(host.textContent).toBe("out");
    expect(html().hasAttribute(SIGNED_IN_MARK)).toBe(false);
    setCookie(true);
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(host.textContent).toBe("in");
    expect(html().hasAttribute(SIGNED_IN_MARK)).toBe(true);
  });
});
