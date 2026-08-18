import { afterEach, describe, expect, it } from "vitest";
import { useOptionsState } from "../store/optionsState";
import {
  applyKnowledgeEwma,
  clampTechnologyDevelopmentSpeed,
  DEFAULT_TECHNOLOGY_DEVELOPMENT_SPEED,
  getTechnologyDevelopmentSpeed,
  MAX_TECHNOLOGY_DEVELOPMENT_SPEED
} from "./technologyDevelopmentSpeed";

describe("technologyDevelopmentSpeed", () => {
  afterEach(() => {
    useOptionsState.setState({ technologyDevelopmentSpeed: DEFAULT_TECHNOLOGY_DEVELOPMENT_SPEED });
  });

  it("clamps invalid and out-of-range values to 1..100", () => {
    expect(clampTechnologyDevelopmentSpeed(undefined)).toBe(1);
    expect(clampTechnologyDevelopmentSpeed(Number.NaN)).toBe(1);
    expect(clampTechnologyDevelopmentSpeed(0)).toBe(1);
    expect(clampTechnologyDevelopmentSpeed(1.4)).toBe(1);
    expect(clampTechnologyDevelopmentSpeed(100)).toBe(100);
    // expect(clampTechnologyDevelopmentSpeed(1250)).toBe(MAX_TECHNOLOGY_DEVELOPMENT_SPEED);
  });

  it("reads the live Options multiplier", () => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 25 });
    expect(getTechnologyDevelopmentSpeed()).toBe(25);
  });

  it("applies one year of EWMA at 1× and many years at 100×", () => {
    const rate = 0.15;
    const oneYear = applyKnowledgeEwma(0, 1, rate, 1);
    expect(oneYear).toBeCloseTo(rate, 8);

    const century = applyKnowledgeEwma(0, 1, rate, 100);
    expect(century).toBeGreaterThan(0.99);
    expect(century).toBeLessThanOrEqual(1);
  });
});
