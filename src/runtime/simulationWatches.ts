import type { SimulationContext } from "../context/simulationContext";
import type { DataTopic } from "./worldRuntime";

export interface SimulationWatch {
  beforeStep(simulation: SimulationContext, days: number): { allowed: boolean; topics?: readonly DataTopic[] };
  requiresDailySteps(simulation: SimulationContext): boolean;
  paused(simulation: SimulationContext): boolean;
  observeStep?(simulation: SimulationContext): boolean;
  afterStep?(
    simulation: SimulationContext,
    days: number
  ): { rollback: boolean; afterRollback?: () => void; topics?: readonly DataTopic[] };
  beginRun?(simulation: SimulationContext, days: number): void;
}
const watches = new Set<SimulationWatch>();
export function registerSimulationWatch(watch: SimulationWatch): () => void {
  watches.add(watch);
  return () => watches.delete(watch);
}
export function checkSimulationWatches(simulation: SimulationContext, days: number) {
  for (const watch of watches) {
    const result = watch.beforeStep(simulation, days);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
export function simulationNeedsDailySteps(simulation: SimulationContext): boolean {
  return [...watches].some(watch => watch.requiresDailySteps(simulation));
}
export function simulationWatchPaused(simulation: SimulationContext): boolean {
  return [...watches].some(watch => watch.paused(simulation));
}

export function simulationNeedsObservedStep(simulation: SimulationContext): boolean {
  return [...watches].some(watch => watch.observeStep?.(simulation));
}
export function completeObservedStep(simulation: SimulationContext, days: number) {
  for (const watch of watches) {
    const result = watch.afterStep?.(simulation, days);
    if (result?.rollback) return result;
  }
  return { rollback: false };
}
export function beginWatchedAdvance(simulation: SimulationContext, days: number): void {
  for (const watch of watches) watch.beginRun?.(simulation, days);
}
