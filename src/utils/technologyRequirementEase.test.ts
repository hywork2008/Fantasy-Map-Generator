import { afterEach, describe, expect, it } from "vitest";
import { useOptionsState } from "../store/optionsState";
import {
  clampTechnologyRequirementEase,
  DEFAULT_TECHNOLOGY_REQUIREMENT_EASE,
  getTechnologyRequirementEase,
  isDeepMineRequirementRelaxed,
  MAX_TECHNOLOGY_REQUIREMENT_EASE,
  meetsTechnologyRequirement,
  scaleCountRequirement
} from "./technologyRequirementEase";

describe("technologyRequirementEase", () => {
  afterEach(() => {
    useOptionsState.setState({ technologyRequirementEase: DEFAULT_TECHNOLOGY_REQUIREMENT_EASE });
  });

  it("clamps invalid and out-of-range values to 1..100", () => {
    expect(clampTechnologyRequirementEase(undefined)).toBe(1);
    expect(clampTechnologyRequirementEase(Number.NaN)).toBe(1);
    expect(clampTechnologyRequirementEase(0)).toBe(1);
    expect(clampTechnologyRequirementEase(1.4)).toBe(1);
    expect(clampTechnologyRequirementEase(100)).toBe(MAX_TECHNOLOGY_REQUIREMENT_EASE);
    expect(clampTechnologyRequirementEase(250)).toBe(MAX_TECHNOLOGY_REQUIREMENT_EASE);
  });

  it("reads the live Options multiplier", () => {
    useOptionsState.setState({ technologyRequirementEase: 25 });
    expect(getTechnologyRequirementEase()).toBe(25);
  });

  it("waives unit counts at 2× and two-counts at 3×", () => {
    expect(scaleCountRequirement(1, 1)).toBe(1);
    expect(scaleCountRequirement(1, 2)).toBe(0);
    expect(scaleCountRequirement(2, 2)).toBe(1);
    expect(scaleCountRequirement(2, 3)).toBe(0);
    expect(isDeepMineRequirementRelaxed(1)).toBe(false);
    expect(isDeepMineRequirementRelaxed(2)).toBe(true);
  });

  it("keeps historical bars at 1× and passes empty evidence at 100×", () => {
    expect(meetsTechnologyRequirement(0, 1, "count", 1)).toBe(false);
    expect(meetsTechnologyRequirement(1, 1, "count", 1)).toBe(true);
    expect(meetsTechnologyRequirement(0, 0.55, "ratio", 1)).toBe(false);
    expect(meetsTechnologyRequirement(0, 160, "amount", 1)).toBe(false);

    expect(meetsTechnologyRequirement(0, 1, "count", 100)).toBe(true);
    expect(meetsTechnologyRequirement(0, 0.55, "ratio", 100)).toBe(true);
    expect(meetsTechnologyRequirement(0, 160, "amount", 100)).toBe(true);
  });
});
