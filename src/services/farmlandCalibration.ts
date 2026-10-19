import type { FarmlandFeatures, FarmlandSnapshot } from "./farmlandObservation";

export interface FarmlandFrame {
  worldId: string;
  date: string;
  snapshot: FarmlandSnapshot;
}

export interface FarmlandModel {
  version: 1;
  target: "land-use-cultivation-ha";
  status: "research";
  trainingWorldIds: string[];
  trainingSeeds: string[];
  groups: {
    key: string;
    cells: number;
    worlds: number;
    ratioP10: number;
    ratioP50: number;
    ratioP90: number;
    populationMin: number;
    populationMax: number;
  }[];
}

export interface FarmlandEstimate {
  source: "calibrated-research" | "static-baseline";
  areaHa: number;
  urbanAllocatedAreaHa: number;
  empiricalRangeHa: [number, number] | null;
  support: { worlds: number; cells: number } | null;
}

export function farmlandPopulationBand(people: number): string {
  return people <= 0 ? "empty" : people < 1000 ? "under-1000" : people < 10_000 ? "1000-9999" : "10000-plus";
}

function groupKey(row: FarmlandFeatures): string {
  return JSON.stringify([
    row.biomeKey,
    row.historicalPeriod,
    row.settlementPattern,
    farmlandPopulationBand(row.ruralPeople + row.urbanPeople)
  ]);
}

export function quantile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * fraction;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i));
}

/** Repeated monthly requests are not independent years: keep the last sample per world/year. */
export function annualFarmlandFrames(frames: readonly FarmlandFrame[]): FarmlandFrame[] {
  const annual = new Map<string, FarmlandFrame>();
  for (const frame of frames) {
    if (frame.snapshot.version !== 1 || !frame.snapshot.economyEnabled) continue;
    const key = JSON.stringify([frame.worldId, frame.snapshot.year]);
    const old = annual.get(key);
    if (!old || old.date.localeCompare(frame.date) <= 0) annual.set(key, frame);
  }
  return [...annual.values()].sort((a, b) => a.worldId.localeCompare(b.worldId) || a.snapshot.year - b.snapshot.year);
}

/** Area is a stock: summarize annual totals, never add hectares across years. */
export function summarizeFarmland(frames: readonly FarmlandFrame[], periodYears = 5) {
  if (!Number.isSafeInteger(periodYears) || periodYears < 1) throw new Error("periodYears must be a positive integer");
  const annual = annualFarmlandFrames(frames);
  const starts = new Map<string, number>();
  const buckets = new Map<string, { worldId: string; startYear: number; frames: FarmlandFrame[] }>();
  for (const frame of annual) {
    if (!starts.has(frame.worldId)) starts.set(frame.worldId, frame.snapshot.year);
    const startYear =
      starts.get(frame.worldId)! +
      Math.floor((frame.snapshot.year - starts.get(frame.worldId)!) / periodYears) * periodYears;
    const key = JSON.stringify([frame.worldId, startYear]);
    if (!buckets.has(key)) buckets.set(key, { worldId: frame.worldId, startYear, frames: [] });
    buckets.get(key)!.frames.push(frame);
  }
  return [...buckets.values()].map(bucket => {
    const totals: number[] = [];
    const urbanTotals: number[] = [];
    const groups = new Map<string, { areas: number[]; baseline: number[]; people: number[]; cells: Set<number> }>();
    let missingCellYears = 0;
    for (const frame of bucket.frames) {
      let missingThisYear = 0;
      let total = 0,
        urban = 0;
      for (const cell of frame.snapshot.cells) {
        if (cell.cultivationAreaHa === null) {
          missingCellYears++;
          missingThisYear++;
          continue;
        }
        total += cell.cultivationAreaHa;
        urban += cell.urbanAllocatedAreaHa ?? 0;
        const key = groupKey(cell);
        if (!groups.has(key)) groups.set(key, { areas: [], baseline: [], people: [], cells: new Set() });
        const group = groups.get(key)!;
        group.areas.push(cell.cultivationAreaHa);
        group.baseline.push(cell.baselineAreaHa);
        group.people.push(cell.ruralPeople + cell.urbanPeople);
        group.cells.add(cell.cellId);
      }
      if (!missingThisYear) {
        totals.push(total);
        urbanTotals.push(urban);
      }
    }
    const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
    return {
      worldId: bucket.worldId,
      startYear: bucket.startYear,
      endYear: bucket.startYear + periodYears - 1,
      observedYears: bucket.frames.map(f => f.snapshot.year),
      complete: bucket.frames.length === periodYears && missingCellYears === 0,
      completeAreaYears: totals.length,
      missingCellYears,
      meanCultivationAreaHa: mean(totals),
      minCultivationAreaHa: totals.length ? Math.min(...totals) : null,
      maxCultivationAreaHa: totals.length ? Math.max(...totals) : null,
      meanUrbanAllocatedAreaHa: mean(urbanTotals),
      groups: [...groups].map(([key, group]) => ({
        key,
        distinctCells: group.cells.size,
        cellYears: group.areas.length,
        meanAreaHa: mean(group.areas),
        meanPeople: mean(group.people),
        areaPerResidentHa: group.people.some(p => p > 0)
          ? group.areas.reduce((s, a) => s + a, 0) / group.people.reduce((s, p) => s + p, 0)
          : null,
        p10AreaHa: quantile(group.areas, 0.1),
        medianAreaHa: quantile(group.areas, 0.5),
        p90AreaHa: quantile(group.areas, 0.9),
        meanBaselineAreaHa: mean(group.baseline)
      }))
    };
  });
}

