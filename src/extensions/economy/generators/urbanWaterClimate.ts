import type { WorldContext } from "../../../context/worldContext";
import { getSeasonalTemperatureOffset } from "../../../utils/seasonUtils";
import type { Burg } from "../../hostTypes";
import { getClosedRiverIds } from "./urbanSewerage";

/** A winter freeze with a short warm season; exposed treatment must be stored or seasonal. */
export const SEASONAL_COLD_WINTER_C = -15;
export const SEASONAL_COLD_SUMMER_C = 10;

/**
 * True where the local seasonal range has the cold-winter / usable-summer pattern used by
 * covered Giant sewer storage. Missing map-coordinate data fails open for legacy fixtures.
 */
export function isSeasonalColdBurg(world: WorldContext, burg: Burg): boolean {
  // Previously called only for Giant burgs, whose test/generation fixtures always populate
  // `pack.cells`. Generalized 2026-08-23 (docs/plan/modern-urban-water-treatment-and-governance.md
  // §2.2) to every burg's `thermalRegime`, which exposed lighter-weight fixtures that never set
  // `pack` at all — hence the fully optional-chained reads below, matching this function's own
  // "fails open for legacy fixtures" contract.
  const gridCell = world.pack?.cells?.g?.[burg.cell] ?? burg.cell;
  const annualTemperature = world.grid?.cells?.temp?.[gridCell];
  const point = world.pack?.cells?.p?.[burg.cell];
  const { latN, latT } = world.mapCoordinates ?? {};
  if (
    !Number.isFinite(annualTemperature) ||
    !point ||
    !Number.isFinite(latN) ||
    !Number.isFinite(latT) ||
    !world.graphHeight
  ) {
    return false;
  }

  const latitude = latN! - (point[1] / world.graphHeight) * latT!;
  const climate = {
    temperatureEquator: world.options?.temperatureEquator,
    temperatureNorthPole: world.options?.temperatureNorthPole,
    temperatureSouthPole: world.options?.temperatureSouthPole
  };
  const january =
    annualTemperature! + getSeasonalTemperatureOffset(latitude, 1, 1, 15, climate, world.options?.axialTilt);
  const july = annualTemperature! + getSeasonalTemperatureOffset(latitude, 1, 7, 15, climate, world.options?.axialTilt);
  return Math.min(january, july) <= SEASONAL_COLD_WINTER_C && Math.max(january, july) >= SEASONAL_COLD_SUMMER_C;
}

export function getSeasonalColdBurgIds(
  world: WorldContext,
  burgs: readonly (Burg | undefined)[],
  burgIds: Iterable<number>
): Set<number> {
  const result = new Set<number>();
  for (const burgId of burgIds) {
    const burg = burgs[burgId];
    if (burg?.i && isSeasonalColdBurg(world, burg)) result.add(burgId);
  }
  return result;
}

/**
 * A river reaching the open sea (`openBasin`) vs. terminating inland or into a closed lake
 * (`closedBasin`) — docs/plan/modern-urban-water-treatment-and-governance.md §2.2. A burg with no
 * river at all defaults to `openBasin` (the permissive case): nothing that reads this treats a
 * closed river as a valid outfall, so a riverless burg's outfall eligibility already comes
 * entirely from its own coastal access, independent of this field.
 */
export type RiverBasinKind = "openBasin" | "closedBasin";

/** Where a burg's wastewater can legitimately go once treated — §2.2/§6 of the doc above. */
export type WaterEffluentDestination = "riverOutfall" | "coastalOutfall" | "sealedStorageAndInfiltration";

/**
 * Classifies the river running through `cellId`, if any. Generalizes urbanSewerage.ts's
 * `getClosedRiverIds` (originally private to the Giant-legacy inherited-sewer route, and gated to
 * seasonal-cold burgs there before 2026-08-23) so every burg — not just Giant/seasonal-cold ones —
 * can tell whether its river is a legitimate downstream outfall. Called unconditionally (unlike
 * the old Roman-legacy helpers, which short-circuit away when a burg has no inherited waterworks
 * to check), so — like `isSeasonalColdBurg` — missing map data fails open to `openBasin` for
 * legacy/test fixtures rather than throwing.
 */
export function resolveBurgBasinKind(args: {
  cellId: number;
  cells: Parameters<typeof getClosedRiverIds>[0] | undefined;
  rivers?: Parameters<typeof getClosedRiverIds>[1];
  features?: Parameters<typeof getClosedRiverIds>[2];
}): RiverBasinKind {
  const riverId = args.cells?.r?.[args.cellId] ?? 0;
  if (!riverId || !args.cells) return "openBasin";
  return getClosedRiverIds(args.cells, args.rivers, args.features).has(riverId) ? "closedBasin" : "openBasin";
}

/**
 * Where treated (or, pre-treatment, raw) wastewater actually goes: the open river (only once it
 * is confirmed to reach the sea), the coast directly, or nowhere a river/sea can carry it —
 * `sealedStorageAndInfiltration`, meaning it must be stored, infiltrated, or reused on-site
 * instead. This module only classifies the destination; the storage/infiltration capacity economy
 * itself (`winterStorageFill`, `seasonalInfiltrationCapacity` in the doc's §6) is later work.
 */
export function resolveBurgEffluentDestination(args: {
  hasRiver: boolean;
  isCoastal: boolean;
  basinKind: RiverBasinKind;
}): WaterEffluentDestination {
  if (args.hasRiver && args.basinKind === "openBasin") return "riverOutfall";
  if (args.isCoastal) return "coastalOutfall";
  return "sealedStorageAndInfiltration";
}
