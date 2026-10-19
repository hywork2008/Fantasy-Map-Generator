import type { WorldContext } from "../context/worldContext";
import { resolveStaticLandUseInputs } from "../generators/landUse";
import { planSettlementLandUse } from "../generators/settlementClearance";
import { precipitationProxyToMillimeters } from "../utils/precipitationUnits";

export interface FarmlandFeatures {
  cellId: number;
  burgId: number | null;
  biomeKey: string;
  historicalPeriod: string;
  settlementPattern: string;
  ruralPeople: number;
  urbanPeople: number;
  physicalAreaHa: number;
  cultivableAreaHa: number;
  baselineAreaHa: number;
  annualTemperatureC: number | null;
  annualPrecipitationMm: number | null;
  height: number;
  river: boolean;
  forestCover: number | null;
}

export interface FarmlandObservation extends FarmlandFeatures {
  /** Drawing footprint, including fallow; never an inferred training label. */
  cultivationAreaHa: number | null;
  economyCultivatedAreaHa: number | null;
  landUseProvenance: string | null;
  urbanAllocatedAreaHa: number | null;
}

export interface FarmlandSnapshot {
  version: 1;
  seed: string;
  year: number;
  economyEnabled: boolean;
  cells: FarmlandObservation[];
}

const finiteOrNull = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : null);

/** Host-only features: no Economy imports, no writes, no observed farmland in the baseline. */
export function readFarmlandFeatures(world: WorldContext, year: number): FarmlandFeatures[] {
  const inputs = resolveStaticLandUseInputs(world);
  const byCell = new Map(inputs.map(input => [input.id, input]));
  const baseline = planSettlementLandUse(inputs, { seed: world.seed, year, provenance: "estimated" });
  const { cells, burgs } = world.pack;
  const rate = world.populationRate || 1;
  return Array.from(cells.i)
    .filter(id => cells.h[id] >= 20)
    .map(id => {
      const burg = burgs[cells.burg?.[id] ?? 0];
      const urban = burg?.i && !burg.removed ? Math.max(0, burg.population ?? 0) * rate * (world.urbanization ?? 1) : 0;
      const grid = cells.g?.[id] ?? id;
      const rain = finiteOrNull(world.grid.cells.prec?.[grid]);
      return {
        cellId: id,
        burgId: burg?.i && !burg.removed ? burg.i : null,
        biomeKey: world.biomesData.keys?.[cells.biomeCode[id]] ?? `biome:${cells.biomeCode[id]}`,
        historicalPeriod: world.options.historicalPeriod ?? "unknown",
        settlementPattern: world.options.initialSettlementPattern ?? "unknown",
        ruralPeople: Math.max(0, cells.pop?.[id] ?? 0) * rate,
        urbanPeople: urban,
        physicalAreaHa: baseline.cells[id]?.physicalLandAreaHa ?? 0,
        cultivableAreaHa: byCell.get(id)?.cultivableAreaHa ?? 0,
        baselineAreaHa:
          baseline.cells[id]?.patches.filter(p => p.kind === "cultivation").reduce((sum, p) => sum + p.areaHa, 0) ?? 0,
        annualTemperatureC: finiteOrNull(world.grid.cells.temp?.[grid]),
        annualPrecipitationMm: rain === null ? null : precipitationProxyToMillimeters(rain),
        height: cells.h[id],
        river: Boolean(cells.r?.[id]),
        forestCover: finiteOrNull(cells.forestCover?.[id])
      };
    });
}

/** Economy columns are supplied by the adapter; an OFF snapshot cannot become a training label. */
export function collectFarmlandSnapshot(
  world: WorldContext,
  year: number,
  economyEnabled: boolean,
  cultivatedArea?: ArrayLike<number>
): FarmlandSnapshot {
  return {
    version: 1,
    seed: world.seed,
    year,
    economyEnabled,
    cells: readFarmlandFeatures(world, year).map(features => {
      const budget = world.pack.landUse?.cells[features.cellId];
      const observed =
        economyEnabled && budget && world.pack.landUse?.provenance === "authoritative"
          ? budget.patches.filter(p => p.kind === "cultivation").reduce((sum, p) => sum + p.areaHa, 0)
          : null;
      const people = features.ruralPeople + features.urbanPeople;
      return {
        ...features,
        cultivationAreaHa: observed,
        economyCultivatedAreaHa: economyEnabled ? finiteOrNull(cultivatedArea?.[features.cellId]) : null,
        landUseProvenance: budget ? world.pack.landUse!.provenance : null,
        urbanAllocatedAreaHa: observed === null ? null : people > 0 ? (observed * features.urbanPeople) / people : 0
      };
    })
  };
}
