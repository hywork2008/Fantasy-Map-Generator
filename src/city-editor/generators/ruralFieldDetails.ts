import type { RuralFieldSettings, RuralFieldSystem } from "../types/contracts/ruralFields";
import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea, polygonCentroid } from "./geom";
import type { FarmPlot } from "./localInfill.types";
import { convexInfillParts } from "./lotGeometry";
import { bounds, corridor, intersectConvex, PlotIndex } from "./parcelGeometry";
import { clipLines, curvedRows, gatedBoundary, nearestOnSegment } from "./ruralFieldGeometry";
import { planRuralFieldGroups } from "./ruralFieldGroups";
import { planRuralFields, type RuralFieldInput, type RuralFieldPlan } from "./ruralFieldPlan";

export interface DetailedRuralFieldInput extends RuralFieldInput {
  profiler?: import("../utils/ruralFieldProfiler").RuralFieldProfiler;
  system: RuralFieldSystem;
  settings?: RuralFieldSettings;
  /** The physical domain can extend beyond this rendering window. */
  visibleFrame?: Point[];
  unsuitableAreaM2?: number;
}
const area = (p: Point[]) => Math.abs(polygonArea(p));
const hash = (s: string) => {
  let n = [...s].reduce((n, c) => (Math.imul(n, 33) + c.charCodeAt(0)) >>> 0, 5381);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return (n ^ (n >>> 16)) >>> 0;
};
const rotate = ([x, y]: Point, angle: number): Point => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle)
];
const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1]
];

/** Retains the proven access lattice, then recovers usable margins and fits
 * gently curved or tapered fields against the actual domain and reservations. */
