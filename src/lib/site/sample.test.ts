import { describe, expect, it, vi } from "vitest";
import type { SamplePlay } from "./sample";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { resolveSamplePlay } = await import("./sample");

const play = (id: string): SamplePlay => ({
  id,
  title: `Play ${id}`,
  category: "Listings",
  description: "",
  heavyUseFor: "",
  playbookMd: "",
  pasteToInstall: "",
  figures: {},
  scores: {},
  score: null,
});

describe("the sample play", () => {
  it("is the admin's choice when there is one", async () => {
    expect(await resolveSamplePlay(play("bundled"), async () => play("chosen"))).toEqual(play("chosen"));
  });

  it("is the bundled play when none is chosen", async () => {
    expect(await resolveSamplePlay(play("bundled"), async () => null)).toEqual(play("bundled"));
  });

  it("is the bundled play when the reader throws", async () => {
    const failing = async () => {
      throw new Error("database is down");
    };
    expect(await resolveSamplePlay(play("bundled"), failing)).toEqual(play("bundled"));
  });

  it("is the bundled play with no database, through the real reader", async () => {
    expect(await resolveSamplePlay(play("bundled"))).toEqual(play("bundled"));
  });
});
