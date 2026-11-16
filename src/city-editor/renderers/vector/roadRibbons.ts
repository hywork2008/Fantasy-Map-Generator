import {
  classifyRoadSurface,
  type RoadPlace,
  type RoadRibbon,
  roadMeans,
  roadSphere
} from "../../../utils/roadSurface";
import { clipPolylineToExterior, clipPolylineToInterior } from "../../generators/concealStreets";
import { unpackLine } from "../../generators/vector/fabric/pack";
import { pathIsClosed } from "../../generators/vector/geometry/curves";
import { samplePath } from "../../generators/vector/geometry/sampling";
import { allVectorWater } from "../../generators/vector/geometry/water";
import { dryRuns } from "../../generators/waterGeometry";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";

const WETLAND = new Set(["wetland", "mangrove", "borealPeatland", "floodedForest"]),
  UPLAND = new Set(["montaneForest", "alpineTundra", "cloudForest"]),
  DRY = new Set(["hotDesert", "coldDesert"]);

/**
 * Wearing-course ribbons of a meshless city for the mesh editor's road meshes, with surfaces chosen by the same
 * rules (`classifyRoadSurface`): main roads are highways outside the town wall and arterials inside, district
 * streets and lanes are streets. Parts over water are left to the bridges.
 */
export function vectorRoadRibbons(
  doc: VectorCityDocument,
  /** Owners drawn in the current stage: road path ids, or `<record>~s` / `<record>~l` for fabric lines. */
  include: (id: string) => boolean = () => true
): {
  ribbons: RoadRibbon[];
  water: { polygons: Point[][]; ribbons: [] };
} {
  const descriptor = doc.site?.descriptor,
    period = doc.context.historicalPeriod,
    civilization = descriptor?.civilization,
    tags = new Set(descriptor?.biome?.tags ?? []),
    key = descriptor?.biome?.key,
    economy = descriptor?.economy,
    query = {
      period,
      sphere: roadSphere(
        civilization?.tradition ?? null,
        civilization?.fortification ?? null,
        civilization?.faith ?? null,
        period
      ),
      means: roadMeans({
        population: doc.context.targetPopulation,
        commerceRank: economy && Number.isFinite(economy.commerce.rank) ? economy.commerce.rank : null,
        capital: descriptor?.burg.capital === true,
        marketCenter: economy?.commerce.marketCenter === true
      }),
      wetland: tags.has("wetland") || (key !== undefined && WETLAND.has(key)),
      upland: tags.has("mountain") || tags.has("snow") || (key !== undefined && UPLAND.has(key)),
      dry: tags.has("desert") || (key !== undefined && DRY.has(key)),
      stoneRoads: "unknown" as const
    };
  const water = allVectorWater(doc).map(p => p.outer),
    hidden = new Set(doc.environment?.hidden ?? []),
    owned = new Set(doc.urban?.ownedPaths ?? []),
    wall = Object.values(doc.connections.circuits)
      .filter(c => !c.parentCircuitId)
      .map(c => doc.paths[c.pathId])
      .find(p => p && pathIsClosed(p)),
    wallRing = wall ? samplePath(wall).map(s => s.point) : null,
    ribbons: RoadRibbon[] = [];
  const emit = (line: Point[], widthMeters: number, place: RoadPlace, lane: boolean) => {
    if (!(widthMeters > 0) || line.length < 2) return;
    for (const run of dryRuns(line, water))
      if (run.length >= 2)
        ribbons.push({
          centerline: run.map(p => [p[0], p[1]] as const),
          widthMeters,
          gradeClass: lane ? "lane" : "cart",
          surface: classifyRoadSurface({ ...query, place, group: "local" }).id
        });
  };
  for (const path of Object.values(doc.paths)) {
    if (path.role !== "road" || hidden.has(path.id) || !include(path.id)) continue;
    const line = samplePath(path).map(s => s.point),
      width = path.width.leftMeters + path.width.rightMeters;
    if (owned.has(path.id)) emit(line, width, "street", true);
    else if (wallRing) {
      for (const part of clipPolylineToExterior(line, wallRing)) emit(part, width, "highway", false);
      for (const part of clipPolylineToInterior(line, wallRing)) emit(part, width, "arterial", false);
    } else emit(line, width, "arterial", false);
  }
  for (const district of Object.values(doc.fabric?.districts ?? {}).filter(d => include(`${d.id}~s`)))
    for (let i = 0; i < district.streets.widths.length; i++)
      if (!district.detachedLines?.some(l => l.index === i))
        emit(unpackLine(district.streets, i, district.origin), district.streets.widths[i], "street", false);
  for (const cell of Object.values(doc.fabric?.cells ?? {}).filter(c => include(`${c.id}~l`)))
    for (let i = 0; i < cell.lanes.widths.length; i++)
      if (!cell.detachedLines?.some(l => l.index === i))
        emit(unpackLine(cell.lanes, i, cell.origin), cell.lanes.widths[i], "street", true);
  return { ribbons, water: { polygons: water, ribbons: [] } };
}
