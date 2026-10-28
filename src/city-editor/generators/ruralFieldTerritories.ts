import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea, polygonCentroid } from "./geom";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import { bounds, corridor, intersectConvex, PlotIndex, subtractConvex } from "./parcelGeometry";
import { clipRuralAccess } from "./ruralFieldAccessGeometry";
import { ruralBankKey } from "./ruralFieldBanks";
import type { DetailedRuralFieldInput } from "./ruralFieldDetails.types";
import { clipLines, curvedRows, gatedBoundary } from "./ruralFieldGeometry";
import type { RuralFieldPlan } from "./ruralFieldPlan";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const hash = (s: string) => {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return (n ^ (n >>> 13)) >>> 0;
};
type AccessNode = { point: Point; x: number; y: number };
type Group = { id: string; center: Point; angle: number; seed: number; region: string };
interface Context {
  input: DetailedRuralFieldInput;
  result: RuralFieldPlan;
  nodes: Map<string, AccessNode>;
  queue: string[];
  groups: Group[];
  tracks: Point[][];
  q: number;
  regions: Map<string, string>;
  clear(p: Point[]): boolean;
  source(p: Point[]): string[];
}

/** Partition all accessible ground. Fields share boundaries instead of being
 * independent rectangles fitted into separate, partially empty envelopes. */
