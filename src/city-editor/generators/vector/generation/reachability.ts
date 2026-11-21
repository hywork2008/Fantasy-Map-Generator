import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { pointInPolygon } from "../../geom";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean, regionSurelyWithin } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** Ground cleared round a passage gate's anchor beyond the wall's own width, so the gate links both sides. */
const GATE_LINK_METERS = 3;
/** Slivers below this left by the clipper are not land a mill or a field stands on. */
const MIN_PIECE_M2 = 1;

const disc = (c: Point, r: number, n = 16): VectorPolygon => ({
  outer: Array.from(
    { length: n },
    (_, i): Point => [c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r]
  ),
  holes: []
});

/**
 * The land a carter can reach from the town centre (pre-acceptance U5): the frame without its water and walls, where
 * only the passage gates cross a wall and only the roads (their bridges and fords) cross water. Ground cut off by a
 * gateless stretch of wall or an unbridged river is left out, so no field, windmill or mill is raised there.
 * Returns undefined when nothing cuts the frame (no wall, no water), since then every piece of land is reachable.
 */
export function vectorReachableLand(doc: VectorCityDocument, centre: Point): VectorPolygon[] | undefined {
  const walls = Object.values(doc.paths).filter(p => p.role === "wall"),
    water = allVectorWater(doc);
  if (!walls.length && !water.length) return undefined;
  const half = doc.frame.extentMeters / 2,
    frame: VectorPolygon = {
      outer: [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half]
      ],
      holes: []
    },
    barriers = [...water, ...walls.map(pathSurface)],
    links = [
      ...Object.values(doc.paths)
        .filter(p => p.role === "road")
        .map(pathSurface),
      ...Object.values(doc.connections.gates).flatMap(g => {
        const wall = doc.paths[g.wallPathId];
        return wall && g.kind === "passage"
          ? [disc(evaluateAnchor(wall, g.anchor), wall.width.leftMeters + wall.width.rightMeters + GATE_LINK_METERS)]
          : [];
      })
    ];
  let land: VectorPolygon[];
  try {
    land = regionBoolean(
      regionBoolean(regionBoolean([frame], barriers, "difference"), links, "union"),
      [frame],
      "intersection"
    ).filter(r => regionArea(r) >= MIN_PIECE_M2);
  } catch {
    // The clipping kernel failed even on its retry: hold nothing back rather than lose the mills.
    return undefined;
  }
  const home = land.filter(r => containsRegion([r], centre));
  // A centre on a road's edge or in a sliver: the largest piece stands for the town.
  if (home.length) return home;
  const inFrame = land.filter(r => pointInPolygon(centre, r.outer));
  return inFrame.length ? inFrame : undefined;
}

/** Whether a footprint lies wholly on the reachable land (true when nothing cuts the frame). */
export function onReachableLand(reach: VectorPolygon[] | undefined, footprint: Point[]): boolean {
  if (!reach) return true;
  const piece = { outer: footprint, holes: [] };
  // Most footprints tried lie well inside the reachable land: nothing of them lies outside it.
  if (regionSurelyWithin(piece, reach)) return true;
  return regionBoolean([piece], reach, "difference").reduce((n, r) => n + regionArea(r), 0) < 0.5;
}
