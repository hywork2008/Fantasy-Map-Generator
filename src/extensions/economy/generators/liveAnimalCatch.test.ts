import { afterEach, describe, expect, it, vi } from "vitest";
import { simulationContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { clearLiveAnimalCatchAccumulators, getLiveAnimalCatchKey, rollLiveAnimalCatch } from "./liveAnimalCatch";

describe("liveAnimalCatch", () => {
  afterEach(() => {
    clearLiveAnimalCatchAccumulators();
    clearEconomyContext();
    vi.restoreAllMocks();
  });

  it("returns 0 for a non-positive expected amount and does not touch the accumulator", () => {
    expect(rollLiveAnimalCatch("k", 0)).toBe(0);
    expect(rollLiveAnimalCatch("k", -1)).toBe(0);
  });

  it("returns an integer catch, never a fraction", () => {
    for (let i = 0; i < 20; i++) {
      expect(Number.isInteger(rollLiveAnimalCatch("k", 0.2))).toBe(true);
    }
  });

  it("guarantees a catch once the banked amount reaches 1", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    // 0.999 always fails a Bernoulli(remainder<1) draw, so only the accumulator crossing
    // 1 via `guaranteed` can produce a catch here.
    expect(rollLiveAnimalCatch("k", 0.5)).toBe(0); // acc = 0.5
    expect(rollLiveAnimalCatch("k", 0.5)).toBe(1); // acc = 1.0 -> guaranteed catch
    spy.mockRestore();
  });

  it("resets toward zero after a catch, suppressing the next catches", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // any positive remainder now "succeeds"
    expect(rollLiveAnimalCatch("k", 0.3)).toBe(1); // acc = 0.3 -> remainder 0.3, random()=0 < 0.3 -> catch
    // acc drops to 0.3 - 1 = -0.7 (in debt); next months must first pay that off before
    // remainder can go positive again.
    expect(rollLiveAnimalCatch("k", 0.3)).toBe(0); // acc = -0.4
    expect(rollLiveAnimalCatch("k", 0.3)).toBe(0); // acc = -0.1
    expect(rollLiveAnimalCatch("k", 0.3)).toBe(1); // acc = 0.2 -> remainder 0.2 > 0, random()=0 -> catch
  });

  it("converges to the expected amount on average over many months", () => {
    const expectedAmount = 0.2;
    const months = 20000;
    let total = 0;
    for (let i = 0; i < months; i++) total += rollLiveAnimalCatch("k", expectedAmount);

    expect(total / months).toBeCloseTo(expectedAmount, 1);
  });

  it("tracks independent keys separately", () => {
    expect(getLiveAnimalCatchKey(1, 2, 3)).toBe("1:2:3");
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollLiveAnimalCatch("a", 0.3)).toBe(1);
    expect(rollLiveAnimalCatch("b", 0.3)).toBe(1);
  });

  it("writes the accumulator into the economy extension slice when the API is live", () => {
    initEconomyContext({ simulationContext } as unknown as ExtensionAPI);
    simulationContext.extensions = {};
    vi.spyOn(Math, "random").mockReturnValue(0.999); // avoid the fractional bonus catch

    rollLiveAnimalCatch("1:0:5", 0.4);

    expect(
      (simulationContext.extensions.economy as { liveAnimalCatchAccumulators: Record<string, number> })
        .liveAnimalCatchAccumulators["1:0:5"]
    ).toBeCloseTo(0.4, 5);
  });

  it("clearLiveAnimalCatchAccumulators() empties the slice", () => {
    initEconomyContext({ simulationContext } as unknown as ExtensionAPI);
    simulationContext.extensions = {};
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    rollLiveAnimalCatch("1:0:5", 0.4);
    clearLiveAnimalCatchAccumulators();

    expect(
      (simulationContext.extensions.economy as { liveAnimalCatchAccumulators: Record<string, number> })
        .liveAnimalCatchAccumulators
    ).toEqual({});
  });
});
