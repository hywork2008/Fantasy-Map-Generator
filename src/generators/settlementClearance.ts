import {
  type CellLandUseBudget,
  LAND_USE_MODEL_VERSION,
  type LandUseProfile,
  type LandUseSnapshot
} from "../types/landUse";
import { addActivities, clearanceLabor, placeLandUses, recoveryYears, supplyCatchments } from "./landUseActivities";
import type { ClearanceCellInput } from "./settlementClearance.types";

export const STAPLE_NEED_KG_PER_PERSON_YEAR = 200;
export const EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK = 0.65;
export const ANNUAL_SOWN_SHARE = 0.67;
export const BASE_NET_YIELD_KG_PER_SOWN_HECTARE = 450;
/** Explicit calibration in real people, independent of population-point settings. */
export const BUILT_DENSITY_PEOPLE_PER_HECTARE = 50;
/** Separate development labour calibration; never reuse days already maintaining crops. */
export const CLEARANCE_LABOUR_DAYS_PER_HECTARE = 140;
/** Annual field work per hectare at BASE_NET_YIELD (Clark c.1300: 27–35 days/ha). */
export const FIELD_LABOUR_DAYS_PER_HECTARE = 30;
/** Days a rural adult (men and women together) gives to the fields in a year. */
export const FIELD_WORK_DAYS_PER_ADULT = 140;
/** Threshing and winnowing share of a cereal's field work, which scales with the crop. */
export const THRESHING_LABOUR_SHARE = 0.25;
/** Typical adult share of a rural cell's residents, for capacity estimates made before cohorts exist. */
export const RURAL_ADULT_SHARE_ESTIMATE = 0.45;

/**
 * Field labour per hectare scales partly with the crop: threshing was paid by the quarter of grain
 * (docs/plan/farm-labour-calibration.md §1.3). FIELD_LABOUR_DAYS_PER_HECTARE is calibrated at
 * BASE_NET_YIELD, so the processing share of the work follows yield ÷ that base.
 */
export function getYieldScaledLabourMultiplier(yieldKgPerHa: number, processingShare: number): number {
  const share = Number.isFinite(processingShare) ? Math.min(1, Math.max(0, processingShare)) : 0;
  if (!(share > 0)) return 1;
  return 1 - share + (share * Math.max(0, yieldKgPerHa)) / BASE_NET_YIELD_KG_PER_SOWN_HECTARE;
}

/**
 * Share (0..1) of a grain diet the residents can grow with their own labour. Low yields need more
 * hectares per person; past the adults' field days the rest of the land cannot be worked, so the
 * fields feed fewer people than the land alone would (docs/plan/farm-labour-calibration.md §7.3).
 */
export function getFieldLabourFeasibility(
  yieldKgPerSownHa: number,
  options: {
    sownShare?: number;
    labourDaysPerHectare?: number;
    processingShare?: number;
    adultShare?: number;
  } = {}
): number {
  if (!(yieldKgPerSownHa > 0)) return 0;
  const sownShare = options.sownShare ?? ANNUAL_SOWN_SHARE;
  const hectaresPerPerson =
    STAPLE_NEED_KG_PER_PERSON_YEAR / (yieldKgPerSownHa * sownShare * EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK);
  const daysPerPerson =
    hectaresPerPerson *
    (options.labourDaysPerHectare ?? FIELD_LABOUR_DAYS_PER_HECTARE) *
    getYieldScaledLabourMultiplier(yieldKgPerSownHa, options.processingShare ?? THRESHING_LABOUR_SHARE);
  const available = (options.adultShare ?? RURAL_ADULT_SHARE_ESTIMATE) * FIELD_WORK_DAYS_PER_ADULT;
  return daysPerPerson > 0 ? Math.min(1, available / daysPerPerson) : 1;
}
const positive = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
export function requiredFieldAreaHectares(people: number, yieldKgPerHa: number, sownShare = ANNUAL_SOWN_SHARE): number {
  if (people <= 0) return 0;
  if (yieldKgPerHa <= 0 || sownShare <= 0) return Infinity;
  return (
    (positive(people) * STAPLE_NEED_KG_PER_PERSON_YEAR) /
    (EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK * yieldKgPerHa * sownShare)
  );
}
export function calculateBuiltAreaHa(people: number, profile: LandUseProfile = "mixed_farming"): number {
  return positive(people) / (profile === "embedded" ? 200 : BUILT_DENSITY_PEOPLE_PER_HECTARE);
}
export function resolveLandUseProfile(input: {
  explicit?: LandUseProfile;
  cultural?: LandUseProfile;
  raceKey?: string;
  fantasy?: boolean;
}): LandUseProfile {
  return (
    input.explicit ??
    input.cultural ??
    (input.fantasy && (input.raceKey === "elf" || input.raceKey === "dark_elf") ? "embedded" : "mixed_farming")
  );
}

