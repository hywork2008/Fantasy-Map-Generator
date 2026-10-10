// Flow direction of imported FMG rivers. FMG cities draw their rivers from the fixed bank
// polygons (`importedFixedCrossings`), which carry no centreline or direction, so mills and
// tanneries could not tell upstream from downstream. The descriptor's centrelines are oriented
// here from the exported heightfield, once, when generation finishes. The result is stored in
// its own document field: `importedFixedCrossings` is never touched, so its validation, water
// decomposition and render-epoch caches (keyed on its contents) stay valid.

import { terrainHeight } from "./gen/castlePlacement";
import type { BurgSiteDescriptor, BurgSiteTerrain } from "./gen/site/burgSiteDescriptor";
import type { CityDocument, Id, Point } from "./types";

export interface RiverFlow {
  /** FMG river id. */
  riverId: number;
  name: string;
  /** Centreline, upstream → downstream, local metres. */
  points: Point[];
  widthMeters: number;
  /** Fitted fall along the centreline (m); 0 when the terrain is too flat to decide. */
  dropMeters: number;
  /** What decided the direction. */
  basis: "fmgElevation" | "localElevation" | "descriptor";
}

/** Falls smaller than this are within heightfield noise; keep the exporter's order. */
const MIN_DROP_METERS = 0.5;

function length(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return sum;
}

/** Least-squares slope of elevation against distance along the line (m per m). */
function fittedSlope(points: Point[], terrain: BurgSiteTerrain): { slope: number; weight: number } | null {
  const samples: Array<[number, number]> = [];
  let walked = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) walked += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const z = terrainHeight(terrain, points[i]);
    if (z !== null && Number.isFinite(z)) samples.push([walked, z]);
  }
  if (samples.length < 2 || walked < 1) return null;
  const mx = samples.reduce((s, [x]) => s + x, 0) / samples.length;
  const mz = samples.reduce((s, [, z]) => s + z, 0) / samples.length;
  let sxx = 0,
    sxz = 0;
  for (const [x, z] of samples) {
    sxx += (x - mx) ** 2;
    sxz += (x - mx) * (z - mz);
  }
  return sxx > 0 ? { slope: sxz / sxx, weight: walked } : null;
}

/** Orient every descriptor river so that it runs downhill on the exported heightfield. */
export function riverFlowsFromDescriptor(descriptor: BurgSiteDescriptor): RiverFlow[] {
  const terrain = descriptor.terrain;
  const flows: RiverFlow[] = [];
  for (const river of descriptor.rivers ?? []) {
    const segments = river.segments
      .map(segment => segment.points.map(([x, y]): Point => [x, y]))
      .filter(points => points.length >= 2 && length(points) > 1);
    if (!segments.length) continue;
    // One direction per river. FMG's own cell heights along the river come first: the
    // exported heightfield spans about one FMG cell and is usually flat.
    let rise = 0;
    let basis: RiverFlow["basis"] = "descriptor";
    const regional = river.flowElevation;
    if (regional && Math.abs(regional.downstreamMeters - regional.upstreamMeters) >= MIN_DROP_METERS) {
      rise = regional.downstreamMeters - regional.upstreamMeters;
      basis = "fmgElevation";
    } else {
      // Length-weighted fall over all the clipped pieces.
      for (const points of segments) {
        const fit = terrain ? fittedSlope(points, terrain) : null;
        if (fit) rise += fit.slope * fit.weight;
      }
      if (Math.abs(rise) >= MIN_DROP_METERS) basis = "localElevation";
    }
    const decided = basis !== "descriptor";
    const reverse = decided && rise > 0;
    for (const points of segments)
      flows.push({
        riverId: river.riverId,
        name: river.name,
        points: reverse ? [...points].reverse() : points,
        widthMeters: river.widthMeters,
        dropMeters: decided ? Math.abs(rise) : 0,
        basis
      });
  }
  return flows;
}

export interface FlowingRiver {
  id: Id;
  points: Point[];
  widthMeters: number;
  /** Imported: the drawn water is the surveyed bank polygon, not a stroke of `widthMeters`. */
  surveyed: boolean;
}

/** Every river with a known direction: editable river groups, then imported FMG flows. */
export function flowingRivers(document: CityDocument): FlowingRiver[] {
  const out: FlowingRiver[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    const points = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
    if (points.length >= 2) out.push({ id: group.id, points, widthMeters: group.style.widthMeters, surveyed: false });
  }
  for (const [index, flow] of (document.riverFlows ?? []).entries())
    if (flow.points.length >= 2)
      out.push({
        id: `fmg-river-${flow.riverId}-${index}`,
        points: flow.points,
        widthMeters: flow.widthMeters,
        surveyed: true
      });
  return out;
}
