import type { WallShape } from "../../../types/generation";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorBlock, VectorGenerationSettings, VectorPolygon } from "../../../types/vector/generation";
import { planCirculadeLayout } from "../../circuladeLayout";
import { type GenerationTimingObserver, generationTiming } from "../../generationTiming";
import { pointInPolygon, polygonCentroid } from "../../geom";
import {
  bramCoreRadiusMeters,
  planPolygonalCirculadeLayout,
  urbanDiskRadiusMeters
} from "../../polygonalCirculadeLayout";
import { mapDocumentAnchors } from "../editing/anchors";
import {
  createVectorGate,
  joinVectorGenerationAnchors,
  proposeSquareBridge,
  rebuildRoadGraph,
  setWallCircuit
} from "../editing/network";
import { curveSource, removeVectorPath } from "../editing/paths";
import { featureReservations } from "../environmentState";
import { evaluateAnchor, pathIsClosed, pathSegmentIds } from "../geometry/curves";
import { pathIntersections } from "../geometry/intersections";
import { bridgeGeometry, distance, gateOpening, unit, widthAt } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { compactRing, offsetRing } from "../geometry/routing";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater, vectorWaterSurfaces } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { assertVectorDocument } from "../validation/document";
import { CASTLE_FEATURE_ID, CASTLE_SITE_ID, raiseVectorCastle, reserveVectorCastle } from "./castle";
import { connectVectorCivicCentre } from "./civic";
import { type RouteLink, skeletonRoutes } from "./routes";
import { GENERATED_HARBOR_ID, raiseVectorHarbor } from "./seaHarbor";
import { isVectorWallShape, VECTOR_WALL_WIDTH_METERS, vectorUnitWallRing, vectorWallSettings } from "./wallShape";

/** Sine of the shallowest angle a road or river may cross a generated wall shape at (20 degrees). */
const WALL_CROSSING_SINE = Math.sin((20 * Math.PI) / 180);
/** Side street width relative to a main street (5 m to 3 m by default). */
const MINOR_STREET_WIDTH_RATIO = 0.6;
export const DEFAULT_VECTOR_GENERATION: VectorGenerationSettings = {
  seed: "meshless",
  roadWidthMeters: 5,
  clearanceMeters: 0.5,
  branches: 8,
  wall: "none"
};
export function generationFingerprint(doc: VectorCityDocument, ids: Set<string>): string {
  const nodes = Object.values(doc.connections.nodes)
    .filter(n => n.anchors.some(a => ids.has(a.pathId)))
    .map(n => n.id);
  return JSON.stringify({
    nodes: Object.values(doc.connections.nodes).filter(n => nodes.includes(n.id)),
    edges: Object.values(doc.connections.edges).filter(
      e => ids.has(e.pathId) || nodes.includes(e.fromNodeId) || nodes.includes(e.toNodeId)
    ),
    gates: Object.values(doc.connections.gates).filter(g => ids.has(g.wallPathId) || nodes.includes(g.nodeId)),
    circuits: Object.values(doc.connections.circuits).filter(c => ids.has(c.pathId)),
    bridges: Object.values(doc.connections.bridges).filter(b => ids.has(b.roadPathId) || ids.has(b.riverAnchor.pathId)),
    wallRoads: Object.values(doc.connections.wallRoads).filter(r => ids.has(r.pathId)),
    ...(doc.environment?.landscape ? { landscape: doc.environment.landscape } : {}),
    ...(doc.environment?.harbor ? { harbor: doc.environment.harbor } : {}),
    ...(doc.environment?.defenses ? { defenses: doc.environment.defenses } : {})
  });
}
export { joinVectorGenerationAnchors } from "../editing/network";

function walls(doc: VectorCityDocument): VectorPolygon[] {
  return Object.values(doc.paths)
    .filter(p => p.role === "wall")
    .flatMap(p =>
      regionBoolean(
        [pathSurface(p)],
        Object.values(doc.connections.gates)
          .filter(g => g.wallPathId === p.id)
          .map(g => ({ outer: gateOpening(doc, g), holes: [] })),
        "difference"
      )
    );
}
function freeLand(doc: VectorCityDocument): VectorPolygon[] {
  const obstacles = [
    ...featureReservations(doc),
    ...allVectorWater(doc),
    ...walls(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind === "reservation")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...vectorOccupiedSites(doc, "reserved")
  ];
  return regionBoolean(doc.site!.domain, obstacles, "difference");
}
function roadEndpoints(path: VectorPath): CurveAnchor[] {
  const ids = pathSegmentIds(path);
  return [
    { pathId: path.id, segmentId: ids[0], t: 0 },
    { pathId: path.id, segmentId: ids.at(-1)!, t: 1 }
  ];
}
/**
 * A wall shape can pass inside the end of an approach road that a site-sized ellipse always enclosed: a square's
 * sides run 0.71 of the way out. Such a road is continued straight toward the centre until just inside the wall,
 * so it reaches the town through a gate as the mesh editor's approach roads do (P4a). A continuation that would
 * cross water or miss the wall is not drawn.
 */