/** Global, stable allocation. All requests share capacity proportionally rather than first-come reservation. */
export function planSettlementLandUse(
  inputs: readonly ClearanceCellInput[],
  options: {
    seed: string;
    year: number;
    provenance?: LandUseSnapshot["provenance"];
    previous?: LandUseSnapshot;
    annual?: boolean;
  }
): LandUseSnapshot {
  const ordered = [...inputs].sort((a, b) => a.id - b.id);
  const inputById = new Map(ordered.map(i => [i.id, i]));
  const cells: Record<number, CellLandUseBudget> = {};
  const requests = new Map<number, { required: number; remaining: number; candidates: number[] }>();
  const capacity = new Map<number, number>();
  const catchments = supplyCatchments(ordered);
  const referenceProductivity = new Map<number, number>();
  for (const input of ordered) {
    const area = positive(input.physicalLandAreaHa);
    const built = Math.min(area, calculateBuiltAreaHa(input.urbanPeople, input.profile));
    const people =
      positive(input.ruralPeople) + (input.includeUrbanFoodDemand === false ? 0 : positive(input.urbanPeople));
    const localPeople = Math.max(0, people - positive(input.importedStaplePeople ?? 0));
    const unresolvedEmbedded = input.profile === "embedded" && input.localStapleShare === undefined && localPeople > 0;
    const reachable = input.access
      ? (catchments.get(input.id) ?? []).map(c => c.id)
      : [input.id, ...(input.neighbors ?? [])];
    const remoteSupply = reachable.some(id => id !== input.id && (inputById.get(id)?.yieldKgPerSownHa ?? 0) > 0);
    const referenceYield =
      input.yieldKgPerSownHa > 0 ? input.yieldKgPerSownHa : remoteSupply ? BASE_NET_YIELD_KG_PER_SOWN_HECTARE : 0;
    const referenceSown =
      (input.annualSownShare ?? ANNUAL_SOWN_SHARE) > 0
        ? (input.annualSownShare ?? ANNUAL_SOWN_SHARE)
        : remoteSupply
          ? ANNUAL_SOWN_SHARE
          : 0;
    referenceProductivity.set(input.id, referenceYield * referenceSown);
    const required = requiredFieldAreaHectares(
      localPeople * (input.localStapleShare ?? 1),
      unresolvedEmbedded ? 0 : referenceYield,
      referenceSown
    );
    // An unavailable crop keeps demand visible without non-finite archive values.
    const impossible = !Number.isFinite(required);
    const target = impossible
      ? 0
      : Math.max(required * (input.subsistenceReserve ?? 1.1), positive(input.laborAffordableAreaHa ?? 0));
    const previous = options.previous?.cells[input.id];
    const previousFields =
      previous?.patches.filter(p => p.kind === "cultivation").reduce((s, p) => s + p.areaHa, 0) ?? 0;
    const limit = Math.min(
      Math.max(0, area - built),
      positive(input.cultivableAreaHa),
      options.annual
        ? previousFields + (previous?.lastUpdatedYear === options.year ? 0 : positive(clearanceLabor(input, previous)))
        : Infinity
    );
    capacity.set(input.id, input.yieldKgPerSownHa > 0 && input.tenure !== "protected" ? limit : 0);
    const diagnostics = [...(input.diagnostics ?? []), "estimated-spatial-forest-intersection"];
    if (input.profile === "port" && input.importedStaplePeople === undefined)
      diagnostics.push("port-import-supply-unresolved");
    if (remoteSupply && input.yieldKgPerSownHa <= 0) diagnostics.push("remote-supply-reference-hectares");
    if (impossible) diagnostics.push("staple-production-unavailable");
    if (input.profile === "embedded" && !input.importedStaplePeople)
      diagnostics.push("embedded-food-supply-unresolved");
    cells[input.id] = {
      sourceCellId: input.id,
      lastUpdatedYear: options.year,
      physicalLandAreaHa: area,
      ruralPeople: positive(input.ruralPeople),
      foodDemandPeople: people,
      unresolvedFoodPeople: impossible ? localPeople : 0,
      requiredAreaHa: impossible ? 0 : required,
      policyTargetAreaHa: target,
      allocatedAreaHa: 0,
      unallocatedAreaHa: impossible ? 0 : required,
      maintenanceShortfallHa: 0,
      convertedForestAreaHa: 0,
      transportAllocations: [],
      clearanceLaborDays: input.workforce
        ? clearanceLabor(input, previous) * input.workforce.clearanceDaysPerHa
        : undefined,
      patches:
        built > 0
          ? [
              {
                id: `land:${input.id}:built`,
                sourceCellId: input.id,
                kind: "built",
                areaHa: built,
                anchor: input.anchor,
                supplierIds: [],
                stage: "maintained",
                convertedForestAreaHa: 0
              }
            ]
          : [],
      diagnostics
    };
    requests.set(input.id, {
      required: impossible ? 0 : required,
      remaining: target,
      candidates: input.access
        ? (catchments.get(input.id) ?? []).map(c => c.id)
        : [input.id, ...[...new Set(input.neighbors ?? [])].filter(id => id !== input.id).sort((a, b) => a - b)]
    });
  }
  // Prefer local supply, then adjacent accessible cells supplied by the host graph.
  for (let round = 0; round < Math.max(1, ...ordered.map(i => requests.get(i.id)!.candidates.length)); round++) {
    const offers = new Map<number, Array<{ id: number; area: number; conversion: number }>>();
    for (const [id, request] of requests) {
      const dest = request.candidates[round];
      if (request.remaining <= 0 || !(capacity.get(dest) ?? 0)) continue;
      const list = offers.get(dest) ?? [];
      const source = inputById.get(id)!;
      const destination = inputById.get(dest)!;
      if (
        destination.tenure === "private" &&
        (destination.ownerId === undefined || destination.ownerId !== source.ownerId)
      )
        continue;
      const conversion =
        referenceProductivity.get(id)! /
        (destination.yieldKgPerSownHa * (destination.annualSownShare ?? ANNUAL_SOWN_SHARE));
      if (!(conversion > 0) || !Number.isFinite(conversion)) continue;
      list.push({ id, area: request.remaining * conversion, conversion });
      offers.set(dest, list);
    }
    for (const [dest, list] of offers) {
      const available = capacity.get(dest)!;
      const total = list.reduce((s, r) => s + r.area, 0);
      const allocated = Math.min(available, total);
      const cell = cells[dest];
      const input = inputById.get(dest)!;
      for (const offer of list)
        requests.get(offer.id)!.remaining -= (allocated * offer.area) / total / offer.conversion;
      cell.allocatedAreaHa += allocated;
      for (const offer of list)
        cell.transportAllocations!.push({
          demandCellId: offer.id,
          areaHa: (allocated * offer.area) / total,
          transportCost: catchments.get(offer.id)?.find(c => c.id === dest)?.cost ?? 0
        });
      const patch = cell.patches.find(p => p.kind === "cultivation");
      if (patch) {
        patch.areaHa += allocated;
        patch.supplierIds.push(...list.map(r => `cell:${r.id}`));
      } else
        cell.patches.push({
          id: `land:${dest}:cultivation`,
          sourceCellId: dest,
          kind: "cultivation",
          areaHa: allocated,
          anchor: input.anchor,
          supplierIds: list.map(r => `cell:${r.id}`),
          stage: "maintained",
          convertedForestAreaHa: 0
        });
      capacity.set(dest, available - allocated);
    }
  }
  for (const input of ordered) {
    const cell = cells[input.id];
    const request = requests.get(input.id)!;
    cell.unallocatedAreaHa = Math.max(0, request.required - (cell.policyTargetAreaHa - request.remaining));
    if (cell.unallocatedAreaHa > 0) cell.diagnostics.push("land-or-development-capacity");
    cell.maintenanceShortfallHa = Math.max(
      0,
      cell.allocatedAreaHa - positive(input.laborAffordableAreaHa ?? cell.allocatedAreaHa)
    );
    const previous = options.previous?.cells[input.id];
    // Retain abandoned uses; annual regrowth stages do not erase history immediately.
    if (options.annual && previous) {
      const oldFields = previous.patches
        .filter(p => p.kind === "cultivation" || p.kind === "abandoned")
        .reduce((s, p) => s + p.areaHa, 0);
      const oldAbandoned = previous.patches.filter(p => p.kind === "abandoned").reduce((s, p) => s + p.areaHa, 0);
      const recovered =
        oldAbandoned *
        Math.min(
          1,
          Math.max(0, options.year - (previous.lastUpdatedYear ?? options.previous?.year ?? options.year)) /
            recoveryYears(input.temperature, input.precipitation)
        );
      const abandoned = Math.min(
        Math.max(0, cell.physicalLandAreaHa - cell.patches.reduce((s, p) => s + p.areaHa, 0)),
        Math.max(0, oldFields - cell.allocatedAreaHa - recovered)
      );
      if (abandoned > 0)
        cell.patches.push({
          id: `land:${input.id}:abandoned`,
          sourceCellId: input.id,
          kind: "abandoned",
          areaHa: abandoned,
          anchor: input.anchor,
          supplierIds: [],
          stage: "regenerating",
          convertedForestAreaHa: 0,
          abandonedYear: previous.patches.find(p => p.kind === "abandoned")?.abandonedYear ?? options.year,
          recoveryYears: recoveryYears(input.temperature, input.precipitation)
        });
    }
    addActivities(input, cell, options.year, previous);
    const forest = cell.physicalLandAreaHa * Math.min(1, positive(input.forestCover));
    let nonforest = cell.physicalLandAreaHa - forest;
    for (const patch of cell.patches) {
      const open = Math.min(nonforest, patch.areaHa);
      nonforest -= open;
      patch.convertedForestAreaHa = (patch.areaHa - open) * (1 - (patch.canopyRetention ?? 0));
      cell.convertedForestAreaHa += patch.convertedForestAreaHa;
    }
    const remainingLand = Math.max(0, cell.physicalLandAreaHa - cell.patches.reduce((s, p) => s + p.areaHa, 0));
    const remainingForest = Math.min(
      remainingLand,
      Math.max(0, forest - (cell.physicalLandAreaHa - remainingLand - (cell.physicalLandAreaHa - forest - nonforest)))
    );
    for (const [kind, areaHa] of [
      ["natural_forest", remainingForest],
      ["other_natural", Math.max(0, remainingLand - remainingForest)]
    ] as const) {
      if (areaHa >= 0)
        cell.patches.push({
          id: `land:${input.id}:${kind}`,
          sourceCellId: input.id,
          kind,
          areaHa,
          anchor: input.anchor,
          supplierIds: [],
          stage: "maintained",
          convertedForestAreaHa: 0
        });
    }
    placeLandUses(input, cell, options.seed);
    if (previous && cell.geometryHaPerUnit && !previous.geometryHaPerUnit)
      cell.diagnostics.push("legacy-geometry-baseline-preserved");
    for (const p of cell.patches) p.supplierIds = [...new Set(p.supplierIds)].sort();
  }
  return {
    modelVersion: LAND_USE_MODEL_VERSION,
    revision: (options.previous?.revision ?? 0) + 1,
    year: options.year,
    seed: options.seed,
    provenance: options.provenance ?? "estimated",
    cells
  };
}

export type { ClearanceCellInput } from "./settlementClearance.types";
