import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { getRaceById } from "../data/races";
import type { Culture, Race, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

type WaterSitingCells = Pick<PackedGraph["cells"], "h" | "i" | "r" | "s" | "state">;

/** True only for a Giant State in a Fantasy culture set, the scope of the Roman-waterworks rule. */
export function isGiantWaterworksState(args: {
  stateId: number | undefined;
  states: readonly State[];
  cultures: readonly Culture[];
  races: readonly Race[] | undefined;
  culturesSet: string | undefined;
}): boolean {
  if (!args.stateId || !isFantasyCulturesSet(args.culturesSet)) return false;
  const state = args.states[args.stateId] ?? args.states.find(candidate => candidate?.i === args.stateId);
  const culture = args.cultures[state?.culture ?? 0];
  return getRaceById(args.races, culture?.race)?.key === "giant";
}

/** Highest mapped river cell, used as the world's highest available gravity-water source. */
export function highestWaterSourceElevation(cells: WaterSitingCells): number | null {
  let highest: number | null = null;
  for (const cell of cells.i) {
    if (!cells.r[cell]) continue;
    const elevation = cells.h[cell];
    if (highest === null || elevation > highest) highest = elevation;
  }
  return highest;
}

/**
 * Find a viable, unoccupied State cell strictly below the highest water source.
 * Suitability wins first so the rule does not turn gravity-fed cities into deliberately poor
 * settlements; distance from the former location breaks ties and makes the result deterministic.
 */
export function chooseLowerGiantWaterworksSite(args: {
  cells: WaterSitingCells;
  stateId: number;
  fromCell: number;
  highestSourceElevation: number;
}): number | undefined {
  let candidate: number | undefined;
  let bestSuitability = -Infinity;
  let bestDistance = Infinity;

  for (const cell of args.cells.i) {
    if (args.cells.state[cell] !== args.stateId || args.cells.h[cell] < 20) continue;
    if (args.cells.h[cell] >= args.highestSourceElevation || args.cells.s[cell] <= 0) continue;
    const distance = Math.abs(cell - args.fromCell);
    const suitability = args.cells.s[cell];
    if (suitability > bestSuitability || (suitability === bestSuitability && distance < bestDistance)) {
      candidate = cell;
      bestSuitability = suitability;
      bestDistance = distance;
    }
  }
  return candidate;
}
