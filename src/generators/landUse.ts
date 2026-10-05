import type { WorldContext } from "../context/worldContext";
import { landCoverCode } from "../types/biomeAttributes";
import { assertValidLandUseSnapshot, type LandUseSnapshot } from "../types/landUse";
import { harvestForestStock } from "./forestStock";
import { newlyConvertedForest } from "./landUseActivities";
import { polygonArea } from "./landUseGeometry";
import {
  BASE_NET_YIELD_KG_PER_SOWN_HECTARE,
  CLEARANCE_LABOUR_DAYS_PER_HECTARE,
  type ClearanceCellInput,
  planSettlementLandUse,
  resolveLandUseProfile
} from "./settlementClearance";

const initialLandUseWorlds = new WeakSet<WorldContext>();
export function beginInitialLandUse(world: WorldContext): void {
  initialLandUseWorlds.add(world);
}
export function isInitialLandUsePending(world: WorldContext): boolean {
  return initialLandUseWorlds.has(world);
}

/** Pure legacy/OFF adapter. No mutation, no saturation multiplier, no technology applied twice. */
export function resolveStaticLandUseInputs(world: Readonly<WorldContext>): ClearanceCellInput[] {
  const { cells } = world.pack;
  const inputs: ClearanceCellInput[] = [];
  for (const id of cells.i) {
    if (cells.h[id] < 20) continue;
    const area = Math.max(0, cells.area?.[id] ?? 0) * (world.distanceScale || 1) ** 2 * 100;
    const tags = world.biomesData.tags?.[cells.biomeCode[id]] ?? [];
    const burg = world.pack.burgs?.[cells.burg?.[id] ?? 0];
    const urbanPeople =
      burg && !burg.removed
        ? Math.max(0, burg.population ?? 0) * (world.populationRate || 1) * (world.urbanization ?? 1)
        : 0;
    const culture = world.pack.cultures?.[cells.culture?.[id] ?? 0];
    const gridId = cells.g?.[id] ?? id;
    const temp = world.grid?.cells?.temp?.[gridId] ?? 12;
    const rain = world.grid?.cells?.prec?.[gridId] ?? 45;
    const suitable =
      temp > 0 &&
      rain >= 8 &&
      !tags.includes("wetland") &&
      (world.biomesData.habitability?.[cells.biomeCode[id]] ?? 0) > 0;
    const terrain = cells.h[id] <= 50 ? 0.9 : Math.max(0.2, 0.9 - (cells.h[id] - 50) / 90);
    const settings = burg?.landUseSettings ?? culture?.landUseSettings;
    inputs.push({
      ...settings,
      polygon: cells.v?.[id]?.map(v => world.pack.vertices?.p?.[v]).filter((p): p is [number, number] => !!p),
      temperature: temp,
      precipitation: rain,
      ownerId: settings?.ownerId ?? cells.state?.[id],
      maxTransportCost: settings?.maxTransportCost ?? (urbanPeople > 0 ? 100 : 10),
      access:
        settings?.access ??
        (cells.c?.[id] ?? [])
          .filter(n => cells.h[n] >= 20 && cells.p?.[n] && cells.p?.[id])
          .map(n => ({
            cellId: n,
            allowed: cells.state?.[n] === cells.state?.[id],
            cost:
              Math.hypot(cells.p[n][0] - cells.p[id][0], cells.p[n][1] - cells.p[id][1]) *
              (world.distanceScale || 1) *
              (cells.routes?.[id]?.[n] ? 0.3 : cells.r?.[id] || cells.r?.[n] ? 3 : 1) *
              (1 + Math.max(0, cells.h[n] - 50) / 50)
          })),
      workforce: {
        adultPeople: ((cells.maleAdults?.[id] ?? 0) + (cells.femaleAdults?.[id] ?? 0)) * (world.populationRate || 1),
        workableDays: 140,
        maintenanceDaysPerHa: 34.5,
        otherOccupationDays: settings?.otherOccupationDays ?? 0,
        clearanceShare: settings?.clearanceShare ?? 0.1,
        clearanceDaysPerHa: CLEARANCE_LABOUR_DAYS_PER_HECTARE
      },
      livestock:
        settings?.grazingAreaHa !== undefined
          ? {
              grazingAreaHa: settings.grazingAreaHa,
              hayAreaHa: settings.hayAreaHa,
              woodPastureHa: settings.woodPastureHa,
              grazedFallowHa: settings.grazedFallowHa,
              fodderWithinFieldsHa: settings.fodderWithinFieldsHa
            }
          : undefined,
      id,
      anchor: burg && Number.isFinite(burg.x) && Number.isFinite(burg.y) ? [burg.x, burg.y] : (cells.p?.[id] ?? [0, 0]),
      physicalLandAreaHa: area,
      forestCover: cells.forestCover?.[id] ?? (tags.includes("forest") ? 0.7 : 0),
      ruralPeople: Math.max(0, cells.pop?.[id] ?? 0) * (world.populationRate || 1),
      urbanPeople,
      profile: resolveLandUseProfile({
        explicit: burg?.landUseProfile,
        cultural: culture?.landUseProfile,
        raceKey: culture?.raceKey,
        fantasy: usesFantasyForestDefaults(world)
      }),
      cultivableAreaHa: suitable ? area * terrain * (tags.includes("desert") ? 0.2 : 0.8) : 0,
      yieldKgPerSownHa: suitable
        ? BASE_NET_YIELD_KG_PER_SOWN_HECTARE * Math.min(1, Math.max(0.15, temp / 7)) * Math.min(1, rain / 45)
        : 0,
      neighbors: cells.c?.[id]?.filter(n => cells.state?.[n] === cells.state?.[id]),
      diagnostics: [
        "estimated-soil-and-livelihood",
        ...(settings?.tenure ? [] : ["land-tenure-unresolved"]),
        "estimated-clearance-workforce-share",
        ...(world.grid?.cells?.prec?.[gridId] === undefined ? ["estimated-precipitation"] : [])
      ]
    });
  }
  return inputs;
}
export function estimateWorldLandUse(world: Readonly<WorldContext>, year = 0): LandUseSnapshot {
  return planSettlementLandUse(resolveStaticLandUseInputs(world), {
    seed: world.seed ?? "legacy",
    year,
    provenance: "estimated"
  });
}
/** Sole host writer. Revisions remove only newly converted forest; historical timber is never sold. */
export function commitLandUsePlan(
  world: WorldContext,
  plan: LandUseSnapshot,
  options: { preserveStock?: boolean; annual?: boolean } = {}
): boolean {
  assertValidLandUseSnapshot(plan, world.pack.cells.i.length);
  const previous = world.pack.landUse;
  if (previous && plan.revision <= previous.revision) return false;
  plan.conversionTimber = previous?.conversionTimber?.map(r => ({ ...r })) ?? [];
  let changed = false;
  for (const budget of Object.values(plan.cells)) {
    const dominant = [...budget.patches].sort((a, b) => b.areaHa - a.areaHa || a.id.localeCompare(b.id))[0]?.kind;
    const cover =
      dominant === "built"
        ? "settlement"
        : dominant === "cultivation"
          ? "cropland"
          : dominant === "pasture"
            ? "pasture"
            : dominant === "managed_forest"
              ? "managedForest"
              : dominant === "natural_forest"
                ? "naturalForest"
                : "none";
    if (world.pack.cells.landCover) world.pack.cells.landCover[budget.sourceCellId] = landCoverCode(cover);
    const additional = newlyConvertedForest(budget, previous?.cells[budget.sourceCellId]);
    if (budget.physicalLandAreaHa > 0 && !options.preserveStock) {
      const harvested = harvestForestStock(
        world.pack.cells,
        budget.sourceCellId,
        additional * forestCoveragePerHectare(budget)
      );
      changed = harvested > 0 || changed;
      if (previous && (options.annual || plan.year > previous.year) && harvested > 0)
        plan.conversionTimber.push({
          id: `clearance:${plan.revision}:${budget.sourceCellId}`,
          sourceCellId: budget.sourceCellId,
          year: plan.year,
          coverage: harvested,
          deliveredCoverage: 0
        });
    }
  }
  world.pack.landUse = plan;
  return changed;
}
export function initializeSettlementLandUse(world: WorldContext, year: number): void {
  if (!world.pack.landUse) commitLandUsePlan(world, estimateWorldLandUse(world, year));
  initialLandUseWorlds.delete(world);
}
/** Only planned forest intersections block timber recovery. */
export function getMaintainedForestConversion(snapshot: LandUseSnapshot | undefined, id: number): number | undefined {
  const budget = snapshot?.cells[id];
  if (!budget) return undefined;
  const area = budget.patches.reduce(
    (s, p) =>
      s +
      (p.kind !== "natural_forest" &&
      p.kind !== "other_natural" &&
      p.kind !== "managed_forest" &&
      p.kind !== "abandoned"
        ? p.convertedForestAreaHa
        : 0),
    0
  );
  return area * forestCoveragePerHectare(budget);
}

