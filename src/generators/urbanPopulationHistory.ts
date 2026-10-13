import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";

/** Calendar boundary snapshots, shared by normal/fast/history runners; never invent skipped years. */
export function recordUrbanPopulationHistory(world: WorldContext, simulation: SimulationContext): boolean {
  let changed = false;
  simulation.burgs ??= {};
  for (const burg of world.pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    simulation.burgs[burg.i] ??= {};
    const state = simulation.burgs[burg.i];
    state.urbanPopulationHistory ??= [];
    const history = state.urbanPopulationHistory;
    if (history.at(-1)?.year === simulation.currentYear) continue;
    const knot = {
      year: simulation.currentYear,
      people: Math.max(0, (burg.population ?? 0) * world.populationRate * world.urbanization),
      source: "observed" as const
    };
    history.push(knot);
    // Keep actual yearly samples separate from the fixed pre-game history.
    if (history.length > 200) history.splice(0, history.length - 200);
    if (state.urbanMorphology && knot.year > state.urbanMorphology.populationKnots.at(-1)!.year)
      state.urbanMorphology.populationKnots.push({ ...knot });
    changed = true;
  }
  return changed;
}
