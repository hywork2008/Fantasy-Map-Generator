// Medieval landmarks that read at a glance from above (docs/city-editor/plan/1008-wards-and-features.md,
// "空からの視点で特に映える優先度"): monastery cloisters with herb gardens, windmills along the walls,
// barbicans in front of the main gates, tanneries at the downstream end of the river, and the
// permanent gallows on an approach road outside town. Watermills and harbour cranes live in
// watermillFabric.ts / harborFabric.ts. Everything here is derived from the finished document
// and the final building fabric; it never edits the mesh.
import { religiousHousesFor } from "../../../data/civilizationTraditions";
import { featureGroupVertices } from "../features";
import { circuitRing, polygonOverlaps, townGates } from "../fortifications";
import { landmarkReservationHits } from "../landmarks";
import { facePoints } from "../mesh";
import { GATE_TOWER_SCALE, gateCrossingFrame } from "../passages";
import { flowingRivers } from "../riverFlow";
import type { CityDocument, HistoricalPeriod, Id, Point } from "../types";
import { type DocumentWaterTest, documentWaterTest } from "../waterGeometry";
import type { BuildingLot } from "./buildingLots";
import { type OrientedRect, polygonHitsTempleYard, templeRectForElement } from "./civicPlacement";
import { type DomesticWaterPoint, placeDomesticWater } from "./domesticWater";
import {
  bufferPolygon,
  cleanRing,
  convexHull,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  segmentsIntersect
} from "./geom";
import { economyOnDocument, planGuildFacilities, siteEconomyKey, wantsTannery } from "./guildFacilities";
import { type GuildHall, type GuildYard, placeGuildWorks } from "./guildFacilityPlacement";
import { civicYardMeters } from "./housing";
import { fitMonastery, type Monastery, type MonasteryKind } from "./monasteryLayout";
import { makeRng, type Rng } from "./prng";
import { defaultRoadWidthMeters, townExtentMeters } from "./settlementExtent";
import { fixedBankOffset } from "./watermillFabric";

export type { Monastery, MonasteryKind, PrecinctBuilding, PrecinctCourt } from "./monasteryLayout";

export interface Windmill {
  id: Id;
  kind: "post" | "tower";
  name: string;
  center: Point;
  /** Mound (post mill) or tower (tower mill) radius. */
  baseRadius: number;
  /** Direction the sails face (radians, CCW from +X); one prevailing wind for the whole town. */
  facing: number;
  /** Angle of the first sail in the sail plane. */
  sailAngle: number;
  sailLength: number;
}

export interface Barbican {
  id: Id;
  gateId: Id;
  form: "round" | "square";
  name: string;
  /** Outer curtain of the barbican, split at the front passage. */
  curtain: [Point[], Point[]];
  court: Point[];
  frontTowers: Point[][];
  turrets: Point[];
  /** Causeway or bridge across the moat between gate and barbican. */
  causeway?: Point[];
  wallWidth: number;
}

export interface TanneryPit {
  polygon: Point[];
  tone: number;
}

export interface Tannery {
  id: Id;
  name: string;
  riverId: Id;
  yard: Point[];
  washStrip: Point[];
  pits: TanneryPit[];
  sheds: Array<{ polygon: Point[]; ridge: [Point, Point] }>;
  racks: Array<[Point, Point]>;
}

export interface Gallows {
  id: Id;
  name: string;
  center: Point;
  moundRadius: number;
  pillars: Point[];
  path: Point[];
}

export interface AerialLandmarkPlan {
  domesticWater: DomesticWaterPoint[];
  monasteries: Monastery[];
  windmills: Windmill[];
  barbicans: Barbican[];
  tanneries: Tannery[];
  gallows: Gallows[];
  /** Formal guild halls, including chapters whose craftsman count is zero. */
  guildHalls: GuildHall[];
  /** Yards and kilns that belong to a guild even when it has no craftsmen. */
  guildYards: GuildYard[];
}

export type { GuildHall, GuildYard };

export interface AerialLandmarkInput {
  buildings: BuildingLot[];
  lanes: Array<{ points: Point[]; widthMeters: number }>;
  farms: Point[][];
  /** Mills, harbour spaces and other already-reserved footprints. */
  reserved: Point[][];
  /** Water-dependent works: tanneries must be separated and downstream on the same river. */
  waterUsers?: Array<{ riverId?: Id; polygon: Point[] }>;
}

const EMPTY_PLAN: AerialLandmarkPlan = {
  domesticWater: [],
  monasteries: [],
  windmills: [],
  barbicans: [],
  tanneries: [],
  gallows: [],
  guildHalls: [],
  guildYards: []
};

const PERIOD_ORDER: HistoricalPeriod[] = [
  "classicalAntiquity",
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
];
function periodAtLeast(document: CityDocument, period: HistoricalPeriod): boolean {
  return PERIOD_ORDER.indexOf(document.historicalPeriod ?? "ageOfExploration") >= PERIOD_ORDER.indexOf(period);
}

// ---------------------------------------------------------------------------
// Geometry helpers

type Box = [number, number, number, number];

function boxOf(points: Point[]): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function grow(box: Box, by: number): Box {
  return [box[0] - by, box[1] - by, box[2] + by, box[3] + by];
}

/** Uniform bucket grid; items are returned at most once per query. */
class BoxIndex<T> {
  private cells = new Map<string, Array<{ box: Box; item: T }>>();
  constructor(private readonly size = 40) {}
  add(box: Box, item: T): void {
    const entry = { box, item };
    for (let i = Math.floor(box[0] / this.size); i <= Math.floor(box[2] / this.size); i++)
      for (let j = Math.floor(box[1] / this.size); j <= Math.floor(box[3] / this.size); j++) {
        const key = `${i},${j}`;
        const list = this.cells.get(key);
        if (list) list.push(entry);
        else this.cells.set(key, [entry]);
      }
  }
  query(box: Box): T[] {
    const seen = new Set<object>();
    const out: T[] = [];
    for (let i = Math.floor(box[0] / this.size); i <= Math.floor(box[2] / this.size); i++)
      for (let j = Math.floor(box[1] / this.size); j <= Math.floor(box[3] / this.size); j++)
        for (const entry of this.cells.get(`${i},${j}`) ?? []) {
          if (seen.has(entry)) continue;
          seen.add(entry);
          const b = entry.box;
          if (b[0] <= box[2] && b[2] >= box[0] && b[1] <= box[3] && b[3] >= box[1]) out.push(entry.item);
        }
    return out;
  }
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  return nearestOnPolyline(p, [a, b]).dist;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}