/** Frontier transactions request local, labour-limited updates through the same host writer. */
export function requestFrontierLandUse(world: WorldContext, cellIds: readonly number[], year: number): void {
  const previous = world.pack.landUse;
  if (!previous || !cellIds.length) return;
  const requested = new Set(cellIds);
  const inputs = resolveStaticLandUseInputs(world)
    .filter(i => requested.has(i.id))
    .map(i => ({
      ...i,
      neighbors: [],
      newClearanceAreaHa: Math.min(
        i.physicalLandAreaHa * 0.02,
        Math.max(
          0,
          ((world.pack.cells.maleAdults?.[i.id] ?? 0) + (world.pack.cells.femaleAdults?.[i.id] ?? 0)) *
            (world.populationRate || 1) *
            140 -
            (previous.cells[i.id]?.allocatedAreaHa ?? 0) * 30 * 1.15
        ) / CLEARANCE_LABOUR_DAYS_PER_HECTARE
      ),
      diagnostics: [...(i.diagnostics ?? []), "estimated-frontier-clearance-labour"]
    }));
  const update = planSettlementLandUse(inputs, {
    seed: previous.seed,
    year,
    previous,
    annual: true,
    provenance: previous.provenance
  });
  update.cells = { ...previous.cells, ...update.cells };
  update.needsAnnualReconciliation = true;
  commitLandUsePlan(world, update, { annual: true });
}

