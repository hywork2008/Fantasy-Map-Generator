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
import {
  evaluateWorldCellLandConnectionProposals,
  type WorldCellLandProposalResult
} from "./worldCellLandConnectionProposals";
import {
  evaluateWorldLandConnectionProposals,
  type WorldLandProposalResult,
  type WorldProposalSettings
} from "./worldLandConnectionProposals";

type ProposalInput = Parameters<typeof evaluateWorldLandConnectionProposals>[2];
type CellProposalInput = Parameters<typeof evaluateWorldCellLandConnectionProposals>[2];
interface CalibrationSelectionInput {
  cityIds: readonly number[];
  nearby: NearbyConnectionSettings;
  calibration: LandConnectionCalibration;
  measurements: LandSearchMeasurements;
  budgetPolicy: LandBudgetPolicy;
  settings: WorldProposalSettings;
}
type CalibratedResult<P> =
  | {
      status: "evaluated";
      selection: Extract<NearbyConnectionResult, { status: "selected" }>;
      proposal: P;
      budget: ReturnType<typeof tuneLandConnectionBudgets>;
    }
  | { status: "unresolved"; reason: string; selection?: NearbyConnectionResult; proposal?: P };
export type CalibratedWorldLandConnectionResult = CalibratedResult<WorldLandProposalResult>;
export type CalibratedWorldCellLandConnectionResult = CalibratedResult<WorldCellLandProposalResult>;

function calibratedProposal<P extends WorldLandProposalResult | WorldCellLandProposalResult>(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: CalibrationSelectionInput,
  evaluate: (
    selection: Extract<NearbyConnectionResult, { status: "selected" }>,
    budget: ReturnType<typeof tuneLandConnectionBudgets>
  ) => P
): CalibratedResult<P> {
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
  const proposal = evaluate(selection, budget);
  return proposal.status === "evaluated"
    ? { status: "evaluated", selection, proposal, budget }
    : { status: "unresolved", reason: proposal.reason, selection, proposal };
}

/** Explicit-provider stage-5 entry. Preserves the original complete water/support
 * contract for synthetic environments and callers with their own physical source. */
export function evaluateCalibratedWorldLandConnections(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: Omit<ProposalInput, "pairs" | "environment"> &
    CalibrationSelectionInput & {
      environment: Omit<ProposalInput["environment"], "facilityCostsAt" | "approachConstructionCostAt">;
    }
): CalibratedWorldLandConnectionResult {
  return calibratedProposal(world, distanceUnit, input, (selection, budget) => {
    const width = budget.settings.crossings.dimensions.roadWidthMeters;
    return evaluateWorldLandConnectionProposals(world, distanceUnit, {
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
  });
}

/** World-owned lake/sea and cell-policy entry, including optional automatic dry
 * walking alternatives. Calibration/engineering capability and all budgets remain
 * explicit. The returned proposal is accepted by the existing fresh-session
 * adoption API; incomplete world inputs cannot be promoted into adoption permits. */
export function evaluateCalibratedWorldCellLandConnections(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: Omit<CellProposalInput, "pairs" | "environment"> &
    CalibrationSelectionInput & {
      environment: Omit<CellProposalInput["environment"], "facilityCostsAt" | "approachConstructionCostAt">;
    }
): CalibratedWorldCellLandConnectionResult {
  return calibratedProposal(world, distanceUnit, input, (selection, budget) => {
    const width = budget.settings.crossings.dimensions.roadWidthMeters;
    return evaluateWorldCellLandConnectionProposals(world, distanceUnit, {
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
  });
}
