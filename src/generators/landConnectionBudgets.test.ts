import { describe, expect, it } from "vitest";
import { createLandCalibrationWorldFixture } from "./fixtures/landConnectionCalibrationWorld";
import { measureLandProposalSearches, tuneLandConnectionBudgets } from "./landConnectionBudgets";
import type { WorldProposalDiagnostics } from "./worldLandConnectionProposals";

const peaks = { networkLabels: 30, networkExpansions: 20, approachLabels: 100, approachExpansions: 60 };
const policy = {
  headroom: 2,
  minimum: { networkLabels: 10, networkExpansions: 10, approachLabels: 10, approachExpansions: 10 },
  ceiling: { networkLabels: 1000, networkExpansions: 1000, approachLabels: 1000, approachExpansions: 1000 },
  maxAssessmentSearches: 1000
};
describe("measured bounded search budgets", () => {
  it("uses measured headroom and reserves whole prepare/commit work without changing geometry", () => {
    const { input } = createLandCalibrationWorldFixture();
    input.settings.sharedSelection = { maxGroups: 4, maxPairsPerGroup: 3, maxFacilitiesPerGroup: 2, maxChecks: 10000 };
    const before = structuredClone(input.settings);
    const tuned = tuneLandConnectionBudgets(input.settings, peaks, policy, 3);
    expect(tuned).toMatchObject({
      ceilingLimited: false,
      requiredAssessmentSearches: 87,
      settings: {
        maxAssessmentSearches: 87,
        search: { maxLabels: 60, maxExpansions: 40 },
        approaches: { corridor: { maxLabels: 200, maxExpansions: 120 } }
      }
    });
    expect(tuned.settings.crossings).toEqual(input.settings.crossings);
    expect(tuned.settings.approaches.guides).toEqual(input.settings.approaches.guides);
    expect(input.settings).toEqual(before);
  });
  it("records ceilings and rejects invalid/unbounded policy", () => {
    const { input } = createLandCalibrationWorldFixture();
    expect(
      tuneLandConnectionBudgets(
        input.settings,
        peaks,
        { ...policy, maxAssessmentSearches: 1, ceiling: { ...policy.ceiling, approachLabels: 50 } },
        2
      )
    ).toMatchObject({
      ceilingLimited: true,
      settings: { maxAssessmentSearches: 1, approaches: { corridor: { maxLabels: 50 } } }
    });
    expect(() => tuneLandConnectionBudgets(input.settings, peaks, { ...policy, headroom: Infinity }, 2)).toThrow();
    expect(() => tuneLandConnectionBudgets(input.settings, { ...peaks, networkLabels: -1 }, policy, 2)).toThrow();
  });
  it("includes budget failures and shared comparisons in measured peaks", () => {
    const diagnostics = {
      approachSearchPeak: { labels: 70, expansions: 60 },
      individuals: [
        {
          assessment: {
            comparison: { candidate: { reason: "search-budget", stats: { labels: 500, expansions: 400 } } }
          }
        }
      ],
      sharedGroups: [
        {
          assessment: {
            comparisons: [
              { alternatives: { riverReturns: [{ reason: "search-budget", stats: { labels: 800, expansions: 700 } }] } }
            ]
          }
        }
      ]
    } as unknown as WorldProposalDiagnostics;
    expect(measureLandProposalSearches(diagnostics)).toEqual({
      networkLabels: 800,
      networkExpansions: 700,
      approachLabels: 70,
      approachExpansions: 60
    });
  });
});