/** Legacy worlds with no culture-set metadata retain their explicit fantasy race defaults. */
export function usesFantasyForestDefaults(world: Readonly<WorldContext>): boolean {
  const set = world.options?.culturesSet;
  return !set || set === "highFantasy" || set === "darkFantasy";
}

/** Writer-owned receipt acknowledgement; the consumer supplies the amount actually accepted. */
export function deliverConversionTimber(
  world: WorldContext,
  deliver: (cellId: number, coverage: number) => number
): void {
  for (const receipt of world.pack.landUse?.conversionTimber ?? []) {
    const pending = Math.max(0, receipt.coverage - receipt.deliveredCoverage);
    if (!pending) continue;
    const accepted = deliver(receipt.sourceCellId, pending);
    if (Number.isFinite(accepted)) receipt.deliveredCoverage += Math.max(0, Math.min(pending, accepted));
  }
}
export function recordManagedHarvest(world: WorldContext, cellId: number, year: number, coverage: number): void {
  const cell = world.pack.landUse?.cells[cellId];
  if (!cell || coverage <= 0) return;
  let remaining = coverage;
  for (const patch of cell.patches) {
    const m = patch.management;
    if (patch.kind !== "managed_forest" || !m) continue;
    if (m.harvestYear !== year) {
      m.harvestYear = year;
      m.harvestedCoverage = 0;
    }
    const taken = Math.min(
      remaining,
      Math.max(0, patch.areaHa / cell.physicalLandAreaHa / m.rotationYears - m.harvestedCoverage)
    );
    m.harvestedCoverage += taken;
    remaining -= taken;
    if (taken > 0) m.lastHarvestYear = year;
  }
}

/** Capacity is standing-timber coverage, not the area of the primary forest domain. */
function forestCoveragePerHectare(budget: import("../types/landUse").CellLandUseBudget): number {
  if (budget.forestPolygons && budget.geometryHaPerUnit) {
    const area = budget.forestPolygons.reduce((s, p) => s + polygonArea(p) * budget.geometryHaPerUnit!, 0);
    return area > 0 ? (budget.forestCapacityCoverage ?? 0) / area : 0;
  }
  return budget.physicalLandAreaHa > 0 ? 1 / budget.physicalLandAreaHa : 0;
}