/** Whether a polygon comes within `radius` of segment ab (or contains it). */
function polygonNearSegment(polygon: Point[], a: Point, b: Point, radius: number): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++)
    if (segmentDistance(polygon[i], polygon[(i + 1) % polygon.length], a, b) < radius) return true;
  return false;
}

/** Local frame: `u` along `axis`, `v` to its left. */
function frame(origin: Point, angle: number) {
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  return (u: number, v: number): Point => [origin[0] + ux * u - uy * v, origin[1] + uy * u + ux * v];
}

function rect(at: (u: number, v: number) => Point, u0: number, v0: number, u1: number, v1: number): Point[] {
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
}

function circle(center: Point, radius: number, steps = 14): Point[] {
  return Array.from({ length: steps }, (_, i): Point => {
    const t = (i / steps) * Math.PI * 2;
    return [center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius];
  });
}

function unit(x: number, y: number): Point | null {
  const len = Math.hypot(x, y);
  return len > 1e-9 ? [x / len, y / len] : null;
}

function centroid(points: Point[]): Point {
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

// ---------------------------------------------------------------------------
// Site context shared by every landmark

interface Capsule {
  a: Point;
  b: Point;
  radius: number;
  kind: "road" | "wall" | "river";
  groupId?: Id;
  vertexIds?: [Id, Id];
}

class Site {
  readonly half: number;
  readonly capsules = new BoxIndex<Capsule>(50);
  readonly blocked = new BoxIndex<Point[]>(60);
  readonly buildings = new BoxIndex<BuildingLot>(30);
  readonly farms = new BoxIndex<Point[]>(60);
  readonly water = new BoxIndex<Point[]>(60);
  /** Town circuit, or the hull of the built-up core for open towns. */
  readonly town: Point[];
  readonly walled: boolean;
  readonly testDocumentWater: DocumentWaterTest;
  readonly roads: Point[][] = [];
  readonly faceIndex = new BoxIndex<{ id: Id; polygon: Point[] }>(60);
  readonly lanes = new BoxIndex<{ points: Point[]; radius: number }>(40);
  /** Half-width of the road or wall running along each mesh edge. */
  readonly edgeRadius = new Map<Id, number>();
  private readonly placed: Point[][] = [];
  private readonly temples: OrientedRect[] = [];
  private readonly templeYard: number;

  constructor(
    readonly document: CityDocument,
    input: AerialLandmarkInput
  ) {
    this.half = document.frame.extentMeters / 2;
    this.testDocumentWater = documentWaterTest(document);
    const v = (id: Id) => document.mesh.vertices[id]?.point;
    for (const group of document.featureGroups) {
      if (group.kind === "river") {
        const half = group.style.widthMeters / 2;
        for (let i = 1; i < group.vertices.length; i++) {
          const a = v(group.vertices[i - 1]),
            b = v(group.vertices[i]);
          if (a && b)
            this.capsules.add(grow(boxOf([a, b]), half), {
              a,
              b,
              radius: half,
              kind: "river"
            });
        }
        continue;
      }
      const ids = featureGroupVertices(document, group);
      const pts = ids.map(v).filter((p): p is Point => !!p);
      if (group.kind === "road" && pts.length >= 2) this.roads.push(pts);
      for (const ref of group.segments) {
        const edge = document.mesh.edges[ref.edgeId];
        const a = edge && v(edge.a),
          b = edge && v(edge.b);
        if (!edge || !a || !b) continue;
        const radius = group.style.widthMeters / 2;
        this.edgeRadius.set(ref.edgeId, Math.max(this.edgeRadius.get(ref.edgeId) ?? 0, radius));
        this.capsules.add(grow(boxOf([a, b]), radius), {
          a,
          b,
          radius,
          kind: group.kind === "wall" ? "wall" : "road",
          groupId: group.id,
          vertexIds: [edge.a, edge.b]
        });
      }
    }
    const roadWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
    const outside = [
      ...(document.frameRoads ?? []).flatMap(r => r.pieces.map(p => p.points)),
      ...(document.riverConnections ?? []).flatMap(c => [c.townRoad, c.farRoad])
    ];
    for (const pts of outside) {
      if (pts.length < 2) continue;
      this.roads.push(pts);
      for (let i = 1; i < pts.length; i++)
        this.capsules.add(grow(boxOf([pts[i - 1], pts[i]]), roadWidth / 2), {
          a: pts[i - 1],
          b: pts[i],
          radius: roadWidth / 2,
          kind: "road"
        });
    }
    for (const face of Object.values(document.mesh.faces)) {
      const polygon = facePoints(document.mesh, face);
      if (polygon.length < 3) continue;
      this.faceIndex.add(boxOf(polygon), { id: face.id, polygon });
      if (face.properties.water !== "land") this.water.add(boxOf(polygon), polygon);
    }
    for (const area of document.waterAreas ?? []) this.water.add(boxOf(area.polygon), area.polygon);
    for (const building of input.buildings) this.buildings.add(boxOf(building.polygon), building);
    for (const lane of input.lanes)
      if (lane.points.length >= 2)
        this.lanes.add(grow(boxOf(lane.points), lane.widthMeters / 2), {
          points: lane.points,
          radius: lane.widthMeters / 2
        });
    for (const farm of input.farms) this.farms.add(boxOf(farm), farm);
    for (const polygon of input.reserved) this.blocked.add(boxOf(polygon), polygon);
    for (const c of document.defenseCircuits ?? []) {
      if (c.scope !== "castle") continue;
      const ring = circuitRing(document, c);
      if (ring.length >= 3) this.blocked.add(boxOf(ring), ring);
    }
    for (const c of document.cemeteries ?? []) this.blocked.add(boxOf(c.boundary), c.boundary);
    // Same temple reservation as buildingHitsCivicLandmark, prepared once.
    const town = townExtentMeters(document.frame);
    this.templeYard = Math.max(2, civicYardMeters(town) * 0.25);
    for (const element of document.elements)
      if (element.kind === "temple" && element.point)
        this.temples.push(templeRectForElement(element.point, element.sizeMeters, element.rotation, town));

    const circuit = (document.defenseCircuits ?? []).find(c => c.scope === "town");
    const ring = circuit ? circuitRing(document, circuit) : [];
    this.walled = ring.length >= 3 && document.featureGroups.some(g => g.kind === "wall");
    if (this.walled) this.town = ring;
    else {
      const core = Object.values(document.mesh.faces).filter(
        f => f.properties.water === "land" && f.properties.settlement === "core"
      );
      this.town = convexHull(core.flatMap(f => facePoints(document.mesh, f)));
    }
  }

  inFrame(polygon: Point[], margin = 6): boolean {
    return polygon.every(([x, y]) => Math.abs(x) < this.half - margin && Math.abs(y) < this.half - margin);
  }

  insideTown(p: Point): boolean {
    return this.town.length >= 3 && pointInPolygon(p, this.town);
  }

  /** Distance to the town boundary (wall line or core hull). */
  townDistance(p: Point): number {
    return this.town.length >= 3 ? nearestOnPolyline(p, [...this.town, this.town[0]]).dist : Infinity;
  }

  wardsUnder(polygon: Point[]): Set<string> {
    const wards = new Set<string>();
    for (const p of [...polygon, centroid(polygon)])
      for (const face of this.faceIndex.query([p[0], p[1], p[0], p[1]]))
        if (pointInPolygon(p, face.polygon)) wards.add(this.document.mesh.faces[face.id]?.properties.ward ?? "none");
    return wards;
  }

  elevation(p: Point): number {
    for (const face of this.faceIndex.query([p[0], p[1], p[0], p[1]]))
      if (pointInPolygon(p, face.polygon)) return this.document.mesh.faces[face.id]?.properties.elevation ?? 0;
    return 0;
  }

  hitsWater(polygon: Point[], clearance = 1): boolean {
    const box = grow(boxOf(polygon), clearance);
    if (this.water.query(box).some(w => polygonOverlaps(polygon, w))) return true;
    // Include the sea outside the editable mesh as well as surveyed rivers.
    if (this.testDocumentWater(polygon)) return true;
    return this.capsules
      .query(box)
      .some(c => c.kind === "river" && polygonNearSegment(polygon, c.a, c.b, c.radius + clearance));
  }

  /** Roads and walls other than `allow`; clearance is added to the stroke half-width. */
  hitsRoutes(
    polygon: Point[],
    clearance: number,
    kinds: Array<Capsule["kind"]> = ["road", "wall"],
    allow?: (c: Capsule) => boolean
  ): boolean {
    const box = grow(boxOf(polygon), clearance + 12);
    return this.capsules
      .query(box)
      .some(c => kinds.includes(c.kind) && !allow?.(c) && polygonNearSegment(polygon, c.a, c.b, c.radius + clearance));
  }

  hitsBlocked(polygon: Point[]): boolean {
    if (this.blocked.query(boxOf(polygon)).some(b => polygonOverlaps(polygon, b))) return true;
    if (this.placed.some(b => polygonOverlaps(polygon, b))) return true;
    if (landmarkReservationHits(this.document, polygon)) return true;
    return this.temples.some(rect => polygonHitsTempleYard(polygon, rect, this.templeYard));
  }

  buildingsIn(polygon: Point[], clearance = 0): BuildingLot[] {
    const ring = [...polygon, polygon[0]];
    return this.buildings
      .query(grow(boxOf(polygon), clearance))
      .filter(
        b =>
          polygonOverlaps(b.polygon, polygon) ||
          (clearance > 0 && b.polygon.some(p => nearestOnPolyline(p, ring).dist < clearance))
      );
  }

  /** Free-standing works on open land keep clear of every alley. */
  hitsLanes(polygon: Point[]): boolean {
    return this.lanes
      .query(boxOf(polygon))
      .some(lane =>
        lane.points.slice(1).some((b, i) => polygonNearSegment(polygon, lane.points[i], b, lane.radius + 0.5))
      );
  }

  farmsIn(polygon: Point[]): Point[][] {
    return this.farms.query(boxOf(polygon)).filter(f => polygonOverlaps(f, polygon));
  }

  claim(polygon: Point[]): void {
    this.placed.push(polygon);
  }

  nearestRoad(p: Point): { point: Point; dist: number } | null {
    let best: { point: Point; dist: number } | null = null;
    for (const road of this.roads) {
      const hit = nearestOnPolyline(p, road);
      if (!best || hit.dist < best.dist) best = { point: hit.point, dist: hit.dist };
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// 1. Monastery: cloister quadrangle, church, herb garden, orchard

const MONASTERY_NAMES: Record<MonasteryKind, string> = {
  abbey: "Abbey",
  friary: "Friary",
  orthodoxMonastery: "Monastery"
};

/** Houses in founding order. Without FMG civilization the town is taken as Latin Catholic. */
function monasteryKinds(document: CityDocument, walled: boolean): MonasteryKind[] {
  const houses = religiousHousesFor(document.civilization?.faith ?? "latinCatholic", document.historicalPeriod);
  if (houses.includes("friary")) return walled ? ["friary", "abbey", "friary"] : ["abbey", "friary", "friary"];
  if (houses.includes("orthodoxMonastery")) return ["orthodoxMonastery", "orthodoxMonastery"];
  return houses.includes("abbey") ? ["abbey"] : [];
}

function monasteryCount(buildings: number, document: CityDocument): number {
  if (!periodAtLeast(document, "earlyMedieval")) return 0;
  if (buildings < 250) return 0;
  if (buildings < 1500) return 1;
  if (buildings < 5000) return 2;
  return 3;
}

/** A block (Voronoi face) a precinct can fill, outlined clear of its streets. */
interface MonasteryBlock {
  faceId: Id;
  ring: Point[];
  centre: Point;
  settlement: string;
}

// Wards a precinct may replace; markets, parks, harbours and the castle keep their cells.
const MONASTERY_WARDS = new Set(["merchant", "craftsmen", "patriciate", "farm", "empty"]);
/** Pulled back from a street (beyond its half-width) and from a plain block edge. */
const STREET_VERGE = 1.8;
const WALL_VERGE = 3.5;
const PLAIN_EDGE_VERGE = 0.9;
const MIN_BLOCK_AREA = 3600;

function monasteryBlocks(site: Site): MonasteryBlock[] {
  const { mesh } = site.document;
  const walls = new Set<Id>();
  for (const group of site.document.featureGroups)
    if (group.kind === "wall") for (const ref of group.segments) walls.add(ref.edgeId);
  const blocks: MonasteryBlock[] = [];
  for (const face of Object.values(mesh.faces)) {
    const properties = face.properties;
    if (properties.water !== "land" || !MONASTERY_WARDS.has(properties.ward ?? "none")) continue;
    const polygon = facePoints(mesh, face);
    if (polygon.length < 3) continue;
    // A block beside open water or a river would put its wall in the channel.
    const wet = face.boundary.some(ref => {
      const edge = mesh.edges[ref.edgeId];
      return [edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id]?.properties.water !== "land");
    });
    if (wet || Math.abs(polygonArea(polygon)) < MIN_BLOCK_AREA * 1.2) continue;
    const hull = convexHull(polygon);
    // Very ragged blocks leave no clean frontage to build against.
    if (Math.abs(polygonArea(polygon)) < 0.82 * Math.abs(polygonArea(hull))) continue;
    const dists = face.boundary.map(ref => {
      const radius = site.edgeRadius.get(ref.edgeId);
      if (radius === undefined) return PLAIN_EDGE_VERGE;
      return radius + (walls.has(ref.edgeId) ? WALL_VERGE : STREET_VERGE);
    });
    const ring = cleanRing(bufferPolygon(polygon, dists));
    if (ring.length < 3 || Math.abs(polygonArea(ring)) < MIN_BLOCK_AREA) continue;
    blocks.push({ faceId: face.id, ring, centre: centroid(ring), settlement: properties.settlement ?? "none" });
  }
  return blocks;
}

function placeMonasteries(site: Site, input: AerialLandmarkInput, rng: Rng): Monastery[] {
  const document = site.document;
  const kinds = monasteryKinds(document, site.walled);
  const count = Math.min(monasteryCount(input.buildings.length, document), kinds.length);
  if (!count || site.town.length < 3) return [];
  const gates = townGates(document)
    .map(g => document.mesh.vertices[g.vertexId]?.point)
    .filter((p): p is Point => !!p);
  const blocks = monasteryBlocks(site);
  const out: Monastery[] = [];
  for (let index = 0; index < count; index++) {
    const kind = kinds[index];
    const outside = kind === "abbey" && site.walled;
    let best: { score: number; monastery: Monastery } | null = null;
    for (const block of blocks) {
      const inside = site.insideTown(block.centre);
      const edge = site.townDistance(block.centre);
      if (outside ? inside || edge < 40 || edge > 280 : !inside || edge < 25) continue;
      if (out.some(m => Math.hypot(...sub(m.gate, block.centre)) < 140)) continue;
      const nearGate = gates.length
        ? Math.min(...gates.map(g => Math.hypot(g[0] - block.centre[0], g[1] - block.centre[1])))
        : 0;
      if (kind === "friary" && gates.length && (nearGate < 50 || nearGate > 340)) continue;
      // Fronting the nearest street keeps the church on a road, as every precinct was.
      const roadAt = (i: number): number => {
        const a = block.ring[i];
        const b = block.ring[(i + 1) % block.ring.length];
        return site.nearestRoad([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])?.dist ?? Infinity;
      };
      const distances = block.ring.map((_, i) => roadAt(i));
      const nearest = Math.min(...distances);
      const frontEdges = distances.flatMap((d, i) => (d <= nearest + 8 ? [i] : []));
      const fit = fitMonastery({
        kind,
        id: `monastery-${index}`,
        faceId: block.faceId,
        ring: block.ring,
        rng: makeRng(`${block.faceId}:${kind}:${index}`),
        frontEdges,
        margin: outside ? 22 : 8
      });
      if (!fit) continue;
      const precinct = fit.monastery.precinct;
      if (!site.inFrame(precinct, 10)) continue;
      if (site.hitsWater(precinct, 3) || site.hitsRoutes(precinct, 0.4) || site.hitsBlocked(precinct)) continue;
      const cleared = site.buildingsIn(precinct).length;
      const farms = site.farmsIn(precinct).length;
      const score =
        fit.scale * 8 -
        Math.abs(fit.looseness - 1.9) * 0.7 -
        (outside ? cleared * 0.08 : cleared * 0.004) -
        farms * 0.25 -
        Math.min(nearest, 60) * 0.03 -
        (kind === "friary" && gates.length ? Math.abs(nearGate - 150) * 0.008 : 0) -
        (outside ? Math.abs(edge - 110) * 0.01 : 0) +
        rng() * 0.4;
      if (!best || score > best.score) best = { score, monastery: fit.monastery };
    }
    if (!best) continue;
    best.monastery.name = `${MONASTERY_NAMES[kind]} #${index + 1}`;
    site.claim(best.monastery.precinct);
    out.push(best.monastery);
  }
  return out;
}

function sub(a: Point, b: Point): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

// ---------------------------------------------------------------------------
// 2. Windmills along the ramparts and on rising ground outside town

function windmillCount(buildings: number, document: CityDocument, hasRiver: boolean): number {
  // Post mills spread across Europe from the late 12th century.
  if (!periodAtLeast(document, "highMedieval")) return 0;
  if (buildings < 40) return 0;
  const base = Math.max(1, Math.min(8, Math.round(buildings / 1400) + 1));
  return hasRiver ? Math.max(1, Math.ceil(base * 0.6)) : base;
}

function placeWindmills(site: Site, input: AerialLandmarkInput, rng: Rng): Windmill[] {
  const document = site.document;
  const hasRiver = document.featureGroups.some(g => g.kind === "river");
  const count = windmillCount(input.buildings.length, document, hasRiver);
  if (!count || site.town.length < 3) return [];
  const towerMills = periodAtLeast(document, "lateMedieval");
  const gates = townGates(document)
    .map(g => document.mesh.vertices[g.vertexId]?.point)
    .filter((p): p is Point => !!p);
  // One prevailing wind: every mill on the plain faces the same way.
  const facing = rng.range(0, Math.PI * 2);
  const ring = [...site.town, site.town[0]];
  const perimeter = ring.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]), 0);
  type Candidate = { center: Point; score: number };
  const candidates: Candidate[] = [];
  const centroidTown = centroid(site.town);
  for (let attempt = 0; attempt < count * 70; attempt++) {
    // Sample a point on the boundary, then step outward.
    let t = rng() * perimeter;
    let at: Point = ring[0];
    let normal: Point = [1, 0];
    for (let i = 1; i < ring.length; i++) {
      const len = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      if (t <= len) {
        const f = len ? t / len : 0;
        at = [ring[i - 1][0] + (ring[i][0] - ring[i - 1][0]) * f, ring[i - 1][1] + (ring[i][1] - ring[i - 1][1]) * f];
        const out = unit(at[0] - centroidTown[0], at[1] - centroidTown[1]) ?? [1, 0];
        normal = out;
        break;
      }
      t -= len;
    }
    const offset = site.walled ? rng.range(22, 90) : rng.range(25, 120);
    const center: Point = [at[0] + normal[0] * offset, at[1] + normal[1] * offset];
    if (site.insideTown(center)) continue;
    candidates.push({
      center,
      score: site.elevation(center) * 0.05 - offset * 0.004 + rng()
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const out: Windmill[] = [];
  for (const { center } of candidates) {
    if (out.length >= count) break;
    if (out.some(m => Math.hypot(m.center[0] - center[0], m.center[1] - center[1]) < 34)) continue;
    if (gates.some(g => Math.hypot(g[0] - center[0], g[1] - center[1]) < 45)) continue;
    const kind: Windmill["kind"] = towerMills && rng() < 0.45 ? "tower" : "post";
    const sailLength = kind === "tower" ? rng.range(9, 11) : rng.range(8, 9.5);
    const baseRadius = kind === "tower" ? 3.6 : 5;
    const sweep = circle(center, sailLength + 1.2, 12);
    const base = circle(center, baseRadius + 0.8, 10);
    if (!site.inFrame(sweep)) continue;
    if (site.hitsWater(sweep, 2) || site.hitsRoutes(sweep, 2) || site.hitsBlocked(sweep)) continue;
    if (site.buildingsIn(sweep, 2).length || site.hitsLanes(base)) continue;
    if (site.farmsIn(base).length && rng() < 0.7) continue;
    site.claim(sweep);
    out.push({
      id: `windmill-${out.length}`,
      kind,
      name: `Windmill #${out.length + 1} (${kind === "tower" ? "Tower Mill" : "Post Mill"})`,
      center,
      baseRadius,
      facing,
      sailAngle: rng.range(0, Math.PI / 2),
      sailLength
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Barbicans in front of the main gates

function placeBarbicans(site: Site, rng: Rng): Barbican[] {
  const document = site.document;
  if (!site.walled || !periodAtLeast(document, "highMedieval")) return [];
  const out: Barbican[] = [];
  const circuit = (document.defenseCircuits ?? []).find(c => c.scope === "town");
  const moat = circuit?.moat?.enabled ? circuit.moat.widthMeters : 0;
  for (const gate of townGates(document)) {
    if (gate.role && gate.role !== "town") continue;
    const wall = document.featureGroups.find(
      g => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
    );
    if (wall?.kind !== "wall" || (wall.wallMaterial ?? "stone") !== "stone") continue;
    // Only gates that lead out of town on an external approach road.
    const roads = document.featureGroups.filter(
      g => g.kind === "road" && featureGroupVertices(document, g).includes(gate.vertexId)
    );
    if (!roads.some(r => r.kind === "road" && (r.beyond || r.sourceRoad))) continue;
    const gf = gateCrossingFrame(document, gate.vertexId);
    if (!gf) continue;
    const P = gf.point;
    const outward: Point = [-gf.inward[0], -gf.inward[1]];
    const road = gf.roads
      .map(r => ({ r, d: unit(r[0] - P[0], r[1] - P[1]) }))
      .filter((x): x is { r: Point; d: Point } => !!x.d)
      .sort((a, b) => b.d[0] * outward[0] + b.d[1] * outward[1] - (a.d[0] * outward[0] + a.d[1] * outward[1]))[0];
    if (!road || road.d[0] * outward[0] + road.d[1] * outward[1] < 0.75) continue;
    const axis = road.d;
    const runLength = Math.hypot(road.r[0] - P[0], road.r[1] - P[1]);
    const wallWidth = wall.style.widthMeters;
    const towerHalf = (wallWidth * GATE_TOWER_SCALE) / 2;
    const roadWidth = Math.max(
      defaultRoadWidthMeters(townExtentMeters(document.frame)),
      ...roads.map(r => r.style.widthMeters)
    );
    const passage = roadWidth + 1.6;
    const form: Barbican["form"] = rng() < 0.5 ? "round" : "square";
    const halfWidth = Math.max(passage / 2 + 7, wallWidth * 3 + rng.range(0, 2.5));
    const start = moat > 0 ? towerHalf + moat + 1.5 : towerHalf;
    let depth = start + rng.range(13, 19);
    depth = Math.min(depth, runLength - 3);
    if (depth - start < 10) continue;
    const angle = Math.atan2(axis[1], axis[0]);
    const at = frame(P, angle); // u outward along the road, v to the left
    const curtainW = Math.max(1.4, wallWidth * 0.75);
    const gap = passage / 2 + 0.2;
    const tower = Math.max(2.8, wallWidth * 1.05);
    // Without a moat the side walls spring from the curtain itself, which may be skewed to the road.
    const left90: Point = [-axis[1], axis[0]];
    const tv = gf.tangent[0] * left90[0] + gf.tangent[1] * left90[1];
    const ta = gf.tangent[0] * axis[0] + gf.tangent[1] * axis[1];
    const springAt = (v: number) => (moat > 0 || Math.abs(tv) < 0.3 ? start : (v * ta) / tv);
    let left: Point[];
    let right: Point[];
    let court: Point[];
    const turrets: Point[] = [];
    if (form === "round") {
      // Semicircular front: centre so the arc reaches `depth`.
      const r = halfWidth;
      const cu = Math.max(start + 2, depth - r);
      const arc = (from: number, to: number) =>
        Array.from({ length: 8 }, (_, i) => {
          const t = from + ((to - from) * i) / 7;
          return at(cu + Math.cos(t) * r, Math.sin(t) * r);
        });
      // Gap half-angle at the front.
      const ga = Math.asin(Math.min(0.9, gap / r));
      right = [at(springAt(-r), -r), ...arc(-Math.PI / 2, -ga)];
      left = [...arc(ga, Math.PI / 2), at(springAt(r), r)];
      court = [at(springAt(-r), -r), ...arc(-Math.PI / 2, Math.PI / 2), at(springAt(r), r)];
      turrets.push(at(cu + Math.cos(-1.2) * r, Math.sin(-1.2) * r), at(cu + Math.cos(1.2) * r, Math.sin(1.2) * r));
    } else {
      right = [at(springAt(-halfWidth), -halfWidth), at(depth, -halfWidth), at(depth, -gap)];
      left = [at(depth, gap), at(depth, halfWidth), at(springAt(halfWidth), halfWidth)];
      court = [
        at(springAt(-halfWidth), -halfWidth),
        at(depth, -halfWidth),
        at(depth, halfWidth),
        at(springAt(halfWidth), halfWidth)
      ];
      turrets.push(at(depth, -halfWidth), at(depth, halfWidth));
    }
    // Both arms must spring from the curtain itself; a gap shows a barbican floating off the wall.
    if (moat <= 0) {
      const wallSegments = site.capsules
        .query(grow(boxOf(court), wallWidth * 2 + 4))
        .filter(c => c.kind === "wall" && c.groupId === wall.id);
      const reaches = (p: Point) => wallSegments.some(c => pointSegmentDistance(p, c.a, c.b) <= c.radius + 0.5);
      if (!reaches(court[0]) || !reaches(court[court.length - 1])) continue;
    }
    const frontTowers = [
      rect(at, depth - tower / 2, -gap - tower, depth + tower / 2, -gap),
      rect(at, depth - tower / 2, gap, depth + tower / 2, gap + tower)
    ];
    const footprint = [...court, ...frontTowers.flat()];
    const hull = convexHull(footprint);
    // The barbican may only straddle its own gate road and wall.
    const own = (c: Capsule) =>
      (c.kind === "wall" && c.groupId === wall.id && Math.min(...[c.a, c.b].map(p => dist(p, P))) < halfWidth + 30) ||
      (c.kind === "road" && !!c.vertexIds?.includes(gate.vertexId)) ||
      (c.kind === "road" && pointSegmentDistance(P, c.a, c.b) < 1 + c.radius) ||
      // The approach road continuing from its first bend, which lies beyond the front gate.
      (c.kind === "road" && Math.min(dist(c.a, road.r), dist(c.b, road.r)) < 0.5);
    if (site.hitsWater(hull, 1) || site.hitsRoutes(hull, 0.5, ["road", "wall"], own) || site.hitsBlocked(hull))
      continue;
    if (!site.inFrame(hull)) continue;
    site.claim(hull);
    out.push({
      id: `barbican-${gate.id}`,
      gateId: gate.id,
      form,
      name: `Barbican (gate #${gate.id})`,
      curtain: [right, left],
      court,
      frontTowers,
      turrets,
      causeway: moat > 0 ? rect(at, towerHalf - 0.5, -gap, start + 0.5, gap) : undefined,
      wallWidth: curtainW
    });
  }
  return out;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// ---------------------------------------------------------------------------
// 4. Tanneries at the downstream end of the river

/** Map-layout clearance, not a historical regulation or a water-quality safety threshold. */
export const TANNERY_WATER_USER_CLEARANCE_METERS = 60;

function polygonsDistance(a: Point[], b: Point[]): number {
  if (polygonOverlaps(a, b)) return 0;
  return Math.min(
    ...a.map(p => nearestOnPolyline(p, [...b, b[0]]).dist),
    ...b.map(p => nearestOnPolyline(p, [...a, a[0]]).dist)
  );
}

function placeTanneries(site: Site, input: AerialLandmarkInput, rng: Rng, enabled = true): Tannery[] {
  const document = site.document;
  if (!enabled || input.buildings.length < 150 || site.town.length < 3) return [];
  const wanted = input.buildings.length > 6000 ? 2 : 1;
  const out: Tannery[] = [];
  for (const river of flowingRivers(document)) {
    if (out.length >= wanted) break;
    const pts = river.points;
    const half = river.widthMeters / 2;
    const townCentre = centroid(site.town);
    // Measure continuously along every segment, including sparse imported centrelines.
    // Include the river half-width so a wide river skirting town uses its bank, not
    // the centreline's nearest vertex. The small sampling margin is conservative:
    // distance to the town boundary is 1-Lipschitz, so no intervening contact is missed.
    const step = 2;
    let exit = -1;
    let walked = 0;
    const segments: Array<{ a: Point; t: Point; length: number; start: number }> = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const length = dist(a, b);
      const t = unit(b[0] - a[0], b[1] - a[1]);
      if (!t || length < 1e-6) continue;
      segments.push({ a, t, length, start: walked });
      const count = Math.ceil(length / step);
      const spacing = length / count;
      for (let j = 0; j <= count; j++) {
        const s = j * spacing;
        const p: Point = [a[0] + t[0] * s, a[1] + t[1] * s];
        if (site.insideTown(p) || site.townDistance(p) <= half + 25 + spacing / 2)
          exit = Math.max(exit, walked + s + spacing / 2);
      }
      walked += length;
    }
    const station = (p: Point): number => {
      let nearest = Infinity,
        at = 0;
      for (const { a, t, length, start } of segments) {
        const s = Math.max(0, Math.min(length, (p[0] - a[0]) * t[0] + (p[1] - a[1]) * t[1]));
        const distance = Math.hypot(p[0] - a[0] - t[0] * s, p[1] - a[1] - t[1] * s);
        if (distance < nearest) {
          nearest = distance;
          at = start + s;
        }
      }
      return at;
    };
    if (exit < 0) {
      // A nearby river need not touch the wall/core hull: suburbs and an access
      // road can separate town from its bank. Preserve these rivers, but use
      // the downstream extent of the town's projection, never its nearest point.
      let bankDistance = Infinity;
      let projectedEnd = -1;
      for (let i = 0; i < site.town.length; i++) {
        const a = site.town[i],
          b = site.town[(i + 1) % site.town.length];
        const count = Math.max(1, Math.ceil(dist(a, b) / step));
        for (let j = 0; j <= count; j++) {
          const p: Point = [a[0] + ((b[0] - a[0]) * j) / count, a[1] + ((b[1] - a[1]) * j) / count];
          bankDistance = Math.min(bankDistance, nearestOnPolyline(p, pts).dist - half);
          projectedEnd = Math.max(projectedEnd, station(p));
        }
      }
      if (bankDistance > 200 || projectedEnd < 0) continue;
      exit = projectedEnd + step;
    }
    // Waterfront uses also determine the downstream limit. Harbour piers may
    // lack a river id (surveyed ports); associate only those on this river's bank.
    const waterUsers = (input.waterUsers ?? []).filter(user => user.polygon.length >= 3);
    for (const user of waterUsers) {
      const sameRiver =
        user.riverId === river.id ||
        (user.riverId === undefined && user.polygon.some(p => nearestOnPolyline(p, pts).dist <= half + 60));
      if (sameRiver) exit = Math.max(exit, ...user.polygon.map(p => station(p) + TANNERY_WATER_USER_CLEARANCE_METERS));
    }
    // Candidates begin strictly downstream of the last town contact. Never fall
    // back to the centre of town when the downstream bank has no suitable space.
    const along: Array<{ p: Point; t: Point; d: number; s: number }> = [];
    for (const { a, t, length, start } of segments) {
      for (let s = Math.max(0, exit - start); s < length && start + s <= exit + 260; s += 6) {
        along.push({ p: [a[0] + t[0] * s, a[1] + t[1] * s], t, d: start + s - exit, s: start + s });
      }
    }
    let best: { score: number; plan: Tannery } | null = null;
    for (const { p, t, d, s } of along) {
      for (const side of [1, -1]) {
        const n: Point = [-t[1] * side, t[0] * side];
        const length = 44 + rng.range(-6, 10);
        const depth = 22;
        if (s - length / 2 <= exit) continue;
        const offset = river.surveyed ? fixedBankOffset(document, p, n, half, t, length / 2) : half;
        if (offset === null) continue;
        const bank = offset + (river.surveyed ? 0.3 : 1.5);
        const angle = Math.atan2(t[1], t[0]);
        // `v` measured inland from the bank.
        const base = frame([p[0] + n[0] * bank, p[1] + n[1] * bank], angle);
        const at = (u: number, v: number) => base(u, side * v);
        const yard = orient(rect(at, -length / 2, 0, length / 2, depth));
        if (!site.inFrame(yard, 8)) continue;
        if (waterUsers.some(user => polygonsDistance(yard, user.polygon) < TANNERY_WATER_USER_CLEARANCE_METERS))
          continue;
        if (polygonOverlaps(yard, site.town) || yard.some(p => station(p) <= exit)) continue;
        if (site.hitsWater(yard, 0.6) || site.hitsRoutes(yard, 2.5) || site.hitsBlocked(yard)) continue;
        const wards = site.wardsUnder(yard);
        if (wards.has("market") || wards.has("castle") || wards.has("park")) continue;
        const cleared = site.buildingsIn(yard).length;
        // The tanners worked on the town's own bank; the far bank means a crossing for every hide.
        const townSide = n[0] * (townCentre[0] - p[0]) + n[1] * (townCentre[1] - p[1]) > 0;
        const score =
          (townSide ? 3 : 0) -
          Math.abs(d - (site.walled ? 45 : 20)) * 0.02 -
          cleared * 0.02 -
          site.farmsIn(yard).length * 0.4 +
          rng() * 0.3;
        if (best && score <= best.score) continue;
        best = {
          score,
          plan: layoutTannery(at, length, depth, river.id, `tannery-${out.length}`, rng)
        };
      }
    }
    if (!best) continue;
    best.plan.name = `Tanners' Yard #${out.length + 1}`;
    site.claim(best.plan.yard);
    out.push(best.plan);
  }
  return out;
}

/** Keep polygons counter-clockwise whichever bank they were built on. */
function orient(polygon: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...polygon].reverse() : polygon;
}

function layoutTannery(
  at: (u: number, v: number) => Point,
  length: number,
  depth: number,
  riverId: Id,
  id: Id,
  rng: Rng
): Tannery {
  const L = length / 2;
  const yard = orient(rect(at, -L, 0, L, depth));
  const washStrip = orient(rect(at, -L + 1, 0.3, L - 1, 2.4));
  const pits: TanneryPit[] = [];
  const pit = 2.3;
  const pitch = 3.1;
  const cols = Math.floor((length - 4) / pitch);
  const u0 = -((cols - 1) * pitch) / 2;
  for (const [row, v] of [3.6, 6.7, 9.8, 12.9].entries()) {
    for (let c = 0; c < cols; c++) {
      const u = u0 + c * pitch;
      // A narrow gangway splits the pit field in two.
      if (Math.abs(u) < pitch * 0.6) continue;
      // Liming pits (white) nearest the water, then tan-liquor pits darkening inland.
      const tone = row === 0 ? (rng() < 0.7 ? 0 : 1) : Math.min(4, row + (rng() < 0.4 ? 1 : 0));
      pits.push({
        polygon: orient(rect(at, u - pit / 2, v - pit / 2, u + pit / 2, v + pit / 2)),
        tone
      });
    }
  }
  const sheds: Tannery["sheds"] = [];
  const shedV0 = 15,
    shedV1 = depth - 0.8;
  let u = -L + 1;
  while (u < L - 8) {
    const w = Math.min(L - 1 - u, rng.range(9, 14));
    sheds.push({
      polygon: orient(rect(at, u, shedV0, u + w, shedV1)),
      ridge: [at(u, (shedV0 + shedV1) / 2), at(u + w, (shedV0 + shedV1) / 2)]
    });
    u += w + rng.range(2.5, 4.5);
  }
  // Hide-drying frames in a row between the pit field and the sheds.
  const racks: Array<[Point, Point]> = [];
  for (let k = -L + 3; k < L - 6; k += 7) racks.push([at(k, shedV0 - 1.2), at(k + 4.5, shedV0 - 1.2)]);
  return {
    id,
    name: "Tanners' Yard",
    riverId,
    yard,
    washStrip,
    pits,
    sheds,
    racks
  };
}

// ---------------------------------------------------------------------------
// 5. Permanent gallows on an approach road outside town

function placeGallows(site: Site, input: AerialLandmarkInput, rng: Rng): Gallows[] {
  if (input.buildings.length < 400 || site.town.length < 3) return [];
  const approach = site.roads.filter(r => r.some(p => !site.insideTown(p) && site.townDistance(p) > 100));
  if (!approach.length) return [];
  // Road forks outside town draw the gallows: a crossroads is a traditional site.
  const ends = approach.flatMap(r => [r[0], r[r.length - 1]]);
  let best: { score: number; center: Point; foot: Point } | null = null;
  for (const road of approach) {
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1],
        b = road[i];
      const len = dist(a, b);
      const t = unit(b[0] - a[0], b[1] - a[1]);
      if (!t) continue;
      for (let s = 0; s < len; s += 12) {
        const foot: Point = [a[0] + t[0] * s, a[1] + t[1] * s];
        const away = site.townDistance(foot);
        if (site.insideTown(foot) || away < 130 || away > 520) continue;
        for (const side of [1, -1]) {
          const off = rng.range(16, 24);
          const center: Point = [foot[0] - t[1] * off * side, foot[1] + t[0] * off * side];
          const mound = circle(center, 8, 12);
          if (!site.inFrame(mound, 10)) continue;
          if (site.hitsWater(mound, 3) || site.hitsRoutes(mound, 2.5) || site.hitsBlocked(mound)) continue;
          if (site.buildingsIn(mound, 12).length || site.hitsLanes(mound)) continue;
          const fork = ends.some(e => dist(e, foot) < 60) ? 1.2 : 0;
          const score =
            site.elevation(center) * 0.08 +
            fork -
            Math.abs(away - 250) * 0.004 -
            site.farmsIn(mound).length * 0.8 +
            rng() * 0.6;
          if (!best || score > best.score) best = { score, center, foot };
        }
      }
    }
  }
  if (!best) return [];
  const { center, foot } = best;
  const rot = rng.range(0, Math.PI * 2);
  const pillars = [0, 1, 2].map((k): Point => {
    const t = rot + (k * Math.PI * 2) / 3;
    return [center[0] + Math.cos(t) * 2.6, center[1] + Math.sin(t) * 2.6];
  });
  site.claim(circle(center, 8, 12));
  return [
    {
      id: "gallows-0",
      name: "Gallows Hill",
      center,
      moundRadius: 6.5,
      pillars,
      path: [foot, center]
    }
  ];
}

// ---------------------------------------------------------------------------

const aerialPlanCache = new WeakMap<CityDocument, { fingerprint: string; plan: AerialLandmarkPlan }>();

/** Deterministic for a document and its finished fabric. */
export function buildAerialLandmarkPlan(
  document: CityDocument,
  input: AerialLandmarkInput,
  seed = "aerial-landmarks"
): AerialLandmarkPlan {
  // A completed generation recipe marks a generated town. Hand-built or upgraded maps keep
  // their district-local edits: these town-wide works would shift with every edit.
  if (!input.buildings.length || !document.fabric?.generation) return EMPTY_PLAN;
  const economy = economyOnDocument(document);
  const guildPlan = planGuildFacilities(economy, document.historicalPeriod ?? "ageOfExploration");
  const fp = `${seed}:${input.buildings.length}:${input.lanes.length}:${document.fabric?.seed ?? document.generationSeed ?? ""}:${siteEconomyKey(economy)}:${JSON.stringify(input.waterUsers ?? [])}`;
  const cached = aerialPlanCache.get(document);
  if (cached && cached.fingerprint === fp) return cached.plan;

  const site = new Site(document, input);
  const root = `${document.fabric?.seed ?? document.generationSeed ?? "aerial"}:${seed}`;
  // Large fixed works first (the gate outworks and river trades), then free-standing pieces.
  // Guild yards claim land before the tannery, so a bleaching field stays upstream of it.
  const barbicans = placeBarbicans(site, makeRng(`${root}:barbican`));
  const guildWorks = placeGuildWorks(site, guildPlan, economy?.year ?? 0);
  const tanneries = placeTanneries(site, input, makeRng(`${root}:tannery`), wantsTannery(economy, guildPlan));
  const monasteries = placeMonasteries(site, input, makeRng(`${root}:monastery`));
  const gallows = placeGallows(site, input, makeRng(`${root}:gallows`));
  const windmills = placeWindmills(site, input, makeRng(`${root}:windmill`));
  const domesticWater = placeDomesticWater(
    site,
    [
      ...site.roads.map(points => ({ points, widthMeters: defaultRoadWidthMeters(townExtentMeters(document.frame)) })),
      ...input.lanes
    ],
    input.buildings.length
  );
  const plan = {
    monasteries,
    windmills,
    barbicans,
    tanneries,
    gallows,
    domesticWater,
    guildHalls: guildWorks.halls,
    guildYards: guildWorks.yards
  };
  aerialPlanCache.set(document, { fingerprint: fp, plan });
  return plan;
}

/** Footprints that displace ordinary houses, lanes and fields. */
export function aerialLandmarkFootprints(plan: AerialLandmarkPlan): Point[][] {
  return [
    ...plan.monasteries.map(m => m.precinct),
    ...plan.tanneries.map(t => t.yard),
    ...plan.barbicans.map(b => convexHull([...b.court, ...b.frontTowers.flat()])),
    ...plan.windmills.map(w => circle(w.center, w.baseRadius + 1, 10)),
    ...plan.gallows.map(g => circle(g.center, g.moundRadius + 1, 12)),
    ...plan.guildHalls.flatMap(hall => (hall.tower ? [hall.footprint, hall.tower] : [hall.footprint])),
    ...plan.guildYards.map(yard => yard.polygon)
  ];
}
