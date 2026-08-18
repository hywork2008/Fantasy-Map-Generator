/**
 * Read-only rows for the Technology Overview dialog.
 * Joins live states with the host technology graph; does not mutate pack or progress.
 */

import { worldContext } from "../context/worldContext";
import { isGunpowderEraEnabled } from "../utils/gunpowderEra";
import { getActiveTechnologyDefinitions } from "./technologyDefinitions";
import { getTechnologyState } from "./technologyProgress";
import { progressKey, type TechnologyEraBand, type TechnologyStage, technologyStageRank } from "./technologyTypes";

export interface TechnologyOverviewRow {
  id: string;
  stateId: number;
  stateName: string;
  technologyId: string;
  technologyLabel: string;
  era: TechnologyEraBand;
  stage: TechnologyStage;
  stageRank: number;
  discoveredYear: number | null;
  demonstratedYear: number | null;
  adoptedYear: number | null;
  diffusion: number;
  capitalX: number | null;
  capitalY: number | null;
}

export interface SteamPumpingSummary {
  states: number;
  known: number;
  demonstrated: number;
  adopted: number;
  diffused: number;
}

export function collectTechnologyOverviewRows(): TechnologyOverviewRow[] {
  const pack = worldContext.pack;
  const states = pack?.states ?? [];
  const burgs = pack?.burgs ?? [];
  const tech = getTechnologyState();
  const byKey = new Map(
    tech.progress.map(entry => [progressKey(entry.technologyId, entry.scope, entry.ownerId), entry])
  );
  const active = getActiveTechnologyDefinitions({
    gunpowderWorld: isGunpowderEraEnabled(worldContext.options),
    shipbuildingWorld: true
  });

  const rows: TechnologyOverviewRow[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const capital = typeof state.capital === "number" ? burgs[state.capital] : undefined;
    const capitalX = capital && Number.isFinite(capital.x) ? capital.x : null;
    const capitalY = capital && Number.isFinite(capital.y) ? capital.y : null;

    for (const def of active) {
      if (def.scope !== "state") continue;
      const entry = byKey.get(progressKey(def.id, "state", state.i));
      const stage = entry?.stage ?? "locked";
      rows.push({
        id: `${state.i}:${def.id}`,
        stateId: state.i,
        stateName: state.name || `State ${state.i}`,
        technologyId: def.id,
        technologyLabel: def.label,
        era: def.era,
        stage,
        stageRank: technologyStageRank(stage),
        discoveredYear: entry?.discoveredYear ?? null,
        demonstratedYear: entry?.demonstratedYear ?? null,
        adoptedYear: entry?.adoptedYear ?? null,
        diffusion: entry?.diffusion ?? 0,
        capitalX,
        capitalY
      });
    }
  }

  return rows;
}

export function summarizeAtmosphericSteamPumping(rows: readonly TechnologyOverviewRow[]): SteamPumpingSummary {
  const steam = rows.filter(row => row.technologyId === "atmosphericSteamPumping");
  return {
    states: steam.length,
    known: steam.filter(row => row.stageRank >= 1).length,
    demonstrated: steam.filter(row => row.stageRank >= 2).length,
    adopted: steam.filter(row => row.stageRank >= 3).length,
    diffused: steam.filter(row => row.stageRank >= 4).length
  };
}
