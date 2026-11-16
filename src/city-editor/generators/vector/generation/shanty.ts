import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { pointInPolygon } from "../../geom";
import { featureReservations } from "../environmentState";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { wallBerm } from "./suburbs";

/** Half the width of the faubourg either side of its approach road. */
const FAUBOURG_HALF_METERS = 45;
/** A road ending this close to the wall line ends at its gate. */
const GATE_METERS = 15;

/** True when the town asks for the mesh editor's extramural shanty (`config.features.shanty`, or the FMG burg's). */
export const wantsShanty = (doc: VectorCityDocument) =>
  doc.context.requestedSettings?.config?.features?.shanty ?? doc.site?.descriptor?.burg.shanty ?? false;

/**
 * Land for the extramural shanty of a walled town (P6h). The mesh editor picks its shanty cells in the band from
 * just inside the wall's reach to 1.8 times it, in the cone of the two busiest approaches (`pickShanty`); a meshless
 * site ends at the wall, so the site grows by a strip along each of those roads from the wall out to that band's
 * outer edge, clear of water and reserved ground. The urban stage then picks the shanty blocks on it.
 */
export function raiseVectorShantyLand(doc: VectorCityDocument): {
  document: VectorCityDocument;
  grown: boolean;
  added?: boolean;
} {
  const site = doc.site;
  if (!site || !wantsShanty(doc)) return { document: doc, grown: false };
  const wall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!wall) return { document: doc, grown: false };
  const ring = samplePath(wall).map(s => s.point),
    center = site.center,
    borderR = Math.max(...ring.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))),
    reach = borderR * 1.8,
    half = doc.frame.extentMeters / 2 - 4,
    descriptorRoads = site.descriptor?.roads ?? [],
    wallGap = (q: Point) => Math.min(...ring.map((a, i) => pointSegmentDistance(q, a, ring[(i + 1) % ring.length])));
  const approaches = Object.values(doc.paths)
    .filter(p => p.role === "road")
    .map(p => {
      const i = descriptorRoads.findIndex((r, k) => p.id === `fmg-road:${r.routeId}:${k}`);
      return { path: p, traffic: i >= 0 ? (descriptorRoads[i].traffic ?? 0) : 0 };
    })
    // A road through the wall, or one ending at its gate.
    .filter(r => {
      const line = samplePath(r.path).map(s => s.point);
      return (
        line.some(q => !pointInPolygon(q, ring)) && line.some(q => pointInPolygon(q, ring) || wallGap(q) < GATE_METERS)
      );
    })
    .sort((a, b) => b.traffic - a.traffic || (a.path.id < b.path.id ? -1 : 1))
    .slice(0, 2);
  const strips: VectorPolygon[] = [];
  for (const { path } of approaches) {
    // The road's run beyond the wall, out to the band's outer edge.
    // Every 5 m, so the run starts at the wall even on a two-point road.
    const coarse = samplePath(path).map(s => s.point),
      line = coarse
        .slice(1)
        .flatMap((b, i): Point[] => {
          const a = coarse[i],
            n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
          return Array.from(
            { length: n },
            (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
          );
        })
        .concat([coarse.at(-1)!]),
      outward = pointInPolygon(line[0], ring) || wallGap(line[0]) < wallGap(line.at(-1)!) ? line : [...line].reverse(),
      first = outward.findIndex(q => !pointInPolygon(q, ring)),
      run = outward.slice(Math.max(0, first)).filter(q => Math.hypot(q[0] - center[0], q[1] - center[1]) <= reach);
    // One straight strip from the wall crossing to the band's edge: overlapping pieces at bends pinch the outline.
    if (run.length < 2) continue;
    const a = run[0],
      b = run.at(-1)!,
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 10) continue;
    const n: Point = [(-(b[1] - a[1]) / l) * FAUBOURG_HALF_METERS, ((b[0] - a[0]) / l) * FAUBOURG_HALF_METERS],
      quad: Point[] = [
        [a[0] + n[0], a[1] + n[1]],
        [b[0] + n[0], b[1] + n[1]],
        [b[0] - n[0], b[1] - n[1]],
        [a[0] - n[0], a[1] - n[1]]
      ];
    strips.push({
      outer: quad.map(([x, y]): Point => [Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, y))]),
      holes: []
    });
  }
  if (!strips.length) return { document: doc, grown: false };
  let land = regionBoolean(strips, [], "union");
  // Clear of water, reserved ground and the wall.
  land = regionBoolean(
    land,
    [
      ...allVectorWater(doc),
      ...featureReservations(doc),
      { outer: ring, holes: [] },
      // A berm before the wall keeps the strip off the gate openings, which belong to the town's land.
      ...wallBerm(ring, 8)
    ],
    "difference"
  ).filter(r => regionArea(r) > 400);
  if (!land.length) return { document: doc, grown: false };
  const domain = regionBoolean(site.domain, land, "union");
  // A strip meeting the site outline at a sliver can pinch it; such a town keeps its site.
  if (!domain.every(p => simpleContour(p.outer, true) && p.holes.every(h => simpleContour(h, true))))
    return { document: doc, grown: false };
  return {
    document: { ...doc, site: { ...site, domain } },
    grown: true,
    added: true
  };
}
