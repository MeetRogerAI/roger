import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

/** A sessionStorage and window that live in a plain object, so the store runs under node. */
function stubBrowser(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<Listener>>();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
  const fakeWindow = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => void listeners.get(type)?.delete(listener)),
    dispatchEvent: vi.fn((event: Event) => {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener();
      return true;
    }),
  };
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", fakeWindow);
  return { storage, fakeWindow };
}

// The store keeps the unsaved choice at module level, so each test loads its own copy.
async function loadStore() {
  vi.resetModules();
  return import("./currency-store");
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the chosen currency", () => {
  it("is the saved USD or CAD", async () => {
    stubBrowser({ "roger-circles-currency": "CAD" });
    const { chosenCurrency } = await loadStore();
    expect(chosenCurrency()).toBe("CAD");
  });

  it("is null when nothing is saved, and ignores a saved value it does not know", async () => {
    stubBrowser();
    expect((await loadStore()).chosenCurrency()).toBeNull();
    stubBrowser({ "roger-circles-currency": "EUR" });
    expect((await loadStore()).chosenCurrency()).toBeNull();
  });

  it("holds the choice in memory when storage throws", async () => {
    const { storage } = stubBrowser();
    const { chooseCurrency, chosenCurrency } = await loadStore();
    chooseCurrency("CAD");
    storage.getItem.mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(chosenCurrency()).toBe("CAD");
  });

  it("still chooses when storage refuses writes", async () => {
    const { storage } = stubBrowser();
    storage.setItem.mockImplementation(() => {
      throw new Error("quota");
    });
    const { chooseCurrency, chosenCurrency } = await loadStore();
    expect(() => chooseCurrency("USD")).not.toThrow();
    expect(chosenCurrency()).toBe("USD");
  });
});

describe("subscribing to the currency", () => {
  it("tells a listener when a currency is chosen, until it unsubscribes", async () => {
    const { fakeWindow } = stubBrowser();
    const { chooseCurrency, subscribeCurrency } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeCurrency(listener);
    chooseCurrency("CAD");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith("roger-currency", listener);
    chooseCurrency("USD");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("the Circles price block", () => {
  // price.tsx keeps its own copy of the key and event; the two must stay the same strings.
  it("uses the same storage key and window event", async () => {
    const { currencyStorageKey, currencyEvent } = await loadStore();
    const source = readFileSync(join(process.cwd(), "src/components/circles/price.tsx"), "utf8");
    expect(source).toContain(`"${currencyStorageKey}"`);
    expect(source).toContain(`"${currencyEvent}"`);
  });
});