/** Explicit world split; each cell contributes one mean residual per stratum, regardless of years. */
export function fitFarmlandModel(
  frames: readonly FarmlandFrame[],
  options: { trainingWorldIds: string[]; minimumCells?: number; minimumWorlds?: number }
): FarmlandModel {
  const groups = new Map<string, Map<string, { worldId: string; ratios: number[]; people: number[] }>>();
  for (const frame of annualFarmlandFrames(frames)) {
    if (!options.trainingWorldIds.includes(frame.worldId)) continue;
    for (const cell of frame.snapshot.cells) {
      if (cell.cultivationAreaHa === null || cell.landUseProvenance !== "authoritative" || cell.baselineAreaHa <= 0)
        continue;
      const key = groupKey(cell),
        id = JSON.stringify([frame.snapshot.seed, cell.cellId]);
      if (!groups.has(key)) groups.set(key, new Map());
      const group = groups.get(key)!;
      if (!group.has(id)) group.set(id, { worldId: frame.snapshot.seed, ratios: [], people: [] });
      group.get(id)!.ratios.push(cell.cultivationAreaHa / cell.baselineAreaHa);
      group.get(id)!.people.push(cell.ruralPeople + cell.urbanPeople);
    }
  }
  return {
    version: 1,
    target: "land-use-cultivation-ha",
    status: "research",
    trainingWorldIds: [...new Set(options.trainingWorldIds)].sort(),
    trainingSeeds: [
      ...new Set(frames.filter(f => options.trainingWorldIds.includes(f.worldId)).map(f => f.snapshot.seed))
    ].sort(),
    groups: [...groups].flatMap(([key, cells]) => {
      const values = [...cells.values()];
      const worlds = new Set(values.map(v => v.worldId)).size;
      if (values.length < (options.minimumCells ?? 10) || worlds < (options.minimumWorlds ?? 2)) return [];
      const ratios = values.map(v => v.ratios.reduce((s, n) => s + n, 0) / v.ratios.length);
      const people = values.flatMap(v => v.people);
      return [
        {
          key,
          cells: values.length,
          worlds,
          ratioP10: quantile(ratios, 0.1)!,
          ratioP50: quantile(ratios, 0.5)!,
          ratioP90: quantile(ratios, 0.9)!,
          populationMin: Math.min(...people),
          populationMax: Math.max(...people)
        }
      ];
    })
  };
}