export function planDetailedRuralFields(input: DetailedRuralFieldInput): RuralFieldPlan {
  if (input.system !== "mechanized") return planRuralFieldGroups(input);
  const timing = input.profiler?.stages("generation/layout");
  timing?.next("mechanized-base");
  const base = planRuralFields({ ...input, period: "petroleumEra", areaBudgetM2: undefined });
  timing?.next("mechanized-details");
  const domain = new PlotIndex<{ polygon: Point[]; faceId: string }>();
  for (const face of input.land)
    for (const part of convexInfillParts(face.polygon))
      domain.add({ polygon: part, faceId: face.faceId }, bounds(part));
  const occupied = new PlotIndex<{ polygon: Point[]; id: number }>();
  base.farms.forEach((farm, id) => {
    occupied.add({ polygon: farm.polygon, id }, bounds(farm.polygon));
  });
  const lanes = base.lanes.map(lane => ({
    ...lane,
    widthMeters:
      lane.kind === "headland"
        ? input.system === "mechanized"
          ? Math.min(10, base.diagnostics.gridMeters - 1)
          : 4.5
        : lane.widthMeters
  }));
  const headlands = lanes.filter(lane => lane.kind === "headland");
  const laneIndex = new PlotIndex<Point[]>();
  for (const lane of lanes)
    for (let i = 1; i < lane.points.length; i++) {
      const band = corridor(lane.points[i - 1], lane.points[i], lane.widthMeters, lane.widthMeters / 2);
      if (band.length) laneIndex.add(band, bounds(band));
    }
  const safe = (polygon: Point[], id: number): boolean => {
    if (!isSimplePolygon(polygon, 150)) return false;
    for (const part of convexInfillParts(polygon)) {
      const box = bounds(part);
      if (input.blocked(part)) return false;
      const covered = domain.query(box).reduce((sum, land) => sum + area(intersectConvex(part, land.polygon)), 0);
      if (covered < area(part) - 0.01) return false;
      if (occupied.query(box).some(other => other.id !== id && area(intersectConvex(part, other.polygon)) > 0.01))
        return false;
      if (laneIndex.query(box).some(band => area(intersectConvex(part, band)) > 0.01)) return false;
    }
    return true;
  };
  const budget =
    input.areaBudgetM2 === undefined
      ? Infinity
      : Math.max(0, Number.isFinite(input.areaBudgetM2) ? input.areaBudgetM2 : 0);
  let remaining = budget;
  const farms: FarmPlot[] = [];
  const selected = new Set<number>();
  let capacity = 0;
  base.farms.forEach((farm, id) => {
    const angle = farm.orientationRadians ?? base.diagnostics.orientationRadians;
    const local = (point: Point) => rotate(point, -angle);
    const world = (point: Point) => rotate(point, angle);
    let box = bounds(farm.polygon.map(local));
    // Recover narrow strips without crossing a real boundary, a neighbour or
    // an access corridor. The offset is in metres, not cell coordinates.
    for (const side of [0, 2, 3] as const) {
      let lo = 0,
        hi = base.diagnostics.gridMeters;
      for (let step = 0; step < 7; step++) {
        const offset = (lo + hi) / 2;
        const candidate = [...box] as typeof box;
        candidate[side] += side === 0 ? -offset : offset;
        if (safe(rectangle(...candidate).map(world), id)) lo = offset;
        else hi = offset;
      }
      box = [...box] as typeof box;
      box[side] += side === 0 ? -lo : lo;
    }
    const [x0, y0, x1, y1] = box;
    const garden =
      input.settings?.gardenRadiusMeters !== undefined &&
      Math.hypot(...polygonCentroid(farm.polygon)) < input.settings.gardenRadiusMeters;
    const system = garden ? "market-garden" : input.system;
    const random = hash(farm.plotId ?? String(id));
    const amplitude = Math.min(12, (y1 - y0) * 0.24, (x1 - x0) * 0.08);
    let rowBend = 0;
    let polygon: Point[];
    if (system === "open-field" || system === "bocage") {
      // A sampled smooth boundary is used as geometry, not just an SVG effect.
      const samples = 8;
      const bend = (t: number) => amplitude * Math.sin(Math.PI * t) ** 2;
      rowBend = amplitude;
      const lower = Array.from({ length: samples + 1 }, (_, i): Point => {
        const t = i / samples;
        return [x0 + (x1 - x0) * t, y0 + bend(t)];
      });
      const upper = Array.from({ length: samples + 1 }, (_, i): Point => {
        const t = 1 - i / samples;
        return [x0 + (x1 - x0) * t, y1 - amplitude + bend(t)];
      });
      polygon = [...lower, ...upper].map(world);
    } else {
      // Keep the entire trapezoid inside the checked envelope. Only one
      // end of the upper working edge moves; the lower edge stays full length.
      const taper = system === "planned" ? Math.min((y1 - y0) * 0.45, (x1 - x0) * 0.18) : 0;
      polygon = [
        [x0 + (random % 2 ? taper : 0), y0],
        [x1 - (random % 2 ? 0 : taper), y0],
        [x1, y1],
        [x0, y1]
      ].map(p => world(p as Point));
    }
    if (!safe(polygon, id)) {
      polygon = farm.polygon;
      rowBend = 0;
    }
    // Ownership remains complete. Rendering/frame clipping never closes it
    // with a fence at the edge of the viewport.
    let holding = polygon;
    const visible = (p: Point[]) => (input.visibleFrame ? intersectConvex(p, input.visibleFrame) : p);
    let clipped = visible(polygon);
    let size = area(clipped);
    capacity += size;
    if (size < 150 || remaining < 150) return;
    if (size > remaining) {
      // Distribute the last usable area by moving a working edge, without
      // making an acute sliver from an arbitrary diagonal cut.
      let lo = x0,
        hi = x1;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        const cut = intersectConvex(polygon, rectangle(x0 - 1, y0 - 1, mid, y1 + 1).map(world));
        if (area(visible(cut)) > remaining) hi = mid;
        else lo = mid;
      }
      polygon = intersectConvex(polygon, rectangle(x0 - 1, y0 - 1, lo, y1 + 1).map(world));
      clipped = visible(polygon);
      size = area(clipped);
      if (lo - x0 < 12 || size < 150) return;
    }
    holding = polygon;
    for (const part of convexInfillParts(polygon)) occupied.add({ polygon: part, id }, bounds(part));
    const group = random % 3;
    const year = input.settings?.rotationYear ?? 0;
    const state = garden
      ? "horticulture"
      : system === "open-field"
        ? (["winter-crop", "spring-crop", "fallow"] as const)[(group + year) % 3]
        : "crop";
    const rows =
      state === "fallow" ? [] : curvedRows(polygon, angle, garden ? 2.7 : system === "mechanized" ? 6 : 4, rowBend);
    const strips = system === "open-field" ? curvedRows(polygon, angle, 8, rowBend) : [];
    const pieces = convexInfillParts(clipped);
    const sourceFaceIds = [
      ...new Set(
        domain
          .query(bounds(clipped))
          .filter(land => pieces.some(piece => area(intersectConvex(piece, land.polygon)) > 0.01))
          .map(land => land.faceId)
      )
    ].sort();
    const headland = headlands[id];
    const entrance: Point = headland
      ? [(headland.points[0][0] + headland.points[1][0]) / 2, (headland.points[0][1] + headland.points[1][1]) / 2]
      : farm.polygon[0];
    const boundaryKind = system === "bocage" ? "hedge" : system === "planned" && random % 5 === 0 ? "wall" : undefined;
    farms.push({
      ...farm,
      faceId: sourceFaceIds[0] ?? farm.faceId,
      sourceFaceIds,
      polygon: clipped,
      rows: clipLines(rows, input.visibleFrame),
      system,
      cropState: state,
      rotationGroup: group,
      holdingPolygon: holding,
      clippedByFrame: area(holding) - area(visible(holding)) > 0.01,
      tenureStrips: clipLines(strips, input.visibleFrame),
      boundaryKind,
      boundaries: clipLines(gatedBoundary(polygon, entrance, 4), input.visibleFrame)
    });
    selected.add(id);
    remaining -= size;
  });
  const retainedLanes = connectedLanes(lanes, selected, input.roads);
  const cultivated = farms.reduce((sum, farm) => sum + area(farm.polygon), 0);
  const shortfall = Number.isFinite(budget) ? Math.max(0, budget - cultivated) : 0;
  timing?.end();
  return {
    ...base,
    farms,
    lanes: retainedLanes.flatMap(lane =>
      clipLines([lane.points], input.visibleFrame).map(points => ({ ...lane, points }))
    ),
    diagnostics: {
      ...base.diagnostics,
      requestedAreaM2: input.areaBudgetM2,
      cultivatedAreaM2: cultivated,
      shortfallAreaM2: shortfall,
      profile: input.system,
      suitableCapacityM2: capacity,
      unsuitableAreaM2: input.unsuitableAreaM2 ?? 0,
      shortfallReason:
        shortfall <= 0.01
          ? undefined
          : base.diagnostics.candidateAreaM2 === 0
            ? input.unsuitableAreaM2
              ? "terrain"
              : "space"
            : base.diagnostics.reachableAreaM2 < base.diagnostics.candidateAreaM2 * 0.5
              ? "access"
              : capacity >= budget
                ? "minimum-plot"
                : "space"
    }
  };
}

