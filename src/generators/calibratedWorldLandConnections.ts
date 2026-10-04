import type { WorldContext } from "../context/worldContext";
import { type LandBudgetPolicy, type LandSearchMeasurements, tuneLandConnectionBudgets } from "./landConnectionBudgets";
import {
  calibrateApproachCost,
  calibrateBridgeCosts,
  type LandConnectionCalibration
} from "./landConnectionCalibration";
import {
  type NearbyConnectionResult,
  type NearbyConnectionSettings,
  selectNearbyWorldConnectionPairs
} from "./landConnectionSelection";
import { evaluateWorldLandConnectionProposals, type WorldLandProposalResult } from "./worldLandConnectionProposals";

type ProposalInput = Parameters<typeof evaluateWorldLandConnectionProposals>[2];
export type CalibratedWorldLandConnectionResult =
  | {
      status: "evaluated";
      selection: Extract<NearbyConnectionResult, { status: "selected" }>;
      proposal: WorldLandProposalResult;
      budget: ReturnType<typeof tuneLandConnectionBudgets>;
    }
  | { status: "unresolved"; reason: string; selection?: NearbyConnectionResult; proposal?: WorldLandProposalResult };

/** Complete stage-5 evaluation entry: current city selection, physical costs,
 * bounded facility groups and measured search budgets. Complete physical water,
 * support/permissions and capability still come from the current world provider;
 * no lakes, bridges or baseline connectivity are inferred here. */
export function evaluateCalibratedWorldLandConnections(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: Omit<ProposalInput, "pairs" | "environment"> & {
    cityIds: readonly number[];
    nearby: NearbyConnectionSettings;
    calibration: LandConnectionCalibration;
    measurements: LandSearchMeasurements;
    budgetPolicy: LandBudgetPolicy;
    environment: Omit<ProposalInput["environment"], "facilityCostsAt" | "approachConstructionCostAt">;
  }
): CalibratedWorldLandConnectionResult {
  if (
    !input.settings.sharedSelection ||
    input.nearby.maxPairs > input.settings.maxPairs ||
    input.settings.sharedSelection.maxPairsPerGroup > input.settings.shared.maxPairs
  )
    return { status: "unresolved", reason: "invalid-input" };
  const selection = selectNearbyWorldConnectionPairs(
    world,
    distanceUnit,
    input.cityIds,
    input.nearby,
    input.calibration,
    input.settings.individual
  );
  if (selection.status === "unresolved") return { status: "unresolved", reason: selection.reason, selection };
  if (!selection.pairs.length) return { status: "unresolved", reason: "no-nearby-pairs", selection };
  let budget: ReturnType<typeof tuneLandConnectionBudgets>;
  try {
    budget = tuneLandConnectionBudgets(input.settings, input.measurements, input.budgetPolicy, selection.pairs.length);
  } catch {
    return { status: "unresolved", reason: "invalid-budget-policy", selection };
  }
  const width = budget.settings.crossings.dimensions.roadWidthMeters;
  const proposal = evaluateWorldLandConnectionProposals(world, distanceUnit, {
    ...input,
    pairs: selection.pairs,
    settings: budget.settings,
    environment: {
      ...input.environment,
      facilityCostsAt: crossing => calibrateBridgeCosts(crossing, width, input.calibration),
      approachConstructionCostAt: (_crossing, _a, _b, lengths) =>
        calibrateApproachCost(lengths, width, input.calibration)
    }
  });
  return proposal.status === "evaluated"
    ? { status: "evaluated", selection, proposal, budget }
    : { status: "unresolved", reason: proposal.reason, selection, proposal };
}
