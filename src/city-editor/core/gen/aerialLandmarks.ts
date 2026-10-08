// Medieval landmarks that read at a glance from above (docs/city-editor/plan/1008-wards-and-features.md,
// "空からの視点で特に映える優先度"): monastery cloisters with herb gardens, windmills along the walls,
// barbicans in front of the main gates, tanneries at the downstream end of the river, and the
// permanent gallows on an approach road outside town. Watermills and harbour cranes live in
// watermillFabric.ts / harborFabric.ts. Everything here is derived from the finished document
// and the final building fabric; it never edits the mesh.
import { type ReligiousHouse, religiousHousesFor } from "../../../data/civilizationTraditions";
import { featureGroupVertices } from "../features";
import { circuitRing, polygonOverlaps, townGates } from "../fortifications";
import { landmarkReservationHits } from "../landmarks";
import { facePoints } from "../mesh";
import { GATE_TOWER_SCALE, gateCrossingFrame } from "../passages";
import { flowingRivers } from "../riverFlow";
import type { CityDocument, HistoricalPeriod, Id, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { type OrientedRect, polygonHitsTempleYard, templeRectForElement } from "./civicPlacement";
import { convexHull, nearestOnPolyline, pointInPolygon, segmentsIntersect } from "./geom";
import { civicYardMeters } from "./housing";
import { makeRng, type Rng } from "./prng";
import { defaultRoadWidthMeters, townExtentMeters } from "./settlementExtent";
import { fixedBankOffset, hitsSurveyedWater } from "./watermillFabric";

export type MonasteryKind = ReligiousHouse;

export interface Monastery {
  id: Id;
  kind: MonasteryKind;
  name: string;
  /** Precinct wall enclosing church, cloister, gardens and orchard. */
  precinct: Point[];
  gate: Point;
  church: {
    nave: Point[];
    transept: Point[];
    apse: Point[];
    ridge: [Point, Point];
  };
  /** The four claustral ranges (east, south, west and the church's cloister side is the walk). */
  ranges: Array<{ polygon: Point[]; ridge: [Point, Point] }>;
  /** Roofed arcade walk around the garth. */
  walk: Point[];
  garth: Point[];
  well: Point;
  herbGarden: { bounds: Point[]; beds: Point[][] };
  orchard: Point[];
}

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
  monasteries: Monastery[];
  windmills: Windmill[];
  barbicans: Barbican[];
  tanneries: Tannery[];
  gallows: Gallows[];
}

export interface AerialLandmarkInput {
  buildings: BuildingLot[];
  lanes: Array<{ points: Point[]; widthMeters: number }>;
  farms: Point[][];
  /** Mills, harbour spaces and other already-reserved footprints. */
  reserved: Point[][];
}