function extendApproachesThroughWall(
  doc: VectorCityDocument,
  wallId: string,
  center: Point,
  settings: VectorGenerationSettings,
  extended: Set<string>
) {
  const wall = doc.paths[wallId],
    ring = samplePath(wall).map(s => s.point),
    water = allVectorWater(doc),
    inset = wall.width.leftMeters + wall.width.rightMeters + settings.clearanceMeters + settings.roadWidthMeters;
  let number = 0;
  for (const road of Object.values(doc.paths).filter(
    p => p.role === "road" && !pathIsClosed(p) && !extended.has(p.id)
  )) {
    const inner = roadEndpoints(road).sort(
        (a, b) => distance(evaluateAnchor(road, a), center) - distance(evaluateAnchor(road, b), center)
      )[0],
      from = evaluateAnchor(road, inner);
    // A road that already reaches the centre (an FMG road) needs no continuation.
    if (distance(from, center) < 1) continue;
    const dir = unit([center[0] - from[0], center[1] - from[1]]),
      inside = pointInPolygon(from, ring),
      // An end inside the wall but within the gate's reach stops in the gate itself; it is carried on too.
      clear = ring.every((p, i) => distanceToSegment(from, p, ring[(i + 1) % ring.length]) >= inset);
    if (inside && clear) continue;
    let hit: Point | undefined = inside ? from : undefined,
      best = Infinity;
    for (let i = 0; i < ring.length && !inside; i++) {
      const t = segmentHit(from, center, ring[i], ring[(i + 1) % ring.length]);
      if (t !== undefined && t < best) {
        best = t;
        hit = [from[0] + (center[0] - from[0]) * t, from[1] + (center[1] - from[1]) * t];
      }
    }
    if (!hit) continue;
    const to: Point = [hit[0] + dir[0] * inset, hit[1] + dir[1] * inset];
    if (distance(from, center) <= distance(to, from)) continue;
    let id = `auto-approach:${number++}`;
    while (Object.hasOwn(doc.paths, id)) id = `auto-approach:${number++}`;
    const path: VectorPath = {
      id,
      revision: 0,
      role: "road",
      origin: "automatic",
      editPolicy: "editable",
      source: curveSource([from, to], "polyline", false),
      width: { leftMeters: road.width.leftMeters, rightMeters: road.width.rightMeters, stations: [] }
    };
    if (regionBoolean([pathSurface(path)], water, "intersection").some(r => regionArea(r) > 1e-5)) continue;
    doc.paths[id] = path;
    joinVectorGenerationAnchors(doc, [inner, { pathId: id, segmentId: pathSegmentIds(path)[0], t: 0 }]);
    extended.add(road.id);
  }
}
/**
 * Whether every road and river crosses `wall` at 20 degrees or more and away from its corners, so each gate
 * opening lies on one straight run (P4a). With `blocked`, gates must also keep apart from one another and off
 * those sites (P4b: an old-town wall cut into laid streets).
 */
function wallCrossingsFit(
  wall: VectorPath,
  crossers: VectorPath[],
  settings: VectorGenerationSettings,
  blocked?: VectorPolygon[],
  /** Let the wall itself cross the blocked sites; only its gates must keep off them. */
  crossSites = false
): boolean {
  const ring = samplePath(wall)
      .map(s => s.point)
      .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-6),
    thickness = wall.width.leftMeters + wall.width.rightMeters,
    corners = (distance(ring[0], ring.at(-1)!) <= 1e-6 ? ring.slice(0, -1) : ring).filter((p, i, all) => {
      const a = all[(i + all.length - 1) % all.length],
        b = all[(i + 1) % all.length],
        u = unit([p[0] - a[0], p[1] - a[1]]),
        v = unit([b[0] - p[0], b[1] - p[1]]);
      return u[0] * v[0] + u[1] * v[1] < Math.cos((15 * Math.PI) / 180);
    }),
    gates: { at: Point; opening: number }[] = [];
  if (
    blocked &&
    !crossSites &&
    regionBoolean([pathSurface(wall)], blocked, "intersection").some(r => regionArea(r) > 1e-5)
  )
    return false;
  for (const other of crossers)
    for (const hit of pathIntersections(wall, other)) {
      const a = unit(evaluateAnchor(wall, hit.a, true)),
        b = unit(evaluateAnchor(other, hit.b, true)),
        sine = Math.abs(a[0] * b[1] - a[1] * b[0]);
      if (sine < WALL_CROSSING_SINE) return false;
      const width = widthAt(other, hit.b),
        at = evaluateAnchor(wall, hit.a),
        opening = (width.left + width.right) / sine + 2 * settings.clearanceMeters + 0.1;
      if (corners.some(c => distance(c, at) < opening * 0.75 + thickness)) return false;
      if (blocked) {
        if (gates.some(g => distance(g.at, at) < (g.opening + opening) / 2 + thickness)) return false;
        const reach = opening / 2 + thickness;
        if (blocked.some(r => containsRegion([r], at) || ringDistance(at, r.outer) < reach)) return false;
      }
      gates.push({ at, opening });
    }
  return true;
}
export const TOWN_MOAT_ID = "auto-moat";
/** The mesh editor's town moat (`circuits.ts`: 12 m) and the berm between it and the wall foot. */
const TOWN_MOAT_WIDTH_METERS = 12,
  MOAT_BERM_METERS = 6;
/**
 * A wet moat round the outer wall (P4c-2): a closed water course a berm outside the wall foot, with a straight
 * bridge wherever a road crosses it. The bridges keep to the shared skew policy through document validation; a
 * wall turned so that a road meets the moat obliquely is rejected and the next rotation tried.
 */
