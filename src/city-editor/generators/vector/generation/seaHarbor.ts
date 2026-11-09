import { SHIP_DIMENSIONS } from "../../../data/ships";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorGenerationSettings, VectorPolygon } from "../../../types/vector/generation";
import type { VectorHarborPlan, VectorHarborShip } from "../../../types/vector/harbor";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { type HarborShore, planHarborOnShores } from "../../harborFabric";
import { type HarborWaterField, polygonHarborWaterField } from "../../harborNavigation";
import { allowedShipTypesForPeriod, isExplorationOrLater, type KnownPier, planShipsAtPiers } from "../../harborShips";
import { convexInfillParts } from "../../lotGeometry";
import { corridor, plotArea } from "../../parcelGeometry";
import type { ParcelFrontage } from "../../parcelTypes";
import { makeRng } from "../../prng";
import { MOORED_SHIP_STATE } from "../../shipDisplayState";
import { normalizeShipType } from "../../ships";
import { featureReservations } from "../environmentState";
import { evaluateAnchor } from "../geometry/curves";
import { bridgeGeometry, nearestRoadAnchor } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { vectorWaterSurfaces } from "../geometry/water";
import { validateVectorHarbor, vectorHarborWater } from "../harbor";
import { vectorOccupiedSites } from "../occupancy";

export const GENERATED_HARBOR_ID = "harbor:generated";
/** Harbour water depth. The mesh editor falls back to 3 m where a cell gives none, yet moors galleons there; the
 * stored plan checks each hull's real draft (a galleon's is over 3 m), so a sea port's water is 6 m deep, as the
 * mesh editor's harbour fixtures (P5b). */
const SEA_DEPTH_METERS = 6;
/** A navigable river's channel: enough for the river barges that berth at its short bank piers (P5b-3). */
const RIVER_DEPTH_METERS = 3;
/** The mesh editor's flat quay height over the sea where land cells have no elevation (`flatSeaDropMeters`). */
const WATER_BELOW_QUAY_METERS = 1;
/** Shore chords about the length of a mesh editor's harbour cell edge, straight to within a deck's tolerance. */
const SHORE_CHORD = { min: 12, max: 60, deviation: 1.5 };
/** Land behind a shore that its quay, yard and crane may use (a harbour cell's depth). */
const SHORE_LAND_DEPTH = 40;
/** A shore this near a point where the land blocks could not be cut round the harbour is left out on a retry. */
const FAULT_RADIUS = 30;

const area = (regions: VectorPolygon[]) => regions.reduce((n, r) => n + regionArea(r), 0);
const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const segments = (points: Point[], width: number): ParcelFrontage[] =>
  points.slice(1).flatMap((b, i) => {
    const a = points[i];
    return Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 ? [{ a, b, widthMeters: width }] : [];
  });
const roadWidth = (road: VectorPath) => road.width.leftMeters + road.width.rightMeters;

/**
 * Convex pieces of a region for the planner's barrier test, which knows no holes: a region with holes (a closed
 * wall's ring) is first cut through each hole, so its convex pieces do not cover the town inside it.
 */
function solidParts(region: VectorPolygon, depth = 0): Point[][] {
  const hole = region.holes[0];
  if (!hole || depth > 8) return convexInfillParts(region.outer);
  const x = polygonCentroid(hole)[0],
    ys = region.outer.map(p => p[1]),
    xs = region.outer.map(p => p[0]),
    y0 = Math.min(...ys) - 1,
    y1 = Math.max(...ys) + 1,
    side = (a: number, b: number) =>
      ring([
        [a, y0],
        [b, y0],
        [b, y1],
        [a, y1]
      ]);
  return [side(Math.min(...xs) - 1, x), side(x, Math.max(...xs) + 1)].flatMap(box =>
    regionBoolean([region], [box], "intersection").flatMap(part => solidParts(part, depth + 1))
  );
}

export type VectorHarborOutcome = { document: VectorCityDocument } | { failure: string };