const EMPTY_PLAN: AerialLandmarkPlan = {
  monasteries: [],
  windmills: [],
  barbicans: [],
  tanneries: [],
  gallows: []
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
  readonly surveyedWater: boolean;
  readonly roads: Point[][] = [];
  readonly faceIndex = new BoxIndex<{ id: Id; polygon: Point[] }>(60);
  readonly lanes = new BoxIndex<{ points: Point[]; radius: number }>(40);
  private readonly placed: Point[][] = [];
  private readonly temples: OrientedRect[] = [];
  private readonly templeYard: number;

  constructor(
    readonly document: CityDocument,
    input: AerialLandmarkInput
  ) {
    this.half = document.frame.extentMeters / 2;
    this.surveyedWater = !!document.importedFixedCrossings || !!document.waterAreas?.length;
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
    // FMG rivers are the surveyed bank polygons.
    if (this.surveyedWater && hitsSurveyedWater(this.document, polygon)) return true;
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

function layoutMonastery(
  center: Point,
  angle: number,
  scale: number,
  mirror: boolean,
  id: Id,
  kind: MonasteryKind
): Monastery {
  const s = scale;
  // Mirror flips the garden to the west of the cloister.
  const base = frame(center, angle);
  const at = (u: number, v: number) => base(mirror ? -u : u, v);
  const garth = 20 * s;
  const walk = 3.4 * s;
  const range = 8 * s;
  const cloister = garth / 2 + walk + range; // half-size of the claustral block
  const churchW = 12 * s;
  const gardenW = 22 * s;
  // Cloister block centred on the origin; church on its north side, garden east.
  const west = -cloister - 5 * s;
  const east = cloister + gardenW + 6 * s;
  const south = -cloister - 12 * s;
  const north = cloister + churchW + 6 * s;
  const ccw = (pts: Point[]) => (mirror ? [...pts].reverse() : pts);
  const precinct = ccw(rect(at, west, south, east, north));

  const g = garth / 2;
  const w = g + walk;
  const ranges = [
    // East range (chapter house, dormitory above), south range (refectory), west range (cellarer).
    {
      polygon: rect(at, w, -cloister, cloister, w),
      ridge: [at(w + range / 2, -cloister), at(w + range / 2, w)]
    },
    {
      polygon: rect(at, -cloister, -cloister, w, -w),
      ridge: [at(-cloister, -w - range / 2), at(w, -w - range / 2)]
    },
    {
      polygon: rect(at, -cloister, -w, -w, w),
      ridge: [at(-w - range / 2, -w), at(-w - range / 2, w)]
    }
  ].map(r => ({ polygon: ccw(r.polygon), ridge: r.ridge as [Point, Point] }));
  const walkRing = ccw(rect(at, -w, -w, w, w));
  const garthPoly = ccw(rect(at, -g, -g, g, g));

  // Church: nave west→east over the full cloister plus a choir, transept over the crossing.
  const n0 = cloister;
  const n1 = cloister + churchW;
  const choirEnd = cloister + 14 * s;
  const nave = ccw(rect(at, -cloister, n0, choirEnd, n1));
  const crossing = cloister - 2 * s;
  const transept = ccw(rect(at, crossing - 6 * s, n0 - 3.5 * s, crossing + 3 * s, n1 + 3.5 * s));
  const apseR = churchW * 0.42;
  const apse = ccw(
    Array.from({ length: 9 }, (_, i) => {
      const t = -Math.PI / 2 + (i / 8) * Math.PI;
      return at(choirEnd + Math.cos(t) * apseR, (n0 + n1) / 2 + Math.sin(t) * apseR);
    })
  );
  const ridge: [Point, Point] = [at(-cloister, (n0 + n1) / 2), at(choirEnd, (n0 + n1) / 2)];

  // Physic garden: a grid of raised beds east of the cloister.
  const gx0 = cloister + 3 * s,
    gx1 = cloister + gardenW,
    gy0 = -cloister + 2 * s,
    gy1 = cloister - 3 * s;
  const cols = 3,
    rows = Math.max(3, Math.round((gy1 - gy0) / (6 * s)));
  const path = 1.4 * s;
  const bw = (gx1 - gx0 - path * (cols + 1)) / cols;
  const bh = (gy1 - gy0 - path * (rows + 1)) / rows;
  const beds: Point[][] = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const u0 = gx0 + path + c * (bw + path),
        v0 = gy0 + path + r * (bh + path);
      beds.push(ccw(rect(at, u0, v0, u0 + bw, v0 + bh)));
    }
  const herbGarden = { bounds: ccw(rect(at, gx0, gy0, gx1, gy1)), beds };
  const orchard = ccw(rect(at, west + 2 * s, south + 2 * s, east - 2 * s, -cloister - 2 * s));
  return {
    id,
    kind,
    name: MONASTERY_NAMES[kind],
    precinct,
    gate: at(west, 0),
    church: { nave, transept, apse, ridge },
    ranges,
    walk: walkRing,
    garth: garthPoly,
    well: at(0, 0),
    herbGarden,
    orchard
  };
}

function placeMonasteries(site: Site, input: AerialLandmarkInput, rng: Rng): Monastery[] {
  const document = site.document;
  const kinds = monasteryKinds(document, site.walled);
  const count = Math.min(monasteryCount(input.buildings.length, document), kinds.length);
  if (!count || site.town.length < 3) return [];
  const scale = Math.max(0.72, Math.min(1.15, Math.sqrt(input.buildings.length / 3000)));
  const gates = townGates(document)
    .map(g => document.mesh.vertices[g.vertexId]?.point)
    .filter((p): p is Point => !!p);
  const box = boxOf(site.town);
  const out: Monastery[] = [];
  const forbidden = new Set(["market", "castle", "cemetery", "park", "harbor", "none"]);
  for (let index = 0; index < count; index++) {
    const kind = kinds[index];
    const outside = kind === "abbey" && site.walled;
    const reach = outside ? 240 : 0;
    const span = grow(box, reach);
    let best: { score: number; plan: Monastery; cleared: number } | null = null;
    for (let attempt = 0; attempt < 260; attempt++) {
      const p: Point = [rng.range(span[0], span[2]), rng.range(span[1], span[3])];
      const inside = site.insideTown(p);
      const edge = site.townDistance(p);
      if (outside ? inside || edge < 50 || edge > reach : !inside || edge < 45) continue;
      const nearGate = gates.length ? Math.min(...gates.map(g => Math.hypot(g[0] - p[0], g[1] - p[1]))) : 0;
      if (kind === "friary" && gates.length && (nearGate < 70 || nearGate > 260)) continue;
      const angle = rng.range(-0.2, 0.2);
      const plan = layoutMonastery(p, angle, scale, rng() < 0.5, `monastery-${index}`, kind);
      const precinct = plan.precinct;
      if (!site.inFrame(precinct, 10)) continue;
      if (out.some(m => Math.hypot(...sub(centroid(m.precinct), p)) < 220)) continue;
      const wards = site.wardsUnder(precinct);
      if ([...wards].some(w => forbidden.has(w))) continue;
      if (site.hitsWater(precinct, 3) || site.hitsRoutes(precinct, 2) || site.hitsBlocked(precinct)) continue;
      const cleared = site.buildingsIn(precinct).length;
      const farms = site.farmsIn(precinct).length;
      const road = site.nearestRoad(p);
      // A precinct sits on a street; in town it replaces whole blocks, outside it takes common land.
      const access = road ? Math.min(road.dist, 160) : 160;
      const score =
        (kind === "friary" ? -nearGate * 0.02 : -Math.abs(edge - 110) * 0.01) -
        cleared * (outside ? 0.08 : 0.004) -
        farms * 0.3 -
        access * 0.02 +
        rng() * 0.5;
      if (!best || score > best.score) best = { score, plan, cleared };
    }
    if (!best) continue;
    // Turn the gate toward the nearest street.
    const plan = best.plan;
    const road = site.nearestRoad(centroid(plan.precinct));
    if (road) {
      const ring = [...plan.precinct, plan.precinct[0]];
      plan.gate = nearestOnPolyline(road.point, ring).point;
    }
    plan.name = `${MONASTERY_NAMES[kind]} #${index + 1}`;
    site.claim(plan.precinct);
    out.push(plan);
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

function placeTanneries(site: Site, input: AerialLandmarkInput, rng: Rng): Tannery[] {
  const document = site.document;
  if (input.buildings.length < 150 || site.town.length < 3) return [];
  const wanted = input.buildings.length > 6000 ? 2 : 1;
  const out: Tannery[] = [];
  for (const river of flowingRivers(document)) {
    if (out.length >= wanted) break;
    const pts = river.points;
    // Last river point that is still in town; the tanners sit just downstream of it.
    let last = -1;
    for (let i = 0; i < pts.length; i++) if (site.insideTown(pts[i]) || site.townDistance(pts[i]) < 25) last = i;
    if (last < 0) {
      // A river skirting the town: start at its nearest point. Wide FMG rivers have their
      // centreline far out in the water, so measure to the bank.
      let best = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = site.townDistance(pts[i]) - river.widthMeters / 2;
        if (d < best && d < 200) {
          best = d;
          last = i;
        }
      }
    }
    if (last < 0) continue;
    const half = river.widthMeters / 2;
    const townCentre = centroid(site.town);
    // Walk downstream from the town edge and try both banks.
    const along: Array<{ p: Point; t: Point; d: number }> = [];
    let walked = 0;
    for (let i = Math.max(1, last - 2); i < pts.length && walked < 260; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const len = dist(a, b);
      const t = unit(b[0] - a[0], b[1] - a[1]);
      if (!t || len < 1) continue;
      for (let s = 0; s < len; s += 6) {
        const p: Point = [a[0] + t[0] * s, a[1] + t[1] * s];
        if (i - 1 >= last) walked += 6;
        along.push({ p, t, d: walked });
      }
    }
    let best: { score: number; plan: Tannery } | null = null;
    for (const { p, t, d } of along) {
      for (const side of [1, -1]) {
        const n: Point = [-t[1] * side, t[0] * side];
        const length = 44 + rng.range(-6, 10);
        const depth = 22;
        const offset = river.surveyed ? fixedBankOffset(document, p, n, half, t, length / 2) : half;
        if (offset === null) continue;
        const bank = offset + (river.surveyed ? 0.3 : 1.5);
        const angle = Math.atan2(t[1], t[0]);
        // `v` measured inland from the bank.
        const base = frame([p[0] + n[0] * bank, p[1] + n[1] * bank], angle);
        const at = (u: number, v: number) => base(u, side * v);
        const yard = orient(rect(at, -length / 2, 0, length / 2, depth));
        if (!site.inFrame(yard, 8)) continue;
        if (site.hitsWater(yard, 0.6) || site.hitsRoutes(yard, 2.5) || site.hitsBlocked(yard)) continue;
        const wards = site.wardsUnder(yard);
        if (wards.has("market") || wards.has("castle") || wards.has("park")) continue;
        const outsideWall = site.walled && !site.insideTown(centroid(yard));
        const cleared = site.buildingsIn(yard).length;
        // The tanners worked on the town's own bank; the far bank means a crossing for every hide.
        const townSide = n[0] * (townCentre[0] - p[0]) + n[1] * (townCentre[1] - p[1]) > 0;
        const score =
          (townSide ? 3 : 0) +
          (site.walled ? (outsideWall ? 2 : 0) : 0) -
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

/** Deterministic for a document and its finished fabric. */
export function buildAerialLandmarkPlan(
  document: CityDocument,
  input: AerialLandmarkInput,
  seed = "aerial-landmarks"
): AerialLandmarkPlan {
  // A completed generation recipe marks a generated town. Hand-built or upgraded maps keep
  // their district-local edits: these town-wide works would shift with every edit.
  if (!input.buildings.length || !document.fabric?.generation) return EMPTY_PLAN;
  const site = new Site(document, input);
  const root = `${document.fabric?.seed ?? document.generationSeed ?? "aerial"}:${seed}`;
  // Large fixed works first (the gate outworks and river trades), then free-standing pieces.
  const barbicans = placeBarbicans(site, makeRng(`${root}:barbican`));
  const tanneries = placeTanneries(site, input, makeRng(`${root}:tannery`));
  const monasteries = placeMonasteries(site, input, makeRng(`${root}:monastery`));
  const gallows = placeGallows(site, input, makeRng(`${root}:gallows`));
  const windmills = placeWindmills(site, input, makeRng(`${root}:windmill`));
  return { monasteries, windmills, barbicans, tanneries, gallows };
}

/** Footprints that displace ordinary houses, lanes and fields. */
export function aerialLandmarkFootprints(plan: AerialLandmarkPlan): Point[][] {
  return [
    ...plan.monasteries.map(m => m.precinct),
    ...plan.tanneries.map(t => t.yard),
    ...plan.barbicans.map(b => convexHull([...b.court, ...b.frontTowers.flat()])),
    ...plan.windmills.map(w => circle(w.center, w.baseRadius + 1, 10)),
    ...plan.gallows.map(g => circle(g.center, g.moundRadius + 1, 12))
  ];
}