function connectedLanes(
  lanes: RuralFieldPlan["lanes"],
  selected: Set<number>,
  roads: RuralFieldInput["roads"]
): RuralFieldPlan["lanes"] {
  const tracks = lanes.filter(lane => lane.kind !== "headland"),
    headlands = lanes.filter(lane => lane.kind === "headland");
  const signature = (p: Point) => p.map(n => n.toFixed(5)).join(":");
  const graph = new Map<string, { next: string; index: number }[]>();
  const points = new Map<string, Point>();
  tracks.forEach((lane, index) => {
    const a = signature(lane.points[0]),
      b = signature(lane.points[1]);
    points.set(a, lane.points[0]);
    points.set(b, lane.points[1]);
    graph.set(a, [...(graph.get(a) ?? []), { next: b, index }]);
    graph.set(b, [...(graph.get(b) ?? []), { next: a, index }]);
  });
  const roots = [...points]
    .filter(([, p]) =>
      roads.some(road => road.points.slice(1).some((b, i) => nearestOnSegment(p, road.points[i], b).dist < 0.01))
    )
    .map(([id]) => id);
  const queue = [...roots],
    visited = new Set(roots),
    parents = new Map<string, { next: string; index: number }>();
  for (let i = 0; i < queue.length; i++)
    for (const edge of graph.get(queue[i]) ?? [])
      if (!visited.has(edge.next)) {
        visited.add(edge.next);
        queue.push(edge.next);
        parents.set(edge.next, { next: queue[i], index: edge.index });
      }
  const keep = new Set<number>();
  for (const index of selected)
    for (let id = signature(headlands[index].points[0]); parents.has(id); ) {
      const edge = parents.get(id)!;
      if (keep.has(edge.index)) break;
      keep.add(edge.index);
      id = edge.next;
    }
  return [...tracks.filter((_, i) => keep.has(i)), ...headlands.filter((_, i) => selected.has(i))];
}
