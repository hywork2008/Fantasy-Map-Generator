import type { Burg, Culture, IndependentBurgStance, State } from "../types/models";

export interface DiplomaticIncorporationProposal {
  burg: Burg;
  state: State;
  stance: IndependentBurgStance;
  guaranteeAutonomy?: boolean; // Offering free city / autonomous charter
}

export interface DiplomaticIncorporationResult {
  accepted: boolean;
  autonomyStatus?: "protectorate" | "tributary" | "full_independent";
  reason: string;
  influenceCost: number;
}

/**
 * Evaluates whether an independent burg accepts a diplomatic incorporation (peaceful annexation/protectorate).
 */
export function evaluateDiplomaticIncorporation(
  proposal: DiplomaticIncorporationProposal
): DiplomaticIncorporationResult {
  const { burg, state, stance, guaranteeAutonomy = true } = proposal;
  const gov = burg.independentGovernance;

  // Strict isolationist bias from governance form
  const resolve = gov?.defenseResolve ?? 40;
  const factions = gov?.factions ?? [];
  const proStateFaction = factions.find(f => f.targetStateId === state.i)?.weight ?? 0;
  const independentFaction = factions.find(f => f.targetStateId === 0)?.weight ?? 50;

  // Base acceptance score
  let acceptanceScore = 0;
  acceptanceScore += stance.affinity * 0.8;
  acceptanceScore += (proStateFaction - independentFaction) * 0.6;
  acceptanceScore += stance.economicDependence * 0.4;

  // Autonomy guarantee adds huge diplomatic incentive
  if (guaranteeAutonomy) {
    acceptanceScore += 35;
  } else {
    // Demanding complete subjugation faces fierce backlash from communes and proud lords
    acceptanceScore -= resolve * 0.6;
  }

  // If the burg is submissive under overwhelming threat, it accepts protection to survive
  if (stance.overallStance === "submissive") {
    acceptanceScore += 25;
  }

  const threshold = 50;
  if (acceptanceScore >= threshold) {
    return {
      accepted: true,
      autonomyStatus: guaranteeAutonomy ? "protectorate" : "tributary",
      reason: guaranteeAutonomy
        ? `Ratified the Charter of Autonomy with ${state.name} under diplomatic consensus.`
        : `Submitted to the authority of ${state.name} under overwhelming diplomatic pressure.`,
      influenceCost: Math.max(10, Math.round(100 - acceptanceScore))
    };
  }

  return {
    accepted: false,
    autonomyStatus: "full_independent",
    reason: `Rejected annexation proposal from ${state.name}: civic resolve (${resolve}) and sovereignty faction retain majority.`,
    influenceCost: 5
  };
}

export interface MilitaryUltimatumProposal {
  burg: Burg;
  state: State;
  militaryRatio: number; // Ratio of besieging forces vs burg defense capacity (e.g. 3.0 = 3:1)
}

export interface MilitaryUltimatumResult {
  outcome: "capitulation" | "resistance";
  autonomyStatus: "tributary" | "full_independent";
  reason: string;
}

/**
 * Evaluates burg reaction to a military ultimatum / gunboat diplomacy.
 */
export function evaluateMilitaryUltimatum(proposal: MilitaryUltimatumProposal): MilitaryUltimatumResult {
  const { burg, state, militaryRatio } = proposal;
  const gov = burg.independentGovernance;
  const resolve = gov?.defenseResolve ?? 40;

  // If invading force is overwhelmingly large compared to defense resolve
  // e.g. militaryRatio >= 3.5 with low resolve -> unfortified burg opens gates
  const resistanceScore = resolve * 1.5 - (militaryRatio - 1.0) * 25;

  if (resistanceScore <= 20) {
    return {
      outcome: "capitulation",
      autonomyStatus: "tributary",
      reason: `Capitulated to ${state.name} to avoid pillage against overwhelming force.`
    };
  }

  return {
    outcome: "resistance",
    autonomyStatus: "full_independent",
    reason: `Barricaded the gates and declared defense against ${state.name}'s aggressive ultimatum.`
  };
}

export interface ThirdPartyCrisisAssessmentInput {
  targetBurg: Burg;
  aggressorState: State;
  thirdPartyState: State;
  thirdPartyStanceToBurg: IndependentBurgStance;
  areStatesRivals?: boolean;
  distanceThirdPartyToBurg: number;
}

export interface ThirdPartyCrisisResult {
  shouldIntervene: boolean;
  interventionType?: "volunteer_garrison" | "declare_war" | "diplomatic_warning";
  reason: string;
}

/**
 * Determines whether a third-party rival state intervenes to protect an independent burg
 * (preventing a strategic bridgehead / preserving the buffer zone).
 */
