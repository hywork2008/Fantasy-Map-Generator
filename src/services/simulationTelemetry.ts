/**
 * Optional observer hook for the simulation engine (advanceTime / recordDeaths). Defaults
 * to null so the browser pays zero cost; a headless Lab host (see docs/plan/simulation-lab.md)
 * injects a real implementation to mirror tick events to disk. Follows the same holder
 * pattern as skillModifierService.ts: a dependency-free module so generators can import it
 * without risking a circular dependency.
 */
export interface TickContext {
  tick: number;
  cal: { y: number; m: number; d: number; era: string };
}

export interface TickStats {
  deltaYears: number;
  deltaMonths: number;
  deltaDays: number;
}

export interface DeathEvent {
  tick: number;
  cal: TickContext["cal"];
  stateId: number;
  people: number;
  /** Mirrors DeathCause in populationLossTracker.ts (duplicated here to keep this file dependency-free). */
  cause: "combat" | "famine" | "natural" | "other";
  /** Battlefield packed-cell index when known (combat only). */
  cellId?: number;
}

export interface SimulationTelemetry {
  onDeath?(e: DeathEvent): void;
  onTickEnd?(ctx: TickContext, stats: TickStats): void;
}

let _telemetry: SimulationTelemetry | null = null;

export function setSimulationTelemetry(t: SimulationTelemetry | null): void {
  _telemetry = t;
}

export function telemetry(): SimulationTelemetry | null {
  return _telemetry;
}
