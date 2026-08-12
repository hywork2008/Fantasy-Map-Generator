import { describe, expect, it } from "vitest";
import {
  checkGreatLibraryEligibility,
  checkGreatLibraryMaintain,
  commitmentScholarshipAffinity,
  computeRulerScore,
  computeValuesKnowledge,
  type GreatLibraryRulerTraits,
  isGreatLibraryTheocracyState
} from "./greatLibraryEligibility";
import {
  GREAT_LIBRARY_MAINTAIN_COVERAGE,
  GREAT_LIBRARY_MAINTAIN_RULER_SCORE,
  GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR,
  GREAT_LIBRARY_RULER_LEARNING_MIN,
  GREAT_LIBRARY_RULER_SCORE_MIN,
  GREAT_LIBRARY_TREASURY_FLOOR
} from "./greatLibraryTypes";

describe("isGreatLibraryTheocracyState", () => {
  it("is true for form === 'Theocracy'", () => {
    expect(isGreatLibraryTheocracyState({ form: "Theocracy" })).toBe(true);
  });

  it("is true for a known religious formName even when form differs", () => {
    expect(isGreatLibraryTheocracyState({ form: "Monarchy", formName: "Holy State" })).toBe(true);
    expect(isGreatLibraryTheocracyState({ form: "Monarchy", formName: "Bishopric" })).toBe(true);
  });

  it("is false for a secular form/formName", () => {
    expect(isGreatLibraryTheocracyState({ form: "Monarchy", formName: "Kingdom" })).toBe(false);
    expect(isGreatLibraryTheocracyState({})).toBe(false);
  });
});

describe("commitmentScholarshipAffinity", () => {
  it("returns 1.0 for ideology/craft/domain (single commitment, no secondary)", () => {
    expect(
      commitmentScholarshipAffinity({ primary: { kind: "craft" }, intensity: 50, conflictPolicy: "negotiate" })
    ).toBe(1);
  });

  it("returns 0.55 for office/state/faith", () => {
    expect(
      commitmentScholarshipAffinity({ primary: { kind: "faith" }, intensity: 50, conflictPolicy: "negotiate" })
    ).toBe(0.55);
  });

  it("returns 0.35 for nation_culture/people", () => {
    expect(
      commitmentScholarshipAffinity({ primary: { kind: "nation_culture" }, intensity: 50, conflictPolicy: "negotiate" })
    ).toBe(0.35);
  });

  it("returns 0.30 for family/house/liege/patron/comrades", () => {
    expect(
      commitmentScholarshipAffinity({ primary: { kind: "family" }, intensity: 50, conflictPolicy: "negotiate" })
    ).toBe(0.3);
  });

  it("returns 0.0 for wealth/self/hedonism/rivalry", () => {
    expect(
      commitmentScholarshipAffinity({ primary: { kind: "wealth" }, intensity: 50, conflictPolicy: "negotiate" })
    ).toBe(0);
  });

  it("weight-averages primary and secondary, defaulting missing weight to 1", () => {
    // craft (1.0) and wealth (0.0), equal implicit weight -> 0.5
    const affinity = commitmentScholarshipAffinity({
      primary: { kind: "craft" },
      secondary: { kind: "wealth" },
      intensity: 50,
      conflictPolicy: "negotiate"
    });
    expect(affinity).toBeCloseTo(0.5, 10);
  });

  it("respects explicit weights", () => {
    // craft (1.0) weight 3, wealth (0.0) weight 1 -> 0.75
    const affinity = commitmentScholarshipAffinity({
      primary: { kind: "craft", weight: 3 },
      secondary: { kind: "wealth", weight: 1 },
      intensity: 50,
      conflictPolicy: "negotiate"
    });
    expect(affinity).toBeCloseTo(0.75, 10);
  });

  it("falls back to the default affinity when there is no commitment at all", () => {
    expect(commitmentScholarshipAffinity(undefined)).toBe(0.25);
  });
});

describe("computeValuesKnowledge / computeRulerScore — worked examples from docs/plan/great-library.md KD-3", () => {
  it("reproduces the non-theocracy Monarchy pass row (learning 80, rat 70, craft 1.0, zeal 50, greed 40)", () => {
    const input = {
      learning: 80,
      rationality: 70,
      zeal: 50,
      greed: 40,
      piety: 0,
      commitmentAffinity: 1,
      isTheocracy: false
    };
    expect(computeValuesKnowledge(input)).toBeCloseTo(0.72, 10);
    expect(computeRulerScore(input)).toBeCloseTo(0.6544, 10);
  });

  it("reproduces the Theocracy high-piety pass row (learning 70, rat 45, piety 80, faith 0.55, zeal 50, greed 40)", () => {
    const input = {
      learning: 70,
      rationality: 45,
      zeal: 50,
      greed: 40,
      piety: 80,
      commitmentAffinity: 0.55,
      isTheocracy: true
    };
    expect(computeValuesKnowledge(input)).toBeCloseTo(0.5075, 10);
    expect(computeRulerScore(input)).toBeCloseTo(0.4759125, 10);
  });

  it("reproduces the Theocracy low-piety fail row (learning 68, rat 40, piety 25, faith 0.55, zeal 40, greed 50)", () => {
    const input = {
      learning: 68,
      rationality: 40,
      zeal: 40,
      greed: 50,
      piety: 25,
      commitmentAffinity: 0.55,
      isTheocracy: true
    };
    expect(computeRulerScore(input)).toBeLessThan(GREAT_LIBRARY_RULER_SCORE_MIN);
  });

  it("a non-theocracy state never reads piety, even when piety is high", () => {
    const base = { learning: 70, rationality: 45, zeal: 50, greed: 40, commitmentAffinity: 0.55, isTheocracy: false };
    expect(computeRulerScore({ ...base, piety: 0 })).toBeCloseTo(computeRulerScore({ ...base, piety: 100 }), 10);
  });
});