function addTownMoat(doc: VectorCityDocument, wallId: string, settings: VectorGenerationSettings): VectorCityDocument {
  const wall = doc.paths[wallId],
    sampled = samplePath(wall)
      .map(s => s.point)
      .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-6),
    ring = compactRing(distance(sampled[0], sampled.at(-1)!) < 1e-6 ? sampled.slice(0, -1) : sampled, 0.05),
    half = TOWN_MOAT_WIDTH_METERS / 2,
    line = offsetRing(ring, Math.max(wall.width.leftMeters, wall.width.rightMeters) + MOAT_BERM_METERS + half);
  doc.paths[TOWN_MOAT_ID] = {
    id: TOWN_MOAT_ID,
    revision: 0,
    role: "river",
    origin: "automatic",
    editPolicy: "editable",
    source: curveSource(line, "polyline", true),
    width: { leftMeters: half, rightMeters: half, stations: [] }
  };
  const moat = doc.paths[TOWN_MOAT_ID];
  let number = 0;
  for (const road of Object.values(doc.paths).filter(p => p.role === "road"))
    for (const hit of pathIntersections(moat, road)) {
      const segment =
        road.source.kind === "curve" ? road.source.segments.find(s => s.id === hit.b.segmentId) : undefined;
      if (!segment || segment.kind !== "line") throw new Error("moat-bridge");
      const tangent = unit(evaluateAnchor(moat, hit.a, true)),
        axis = unit(evaluateAnchor(road, hit.b, true)),
        sine = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0]),
        width = widthAt(road, hit.b),
        // Water plus a dry landing each side, measured along the road, plus the deck's own half width.
        cosine = Math.sqrt(Math.max(0, 1 - sine * sine)),
        span =
          (half + 1.2 + (Math.max(width.left, width.right) * cosine) / Math.max(sine, 0.1)) / Math.max(sine, 0.1) + 0.5,
        dt = span / distance(segment.from, segment.to);
      if (hit.b.t - dt <= 0 || hit.b.t + dt >= 1) throw new Error("moat-bridge");
      let bridgeId = `auto-moat-bridge:${number++}`;
      while (Object.hasOwn(doc.connections.bridges, bridgeId)) bridgeId = `auto-moat-bridge:${number++}`;
      doc.connections.bridges[bridgeId] = {
        id: bridgeId,
        roadPathId: road.id,
        riverAnchor: hit.a,
        from: { ...hit.b, t: hit.b.t - dt },
        to: { ...hit.b, t: hit.b.t + dt },
        structure: settings.wallMaterial === "wood" ? "timber" : "stone",
        dryLandingMeters: 1,
        editPolicy: "editable"
      };
    }
  return doc;
}
/** Gates wherever a road or river crosses the wall. */
function gateWall(doc: VectorCityDocument, id: string, settings: VectorGenerationSettings): VectorCityDocument {
  for (const path of Object.values(doc.paths).filter(p => p.id !== id && (p.role === "road" || p.role === "river")))
    for (const hit of pathIntersections(doc.paths[id], path)) {
      const tangent = unit(evaluateAnchor(doc.paths[id], hit.a, true)),
        axis = unit(evaluateAnchor(path, hit.b, true)),
        width = widthAt(path, hit.b),
        angle = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0]);
      if (angle < 0.1) throw new Error("gate-access");
      const opening = (width.left + width.right) / angle + 2 * settings.clearanceMeters + 0.1;
      const prior = Object.values(doc.connections.gates).find(
        g =>
          g.wallPathId === id &&
          distance(evaluateAnchor(doc.paths[id], g.anchor), evaluateAnchor(doc.paths[id], hit.a)) < 1e-5
      );
      if (prior) {
        prior.widthMeters = Math.max(prior.widthMeters, opening);
        joinVectorGenerationAnchors(doc, [prior.anchor, hit.b]);
      } else doc = createVectorGate(doc, hit.a, hit.b, opening, path.role === "road" ? "passage" : "water");
    }
  return doc;
}
/**
 * The mesh editor's concentric plans (P4d), laid before the routed streets: a circulade's organic rings, spokes
 * and through street (`planCirculadeLayout`), or Bram's sixteen-sided core (`planPolygonalCirculadeLayout`), around
 * the site centre and sized to the built-up disc as the mesh editor sizes them. Rings and spokes are side streets;
 * the through street is a main street. Each line breaks where it would cross water, a civic precinct or a wall.
 */
function layConcentricStreets(doc: VectorCityDocument, settings: VectorGenerationSettings, extended: Set<string>) {
  const hub = doc.site!.center,
    radius = Math.max(...doc.site!.domain.flatMap(d => d.outer.map(p => distance(p, hub)))),
    walled = Object.values(doc.paths).some(p => p.role === "wall"),
    urban = urbanDiskRadiusMeters(radius, walled),
    plan =
      settings.layout === "bram"
        ? planPolygonalCirculadeLayout(hub, settings.seed, bramCoreRadiusMeters(urban), true, 16)
        : planCirculadeLayout(hub, urban, settings.seed, true),
    main = settings.roadWidthMeters / 2,
    side = main * MINOR_STREET_WIDTH_RATIO;
  for (const ring of plan.ringRoads) layRoadRuns(doc, ring, true, "auto-ring", side, settings, extended);
  for (const spoke of plan.radialRoads) layRoadRuns(doc, spoke, false, "auto-spoke", side, settings, extended);
  layRoadRuns(doc, plan.throughRoad, false, "auto-through", main, settings, extended);
}
/** The line of a razed wall as open road runs, cut back from water by the road's clearance (P4b). The runs are
 * reached by the street routing, so their ends are no route ports. */
function boulevard(
  doc: VectorCityDocument,
  line: VectorPath,
  settings: VectorGenerationSettings,
  extended: Set<string>
) {
  const points = samplePath(line).map(s => s.point);
  layRoadRuns(doc, points, true, "auto-boulevard", settings.roadWidthMeters / 2, settings, extended);
}
/**
 * Lay `points` as generated roads, broken wherever they would enter water, a reserved precinct, a wall or the
 * site edge (kept off by the road's clearance). A closed line that stays clear is one closed road. Runs shorter
 * than 10 m are dropped; the ends of the runs are no route ports, the street routing reaches them.
 */