/** Pure inference: works without loading Economy, and never updates a land-use ledger. */
export function estimateFarmland(features: FarmlandFeatures, model?: FarmlandModel): FarmlandEstimate {
  const amounts = [
    features.ruralPeople,
    features.urbanPeople,
    features.baselineAreaHa,
    features.physicalAreaHa,
    features.cultivableAreaHa
  ];
  if (amounts.some(n => !Number.isFinite(n) || n < 0))
    throw new Error("Farmland features need finite non-negative people and areas");
  if (model && (model.version !== 1 || model.target !== "land-use-cultivation-ha"))
    throw new Error("Unsupported farmland model");
  const people = features.ruralPeople + features.urbanPeople;
  const group =
    features.baselineAreaHa > 0
      ? model?.groups.find(g => g.key === groupKey(features) && people >= g.populationMin && people <= g.populationMax)
      : undefined;
  if (group && [group.ratioP10, group.ratioP50, group.ratioP90].some(n => !Number.isFinite(n) || n < 0))
    throw new Error("Invalid farmland model ratios");
  const clamp = (area: number) =>
    Math.min(Math.max(0, features.physicalAreaHa), Math.max(0, features.cultivableAreaHa), Math.max(0, area));
  const areaHa = clamp(features.baselineAreaHa * (group?.ratioP50 ?? 1));
  return {
    source: group ? ("calibrated-research" as const) : ("static-baseline" as const),
    areaHa,
    urbanAllocatedAreaHa: people > 0 ? (areaHa * features.urbanPeople) / people : 0,
    empiricalRangeHa: group
      ? [clamp(features.baselineAreaHa * group.ratioP10), clamp(features.baselineAreaHa * group.ratioP90)]
      : null,
    support: group ? { worlds: group.worlds, cells: group.cells } : null
  };
}

export type FarmlandPeriodSummary = ReturnType<typeof summarizeFarmland>[number];
export type FarmlandEvaluation = ReturnType<typeof evaluateFarmlandModel>;

/** Held-out worlds only; relative error of zero targets is deliberately not computed. */
export function evaluateFarmlandModel(frames: readonly FarmlandFrame[], model: FarmlandModel, worldIds: string[]) {
  if (worldIds.some(id => model.trainingWorldIds.includes(id)))
    throw new Error("Training and validation worlds must be disjoint");
  if (frames.some(f => worldIds.includes(f.worldId) && model.trainingSeeds.includes(f.snapshot.seed)))
    throw new Error("Training and validation seeds must be disjoint");
  const rows = annualFarmlandFrames(frames)
    .filter(f => worldIds.includes(f.worldId))
    .flatMap(f =>
      f.snapshot.cells
        .filter(c => c.cultivationAreaHa !== null)
        .map(c => {
          const estimate = estimateFarmland(c, model);
          return {
            burg: c.burgId !== null,
            urbanShare: c.ruralPeople + c.urbanPeople > 0 ? c.urbanPeople / (c.ruralPeople + c.urbanPeople) : 0,
            observed: c.cultivationAreaHa!,
            predicted: estimate.areaHa,
            baseline: c.baselineAreaHa,
            calibrated: estimate.source === "calibrated-research"
          };
        })
    );
  const error = (key: "predicted" | "baseline", selected = rows, urban = false) => {
    const observed = selected.reduce((s, r) => s + r.observed * (urban ? r.urbanShare : 1), 0);
    const absolute = selected.reduce((s, r) => s + Math.abs(r[key] - r.observed) * (urban ? r.urbanShare : 1), 0);
    return {
      maeHa: selected.length ? absolute / selected.length : null,
      wape: observed > 0 ? absolute / observed : null
    };
  };
  const burgs = rows.filter(r => r.burg);
  return {
    worldIds,
    cellYears: rows.length,
    calibratedCellYears: rows.filter(r => r.calibrated).length,
    baseline: error("baseline"),
    model: error("predicted"),
    burgCells: {
      cellYears: burgs.length,
      calibratedCellYears: burgs.filter(r => r.calibrated).length,
      baseline: error("baseline", burgs),
      model: error("predicted", burgs)
    },
    urbanAllocation: { baseline: error("baseline", burgs, true), model: error("predicted", burgs, true) }
  };
}