export function evaluateThirdPartyIntervention(input: ThirdPartyCrisisAssessmentInput): ThirdPartyCrisisResult {
  const {
    targetBurg,
    aggressorState,
    thirdPartyState,
    thirdPartyStanceToBurg,
    areStatesRivals,
    distanceThirdPartyToBurg
  } = input;

  // If too distant, third party cannot project power to intervene
  if (distanceThirdPartyToBurg > 800) {
    return {
      shouldIntervene: false,
      reason: `${thirdPartyState.name} is too distant to project military intervention.`
    };
  }

  // Motivation 1: High affinity (protecting ethnic/cultural kin)
  const isKin = thirdPartyStanceToBurg.affinity >= 30;

  // Motivation 2: Geopolitical bridgehead danger (prevent rival from establishing border base)
  const preventsBridgehead = Boolean(areStatesRivals);

  // Motivation 3: Economic interest (protecting critical trade terminal)
  const isTradePartner = thirdPartyStanceToBurg.economicDependence >= 40;

  if (preventsBridgehead && (isKin || isTradePartner || distanceThirdPartyToBurg < 300)) {
    return {
      shouldIntervene: true,
      interventionType: areStatesRivals ? "declare_war" : "volunteer_garrison",
      reason: `${thirdPartyState.name} mobilizes to prevent ${aggressorState.name} from securing a vital bridgehead at ${targetBurg.name ?? "the burg"}.`
    };
  }

  if (isKin) {
    return {
      shouldIntervene: true,
      interventionType: "diplomatic_warning",
      reason: `${thirdPartyState.name} issues severe diplomatic warnings to ${aggressorState.name} over threats to cultural kin.`
    };
  }

  return {
    shouldIntervene: false,
    reason: `${thirdPartyState.name} remains uninvolved in the regional dispute.`
  };
}

/**
 * Applies a confirmed incorporation of a burg into a state.
 * Implements the user's recommended pattern:
 * - cells.state[cell] updated to stateId
 * - burg.state updated to stateId
 * - autonomy status recorded ("protectorate" or "tributary")
 * - historical ownership updated
 */
export function applyBurgIncorporation(
  burg: Burg,
  state: State,
  cells: { state: { [key: number]: number } },
  autonomyStatus: "protectorate" | "tributary"
): void {
  burg.state = state.i;
  cells.state[burg.cell] = state.i;

  if (!burg.stateHistory) {
    burg.stateHistory = [0];
  }
  burg.stateHistory.push(state.i);

  if (!burg.independentGovernance) {
    burg.independentGovernance = {
      form: "autocracy",
      factions: [],
      stances: {},
      defenseResolve: 30
    };
  }
  burg.independentGovernance.autonomyStatus = autonomyStatus;
  burg.independentGovernance.protectorStateId = state.i;
}

export interface AdvanceIndependentBurgDiplomacyOptions {
  world: {
    pack: {
      burgs: Burg[];
      states: State[];
      cells: { c: number[][]; state: { [key: number]: number } };
      cultures?: Culture[];
    };
  };
  simulation: {
    currentYear: number;
    currentMonth: number;
    currentDay: number;
  };
}

/**
 * Annual diplomatic advance: neighboring states send envoys to unaligned independent burgs.
 * High-affinity or intimidated burgs accept peaceful incorporation (protectorates).
 */
export function advanceIndependentBurgDiplomacy(options: AdvanceIndependentBurgDiplomacyOptions): boolean {
  const { world, simulation } = options;
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return false;

  const { burgs, states, cells } = world.pack;
  if (!burgs?.length || !states?.length) return false;

  let changed = false;

  for (const burg of burgs) {
    if (!burg.i || burg.removed || burg.state) continue;

    const gov = burg.independentGovernance;
    if (!gov || gov.autonomyStatus === "protectorate" || gov.autonomyStatus === "tributary") continue;

    // Detect neighboring states
    const neighborStateSet = new Set<number>();
    for (const c of cells.c[burg.cell] ?? []) {
      const s = cells.state[c];
      if (s && s > 0 && !states[s]?.removed) neighborStateSet.add(s);
    }

    if (neighborStateSet.size === 0) continue;

    // Evaluate diplomatic proposals from each neighbor
    for (const stateId of neighborStateSet) {
      const state = states[stateId];
      if (!state || state.removed) continue;

      let stance = gov.stances[stateId];
      if (!stance) {
        // Fallback stance calculation if missing
        const affinity = burg.culture === state.culture ? 40 : -10;
        const threat = 30 + ((state.expansionism ?? 1.5) - 1.0) * 15;
        stance = {
          targetStateId: stateId,
          affinity,
          threat,
          economicDependence: 20,
          overallStance: affinity >= 30 ? "friendly" : "cautious"
        };
        gov.stances[stateId] = stance;
      }

      const proposalResult = evaluateDiplomaticIncorporation({
        burg,
        state,
        stance,
        guaranteeAutonomy: true
      });

      if (proposalResult.accepted) {
        applyBurgIncorporation(
          burg,
          state,
          cells,
          proposalResult.autonomyStatus === "tributary" ? "tributary" : "protectorate"
        );
        changed = true;
        break; // Successfully incorporated, stop evaluating other neighbors for this burg
      }
    }
  }

  return changed;
}