/**
 * A sea harbour raised by the mesh editor's harbour and ship planners (`planHarborOnShores`, `planShipsAtPiers`) on
 * the meshless coast, instead of the harbour ward's cells (P5b): the coast within the town is cut into straight
 * shores of a harbour cell's length, each with the land behind it; the planner lays quays, yards, cranes, crane
 * quays, cargo piles and piers on them and links each quay to the nearest street, and ships moor at the piers, at
 * an anchorage and under the cranes. The plan is kept only when it validates as a fixed harbour.
 */
export function raiseVectorHarbor(
  doc: VectorCityDocument,
  settings: VectorGenerationSettings,
  avoid: readonly Point[] = []
): VectorHarborOutcome {
  try {
    return raise(doc, settings, avoid);
  } catch {
    // A polygon operation that fails on the coast leaves the town without a harbour, not without a skeleton.
    return { failure: "harbor-geometry" };
  }
}
function raise(
  doc: VectorCityDocument,
  settings: VectorGenerationSettings,
  avoid: readonly Point[]
): VectorHarborOutcome {
  const site = doc.site;
  if (!site) return { failure: "harbor-site" };
  if (doc.environment?.harbor) return { failure: "harbor-exists" };
  if (doc.environment?.terrain) return { failure: "harbor-relief" };
  // A river port needs the river's fixed physical water, which the stored plan's navigation is checked against.
  const bodies = vectorHarborWater(doc);
  if (!bodies) return { failure: "harbor-river" };
  if (!bodies.length) return { failure: "harbor-no-sea" };
  const water = bodies.map(b => b.polygon),
    depthOf = (k: number) => (bodies[k].river ? RIVER_DEPTH_METERS : SEA_DEPTH_METERS),
    land = regionBoolean(site.domain, water, "difference"),
    onLand = (p: Point) => containsRegion(land, p),
    roads = Object.values(doc.paths).filter(p => p.role === "road"),
    walls = Object.values(doc.paths).filter(p => p.role === "wall"),
    decks = Object.values(doc.connections.bridges).map(b =>
      ring(bridgeGeometry(doc, b, vectorWaterSurfaces(doc)).deck)
    ),
    blocked = [
      ...walls.map(pathSurface),
      ...decks,
      ...featureReservations(doc),
      ...vectorOccupiedSites(doc, "reserved"),
      ...Object.values(doc.regions).filter(r => r.kind === "reservation")
    ],
    roadSurfaces = roads.map(pathSurface),
    overlaps = (polygon: Point[], regions: VectorPolygon[]) =>
      polygon.length >= 3 && area(regionBoolean([ring(polygon)], regions, "intersection")) > 0.01;
  // The town reach: the outer wall, else the planned town radius (or 0.6 of the site's half width).
  const hub = site.center,
    reach = Math.max(
      ...walls.flatMap(w => samplePath(w).map(s => Math.hypot(s.point[0] - hub[0], s.point[1] - hub[1]))),
      site.descriptor?.frame.cityRadiusMeters ??
        0.6 * Math.min(...site.domain[0].outer.map(p => Math.max(Math.abs(p[0] - hub[0]), Math.abs(p[1] - hub[1]))))
    );

  // Shores: straight chords of the sea outline where it meets the land, inside the town reach.
  const shores: HarborShore[] = [],
    lands = new Map<string, Point[]>(),
    waterIds: string[] = [];
  bodies.forEach(({ polygon: sea, river }, k) => {
    const waterId = `harbor-water:${k}`,
      // Long straight edges are split so no shore runs longer than a harbour cell's edge.
      outline = sea.outer.flatMap((a, i) => {
        const b = sea.outer[(i + 1) % sea.outer.length],
          parts = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (SHORE_CHORD.max / 2)));
        return Array.from(
          { length: parts },
          (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / parts, a[1] + ((b[1] - a[1]) * k) / parts]
        );
      }),
      n = outline.length,
      coastal = outline.map((a, i) => {
        const b = outline[(i + 1) % n],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-6) return false;
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        return [1, -1].some(s => onLand([mid[0] + normal[0] * s, mid[1] + normal[1] * s]));
      });
    if (!coastal.some(Boolean)) return;
    waterIds[k] = waterId;
    // Start the walk on a dry edge so no coastal run is split across the seam.
    const first = coastal.every(Boolean) ? 0 : (coastal.findIndex(c => !c) + 1) % n;
    let i = first,
      steps = 0;
    while (steps < n) {
      if (!coastal[i % n]) {
        i++;
        steps++;
        continue;
      }
      let j = i + 1;
      for (let next = i + 1; next - i <= n && coastal[(next - 1) % n]; next++) {
        const a = outline[i % n],
          b = outline[next % n],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length > SHORE_CHORD.max) break;
        let straight = true;
        for (let m = i + 1; m < next && straight; m++)
          straight = pointSegmentDistance(outline[m % n], a, b) <= SHORE_CHORD.deviation;
        if (!straight) break;
        j = next;
      }
      const a = outline[i % n],
        b = outline[j % n],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      steps += j - i;
      i = j;
      if (
        length < SHORE_CHORD.min ||
        Math.hypot(mid[0] - hub[0], mid[1] - hub[1]) > reach ||
        avoid.some(p => pointSegmentDistance(p, a, b) < FAULT_RADIUS)
      )
        continue;
      let inward: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      if (!onLand([mid[0] + inward[0], mid[1] + inward[1]])) inward = [-inward[0], -inward[1]];
      if (!onLand([mid[0] + inward[0], mid[1] + inward[1]])) continue;
      const back = (p: Point): Point => [p[0] + inward[0] * SHORE_LAND_DEPTH, p[1] + inward[1] * SHORE_LAND_DEPTH],
        // The shore's land: the strip behind it, cut to the dry site and to the piece at the shore.
        piece = regionBoolean([ring([a, b, back(b), back(a)])], land, "intersection").find(
          r => !r.holes.length && containsRegion([r], [mid[0] + inward[0] * 1.2, mid[1] + inward[1] * 1.2])
        );
      if (!piece || !simpleContour(piece.outer, true)) continue;
      const id = `shore:${k}:${shores.length}`,
        landId = `harbor-land:${shores.length}`;
      lands.set(landId, piece.outer);
      // A river shore takes the planner's short bank piers (a quarter of the channel) and barges.
      shores.push({
        id,
        landId,
        waterId,
        ...(river ? { riverId: river } : {}),
        a,
        b,
        inward,
        length,
        depth: depthOf(k),
        water: outline
      });
    }
  });
  if (!shores.length) return { failure: "harbor-no-shore" };

  const streets = roads.flatMap(r =>
      segments(
        samplePath(r).map(s => s.point),
        roadWidth(r)
      )
    ),
    period = doc.context.historicalPeriod ?? "ageOfExploration",
    extent = doc.frame.extentMeters,
    navigationMasks = (minimumDepth = 0) => [
      ...land.map(polygon => ({ polygon, water: false })),
      ...water.map((polygon, k) => ({ polygon, water: depthOf(k) >= minimumDepth }))
    ],
    waterField = (minimumDepth = 0, obstacles: readonly Point[][] = []): HarborWaterField =>
      polygonHarborWaterField(
        extent,
        true,
        [...navigationMasks(minimumDepth), ...obstacles.map(o => ({ polygon: ring(o), water: false }))],
        true
      );
  let field: HarborWaterField | undefined;
  const plan = planHarborOnShores({
    shores,
    bankSpaces: [],
    streets,
    throughStreets: streets,
    barriers: blocked.flatMap(solidParts),
    // Harbour spaces keep off the streets; the cart path to a street stops at its kerb.
    isFree: polygon => !overlaps(polygon, blocked) && !overlaps(polygon, roadSurfaces),
    pathIsFree: (from, to) => {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]),
        kerb = Math.max(...streets.map(s => (pointSegmentDistance(to, s.a, s.b) < 0.01 ? s.widthMeters / 2 : 0))) + 0.3;
      if (length <= kerb) return true;
      const end: Point = [to[0] - ((to[0] - from[0]) / length) * kerb, to[1] - ((to[1] - from[1]) / length) * kerb];
      const path = corridor(from, end, 3, 0);
      return !overlaps(path, blocked) && !overlaps(path, roadSurfaces);
    },
    period,
    extentMeters: extent,
    landPolygon: id => lands.get(id),
    rootIsDry: (id, root) => {
      const polygon = lands.get(id);
      return !!polygon && pointInPolygon(root, polygon) && onLand(root);
    },
    connectable: p => onLand(p) && !containsRegion(blocked, p),
    preset: () => "dense",
    flatSite: () => true,
    waterBelowQuay: WATER_BELOW_QUAY_METERS,
    // Sea-going ships unload at a crane on the sea, not on the river.
    cargoWater: shore => !shore.riverId,
    waterField: () => (field ??= waterField())
  });

  // The quay paths that end on a street are the harbour's accesses.
  const accesses: VectorHarborPlan["accesses"] = plan.frontages
    .flatMap(f => {
      if (f.widthMeters !== 3) return [];
      const hit = roads
        .map(path => {
          const anchor: CurveAnchor = nearestRoadAnchor(path, f.b),
            target = evaluateAnchor(path, anchor);
          return { anchor, target, distance: Math.hypot(target[0] - f.b[0], target[1] - f.b[1]) };
        })
        .sort((x, y) => x.distance - y.distance)[0];
      return hit && hit.distance <= 0.05
        ? [{ points: [f.a, hit.target], widthMeters: f.widthMeters, road: hit.anchor }]
        : [];
    })
    .map((a, i) => ({ id: `harbor-access:${i}`, ...a }));
  if (!accesses.length) return { failure: "harbor-road-access" };

  const usedLands = new Set([
    ...plan.spaces.map(s => s.faceId),
    ...plan.piers.flatMap(p => (p.landFaceId ? [p.landFaceId] : [])),
    ...(plan.cargoQuays ?? []).map(q => q.landFaceId)
  ]);
  const knownPiers: KnownPier[] = plan.piers.flatMap(p => {
    if (!p.start || !p.end || !p.width) return [];
    const length = Math.hypot(p.end[0] - p.start[0], p.end[1] - p.start[1]);
    if (length < 5) return [];
    const dir: Point = [(p.end[0] - p.start[0]) / length, (p.end[1] - p.start[1]) / length];
    return [
      {
        id: p.id,
        landFaceId: p.landFaceId,
        waterFaceId: p.waterFaceId,
        ...(p.riverId ? { riverId: p.riverId } : {}),
        water: shores.find(s => s.landId === p.landFaceId)?.water,
        depth: p.depth,
        start: p.start,
        end: p.end,
        length,
        width: p.width,
        dir,
        normal: [-dir[1], dir[0]],
        polygon: p.polygon
      }
    ];
  });
  const seaLand = [...usedLands].find(id => shores.some(s => s.landId === id && !s.riverId)),
    firstLand = seaLand ? lands.get(seaLand) : undefined,
    crossingLines = [
      ...streets.map(s => ({ a: s.a, b: s.b, halfWidth: s.widthMeters / 2 })),
      ...decks.flatMap(d => segments([...d.outer, d.outer[0]], 0).map(s => ({ a: s.a, b: s.b, halfWidth: 0.5 })))
    ];
  const elements = planShipsAtPiers({
    piers: knownPiers,
    rng: makeRng(`${settings.seed}:harbor-ships:ships`),
    exploration: isExplorationOrLater(period),
    typesForWater: () => allowedShipTypesForPeriod(period),
    waterField,
    waterPolygons: new Map(water.flatMap((s, k) => (waterIds[k] ? [[waterIds[k], s.outer] as [string, Point[]]] : []))),
    landPolygons: land.map(l => l.outer),
    physicalWater: water.map(w => w.outer),
    crossingLines,
    // Only a sea port has a roadstead.
    ...(seaLand && firstLand
      ? {
          anchorage: {
            landId: seaLand,
            center: polygonCentroid(firstLand),
            sea: id => !bodies[waterIds.indexOf(id)]?.river,
            depth: id => depthOf(waterIds.indexOf(id))
          }
        }
      : {}),
    harborPiers: plan.piers.map(p => p.polygon),
    cargoQuays: plan.cargoQuays ?? [],
    cargoWater: () => true,
    waterDepth: id => depthOf(waterIds.indexOf(id)),
    fixedShips: []
  });
  const ships: VectorHarborShip[] = elements.flatMap(e => {
    const waterId = e.faceIds[0],
      landId = e.harborFaceId;
    if (!e.point || !waterId || !landId) return [];
    const type = normalizeShipType(e.shipType);
    return [
      {
        id: `harbor-ship:${e.id.replace(/^gc:/, "")}`,
        type,
        point: e.point,
        rotation: e.rotation ?? 0,
        length: e.sizeMeters ?? SHIP_DIMENSIONS[type].defaultSizeMeters,
        state: { ...MOORED_SHIP_STATE, ...e.shipState },
        landId,
        waterId,
        ...(e.harborOperation
          ? {
              cargo: {
                ...e.harborOperation,
                ...(e.harborOperation.sourceShipId
                  ? { sourceShipId: `harbor-ship:${e.harborOperation.sourceShipId.replace(/^gc:/, "")}` }
                  : {})
              }
            }
          : {})
      }
    ];
  });
  for (const s of ships) usedLands.add(s.landId);

  const harbor: VectorHarborPlan = {
    id: GENERATED_HARBOR_ID,
    editPolicy: "fixed",
    navigation: {
      extentMeters: extent,
      initialWater: true,
      openBoundary: true,
      land,
      water,
      depths: water.map((polygon, i) => ({
        id: `harbor-water:${i}`,
        polygon,
        depthMeters: depthOf(i),
        levelMeters: -WATER_BELOW_QUAY_METERS
      }))
    },
    lands: [...lands].filter(([id]) => usedLands.has(id)).map(([id, outer]) => ({ id, polygon: ring(outer) })),
    spaces: plan.spaces.flatMap(s =>
      (s.kind === "quay" || s.kind === "loading-yard") && plotArea(s.polygon) > 1 && simpleContour(s.polygon, true)
        ? [{ id: s.id, landId: s.faceId, kind: s.kind, polygon: ring(s.polygon) }]
        : []
    ),
    frontages: plan.frontages.map(f => ({
      a: f.a,
      b: f.b,
      widthMeters: f.widthMeters,
      ...(f.cargo ? { cargo: true } : {})
    })),
    accesses,
    piers: plan.piers.map(p => ({
      id: p.id,
      landId: p.landFaceId!,
      waterId: p.waterFaceId,
      polygon: ring(p.polygon),
      depthMeters: p.depth
    })),
    cranes: plan.cranes,
    quays: (plan.cargoQuays ?? []).map(({ landFaceId, waterFaceId, ...q }) => ({
      ...q,
      landId: landFaceId,
      waterId: waterFaceId
    })),
    cargoPiles: plan.cargoPiles,
    ships
  };
  const withHarbor = (h: VectorHarborPlan): VectorCityDocument => ({
    ...doc,
    environment: { features: {}, hidden: [], ...doc.environment, harbor: h }
  });
  let next = withHarbor(harbor),
    errors = validateVectorHarbor(next);
  // A ship the stored plan cannot re-solve (a crane berth or a channel) is left out rather than the harbour.
  if (errors.some(e => e.startsWith("harbor:ships"))) {
    const kept: VectorHarborShip[] = [];
    for (const ship of ships.filter(s => !s.cargo?.sourceShipId)) {
      const trial = withHarbor({ ...harbor, ships: [...kept, ship] });
      if (!validateVectorHarbor(trial).length) kept.push(ship);
    }
    for (const ship of ships.filter(s => s.cargo?.sourceShipId)) {
      const trial = withHarbor({ ...harbor, ships: [...kept, ship] });
      if (!validateVectorHarbor(trial).length) kept.push(ship);
    }
    next = withHarbor({ ...harbor, ships: kept });
    errors = validateVectorHarbor(next);
  }
  if (errors.length) return { failure: errors[0] };
  return { document: next };
}
