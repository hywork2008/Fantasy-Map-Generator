import { afterEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import {
  CRAFT_EMPLOYMENT_SHARE_KEY,
  getCraftEmploymentScale,
  getCraftEmploymentShare,
  setCraftEmploymentShare
} from "./craftSettings";

describe("craftSettings", () => {
  afterEach(() => {
    simulationContext.worldSettings = undefined;
  });

  it("defaults to the authored 0.45 employed share", () => {
    simulationContext.worldSettings = {};
    expect(getCraftEmploymentShare()).toBe(0.45);
    expect(getCraftEmploymentScale()).toBe(1);
  });

  it("saves the share with the world and clamps it", () => {
    simulationContext.worldSettings = {};
    expect(setCraftEmploymentShare(0.9)).toBe(0.6);
    expect(simulationContext.worldSettings?.[CRAFT_EMPLOYMENT_SHARE_KEY]).toBe("0.6");
    expect(getCraftEmploymentScale()).toBeCloseTo(0.6 / 0.45, 9);
  });
});