export function finishRuralTerritories({
  input,
  result,
  nodes,
  queue,
  groups,
  tracks,
  clear,
  source,
  q,
  regions
}: Context): RuralFieldPlan {
  if (!groups.length) return result;
  const timing = input.profiler?.stages("generation/layout");
  timing?.next("territory-ownership");
  const reachable = new Map(queue.map(id => [id, nodes.get(id)!]));
  const regionNodes = new Map<string, Map<string, AccessNode>>();
  for (const [id, node] of reachable) {
    const region = regions.get(id)!,
      entries = regionNodes.get(region) ?? new Map<string, AccessNode>();
    entries.set(id, node);
    regionNodes.set(region, entries);
  }
  const frames = new Map(
    [...regionNodes].map(([region, entries]) => {
      const box = bounds([...entries.values()].map(node => node.point));
      const frame: Point[] = [
        [box[0] - q, box[1] - q],
        [box[2] + q, box[1] - q],
        [box[2] + q, box[3] + q],
        [box[0] - q, box[3] + q]
      ];
      return [region, frame] as const;
    })
  );
  const box = bounds([...reachable.values()].map(node => node.point));
  const width = 1.2;
  // Exact Voronoi half-planes replace raster ownership and staircase repair.
  // Offsetting the same bisector on both sides reserves exactly one footpath.
  const cells = groups.map((g, i) => {
    let polygon = frames.get(g.region)!;
    groups.forEach((other, j) => {
      if (i === j || g.region !== other.region) return;
      const dx = other.center[0] - g.center[0],
        dy = other.center[1] - g.center[1];
      const length = Math.hypot(dx, dy);
      const normal: Point = [dx / length, dy / length];
      const offset = ((g.center[0] + other.center[0]) * normal[0] + (g.center[1] + other.center[1]) * normal[1]) / 2;
      polygon = clipHalfPlane(polygon, normal, offset);
    });
    return polygon;
  });
  const territories = cells.map(polygon =>
    insetConvexKernel(
      polygon,
      polygon.map(() => width / 2)
    )
  );
  // Keep each unobstructed run straight, stopping at water or reservations.
  const addStraightTrack = (a: Point, b: Point, region: string) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / q));
    const at = (n: number): Point => [a[0] + ((b[0] - a[0]) * n) / steps, a[1] + ((b[1] - a[1]) * n) / steps];
    let start: Point | undefined;
    for (let n = 0; n < steps; n++) {
      const from = at(n),
        to = at(n + 1);
      const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      if (
        (region === "all" || regions.get(`${Math.floor(mid[0] / q)}:${Math.floor(mid[1] / q)}`) === region) &&
        clear(corridor(from, to, width, width / 2))
      )
        start ??= from;
      else if (start) {
        tracks.push([start, from]);
        start = undefined;
      }
    }
    if (start) tracks.push([start, b]);
  };
  timing?.next("interior-tracks");
  groups.forEach((g, i) => {
    const polygon = territories[i];
    if (polygon.length < 3) return;
    const normal: Point = [Math.cos(g.angle), Math.sin(g.angle)];
    const extent = Math.hypot(box[2] - box[0] + q * 2, box[3] - box[1] + q * 2);
    const line: Point[] = [
      [g.center[0] - normal[1] * extent, g.center[1] + normal[0] * extent],
      [g.center[0] + normal[1] * extent, g.center[1] - normal[0] * extent]
    ];
    for (const [a, b] of clipLines([line], polygon)) addStraightTrack(a, b, g.region);
  });
  timing?.next("boundary-routes");
  // Shared edges lie on the unoffset bisector, not on a grid staircase.
  cells.forEach((polygon, i) => {
    polygon.forEach((a, edge) => {
      const b = polygon[(edge + 1) % polygon.length];
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const distance = (p: Point) => Math.hypot(p[0] - mid[0], p[1] - mid[1]);
      const ownDistance = distance(groups[i].center);
      const neighbour = groups.findIndex(
        (g, j) => j !== i && g.region === groups[i].region && Math.abs(distance(g.center) - ownDistance) < 1e-5
      );
      if (neighbour > i) addStraightTrack(a, b, groups[i].region);
    });
  });
  timing?.next("track-reservations");
  const reservations = new PlotIndex<Point[]>();
  for (const line of tracks) {
    const band = corridor(line[0], line[1], width, width / 2);
    if (band.length) reservations.add(band, bounds(band));
  }
  for (const road of input.roads)
    for (let i = 1; i < road.points.length; i++) {
      const band = corridor(road.points[i - 1], road.points[i], road.widthMeters + 2);
      if (band.length) reservations.add(band, bounds(band));
    }
  timing?.next("strip-labels");
  const components: { label: string; ring: Point[] }[] = [];
  groups.forEach((g, index) => {
    const territory = territories[index];
    if (territory.length < 3) return;
    const bank = ruralBankKey(g.center, input.riverDividers);
    const bankClear = (polygon: Point[]) =>
      clear(polygon) &&
      [...polygon, polygonCentroid(polygon)].every(p => ruralBankKey(p, input.riverDividers) === bank);
    const normal: Point = [-Math.sin(g.angle), Math.cos(g.angle)];
    const values = territory.map(p => p[0] * normal[0] + p[1] * normal[1]);
    const hi = Math.max(...values);
    let lo = Math.min(...values),
      strip = 0;
    while (lo < hi && strip < 1000) {
      const end = Math.min(hi, lo + 22 + (hash(`${g.seed}:strip:${strip}`) % 19));
      let polygon = clipHalfPlane(territory, normal, end);
      polygon = clipHalfPlane(polygon, [-normal[0], -normal[1]], -lo);
      let pieces = [polygon];
      for (const band of reservations.query(bounds(polygon)))
        pieces = pieces.flatMap(piece => subtractConvex(piece, band, 0.01));
      for (const piece of pieces)
        for (const ring of clipRuralAccess(piece, regionNodes.get(g.region)!, q, bankClear))
          if (area(ring) >= 150) components.push({ label: `${index}:${strip}`, ring });
      lo = end;
      strip++;
    }
  });
  timing?.next("plots-rows-and-boundaries");
  const rows = input.profiler?.wrap("rows", curvedRows) ?? curvedRows;
  const boundary = input.profiler?.wrap("field-boundaries", gatedBoundary) ?? gatedBoundary;
  const sourcesFor = input.profiler?.wrap("source-faces", source) ?? source;
  let remaining = input.areaBudgetM2 === undefined ? Infinity : Math.max(0, input.areaBudgetM2),
    capacity = 0;
  const ordered = components.sort(
    (a, b) =>
      // Spread a finite area budget over the countryside instead of exhausting
      // it in a ring around the town. Near-city keeps its inward preference.
      (input.settings?.range === "near-city"
        ? Math.hypot(...polygonCentroid(a.ring)) - Math.hypot(...polygonCentroid(b.ring))
        : hash(`${input.seed}:coverage:${a.label}`) - hash(`${input.seed}:coverage:${b.label}`)) ||
      a.label.localeCompare(b.label)
  );
  for (const [i, component] of ordered.entries()) {
    const index = Number(component.label.split(":")[0]),
      g = groups[index];
    let polygon = removeCollinear(component.ring);
    let visible = input.visibleFrame ? intersectRing(polygon, input.visibleFrame) : polygon,
      size = area(visible);
    capacity += size;
    if (size < 150 || remaining < 150) continue;
    if (size > remaining) {
      const b = bounds(polygon);
      let lo = b[0],
        hi = b[2];
      const clip = (x: number): Point[] => [
        [b[0] - 1, b[1] - 1],
        [x, b[1] - 1],
        [x, b[3] + 1],
        [b[0] - 1, b[3] + 1]
      ];
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2,
          part = intersectRing(polygon, clip(mid));
        if (area(input.visibleFrame ? intersectRing(part, input.visibleFrame) : part) > remaining) hi = mid;
        else lo = mid;
      }
      polygon = intersectRing(polygon, clip(lo));
      visible = input.visibleFrame ? intersectRing(polygon, input.visibleFrame) : polygon;
      size = area(visible);
      if (!isSimplePolygon(visible, 150)) continue;
    }
    const garden =
      input.settings?.gardenRadiusMeters !== undefined &&
      Math.hypot(...polygonCentroid(polygon)) < input.settings.gardenRadiusMeters;
    const system = garden ? "market-garden" : input.system,
      rotation = hash(`${input.seed}:${component.label}`) % 3;
    const state = garden
      ? "horticulture"
      : system === "open-field"
        ? (["winter-crop", "spring-crop", "fallow"] as const)[(rotation + (input.settings?.rotationYear ?? 0)) % 3]
        : "crop";
    const sources = sourcesFor(polygon),
      id = `rural-territory:${component.label}:${i}`,
      boundaryKind = system === "bocage" ? "hedge" : undefined;
    result.farms.push({
      faceId: sources[0] ?? input.land[0].faceId,
      sourceFaceIds: sources,
      plotId: id,
      polygon: visible,
      holdingPolygon: polygon,
      clippedByFrame: area(polygon) - size > 0.01,
      rows: state === "fallow" ? [] : clipLines(rows(polygon, g.angle, garden ? 2.7 : 4, 0), input.visibleFrame),
      system,
      cropState: state,
      rotationGroup: rotation,
      orientationRadians: g.angle,
      managementGroupId: g.id,
      tenureStrips: [],
      boundaryKind,
      boundaries: clipLines(boundary(polygon, polygon[0], 4), input.visibleFrame)
    });
    remaining -= size;
  }
  timing?.next("lanes-and-diagnostics");
  result.lanes = tracks.flatMap(points =>
    clipLines([points], input.visibleFrame).map(points => ({
      faceId: input.land[0].faceId,
      points,
      widthMeters: width,
      kind: "farm-track" as const
    }))
  );
  const cultivated = result.farms.reduce((sum, farm) => sum + area(farm.polygon), 0),
    budget = input.areaBudgetM2,
    shortfall = budget === undefined ? 0 : Math.max(0, budget - cultivated);
  result.diagnostics = {
    ...result.diagnostics,
    requestedAreaM2: budget,
    cultivatedAreaM2: cultivated,
    shortfallAreaM2: shortfall,
    suitableCapacityM2: capacity,
    profile: input.system,
    unsuitableAreaM2: input.unsuitableAreaM2 ?? 0,
    shortfallReason: shortfall < 0.01 ? undefined : input.unsuitableAreaM2 && capacity === 0 ? "terrain" : "space"
  };
  if (input.profiler)
    Object.assign(input.profiler.counts, {
      components: components.length,
      finalBoundaryVertices: components.reduce((n, c) => n + c.ring.length, 0)
    });
  timing?.end();
  return result;
}
function removeCollinear(ring: Point[]): Point[] {
  return ring.filter((b, i) => {
    const a = ring[(i + ring.length - 1) % ring.length],
      c = ring[(i + 1) % ring.length];
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-7;
  });
}
function intersectRing(ring: Point[], clip: Point[]): Point[] {
  return ring.length >= 3 ? intersectConvex(ring, clip) : [];
}
