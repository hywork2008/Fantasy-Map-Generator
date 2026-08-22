import type { PackedGraph } from "../../hostTypes";

type RiverBasinCells = Pick<PackedGraph["cells"], "f" | "h" | "r">;
type RiverBasinRiverMeta = Pick<PackedGraph["rivers"][number], "i"> &
  Partial<Pick<PackedGraph["rivers"][number], "mouth">>;
type RiverBasinFeature = Pick<PackedGraph["features"][number], "i" | "type" | "closed">;

/**
 * Rivers whose mouth does not reach the open sea — elevated inland/desert terminus, a closed
 * (endorheic) lake, or a non-ocean feature (docs/plan/modern-urban-water-treatment-and-
 * governance.md §2.2's `closedBasin`). Shared by urbanSewerage.ts's Giant-legacy sewer routing and
 * urbanWaterClimate.ts's per-burg `basinKind` classification — kept in its own module so neither of
 * those needs to import the other (they'd otherwise form a cycle through urbanWaterTypes.ts, whose
 * `UrbanWaterSystem` type urbanSewerage.ts consumes and whose `RiverBasinKind` urbanWaterClimate.ts
 * supplies).
 */
export function getClosedRiverIds(
  cells: RiverBasinCells,
  rivers?: readonly RiverBasinRiverMeta[],
  features?: readonly RiverBasinFeature[]
): Set<number> {
  const featureById = new Map(features?.map(feature => [feature.i, feature]));
  const closed = new Set<number>();
  for (const river of rivers ?? []) {
    if (!Number.isInteger(river.mouth) || river.mouth! < 0 || river.mouth! >= cells.r.length) continue;
    const mouth = river.mouth!;
    const feature = featureById.get(cells.f?.[mouth] ?? -1);
    if ((cells.h[mouth] ?? 0) >= 20 || (feature && (feature.type !== "ocean" || feature.closed))) closed.add(river.i);
  }
  return closed;
}