function layRoadRuns(
  doc: VectorCityDocument,
  points: Point[],
  closed: boolean,
  prefix: string,
  half: number,
  settings: VectorGenerationSettings,
  extended: Set<string>
) {
  const line = closed && distance(points[0], points.at(-1)!) >= 1e-6 ? [...points, points[0]] : points,
    keepOff = [
      ...allVectorWater(doc).map(w => ({ outer: w.outer, holes: w.holes })),
      ...featureReservations(doc),
      ...walls(doc)
    ],
    reach = half + settings.clearanceMeters + 1,
    clear = (p: Point) =>
      containsRegion(doc.site!.domain, p) &&
      doc.site!.domain.every(d => ringDistance(p, d.outer) > reach) &&
      !keepOff.some(w => containsRegion([w], p)) &&
      keepOff.every(w => ringDistance(p, w.outer) > reach && w.holes.every(h => ringDistance(p, h) > reach)),
    dense = densify(line, 2, closed);
  let number = 0;
  const road = (run: Point[], isClosed: boolean) => {
    let id = `${prefix}:${number++}`;
    while (Object.hasOwn(doc.paths, id)) id = `${prefix}:${number++}`;
    doc.paths[id] = {
      id,
      revision: 0,
      role: "road",
      origin: "automatic",
      editPolicy: "editable",
      source: curveSource(run, "freehand", isClosed, 0.1),
      width: { leftMeters: half, rightMeters: half, stations: [] }
    };
    extended.add(id);
  };
  if (closed && dense.every(clear)) {
    road(dense, true);
    return;
  }
  let run: Point[] = [];
  const flush = () => {
    if (run.length >= 2) {
      let length = 0;
      for (let i = 1; i < run.length; i++) length += distance(run[i - 1], run[i]);
      if (length > 10) road(run, false);
    }
    run = [];
  };
  // A closed line starts its walk at a blocked point so no run is split across the seam.
  const start = closed ? dense.findIndex(p => !clear(p)) : -1;
  for (let i = 1; i <= dense.length; i++) {
    const p = dense[closed ? (start + i) % dense.length : i - 1];
    if (!clear(p)) flush();
    else if (!run.length || distance(run.at(-1)!, p) > 1e-3) run.push(p);
  }
  flush();
}
function densify(ring: Point[], step: number, closed = true): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1],
      n = Math.max(1, Math.ceil(distance(a, b) / step));
    for (let k = 0; k < n; k++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (!out.length || distance(out.at(-1)!, p) > 1e-3) out.push(p);
    }
  }
  if (!closed) {
    if (distance(out.at(-1)!, ring.at(-1)!) > 1e-3) out.push(ring.at(-1)!);
    return out;
  }
  // The closing point repeats the first; the ring is returned open.
  while (out.length > 1 && distance(out[0], out.at(-1)!) <= 1e-3) out.pop();
  return out;
}
const ringDistance = (p: Point, ring: Point[]) =>
  Math.min(...ring.map((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length])));
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** Parameter along `a`→`b` where it crosses segment `c`→`d`, if it does. */
function segmentHit(a: Point, b: Point, c: Point, d: Point): number | undefined {
  const r: Point = [b[0] - a[0], b[1] - a[1]],
    q: Point = [d[0] - c[0], d[1] - c[1]],
    den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return undefined;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den,
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}
export function reachablePaths(doc: VectorCityDocument, center: Point): Set<string> {
  const nodes = Object.values(doc.connections.nodes);
  if (!nodes.length) return new Set();
  const root = [...nodes].sort((a, b) => distance(a.position, center) - distance(b.position, center))[0],
    reached = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of Object.values(doc.connections.edges))
      if (reached.has(edge.fromNodeId) || reached.has(edge.toNodeId)) {
        if (!reached.has(edge.fromNodeId) || !reached.has(edge.toNodeId)) changed = true;
        reached.add(edge.fromNodeId);
        reached.add(edge.toNodeId);
      }
  }
  return new Set(
    Object.values(doc.connections.edges)
      .filter(e => reached.has(e.fromNodeId) && reached.has(e.toNodeId))
      .map(e => e.pathId)
  );
}
export function frontages(region: VectorPolygon, road: VectorPath): VectorBlock["frontage"] {
  const result: VectorBlock["frontage"] = [],
    surface = pathSurface(road);
  for (const ring of [region.outer, ...region.holes])
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy);
      if (len < 1e-7) continue;
      for (const boundary of [surface.outer, ...surface.holes])
        for (let j = 0; j < boundary.length; j++) {
          const p = boundary[j],
            q = boundary[(j + 1) % boundary.length];
          if (
            Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len > 1e-5 ||
            Math.abs(dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / len > 1e-5
          )
            continue;
          const t = (r: Point) => ((r[0] - a[0]) * dx + (r[1] - a[1]) * dy) / (len * len),
            lo = Math.max(0, Math.min(t(p), t(q))),
            hi = Math.min(1, Math.max(t(p), t(q)));
          if ((hi - lo) * len > 1e-5)
            result.push({
              pathId: road.id,
              from: [a[0] + dx * lo, a[1] + dy * lo],
              to: [a[0] + dx * hi, a[1] + dy * hi],
              lengthMeters: (hi - lo) * len
            });
        }
    }
  return result;
}
/** Clipping can leave a zero-width spike (A, B, A) where a lane end touches a block edge. The spike encloses
 * no land, so removing it keeps the area while making the ring simple; rings that collapse are dropped. */
