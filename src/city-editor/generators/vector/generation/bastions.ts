import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { polygonArea } from "../../geom";
import { featureReservations } from "../environmentState";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** Region ids of the bastion terrepleins a bastioned wall reserves (gate-ribbon plan §3.7). */
export const BASTION_REGION_PREFIX = "auto-bastion:";
/** Room kept between a road and a bastion it must not touch. */
const ROAD_MARGIN_METERS = 2;

/** The bastions of a unit bastioned outline: five vertices per corner (shoulder, flank, salient, flank, shoulder),
 * closed by the gorge between the shoulders, as `unitWallShape("bastioned")` draws them. */
export function unitBastions(ring: Point[]): Point[][] {
  if (ring.length % 5) return [];
  return Array.from({ length: ring.length / 5 }, (_, i) => ring.slice(5 * i, 5 * i + 5));
}

/** Area of a unit bastioned outline that is town, not bastion. */
export function unitBastionedTownArea(ring: Point[]): number {
  return Math.abs(polygonArea(ring)) - unitBastions(ring).reduce((n, b) => n + Math.abs(polygonArea(b)), 0);
}

/** The bastions of a placed bastioned wall: the `sides` farthest vertices from the centre that stand out from both
 * neighbours are the salients, each with the two vertices either side. Gates split curtains, never a bastion's five
 * corners, so the run round each salient survives them. */
export function placedBastions(doc: VectorCityDocument, wallId: string, sides: number): Point[][] {
  const wall = doc.paths[wallId];
  if (wall?.source.kind !== "curve" || !doc.site) return [];
  const v = wall.source.segments.map(s => s.from),
    n = v.length,
    c = doc.site.center,
    r = v.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]));
  if (n < 5 * sides) return [];
  return v
    .map((_, i) => i)
    .filter(i => r[i] > r[(i + 1) % n] && r[i] > r[(i + n - 1) % n])
    .sort((a, b) => r[b] - r[a])
    .slice(0, sides)
    .sort((a, b) => a - b)
    .map(i => [-2, -1, 0, 1, 2].map(k => v[(i + k + n) % n]));
}

/**
 * Reserve the terrepleins of a bastioned wall (gate-ribbon plan §3.7): a bastion is a gun platform, so no street
 * block, lane or house stands on it. Each reservation is the bastion inside the wall, clear of the wall itself,
 * water and ground already reserved. A bastion a road runs through (its gate in the bastion) stays open, or the gate
 * could not reach the town. Returns the number reserved.
 */
export function reserveVectorBastions(doc: VectorCityDocument, wallId: string, sides: number): number {
  const wall = doc.paths[wallId];
  if (!wall) return 0;
  const roads = Object.values(doc.paths)
    .filter(p => p.role === "road")
    .map(p =>
      pathSurface({
        ...p,
        width: {
          ...p.width,
          leftMeters: p.width.leftMeters + ROAD_MARGIN_METERS,
          rightMeters: p.width.rightMeters + ROAD_MARGIN_METERS
        }
      })
    );
  const keepOff: VectorPolygon[] = [
    pathSurface(wall),
    ...roads,
    ...allVectorWater(doc),
    ...featureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind === "reservation")
      .map(r => ({ outer: r.outer, holes: r.holes }))
  ];
  let count = 0;
  for (const bastion of placedBastions(doc, wallId, sides)) {
    let pieces: VectorPolygon[];
    try {
      // A road through a bastion (a gate in its face) needs the bastion's ground to reach the town: it stays open.
      if (regionBoolean([{ outer: bastion, holes: [] }], roads, "intersection").some(p => regionArea(p) > 1)) continue;
      pieces = regionBoolean(
        regionBoolean([{ outer: bastion, holes: [] }], doc.site!.domain, "intersection"),
        keepOff,
        "difference"
      ).filter(p => regionArea(p) > 20);
    } catch {
      continue;
    }
    for (const piece of pieces) {
      const id = `${BASTION_REGION_PREFIX}${count++}`;
      doc.regions[id] = { id, kind: "reservation", outer: piece.outer, holes: piece.holes };
    }
  }
  return count;
}
