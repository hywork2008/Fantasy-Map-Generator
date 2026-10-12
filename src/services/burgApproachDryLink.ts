import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { checkDryLandSegment } from "./dryLandCorridor";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import type { PhysicalWaterPolygon } from "./riverPhysicalGeometry";
import type { SettlementGeometrySession } from "./settlementGeometrySession";
import { coveredByTerrainCells } from "./settlementRiverSite";

/** Map-unit endpoints; true when a straight trail is dry over its full width. */
export type BurgApproachDryLink = (a: readonly number[], b: readonly number[]) => boolean;

const LINK_WIDTH_METERS = 6;

/** Rivers, sea/lake cells and land support from the shared settlement geometry
 * (same recipe as river-road convergence). Unresolved river water is a refusal. */
export function burgApproachDryLink(
  world: Readonly<WorldContext>,
  unit: string,
  session: SettlementGeometrySession
): BurgApproachDryLink {
  const scale = mapUnitMeters(world.distanceScale, unit);
  const validation = new PhysicalWaterValidationCache();
  const { cells, rivers } = world.pack;
  return (a, b) => {
    const start: [number, number] = [a[0] * scale, a[1] * scale],
      end: [number, number] = [b[0] * scale, b[1] * scale];
    const pad = LINK_WIDTH_METERS * 2;
    const bounds = {
      minX: Math.min(start[0], end[0]) - pad,
      maxX: Math.max(start[0], end[0]) + pad,
      minY: Math.min(start[1], end[1]) - pad,
      maxY: Math.max(start[1], end[1]) + pad
    };
    const water: PhysicalWaterPolygon[] = [];
    for (const riverId of session.rivers(bounds)) {
      const river = rivers.find(r => r.i === riverId);
      if (!river) continue;
      const resolved = session.resolve(world, river, unit, bounds);
      if ("geometry" in resolved) water.push(resolved.geometry.water);
      else if (resolved.reason !== "no-local-water") return false;
    }
    const terrain = session.terrain(world, bounds);
    for (const t of terrain) if (cells.h[t.id] < 20) water.push({ id: 1000000000 + t.id, rings: [t.ring] });
    const land = terrain.filter(t => cells.h[t.id] >= 20).map(t => t.ring);
    const index = PhysicalWaterIndex.build(water, validation);
    if (!index) return false;
    return (
      "tangent" in
      checkDryLandSegment({
        start,
        end,
        widthMeters: LINK_WIDTH_METERS,
        water: index,
        supportsDryFootprint: footprint => coveredByTerrainCells(footprint, land)
      })
    );
  };
}