function withoutSpikes(ring: Point[]): Point[] {
  const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) <= 1e-9 && Math.abs(a[1] - b[1]) <= 1e-9;
  const result = ring.slice();
  let changed = true;
  while (changed && result.length >= 3) {
    changed = false;
    for (let i = 0; i < result.length && result.length >= 3; i++) {
      const previous = result[(i - 1 + result.length) % result.length],
        next = result[(i + 1) % result.length];
      if (same(result[i], next)) {
        result.splice(i, 1);
        changed = true;
        break;
      }
      if (same(previous, next)) {
        // Drop the spike tip and the duplicate that returns to its base.
        const j = (i + 1) % result.length;
        result.splice(Math.max(i, j), 1);
        result.splice(Math.min(i, j), 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}
function despike(polygons: VectorPolygon[]): VectorPolygon[] {
  return polygons.flatMap(p => {
    const outer = withoutSpikes(p.outer);
    if (outer.length < 3 || regionArea({ outer, holes: [] }) <= 1e-9) return [];
    const holes = p.holes.map(withoutSpikes).filter(h => h.length >= 3 && regionArea({ outer: h, holes: [] }) > 1e-9);
    return [{ outer, holes }];
  });
}
/** The clipping library may return a hole that touches its outer ring at a vertex (a reservation box against a
 * road, say). A saved block needs every hole strictly inside, so such a hole is grown by 1 cm about its centre
 * and cut again: it becomes a notch in the outline. Seeds whose skeleton hit this failed to generate at all. */
function openTouchingHoles(polygons: VectorPolygon[]): VectorPolygon[] {
  return polygons.flatMap(polygon => {
    const touching = polygon.holes.filter(h => h.some(p => !pointInPolygon(p, polygon.outer)));
    if (!touching.length) return [polygon];
    const grown = touching.map(hole => {
      const c = polygonCentroid(hole);
      return {
        outer: hole.map(p => {
          const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
          return [p[0] + ((p[0] - c[0]) / d) * 0.01, p[1] + ((p[1] - c[1]) / d) * 0.01] as Point;
        }),
        holes: []
      };
    });
    return regionBoolean(
      [{ outer: polygon.outer, holes: polygon.holes.filter(h => !touching.includes(h)) }],
      grown,
      "difference"
    );
  });
}
export function deriveVectorBlocks(doc: VectorCityDocument, extra: VectorPolygon[] = []): VectorBlock[] {
  const roads = Object.values(doc.paths).filter(p => p.role === "road"),
    land = openTouchingHoles(
      despike(regionBoolean(freeLand(doc), [...roads.map(pathSurface), ...extra], "difference"))
    ),
    reachable = reachablePaths(doc, doc.site!.center);
  return land.map((polygon, i) => {
    const frontage = roads.flatMap(p => frontages(polygon, p));
    return {
      id: `block:${i}`,
      outer: polygon.outer,
      holes: polygon.holes,
      areaMeters2: regionArea(polygon),
      frontage,
      reachable: frontage.some(f => reachable.has(f.pathId))
    };
  });
}
export interface VectorGenerationResult {
  document: VectorCityDocument;
  stages: { id: "inputs" | "skeleton" | "regions"; document: VectorCityDocument }[];
}
/** Adopted geometry is computed here, never while rendering or loading a document. */
export function generateVectorSkeleton(
  input: VectorCityDocument,
  settings: VectorGenerationSettings = DEFAULT_VECTOR_GENERATION,
  timings?: GenerationTimingObserver,
  routingTimings?: GenerationTimingObserver
): VectorGenerationResult {
  try {
    return skeleton(input, settings, timings, routingTimings);
  } catch (error) {
    // An old town walled before its streets can leave land between the walls that no approach reaches (a river
    // cutting the ring). The mesh editor then falls back too; here the old-town wall is cut into the laid streets.
    if (settings.innerWall?.order !== "inner-first" || String(error) !== "Error: fixed-port-unreachable") throw error;
    const result = skeleton(input, { ...settings, innerWall: { ...settings.innerWall, order: "outer-first" } });
    for (const doc of [result.document, ...result.stages.map(s => s.document)])
      doc.generation?.diagnostics.push({
        code: "inner-first-fallback",
        entityId: "auto-inner-wall",
        severity: "warning"
      });
    return result;
  }
}
function skeleton(
  input: VectorCityDocument,
  settings: VectorGenerationSettings,
  timings?: GenerationTimingObserver,
  routingTimings?: GenerationTimingObserver
): VectorGenerationResult {
  const timed = generationTiming(timings);
  assertVectorDocument(input);
  if (input.urban) throw new Error("urban-generated");
  if (!input.site) throw new Error("site-required");
  if (
    !(
      Number.isFinite(settings.roadWidthMeters) &&
      settings.roadWidthMeters > 0 &&
      settings.roadWidthMeters <= 50 &&
      Number.isFinite(settings.clearanceMeters) &&
      settings.clearanceMeters >= 0 &&
      settings.clearanceMeters <= 30 &&
      Number.isInteger(settings.branches) &&
      settings.branches >= 0 &&
      settings.branches <= 24 &&
      settings.seed.length <= 256 &&
      vectorWallSettings(settings)
    )
  )
    throw new Error("invalid-generation-settings");
  let doc = structuredClone(input);
  const old = doc.generation;
  if (old) {
    const ids = new Set(Object.keys(old.pathRevisions));
    if (
      Object.entries(old.pathRevisions).some(
        ([id, revision]) =>
          doc.paths[id]?.revision !== revision ||
          doc.paths[id].origin !== "automatic" ||
          doc.paths[id].editPolicy !== "editable"
      ) ||
      old.connectionFingerprint !== generationFingerprint(doc, ids)
    )
      throw new Error("edited-generation");
    delete doc.generation;
    // A generated castle goes with the paths it owns.
    if (doc.environment?.features[CASTLE_FEATURE_ID]) {
      for (const placement of doc.environment.features[CASTLE_FEATURE_ID].placementIds)
        delete doc.placements[placement];
      delete doc.environment.features[CASTLE_FEATURE_ID];
    }
    // So does a generated harbour (P5b).
    if (doc.environment?.harbor?.id === GENERATED_HARBOR_ID) delete doc.environment.harbor;
    for (const id of [...ids].sort(
      (a, b) => Number(doc.paths[a].role === "wall") - Number(doc.paths[b].role === "wall")
    ))
      doc = removeVectorPath(doc, id);
  }
  delete doc.generation;
  const stages: VectorGenerationResult["stages"] = [{ id: "inputs", document: structuredClone(doc) }],
    before = new Set(Object.keys(doc.paths)),
    center = doc.site!.center;
  const diagnostics: { code: string; entityId: string; severity: "warning" | "error" }[] = [];
  timed("source-validation-and-clone");
  /** Fixed roads continued through a wall shape by a generated approach; their own ends are no route ports. */
  const extended = new Set<string>();
  let deferredInner: { make: (scale: number) => VectorPath; parent: string; scale: number } | undefined;
  if (settings.wall !== "none" && !Object.values(doc.paths).some(p => p.role === "wall")) {
    const ring = doc.site!.domain[0].outer,
      minX = Math.min(...ring.map(p => p[0])),
      maxX = Math.max(...ring.map(p => p[0])),
      minY = Math.min(...ring.map(p => p[1])),
      maxY = Math.max(...ring.map(p => p[1]));
    const id = "auto-wall",
      center: Point = [(minX + maxX) / 2, (minY + maxY) / 2],
      half = (maxX - minX) / 2,
      halfY = (maxY - minY) / 2,
      shape = settings.wall,
      inner = settings.innerWall,
      innerId = "auto-inner-wall",
      // The old town takes `share` of the walled area; outlines scale about the centre.
      innerScale = Math.sqrt(inner?.share ?? 1);
    const attempts: { rotation: number; scale: number }[] = [];
    const wallPath = (source: VectorPath["source"], pathId = id): VectorPath => ({
      id: pathId,
      revision: 0,
      role: "wall",
      origin: "automatic",
      editPolicy: "editable",
      source,
      width: settings.wallMaterial
        ? {
            leftMeters: VECTOR_WALL_WIDTH_METERS[settings.wallMaterial] / 2,
            rightMeters: VECTOR_WALL_WIDTH_METERS[settings.wallMaterial] / 2,
            stations: []
          }
        : { leftMeters: 1, rightMeters: 1, stations: [] }
    });
    // Standing water (sea, lake) the wall must keep off: as the mesh editor's `placeRing`, the outline is pulled in
    // ray by ray to stay clear of it, and straight sides survive where the water does not reach them (P5a).
    const seaRings = doc.site!.water.filter(w => !w.riverPathId).flatMap(w => w.polygons),
      seaClearance = 6;
    const clearOfSea = (ring: Point[]): Point[] => {
      if (!seaRings.length) return ring;
      const wet = (p: Point) =>
        containsRegion(seaRings, p) ||
        seaRings.some(w => [w.outer, ...w.holes].some(r => ringDistance(p, r) < seaClearance));
      const dense = densify([...ring, ring[0]], 4);
      if (!dense.some(wet)) return ring;
      const pulled = dense.map(p => {
        if (!wet(p)) return p;
        let lo = 0,
          hi = 1;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2,
            q: Point = [center[0] + (p[0] - center[0]) * mid, center[1] + (p[1] - center[1]) * mid];
          if (wet(q)) hi = mid;
          else lo = mid;
        }
        return [center[0] + (p[0] - center[0]) * lo, center[1] + (p[1] - center[1]) * lo] as Point;
      });
      // Eased by the wall's own thickness, so the pulled line has no kinks narrower than the wall.
      const simple = simplifyFreehand([...pulled, pulled[0]], 4.5).slice(0, -1);
      return simple.filter((p, i) => i === 0 || distance(p, simple[i - 1]) > 0.05);
    };
    const ringAt = (rotation: number, scale = 1) =>
      clearOfSea(
        vectorUnitWallRing(settings.seed, shape as WallShape, settings.wallSides, rotation).map(
          ([x, y]) => [center[0] + x * half * scale, center[1] + y * halfY * scale] as Point
        )
      );
    const preset = (pathId: string, scale: number) =>
      wallPath(
        {
          kind: "preset",
          preset: shape as "rectangle" | "ellipse",
          center,
          widthMeters: (maxX - minX) * scale,
          heightMeters: (maxY - minY) * scale,
          bearingDegrees: 90
        },
        pathId
      );
    if (isVectorWallShape(shape)) {
      // A shape is turned (48 steps) until every road and river crosses it at a gate-worthy angle (P4a); the mesh editor
      // squares the wall at rivers instead, which an outline drawn on the site has no cells to do.
      const fixed = Object.values(doc.paths).filter(p => p.role === "road" || p.role === "river"),
        // An approach continued through the wall runs from the road's inner end toward the centre.
        approaches = fixed
          .filter(p => p.role === "road" && !pathIsClosed(p))
          .flatMap((road, i): VectorPath[] => {
            const end = roadEndpoints(road)
              .map(a => evaluateAnchor(road, a))
              .sort((a, b) => distance(a, center) - distance(b, center))[0];
            return distance(end, center) > 1
              ? [{ ...road, id: `approach-probe:${i}`, source: curveSource([end, center], "polyline", false) }]
              : [];
          }),
        crossers = [...fixed, ...approaches],
        // The site's own bridges (a synthesized river, an FMG crossing) stand clear of the wall.
        siteDecks = Object.values(doc.connections.bridges).map(b => ({
          outer: bridgeGeometry(doc, b, vectorWaterSurfaces(doc)).deck,
          holes: []
        })),
        steepEnough = (path: VectorPath) =>
          wallCrossingsFit(path, crossers, settings) &&
          !regionBoolean([pathSurface(path)], siteDecks, "intersection").some(r => regionArea(r) > 1e-5);
      // A wall that cannot clear the site's own bridges at any turn is drawn a little inside the site edge.
      const turns = [1, 0.94, 0.88].flatMap(scale =>
          Array.from({ length: 48 }, (_, k) => ({ rotation: (k * Math.PI) / 24, scale }))
        ),
        fits = turns.filter(
          ({ rotation, scale }) =>
            steepEnough(wallPath(curveSource(ringAt(rotation, scale), "polyline", true))) &&
            (!inner ||
              steepEnough(wallPath(curveSource(ringAt(rotation, innerScale * scale), "polyline", true), innerId)))
        );
      // The checks above are geometric; a rotation whose gates still fail validation gives way to the next one.
      attempts.push(...fits, ...turns.filter(t => t.scale === 1 && !fits.includes(t)));
    } else attempts.push({ rotation: 0, scale: 1 });
    const start = doc;
    let failure: unknown;
    // A town moat that no rotation can bridge squarely gives way to the wall alone, as the mesh editor's
    // fallback drops a moat it cannot fit.
    for (const withMoat of settings.townMoat ? [true, false] : [false]) {
      failure = undefined;
      if (!withMoat && settings.townMoat)
        diagnostics.push({ code: "town-moat-unplaced", entityId: TOWN_MOAT_ID, severity: "warning" });
      for (const { rotation, scale: outerScale } of attempts) {
        try {
          const tried = new Set(extended);
          let next = structuredClone(start);
          if (isVectorWallShape(shape)) {
            next.paths[id] = wallPath(curveSource(ringAt(rotation, outerScale), "polyline", true));
            if (inner)
              next.paths[innerId] = wallPath(
                curveSource(ringAt(rotation, innerScale * outerScale), "polyline", true),
                innerId
              );
          } else {
            next.paths[id] = preset(id, 1);
            if (inner) next.paths[innerId] = preset(innerId, innerScale);
          }
          next = setWallCircuit(next, id);
          if (isVectorWallShape(shape) || inner) extendApproachesThroughWall(next, id, center, settings, tried);
          next = gateWall(next, id, settings);
          if (withMoat) {
            next = addTownMoat(next, id, settings);
            assertVectorDocument(next);
          }
          deferredInner = undefined;
          if (inner) {
            const outerCircuit = Object.values(next.connections.circuits).find(c => c.pathId === id)!.id;
            if (inner.state === "razed") {
              // A razed old-town wall leaves its line as a boulevard as wide as the main roads (mesh editor §4.3),
              // broken where water runs through it.
              const line = next.paths[innerId];
              delete next.paths[innerId];
              boulevard(next, line, settings, tried);
            } else if (inner.order === "inner-first") {
              // The old town is walled before any street: gates open only where the approaches run in, and the
              // streets reach the old town through them (mesh editor inner-first).
              next = setWallCircuit(next, innerId, outerCircuit);
              extendApproachesThroughWall(next, innerId, center, settings, tried);
              next = gateWall(next, innerId, settings);
            } else {
              // Outer-first, the mesh editor's historical order: the old-town wall is cut into the streets
              // afterwards, with a gate wherever a street crosses it.
              const turned = rotation;
              deferredInner = {
                make: scale =>
                  isVectorWallShape(shape)
                    ? wallPath(curveSource(ringAt(turned, innerScale * outerScale * scale), "polyline", true), innerId)
                    : preset(innerId, innerScale * scale),
                parent: outerCircuit,
                scale: innerScale
              };
              delete next.paths[innerId];
            }
          }
          doc = next;
          for (const road of tried) extended.add(road);
          failure = undefined;
          break;
        } catch (error) {
          failure ??= error;
        }
      }
      if (!failure) break;
    }
    if (failure) throw failure;
  }
  let bridgeNumber = 0;
  for (const river of Object.values(doc.paths).filter(p => p.role === "river" && p.id !== TOWN_MOAT_ID)) {
    if (Object.values(doc.connections.bridges).some(b => b.riverAnchor.pathId === river.id)) continue;
    const samples = samplePath(river).filter(s => containsRegion(doc.site!.domain, s.point));
    const candidate = samples.sort((a, b) => distance(a.point, center) - distance(b.point, center))[0];
    // Linear paths need interior candidates too; samples intentionally do not densify straight source segments.
    let anchor = candidate?.anchor;
    if (river.source.kind === "curve") {
      const candidates = river.source.segments
        .flatMap(s => Array.from({ length: 17 }, (_, i) => ({ pathId: river.id, segmentId: s.id, t: i / 16 })))
        .filter(a => containsRegion(doc.site!.domain, evaluateAnchor(river, a)))
        .sort((a, b) => distance(evaluateAnchor(river, a), center) - distance(evaluateAnchor(river, b), center));
      anchor = candidates[0] ?? anchor;
    }
    if (!anchor) continue;
    try {
      doc = proposeSquareBridge(
        doc,
        anchor,
        settings.roadWidthMeters,
        settings.roadWidthMeters / 2 + settings.clearanceMeters + 2,
        "stone"
      );
      const created = Object.values(doc.connections.bridges).find(
        b => !before.has(b.roadPathId) && !b.roadPathId.startsWith("auto-bridge-road:")
      );
      if (created) {
        const oldId = created.roadPathId;
        let newId = `auto-bridge-road:${bridgeNumber++}`;
        while (Object.hasOwn(doc.paths, newId)) newId = `auto-bridge-road:${bridgeNumber++}`;
        doc.paths[newId] = { ...doc.paths[oldId], id: newId };
        delete doc.paths[oldId];
        mapDocumentAnchors(doc, a => (a.pathId === oldId ? { ...a, pathId: newId } : a));
        for (const edge of Object.values(doc.connections.edges)) if (edge.pathId === oldId) edge.pathId = newId;
        created.roadPathId = newId;
      }
    } catch {
      diagnostics.push({ code: "bridge-unavailable", entityId: river.id, severity: "warning" });
    }
  }
  const waters = allVectorWater(doc),
    decks = Object.values(doc.connections.bridges).map(b => ({
      outer: bridgeGeometry(doc, b, vectorWaterSurfaces(doc)).deck,
      holes: []
    }));
  for (const road of Object.values(doc.paths).filter(p => p.role === "road")) {
    const inDomain = regionBoolean([pathSurface(road)], doc.site!.domain, "intersection");
    const exposed = regionBoolean(inDomain, decks, "difference");
    if (regionBoolean(exposed, waters, "intersection").some(r => regionArea(r) > 1e-5))
      throw new Error(`unbridged-road:${road.id}`);
  }
  timed("walls-gates-bridges");
  if (settings.layout === "circulade" || settings.layout === "bram") layConcentricStreets(doc, settings, extended);
  // The castle precinct is reserved before the streets are routed, as the mesh editor sites it (P4e).
  if (settings.castle && !reserveVectorCastle(doc, settings))
    diagnostics.push({ code: "castle-unplaced", entityId: CASTLE_FEATURE_ID, severity: "warning" });
  const free = freeLand(doc);
  if (!containsRegion(free, center)) throw new Error("site-center-blocked");
  const ports: Point[] = [[...center]],
    bindings: CurveAnchor[][] = [[]];
  for (const road of Object.values(doc.paths).filter(
    p => p.role === "road" && !pathIsClosed(p) && !extended.has(p.id)
  )) {
    const endpoints = roadEndpoints(road).sort(
      (a, b) => distance(evaluateAnchor(road, a), center) - distance(evaluateAnchor(road, b), center)
    );
    const a = endpoints.find(a => containsRegion(free, evaluateAnchor(road, a)));
    if (a) {
      ports.push(evaluateAnchor(road, a));
      bindings.push([a]);
    }
  }
  const required = ports.length;
  const bounds = doc.site!.domain[0].outer,
    radius =
      Math.min(
        Math.max(...bounds.map(p => Math.abs(p[0] - center[0]))),
        Math.max(...bounds.map(p => Math.abs(p[1] - center[1])))
      ) * 0.72;
  let hash = 2166136261;
  for (const c of settings.seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  for (let i = 0; i < settings.branches; i++) {
    const angle = (i / settings.branches + (hash >>> 0) / 2 ** 32) * 2 * Math.PI,
      p: Point = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
    if (containsRegion(free, p)) {
      ports.push(p);
      bindings.push([]);
    }
  }
  const links: RouteLink[] = Object.values(doc.connections.bridges).map(b => {
    const road = doc.paths[b.roadPathId],
      ends = roadEndpoints(road);
    return {
      from: evaluateAnchor(road, ends[0]),
      to: evaluateAnchor(road, ends[1]),
      cost: samplePath(road).at(-1)!.distance,
      pathId: road.id
    };
  });
  timed("road-free-land-and-ports");
  const route = skeletonRoutes(
    free,
    ports,
    links,
    settings.roadWidthMeters / 2 + settings.clearanceMeters + 0.011,
    routingTimings,
    required
  );
  timed("road-search");
  if (route.unreachable.some(i => i < required)) throw new Error("fixed-port-unreachable");
  for (const i of route.unreachable)
    diagnostics.push({ code: "branch-unreachable", entityId: `target:${i}`, severity: "warning" });
  while (bindings.length < route.points.length) bindings.push([]);
  let number = 0;
  for (const edge of route.edges) {
    if (edge.pathId) {
      const ends = roadEndpoints(doc.paths[edge.pathId]);
      for (const end of ends) {
        const p = evaluateAnchor(doc.paths[end.pathId], end),
          i = route.points.findIndex(q => distance(p, q) < 1e-6);
        if (i >= 0) bindings[i].push(end);
      }
      continue;
    }
    const from = route.points[edge.a],
      to = route.points[edge.b];
    if (distance(from, to) < 1e-6) continue;
    // Side streets are narrower than the main streets that run from the gates to the centre.
    const half = (settings.roadWidthMeters * (edge.minor ? MINOR_STREET_WIDTH_RATIO : 1)) / 2;
    let id = `auto-road:${number++}`;
    while (Object.hasOwn(doc.paths, id)) id = `auto-road:${number++}`;
    doc.paths[id] = {
      id,
      revision: 0,
      role: "road",
      origin: "automatic",
      editPolicy: "editable",
      source: curveSource([from, to], "polyline", false),
      width: { leftMeters: half, rightMeters: half, stations: [] }
    };
    bindings[edge.a].push({ pathId: id, segmentId: "segment:0", t: 0 });
    bindings[edge.b].push({ pathId: id, segmentId: "segment:0", t: 1 });
  }
  for (let i = 0; i < bindings.length; i++) {
    const all = bindings.flatMap((b, j) => (distance(route.points[i], route.points[j]) < 1e-6 ? b : []));
    joinVectorGenerationAnchors(doc, all);
  }
  timed("road-materialization");
  const roads = Object.values(doc.paths).filter(p => p.role === "road");
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++)
      for (const hit of pathIntersections(roads[i], roads[j]))
        if (containsRegion(free, evaluateAnchor(roads[i], hit.a))) joinVectorGenerationAnchors(doc, [hit.a, hit.b]);
  rebuildRoadGraph(doc);
  connectVectorCivicCentre(doc);
  if (deferredInner) {
    // The line is eased in or out a little until every street crosses it steeply, clear of its corners, of the
    // next gate and of protected sites; the streets were laid without it.
    const crossers = Object.values(doc.paths).filter(p => p.role === "road" || p.role === "river"),
      blocked = [...vectorOccupiedSites(doc, "reserved"), ...featureReservations(doc)],
      // The old town takes in the civic centre, so the line may also grow until it clears those sites.
      candidates = [0, ...Array.from({ length: 40 }, (_, i) => (i % 4 === 3 ? -1 : 1) * 0.02 * (1 + (i >> 1)))]
        .filter(d => deferredInner!.scale * (1 + d) <= 0.9)
        .map(d => deferredInner!.make(1 + d)),
      // A line clear of the civic sites is preferred; one through a precinct too large for the old town comes next.
      // A line whose gates still fail validation gives way to the next one.
      clear = candidates.filter(c => wallCrossingsFit(c, crossers, settings, blocked)),
      ordered = [
        ...clear,
        ...candidates.filter(c => !clear.includes(c) && wallCrossingsFit(c, crossers, settings, blocked, true))
      ];
    let placed = false;
    for (const path of ordered)
      try {
        let next = structuredClone(doc);
        next.paths[path.id] = path;
        next = setWallCircuit(next, path.id, deferredInner.parent);
        next = gateWall(next, path.id, settings);
        rebuildRoadGraph(next);
        assertVectorDocument(next);
        doc = next;
        placed = true;
        break;
      } catch {
        // the next line
      }
    // As the mesh editor's single-wall fallback: no line through the streets takes gates cleanly, so the town
    // keeps its outer wall alone.
    if (!placed) diagnostics.push({ code: "inner-wall-unplaced", entityId: "auto-inner-wall", severity: "warning" });
  }
  if (deferredInner) rebuildRoadGraph(doc);
  if (doc.regions[CASTLE_SITE_ID]) {
    doc = raiseVectorCastle(doc, settings);
    if (!doc.environment?.features[CASTLE_FEATURE_ID])
      diagnostics.push({ code: "castle-unplaced", entityId: CASTLE_FEATURE_ID, severity: "warning" });
  }
  // The harbour comes last: its quays link to the laid streets and keep off the walls and precincts (P5b).
  if (settings.port) {
    const harbor = raiseVectorHarbor(doc, settings);
    if ("document" in harbor) doc = harbor.document;
    else diagnostics.push({ code: "harbor-unplaced", entityId: harbor.failure, severity: "warning" });
  }
  doc.revision++;
  assertVectorDocument(doc);
  timed("connections-and-validation");
  stages.push({ id: "skeleton", document: structuredClone(doc) });
  const blocks = deriveVectorBlocks(doc);
  for (const b of blocks)
    if (!b.reachable) diagnostics.push({ code: "land-without-frontage", entityId: b.id, severity: "warning" });
  timed("land-blocks");
  const owned = Object.values(doc.paths).filter(p => !before.has(p.id));
  doc.revision++;
  doc.generation = {
    algorithm: "vector-skeleton-v1",
    sourceRevision: doc.site!.revision,
    settings: structuredClone(settings),
    pathRevisions: Object.fromEntries(owned.map(p => [p.id, p.revision])),
    connectionFingerprint: generationFingerprint(doc, new Set(owned.map(p => p.id))),
    blocks,
    diagnostics,
    inputNodes: Object.values(structuredClone(stages[0].document.connections.nodes)),
    inputRevision: doc.revision
  };
  assertVectorDocument(doc);
  stages.push({ id: "regions", document: structuredClone(doc) });
  timed("ledger-validation-and-snapshots");
  return { document: doc, stages };
}
