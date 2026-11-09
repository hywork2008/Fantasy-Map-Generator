import { resolveBridgeSkewLimit } from "../../../../utils/bridgeSkewPolicy";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { SkeletonInputs, SkeletonRiver, SkeletonRoad } from "../../generation/skeleton/contracts";
import { dryRuns } from "../../generation/skeleton/inputs";
import { bastionEra } from "../../generation/skeleton/wallShapes";
import { minGateSpacingMeters } from "../../passages";
import { pathIsClosed } from "../geometry/curves";
import { distance, widthAt } from "../geometry/network";
import { samplePath } from "../geometry/sampling";

/** The mesh editor's street cell; its cell-free planners size spacing and clearances from it. */
export const SKELETON_CELL_METERS = 50;

/**
 * The mesh editor's skeleton inputs (K1) built from a meshless site, for its cell-free planners: the centre and
 * radius of the site, its open roads (centre side first, in path order), rivers and standing water, and the period's
 * bridge-skew limit. Road `id` is the index in `roadIds`; roads with no dry run are listed in `droppedRoadIds`.
 */
export function vectorSkeletonInputs(
  doc: VectorCityDocument,
  options: { half?: number; walls?: boolean } = {}
): { inputs: SkeletonInputs; roadIds: string[]; droppedRoadIds: string[]; riverIds: string[] } {
  const site = doc.site!,
    center = site.center,
    radius = Math.max(...site.domain[0].outer.map(p => distance(p, center))),
    period = doc.context.historicalPeriod,
    wallWidth = Math.max(4, SKELETON_CELL_METERS * 0.14);
  const roadPaths = Object.values(doc.paths).filter(p => p.role === "road" && !pathIsClosed(p)),
    water = site.water
      .filter(w => !w.riverPathId)
      .flatMap(w => w.polygons.map(p => ({ kind: "lake" as const, polygon: p.outer }))),
    // As the mesh editor's K1: a road keeps its first dry run from the centre; one with none is not a road here.
    trimmed = roadPaths.map(p => {
      const points = samplePath(p).map(s => s.point);
      if (distance(points[0], center) > distance(points.at(-1)!, center)) points.reverse();
      const run = dryRuns(points, water).find(r => polylineLength(r) >= SKELETON_CELL_METERS);
      // A road cut at, or ending on, the shore stops short of it by its own half width and a margin, so its
      // surface stays dry.
      const reach = Math.max(p.width.leftMeters, p.width.rightMeters) + 2;
      if (!run) return run;
      const end = run.at(-1)!,
        shore = Math.min(
          Infinity,
          ...water.map(w =>
            Math.min(...w.polygon.map((a, i) => segmentDistance(end, a, w.polygon[(i + 1) % w.polygon.length])))
          )
        );
      return shore < reach ? shortened(run, reach - shore + 0.5) : run;
    }),
    roads: SkeletonRoad[] = trimmed
      .flatMap(run => (run ? [run] : []))
      .map((path, id) => ({
        id,
        path,
        fixed: false,
        reachesFrame: true
      })),
    riverPaths = Object.values(doc.paths).filter(p => p.role === "river"),
    rivers: SkeletonRiver[] = riverPaths.map((p, index) => ({
      index,
      centerline: samplePath(p).map(s => s.point),
      halfWidth: Math.max(...samplePath(p).map(s => (widthAt(p, s.anchor).left + widthAt(p, s.anchor).right) / 2))
    }));
  return {
    inputs: {
      half: options.half ?? doc.frame.extentMeters / 2,
      cellSize: SKELETON_CELL_METERS,
      core: center,
      cityRadius: radius,
      walls: options.walls ?? true,
      walledAreaShare: 1,
      water,
      rivers,
      roads,
      fixedBridges: [],
      bridgeSkewLimit: resolveBridgeSkewLimit(period),
      bastionEra: bastionEra(period),
      requiredExternalRoads: roads.length,
      wallWidth,
      minGateSpacing: minGateSpacingMeters(wallWidth)
    },
    roadIds: roadPaths.filter((_, i) => trimmed[i]).map(p => p.id),
    droppedRoadIds: roadPaths.filter((_, i) => !trimmed[i]).map(p => p.id),
    riverIds: riverPaths.map(p => p.id)
  };
}

function polylineLength(line: [number, number][]): number {
  let n = 0;
  for (let i = 1; i < line.length; i++) n += distance(line[i - 1], line[i]);
  return n;
}

/** `line` with `meters` cut from its end, or undefined when too little would remain. */
function shortened(line: [number, number][], meters: number): [number, number][] | undefined {
  let left = meters;
  const out = line.map(p => [p[0], p[1]] as [number, number]);
  while (out.length >= 2 && left > 0) {
    const a = out.at(-2)!,
      b = out.at(-1)!,
      length = distance(a, b);
    if (length > left) {
      out[out.length - 1] = [b[0] + ((a[0] - b[0]) * left) / length, b[1] + ((a[1] - b[1]) * left) / length];
      left = 0;
    } else {
      out.pop();
      left -= length;
    }
  }
  return out.length >= 2 && polylineLength(out) >= SKELETON_CELL_METERS ? out : undefined;
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
