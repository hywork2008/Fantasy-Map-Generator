import type { Burg, Culture, IndependentBurgStance, State } from "../types/models";

export interface StanceCalculationContext {
  cultures?: Culture[];
  states?: State[];
  burgs?: Burg[];
  distance?: number; // Euclidian or path distance to state capital/border
  borderEnclosureRatio?: number; // 0..1 fraction of adjacent land cells owned by state
  hasTradeRoute?: boolean;
}

/**
 * Calculates cultural and historical affinity between a burg and a state (-100 to +100).
 */
export function calculateAffinity(burg: Burg, state: State, cultures?: Culture[]): number {
  let affinity = 0;

  // Culture affinity
  if (burg.culture !== undefined && state.culture !== undefined) {
    if (burg.culture === state.culture) {
      affinity += 40;
    } else if (cultures) {
      const burgCult = cultures[burg.culture];
      const stateCult = cultures[state.culture];
      if (burgCult && stateCult && burgCult.base === stateCult.base) {
        affinity += 15; // same language/culture group
      } else {
        affinity -= 25; // alien culture
      }
    } else {
      affinity -= 20;
    }
  }

  // Historical ownership legacy
  if (burg.stateHistory?.includes(state.i)) {
    // If it was their homeland previously
    if (burg.culture === state.culture) {
      affinity += 20;
    } else {
      affinity -= 15; // bitter memory of foreign occupation
    }
  }

  // Type compatibility (Naval, Nomadic, Highland, etc.)
  if (burg.type && state.type && burg.type === state.type) {
    affinity += 10;
  }

  return Math.max(-100, Math.min(100, affinity));
}

/**
 * Calculates geopolitical threat perceived by the burg from this state (0 to 100).
 */
export function calculateThreat(
  _burg: Burg,
  state: State,
  options?: { distance?: number; borderEnclosureRatio?: number }
): number {
  let threat = 20; // baseline neighborhood awareness

  // Expansionism multiplier of the state (typically 0.5 - 4.0)
  const expansionism = state.expansionism ?? 1.5;
  threat += (expansionism - 1.0) * 15;

  // Enclosure ratio: if the state's territory surrounds the burg, threat skyrockets
  const enclosure = options?.borderEnclosureRatio ?? 0;
  threat += enclosure * 40;

  // Distance penalty: far-off empires pose less immediate invasion danger
  const dist = options?.distance ?? 1000;
  if (dist < 200) threat += 25;
  else if (dist < 500) threat += 10;
  else if (dist > 1500) threat -= 25;

  return Math.max(0, Math.min(100, Math.round(threat)));
}

/**
 * Calculates economic dependence on this state (0 to 100).
 */
export function calculateEconomicDependence(
  burg: Burg,
  state: State,
  options?: { hasTradeRoute?: boolean; distance?: number }
): number {
  let dependence = 10;

  if (options?.hasTradeRoute) {
    dependence += 35;
  }

  const dist = options?.distance ?? 1000;
  if (dist < 300) {
    dependence += 25;
  } else if (dist < 600) {
    dependence += 10;
  }

  if (burg.port && state.type === "Naval") {
    dependence += 15;
  }

  return Math.max(0, Math.min(100, dependence));
}

/**
 * Determines overall stance category towards a state.
 */
export function determineOverallStance(
  affinity: number,
  threat: number,
  defenseResolve: number
): "friendly" | "cautious" | "hostile" | "submissive" {
  // Overwhelming threat against low resolve forces capitulation / submissiveness
  if (threat >= 70 && defenseResolve < 45 && affinity >= -20) {
    return "submissive";
  }

  // Strong affinity with manageable threat breeds friendship
  if (affinity >= 30 && threat < 60) {
    return "friendly";
  }

  // Strong hatred, or high threat facing an unyielding defender breeds hostility
  if (affinity <= -30 || (threat >= 65 && defenseResolve >= 50)) {
    return "hostile";
  }

  // Default cautious / pragmatic balancing
  return "cautious";
}

/**
 * Evaluates the comprehensive IndependentBurgStance of a burg toward a specific state.
 */
export function evaluateBurgStanceToState(
  burg: Burg,
  state: State,
  context: StanceCalculationContext
): IndependentBurgStance {
  const affinity = calculateAffinity(burg, state, context.cultures);
  const threat = calculateThreat(burg, state, {
    distance: context.distance,
    borderEnclosureRatio: context.borderEnclosureRatio
  });
  const economicDependence = calculateEconomicDependence(burg, state, {
    hasTradeRoute: context.hasTradeRoute,
    distance: context.distance
  });

  const defenseResolve = burg.independentGovernance?.defenseResolve ?? 40;
  const overallStance = determineOverallStance(affinity, threat, defenseResolve);

  return {
    targetStateId: state.i,
    affinity,
    threat,
    economicDependence,
    overallStance
  };
}
