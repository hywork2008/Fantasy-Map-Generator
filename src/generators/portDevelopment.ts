import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { Burgs } from "./burgs-generator";
import { Routes } from "./routes-generator";

const PORT_DEVELOPMENT_COST = 10;
const PORT_DEVELOPMENT_RESERVE = 12;
const MIN_PORT_DEVELOPMENT_POPULATION = 2;

export interface PortDevelopment {
  readonly stateId: number;
  readonly burgId: number;
  readonly routeAdded: boolean;
}

/**
 * Funds one port work per State each January. It lets an established river or
 * harbour town become a maritime endpoint after its original settlement phase.
 */
export function advancePortDevelopment(
  world: WorldContext,
  simulation: Readonly<SimulationContext>
): readonly PortDevelopment[] {
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return [];

  const { burgs, cells, states } = world.pack;
  const developments: PortDevelopment[] = [];

  for (const state of states) {
    if (!state?.i || state.removed || (state.treasury ?? 0) < PORT_DEVELOPMENT_COST + PORT_DEVELOPMENT_RESERVE) {
      continue;
    }

    const candidates = burgs
      .filter(
        burg =>
          burg?.i &&
          !burg.removed &&
          burg.state === state.i &&
          !burg.port &&
          (burg.population ?? 0) >= MIN_PORT_DEVELOPMENT_POPULATION &&
          Boolean(cells.harbor[burg.cell] || cells.r[burg.cell])
      )
      .sort(
        (a, b) =>
          (cells.harbor[b.cell] ? 10 : 0) +
          (cells.fl[b.cell] ?? 0) / 1000 +
          (b.population ?? 0) -
          ((cells.harbor[a.cell] ? 10 : 0) + (cells.fl[a.cell] ?? 0) / 1000 + (a.population ?? 0))
      );
    for (const candidate of candidates) {
      const burgId = candidate.i;
      if (!burgId || !Burgs.developPort(candidate)) continue;

      state.treasury = Math.max(0, (state.treasury ?? 0) - PORT_DEVELOPMENT_COST);
      const routeAdded = Routes.connectPort(candidate.cell, state.i) !== undefined;
      developments.push({ stateId: state.i, burgId, routeAdded });
      break;
    }
  }

  return developments;
}
