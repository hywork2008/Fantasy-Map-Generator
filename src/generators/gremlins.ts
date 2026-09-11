import { type SimulationContext, simulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { useOptionsState } from "../store/optionsState";
import { isTechnologyStageAtLeast } from "./technologyTypes";

export interface StateGremlinStatus {
  stateId: number;
  /** Whether gremlins have infested the state's electrical machinery/infrastructure. */
  infested: boolean;
  /** Infestation severity from 0 (none) to 1 (critical colony swarm). */
  infestationLevel: number;
  /** Whether the state has learned the Secret Arcane Art to detect and ward off gremlins. */
  warded: "full" | "partial" | "none";
  /** Mechanical failure / disruption chance this simulation period (0..1). */
  disruptionChance: number;
  /** Penalty multiplier to scientific reproducibility (0 = total chaos, 1 = normal science). */
  reproducibilityFactor: number;
}

export interface GremlinDisruptionIncident {
  stateId: number;
  year: number;
  type: "blackout" | "telegraph_failure" | "research_setback" | "civilization_collapse";
  description: string;
}

/**
 * Checks whether a state has learned the Secret Arcane Art of Gremlin Warding.
 */
export function getGremlinWardingStatus(stateId: number): "full" | "partial" | "none" {
  const progressList = simulationContext.technology?.progress ?? [];
  const progress = progressList.find(p => p.ownerId === stateId && p.technologyId === "arcaneGremlinWarding");
  if (!progress) return "none";

  if (isTechnologyStageAtLeast(progress.stage, "adopted")) {
    return "full";
  }
  if (isTechnologyStageAtLeast(progress.stage, "demonstrated")) {
    return "partial";
  }
  return "none";
}

/**
 * Evaluates the presence, infestation scale, and warded status of gremlins in a given state.
 * Gremlins are incorporeal entities that proliferate rapidly on electricity and electrical machines.
 */
export function evaluateStateGremlinStatus(
  stateId: number,
  world: WorldContext,
  electricalSignals: {
    powerStationInstallations?: number;
    gasPowerStationInstallations?: number;
    telegraphLineInstallations?: number;
    copperWireAccess?: number;
    electricityCoverage?: number;
  }
): StateGremlinStatus {
  const options = world.options;
  const culturesSet = options?.culturesSet ?? useOptionsState.getState().culturesSet;
  const gremlinsEnabled = options?.gremlinsEnabled ?? useOptionsState.getState().gremlinsEnabled;

  if (!isFantasyCulturesSet(culturesSet) || gremlinsEnabled === false) {
    return {
      stateId,
      infested: false,
      infestationLevel: 0,
      warded: "none",
      disruptionChance: 0,
      reproducibilityFactor: 1
    };
  }

  const powerStations =
    (electricalSignals.powerStationInstallations ?? 0) + (electricalSignals.gasPowerStationInstallations ?? 0);
  const telegraphs = electricalSignals.telegraphLineInstallations ?? 0;
  const wireAccess = electricalSignals.copperWireAccess ?? 0;
  const electricityCoverage = electricalSignals.electricityCoverage ?? 0;

  // Electrical machine presence intensity
  const electricalIntensity = powerStations * 0.35 + telegraphs * 0.25 + wireAccess * 0.2 + electricityCoverage * 0.2;

  if (electricalIntensity <= 0.05) {
    return {
      stateId,
      infested: false,
      infestationLevel: 0,
      warded: "none",
      disruptionChance: 0,
      reproducibilityFactor: 1
    };
  }

  // Infestation scales with electricity use
  const infestationLevel = Math.min(1, electricalIntensity);
  const warded = getGremlinWardingStatus(stateId);

  let disruptionChance = 0;
  let reproducibilityFactor = 1;

  if (warded === "full") {
    // Secret Arcane Art detects and banishes gremlins safely
    disruptionChance = 0;
    reproducibilityFactor = 1;
  } else if (warded === "partial") {
    // Partially warded: 70% suppression
    disruptionChance = infestationLevel * 0.15;
    reproducibilityFactor = Math.max(0.7, 1 - infestationLevel * 0.3);
  } else {
    // Completely unwarded: gremlins cannot be perceived; phenomenon lacks reproducibility
    disruptionChance = infestationLevel * 0.5; // up to 50% intermittent failure
    reproducibilityFactor = Math.max(0.1, 1 - infestationLevel * 0.85); // up to 90% scientific penalty
  }

  return {
    stateId,
    infested: true,
    infestationLevel,
    warded,
    disruptionChance,
    reproducibilityFactor
  };
}

/**
 * Simulates gremlin activities for a month/year tick.
 * If unwarded gremlins are present, electrical machines fail intermittently,
 * research trial progress resets due to unexplainable irreproducibility,
 * and electrical networks may collapse.
 */
export function advanceGremlins(
  world: WorldContext,
  simulation: SimulationContext,
  stateSignalsLookup: (stateId: number) => {
    powerStationInstallations?: number;
    gasPowerStationInstallations?: number;
    telegraphLineInstallations?: number;
    copperWireAccess?: number;
    electricityCoverage?: number;
  },
  rng: () => number = Math.random
): { incidents: GremlinDisruptionIncident[]; changed: boolean } {
  const { pack, options } = world;
  const culturesSet = options?.culturesSet ?? useOptionsState.getState().culturesSet;
  const gremlinsEnabled = options?.gremlinsEnabled ?? useOptionsState.getState().gremlinsEnabled;

  if (!isFantasyCulturesSet(culturesSet) || gremlinsEnabled === false) {
    return { incidents: [], changed: false };
  }

  const incidents: GremlinDisruptionIncident[] = [];
  const states = pack.states ?? [];

  for (let s = 1; s < states.length; s++) {
    const state = states[s];
    if (!state || state.removed) continue;

    const signals = stateSignalsLookup(s);
    const status = evaluateStateGremlinStatus(s, world, signals);
    if (!status.infested || status.warded === "full") continue;

    const roll = rng();
    if (roll < status.disruptionChance) {
      // Disruption occurs!
      if (status.infestationLevel >= 0.7 && rng() < 0.2) {
        // Severe crisis: Electric civilization disruption / breakdown
        incidents.push({
          stateId: s,
          year: simulation.currentYear,
          type: "civilization_collapse",
          description: `Unseen gremlins multiplied exponentially in State ${state.name}'s power grid! Massive electrical equipment failures have paralyzed urban industries and scientific institutions.`
        });
      } else if (rng() < 0.5) {
        // Telegraph / Signal disruption
        incidents.push({
          stateId: s,
          year: simulation.currentYear,
          type: "telegraph_failure",
          description: `Mysterious glitches crippled telegraph and electrical relay lines in State ${state.name}. Technicians cannot reproduce or isolate the fault without the Secret Arcane Art.`
        });
      } else {
        // Research and experimental trial setback
        incidents.push({
          stateId: s,
          year: simulation.currentYear,
          type: "research_setback",
          description: `Laboratory apparatus and dynamos in State ${state.name} repeatedly shut down at random. Lack of experimental reproducibility has severely set back scientific innovation.`
        });
      }
    }
  }

  return {
    incidents,
    changed: incidents.length > 0
  };
}
