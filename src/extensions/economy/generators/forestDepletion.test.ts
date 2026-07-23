import { afterEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  clearForestDepletion,
  consumeDirtyFlag,
  getDepletionFactor,
  registerLogHarvest,
  tickForestRegrowth
} from "./forestDepletion";

describe("forestDepletion", () => {
  afterEach(() => {
    clearForestDepletion();
    clearEconomyContext();
  });

  it("has no depletion for a cell that was never logged", () => {
    expect(getDepletionFactor(1)).toBe(0);
  });

  it("caps depletion at MAX_DEPLETION regardless of logging amount", () => {
    registerLogHarvest(1, 1000);
    expect(getDepletionFactor(1)).toBe(0.9);
  });

  it("does nothing when nothing has ever been depleted", () => {
    expect(tickForestRegrowth(10)).toBe(false);
  });

  it("does nothing for a non-positive deltaYears", () => {
    registerLogHarvest(1, 20); // depletion 0.9 (capped)
    expect(tickForestRegrowth(0)).toBe(false);
    expect(getDepletionFactor(1)).toBe(0.9);
  });

  it("recovers depletion proportionally to deltaYears", () => {
    registerLogHarvest(1, 20); // depletion 0.9 (capped)
    consumeDirtyFlag(); // clear the dirty flag set by registerLogHarvest

    const changed = tickForestRegrowth(5); // REGROWTH_PER_YEAR=0.02 * 5 = 0.1

    expect(changed).toBe(true);
    expect(getDepletionFactor(1)).toBeCloseTo(0.8, 5);
    expect(consumeDirtyFlag()).toBe(true);
  });

  it("fully recovers to 0 and stops tracking the cell once regrowth clears it", () => {
    registerLogHarvest(1, 1); // depletion 0.05

    tickForestRegrowth(100); // far more than enough to clear 0.05

    expect(getDepletionFactor(1)).toBe(0);
    // A second regrowth tick has nothing left to recover -> no-op.
    expect(tickForestRegrowth(10)).toBe(false);
  });

  it("recovers multiple depleted cells independently", () => {
    registerLogHarvest(1, 20); // 0.9
    registerLogHarvest(2, 2); // 0.1

    tickForestRegrowth(1); // -0.02 each

    expect(getDepletionFactor(1)).toBeCloseTo(0.88, 5);
    expect(getDepletionFactor(2)).toBeCloseTo(0.08, 5);
  });

  it("writes depletion into the economy extension slice when the API is live", () => {
    initEconomyContext({ simulationContext } as unknown as ExtensionAPI);
    simulationContext.extensions = {};

    registerLogHarvest(3, 4); // 0.2
    expect(getDepletionFactor(3)).toBeCloseTo(0.2, 5);
    expect(
      (simulationContext.extensions.economy as { forestDepletion: Record<string, number> }).forestDepletion[3]
    ).toBeCloseTo(0.2, 5);

    // Simulate archive restore into the slice and confirm the public API reads it.
    (simulationContext.extensions.economy as { forestDepletion: Record<number, number> }).forestDepletion = {
      9: 0.5
    };
    expect(getDepletionFactor(9)).toBe(0.5);
    expect(getDepletionFactor(3)).toBe(0);
  });
});