const RULER: GreatLibraryRulerTraits = {
  learning: 80,
  rationality: 70,
  zeal: 50,
  greed: 40,
  piety: 0,
  commitmentAffinity: 1
};

describe("checkGreatLibraryEligibility", () => {
  const baseInput = {
    cultureKnowledgeValue: 0.6,
    ruler: RULER,
    isTheocracy: false,
    treasury: GREAT_LIBRARY_TREASURY_FLOOR,
    hasEnemyDiplomacy: false,
    alreadyHasLibrary: false
  };

  it("passes when every gate clears", () => {
    const result = checkGreatLibraryEligibility(baseInput);
    expect(result.eligible).toBe(true);
    expect(result.cultureOk).toBe(true);
    expect(result.rulerOk).toBe(true);
    expect(result.wealthOk).toBe(true);
    expect(result.peaceOk).toBe(true);
  });

  it("fails on culture alone", () => {
    const result = checkGreatLibraryEligibility({ ...baseInput, cultureKnowledgeValue: 0.1 });
    expect(result.cultureOk).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("fails when there is no living ruler", () => {
    const result = checkGreatLibraryEligibility({ ...baseInput, ruler: undefined });
    expect(result.rulerOk).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.scores.rulerScore).toBe(0);
  });

  it("fails the ruler gate on the raw learning floor even if rulerScore would pass", () => {
    // Below GREAT_LIBRARY_RULER_LEARNING_MIN but with a strong values profile.
    const weakLearningRuler: GreatLibraryRulerTraits = { ...RULER, learning: GREAT_LIBRARY_RULER_LEARNING_MIN - 1 };
    const result = checkGreatLibraryEligibility({ ...baseInput, ruler: weakLearningRuler });
    expect(result.rulerOk).toBe(false);
  });

  it("fails on wealth below the treasury floor", () => {
    const result = checkGreatLibraryEligibility({ ...baseInput, treasury: GREAT_LIBRARY_TREASURY_FLOOR - 1 });
    expect(result.wealthOk).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("fails on an active Enemy diplomacy relation", () => {
    const result = checkGreatLibraryEligibility({ ...baseInput, hasEnemyDiplomacy: true });
    expect(result.peaceOk).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("fails when the state already has an active project, even if every other gate clears", () => {
    const result = checkGreatLibraryEligibility({ ...baseInput, alreadyHasLibrary: true });
    expect(result.eligible).toBe(false);
    expect(result.alreadyHasLibrary).toBe(true);
  });

  it("treasury floor and full projected coverage coincide (docs/plan/great-library.md KD-4 note)", () => {
    const atFloor = checkGreatLibraryEligibility({ ...baseInput, treasury: GREAT_LIBRARY_TREASURY_FLOOR });
    expect(atFloor.scores.projectedCoverage).toBeCloseTo(1, 10);
  });
});

describe("checkGreatLibraryMaintain", () => {
  const baseInput = { ruler: RULER, isTheocracy: false, treasury: GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR };

  it("passes when every looser gate clears", () => {
    const result = checkGreatLibraryMaintain(baseInput);
    expect(result.ok).toBe(true);
  });

  it("fails when there is no living ruler", () => {
    const result = checkGreatLibraryMaintain({ ...baseInput, ruler: undefined });
    expect(result.rulerOk).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("only checks rulerScore, not the raw learning floor", () => {
    // Learning far below the start-gate floor, but a strong-enough values profile for score to clear.
    const lowLearningRuler: GreatLibraryRulerTraits = { ...RULER, learning: 50 };
    const result = checkGreatLibraryMaintain({ ...baseInput, ruler: lowLearningRuler });
    expect(result.rulerScore).toBeGreaterThanOrEqual(GREAT_LIBRARY_MAINTAIN_RULER_SCORE);
    expect(result.rulerOk).toBe(true);
  });

  it("fails below the maintain treasury floor", () => {
    const result = checkGreatLibraryMaintain({ ...baseInput, treasury: GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR - 1 });
    expect(result.treasuryOk).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("fails below the maintain coverage threshold", () => {
    const result = checkGreatLibraryMaintain({ ...baseInput, treasury: 1 });
    expect(result.coverageOk).toBe(false);
    expect(result.projectedCoverage).toBeLessThan(GREAT_LIBRARY_MAINTAIN_COVERAGE);
  });
});
