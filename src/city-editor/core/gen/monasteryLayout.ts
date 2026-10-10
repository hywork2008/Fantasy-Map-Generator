// Monastery layout: a programme of buildings fitted inside one Voronoi block.
//
// A precinct is the block's own outline pulled back from its streets, so the wall
// follows the cell instead of cutting across it. The church fronts the street, the
// cloister sits behind it, and whatever ground is left becomes garden and orchard.
// Everything is built from the same footprints as houses (gabled rectangles), so the
// renderer draws them with the town's own building style.
import type { ReligiousHouse } from "../../../data/civilizationTraditions";
import type { Id, Point } from "../types";
import { clipPolygonHalfPlane, nearestOnPolyline, pointInPolygon, polygonArea, segmentsIntersect } from "./geom";
import type { Rng } from "./prng";

export type MonasteryKind = ReligiousHouse;

export interface PrecinctBuilding {
  polygon: Point[];
  /** Roof ridge; absent for flat or round roofs. */
  ridge?: [Point, Point];
  role: "church" | "apse" | "crossing-tower" | "range" | "gatehouse" | "bell-tower" | "dome";
}

export interface PrecinctCourt {
  polygon: Point[];
  kind: "garth" | "yard" | "garden";
}

export interface Monastery {
  id: Id;
  kind: MonasteryKind;
  name: string;
  /** Voronoi block the precinct sits in. */
  faceId: Id;
  /** Closed ring of the precinct; houses, alleys and fields are cleared from it. */
  precinct: Point[];
  /** Open wall line; the gap between its ends is the gate. */
  wall: Point[];
  gate: Point;
  buildings: PrecinctBuilding[];
  courts: PrecinctCourt[];
  /** Roofed cloister walk as a ring (outer) around the garth. */
  walk?: { outer: Point[]; garth: Point[] };
  beds: Point[][];
  trees: Array<{ at: Point; radius: number }>;
  well?: Point;
}

export interface MonasteryFitInput {
  kind: MonasteryKind;
  id: Id;
  faceId: Id;
  /** Block outline already pulled back from its streets. */
  ring: Point[];
  rng: Rng;
  /** Ring edges worth fronting (indices); all long edges when omitted. */
  frontEdges?: number[];
  /** Ground kept around the buildings inside the precinct, in metres. */
  margin: number;
  maxScale?: number;
  minScale?: number;
}

export interface MonasteryFit {
  monastery: Monastery;
  scale: number;
  /** Midpoint of the edge the church faces. */
  front: Point;
  /** Area of the trimmed precinct divided by the built core's footprint. */
  looseness: number;
}

type Local = Point;

interface LocalPlan {
  width: number;
  depth: number;
  buildings: Array<{ polygon: Local[]; ridge?: [Local, Local]; role: PrecinctBuilding["role"] }>;
  courts: Array<{ polygon: Local[]; kind: PrecinctCourt["kind"] }>;
  walk?: { outer: Local[]; garth: Local[] };
  beds: Local[][];
  well?: Local;
  /** Where the wall opens, measured along the street edge from the core's corner. */
  gateU: number;
  treeSpacing: number;
}

/** Wall clearance between the precinct line and the first building. */
const WALL_GAP = 1.4;
const GATE_HALF_WIDTH = 1.7;

function rect(u0: number, v0: number, u1: number, v1: number): Local[] {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1]
  ];
}

function disc(cu: number, cv: number, r: number, steps = 14): Local[] {
  return Array.from({ length: steps }, (_, i): Local => {
    const t = (i / steps) * Math.PI * 2;
    return [cu + Math.cos(t) * r, cv + Math.sin(t) * r];
  });
}

/** Cloister monastery (abbey) or town convent (friary): church on the street, cloister behind it. */
function cloisterProgram(kind: MonasteryKind, s: number): LocalPlan {
  const abbey = kind === "abbey";
  const garth = (abbey ? 18 : 14) * s;
  const walk = (abbey ? 3 : 2.8) * s;
  const range = (abbey ? 7 : 6.5) * s;
  const block = garth + 2 * walk + 2 * range;
  const naveDepth = (abbey ? 11 : 10) * s;
  const front = (abbey ? 5.5 : 5) * s; // yard between the street wall and the west front
  const naveV0 = front;
  const naveV1 = front + naveDepth;
  const choirLen = (abbey ? 12 : 9) * s;
  const choirDepth = naveDepth * 0.82;
  const midV = (naveV0 + naveV1) / 2;
  const transept = abbey ? 3.5 * s : 0;
  const walkV0 = naveV1;
  const walkV1 = walkV0 + 2 * walk + garth;
  const rangesEnd = walkV1 + range;
  const gardenU0 = block + 4 * s;
  const gardenW = (abbey ? 20 : 12) * s;
  const width = gardenU0 + gardenW;
  const depth = rangesEnd;

  const buildings: LocalPlan["buildings"] = [];
  // Nave runs along the street; the choir continues it and ends in an apse.
  buildings.push({
    polygon: rect(0, naveV0, block, naveV1),
    ridge: [
      [0, midV],
      [block, midV]
    ],
    role: "church"
  });
  buildings.push({
    polygon: rect(block, midV - choirDepth / 2, block + choirLen, midV + choirDepth / 2),
    ridge: [
      [block, midV],
      [block + choirLen, midV]
    ],
    role: "church"
  });
  const apseR = choirDepth / 2;
  buildings.push({
    polygon: Array.from({ length: 9 }, (_, i): Local => {
      const t = -Math.PI / 2 + (i / 8) * Math.PI;
      return [block + choirLen + Math.cos(t) * apseR, midV + Math.sin(t) * apseR];
    }),
    role: "apse"
  });
  if (abbey) {
    // Transept arms reach toward the street and into the cloister side.
    buildings.push({
      polygon: rect(block - 3.5 * s, 0, block + 3.5 * s, naveV1 + transept),
      ridge: [
        [block, 0],
        [block, naveV1 + transept]
      ],
      role: "church"
    });
    const t = 2.75 * s;
    buildings.push({ polygon: rect(block - t, midV - t, block + t, midV + t), role: "crossing-tower" });
  } else {
    // A friary church has no transept, only a small bell turret where nave and choir meet.
    const t = 1.5 * s;
    buildings.push({ polygon: rect(block - t, midV - t, block + t, midV + t), role: "crossing-tower" });
  }
  // Three claustral ranges; the church closes the fourth side.
  const eastStart = naveV1 + transept;
  buildings.push({
    polygon: rect(0, walkV0, range, rangesEnd),
    ridge: [
      [range / 2, walkV0],
      [range / 2, rangesEnd]
    ],
    role: "range"
  });
  buildings.push({
    polygon: rect(0, walkV1, block, rangesEnd),
    ridge: [
      [0, walkV1 + range / 2],
      [block, walkV1 + range / 2]
    ],
    role: "range"
  });
  buildings.push({
    polygon: rect(block - range, eastStart, block, rangesEnd),
    ridge: [
      [block - range / 2, eastStart],
      [block - range / 2, rangesEnd]
    ],
    role: "range"
  });
  const walkOuter = rect(range, walkV0, block - range, walkV1);
  const garthPoly = rect(range + walk, walkV0 + walk, block - range - walk, walkV1 - walk);

  // Physic garden: raised beds east of the cloister.
  const gx0 = gardenU0;
  const gx1 = gardenU0 + gardenW;
  const gy0 = walkV1 - garth - walk;
  const gy1 = rangesEnd - 1.5 * s;
  const cols = abbey ? 3 : 2;
  const rows = Math.max(2, Math.round((gy1 - gy0) / (6 * s)));
  const path = 1.4 * s;
  const bw = (gx1 - gx0 - path * (cols + 1)) / cols;
  const bh = (gy1 - gy0 - path * (rows + 1)) / rows;
  const beds: Local[][] = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const u = gx0 + path + c * (bw + path);
      const v = gy0 + path + r * (bh + path);
      beds.push(rect(u, v, u + bw, v + bh));
    }
  return {
    width,
    depth,
    buildings,
    courts: [
      { polygon: garthPoly, kind: "garth" },
      { polygon: rect(gx0, gy0, gx1, gy1), kind: "garden" }
    ],
    walk: { outer: walkOuter, garth: garthPoly },
    beds,
    well: [(range + block - range) / 2, (walkV0 + walkV1) / 2],
    gateU: width - Math.max(4.6, 4.5 * s),
    treeSpacing: abbey ? 6.2 : 7.5
  };
}

/** Orthodox monastery: a domed church in the middle of a courtyard ringed by cells. */
function orthodoxProgram(s: number): LocalPlan {
  const width = 46 * s;
  const depth = 40 * s;
  const t = 6 * s;
  const cx = width / 2;
  const cy = 21 * s;
  const buildings: LocalPlan["buildings"] = [
    // Cells on three sides and the refectory on the street side beside the gate.
    {
      polygon: rect(0, 8 * s, t, depth - t),
      ridge: [
        [t / 2, 8 * s],
        [t / 2, depth - t]
      ],
      role: "range"
    },
    {
      polygon: rect(width - t, 8 * s, width, depth - t),
      ridge: [
        [width - t / 2, 8 * s],
        [width - t / 2, depth - t]
      ],
      role: "range"
    },
    {
      polygon: rect(0, depth - t, width, depth),
      ridge: [
        [0, depth - t / 2],
        [width, depth - t / 2]
      ],
      role: "range"
    },
    {
      polygon: rect(24 * s, 0, width, 7.5 * s),
      ridge: [
        [24 * s, 3.75 * s],
        [width, 3.75 * s]
      ],
      role: "range"
    },
    { polygon: rect(7 * s, 0.4 * s, 12 * s, 5.4 * s), role: "bell-tower" },
    // Cross-in-square church.
    {
      polygon: rect(cx - 7 * s, cy - 4 * s, cx + 7 * s, cy + 4 * s),
      ridge: [
        [cx - 7 * s, cy],
        [cx + 7 * s, cy]
      ],
      role: "church"
    },
    {
      polygon: rect(cx - 4 * s, cy - 8 * s, cx + 4 * s, cy + 8 * s),
      ridge: [
        [cx, cy - 8 * s],
        [cx, cy + 8 * s]
      ],
      role: "church"
    },
    { polygon: disc(cx, cy, 3.2 * s), role: "dome" }
  ];
  return {
    width,
    depth,
    buildings,
    courts: [{ polygon: rect(t, 8 * s, width - t, depth - t), kind: "yard" }],
    beds: [],
    well: [cx + 11 * s, cy + 9 * s],
    gateU: 12 * s + 3.2,
    treeSpacing: 6.5
  };
}

function programFor(kind: MonasteryKind, s: number): LocalPlan {
  return kind === "orthodoxMonastery" ? orthodoxProgram(s) : cloisterProgram(kind, s);
}

function inwardUnit(ring: Point[], a: Point, b: Point): Point | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const left: Point = [-dy / len, dx / len];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const probe = (n: Point): boolean => pointInPolygon([mid[0] + n[0] * 0.6, mid[1] + n[1] * 0.6], ring);
  if (probe(left)) return left;
  const right: Point = [-left[0], -left[1]];
  return probe(right) ? right : null;
}

function ringDistance(p: Point, ring: Point[]): number {
  return nearestOnPolyline(p, [...ring, ring[0]]).dist;
}

/** Whether `inner` lies inside `outer` with at least `clearance` to spare. */
function containsWithClearance(outer: Point[], inner: Point[], clearance: number): boolean {
  if (!inner.every(p => pointInPolygon(p, outer) && ringDistance(p, outer) >= clearance)) return false;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++)
      if (segmentsIntersect(a, b, outer[j], outer[(j + 1) % outer.length])) return false;
  }
  return true;
}

/** Fit the programme into the ring: largest scale first, along each candidate street edge. */
export function fitMonastery(input: MonasteryFitInput): MonasteryFit | null {
  const { kind, ring, rng } = input;
  if (ring.length < 3) return null;
  const maxScale = input.maxScale ?? 1.15;
  const minScale = input.minScale ?? 0.62;
  const edges = input.frontEdges ?? ring.map((_, i) => i);
  let best: {
    scale: number;
    edge: number;
    u0: number;
    origin: Point;
    u: Point;
    v: Point;
    length: number;
    plan: LocalPlan;
  } | null = null;
  for (const edge of edges) {
    const a = ring[edge];
    const b = ring[(edge + 1) % ring.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const v = inwardUnit(ring, a, b);
    if (!v || length < 20 * minScale) continue;
    const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const at = (lu: number, lv: number): Point => [a[0] + u[0] * lu + v[0] * lv, a[1] + u[1] * lu + v[1] * lv];
    for (let scale = maxScale; scale >= minScale - 1e-9; scale -= 0.07) {
      if (best && scale < best.scale - 1e-9) break;
      const plan = programFor(kind, scale);
      if (plan.width > length) continue;
      // Try the middle of the edge first, then outward.
      const slack = length - plan.width;
      const offsets: number[] = [];
      for (let k = 0; k <= slack; k += 2) offsets.push(k);
      offsets.sort((p, q) => Math.abs(p - slack / 2) - Math.abs(q - slack / 2));
      const u0 = offsets.find(offset => {
        const core = rect(offset, WALL_GAP, offset + plan.width, WALL_GAP + plan.depth).map(([lu, lv]) => at(lu, lv));
        return containsWithClearance(ring, core, 0.9);
      });
      if (u0 === undefined) continue;
      if (!best || scale > best.scale + 1e-9 || (Math.abs(scale - best.scale) < 1e-9 && length > best.length))
        best = { scale, edge, u0, origin: a, u, v, length, plan };
      break;
    }
  }
  if (!best) return null;
  return build(input, best, rng);
}

function build(
  input: MonasteryFitInput,
  fit: { scale: number; edge: number; u0: number; origin: Point; u: Point; v: Point; plan: LocalPlan },
  rng: Rng
): MonasteryFit | null {
  const { plan, origin, u, v } = fit;
  const mirror = rng() < 0.5;
  const at = (lu: number, lv: number): Point => {
    const mu = mirror ? plan.width - lu : lu;
    return [
      origin[0] + u[0] * (fit.u0 + mu) + v[0] * (lv + WALL_GAP),
      origin[1] + u[1] * (fit.u0 + mu) + v[1] * (lv + WALL_GAP)
    ];
  };
  const world = (poly: Local[]): Point[] => poly.map(([lu, lv]) => at(lu, lv));
  const buildings: PrecinctBuilding[] = plan.buildings.map(b => ({
    polygon: world(b.polygon),
    ...(b.ridge ? { ridge: [at(...b.ridge[0]), at(...b.ridge[1])] as [Point, Point] } : {}),
    role: b.role
  }));
  // Gatehouse on the street wall, set into the precinct beside the church front.
  const gu = plan.gateU;
  buildings.push({
    polygon: world(rect(gu - 3.2, -WALL_GAP + 0.3, gu + 3.2, -WALL_GAP + 3.6)),
    role: "gatehouse"
  });
  const gatePoint = at(gu, -WALL_GAP);

  // Trim the precinct to the programme plus a margin of ground; a small block stays whole.
  let precinct = input.ring.map(p => [p[0], p[1]] as Point);
  const m = input.margin;
  const dirU: Point = [mirror ? -u[0] : u[0], mirror ? -u[1] : u[1]];
  const cut = (origin2: Point, normal: Point) => {
    const next = clipPolygonHalfPlane(precinct, origin2, normal);
    if (next.length >= 3) precinct = next;
  };
  cut(at(-m, 0), dirU);
  cut(at(plan.width + m, 0), [-dirU[0], -dirU[1]]);
  cut(at(0, plan.depth + m), [-v[0], -v[1]]);
  const area = Math.abs(polygonArea(precinct));
  const core = plan.width * plan.depth;

  const wall = openWall(precinct, gatePoint);
  const courts: PrecinctCourt[] = plan.courts.map(c => ({ polygon: world(c.polygon), kind: c.kind }));
  const walk = plan.walk ? { outer: world(plan.walk.outer), garth: world(plan.walk.garth) } : undefined;
  const beds = plan.beds.map(world);
  const well = plan.well ? at(...plan.well) : undefined;
  const monastery: Monastery = {
    id: input.id,
    kind: input.kind,
    name: "",
    faceId: input.faceId,
    precinct,
    wall,
    gate: gatePoint,
    buildings,
    courts,
    ...(walk ? { walk } : {}),
    beds,
    trees: [],
    ...(well ? { well } : {})
  };
  const lattice = (lu: number, lv: number): Point => [
    origin[0] + u[0] * (fit.u0 + lu) + v[0] * (lv + WALL_GAP),
    origin[1] + u[1] * (fit.u0 + lu) + v[1] * (lv + WALL_GAP)
  ];
  monastery.trees = plantTrees(monastery, lattice, plan, rng);
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return {
    monastery,
    scale: fit.scale,
    front: mid(at(0, -WALL_GAP), at(plan.width, -WALL_GAP)),
    looseness: area / Math.max(1, core)
  };
}

/** The ring as one open polyline whose ends sit either side of the gate. */
function openWall(ring: Point[], gate: Point): Point[] {
  let edge = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const hit = nearestOnPolyline(gate, [ring[i], ring[(i + 1) % ring.length]]);
    if (hit.dist < bestDist) {
      bestDist = hit.dist;
      edge = i;
    }
  }
  const a = ring[edge];
  const b = ring[(edge + 1) % ring.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const t = (gate[0] - a[0]) * ux + (gate[1] - a[1]) * uy;
  const before: Point = [a[0] + ux * Math.max(0, t - GATE_HALF_WIDTH), a[1] + uy * Math.max(0, t - GATE_HALF_WIDTH)];
  const after: Point = [a[0] + ux * Math.min(len, t + GATE_HALF_WIDTH), a[1] + uy * Math.min(len, t + GATE_HALF_WIDTH)];
  const out: Point[] = [after];
  for (let k = 1; k <= ring.length; k++) out.push(ring[(edge + k) % ring.length]);
  out.push(before);
  return out;
}

/** Orchard and grounds: trees stand in rows laid out along the church front, not scattered. */
function plantTrees(
  m: Monastery,
  lattice: (lu: number, lv: number) => Point,
  plan: LocalPlan,
  rng: Rng
): Monastery["trees"] {
  const spacing = plan.treeSpacing;
  const clearOf = [...m.buildings.map(b => b.polygon), ...m.courts.map(c => c.polygon)];
  const trees: Monastery["trees"] = [];
  for (let lu = -90; lu <= plan.width + 90 && trees.length < 220; lu += spacing)
    for (let lv = -2; lv <= plan.depth + 90 && trees.length < 220; lv += spacing) {
      const p = lattice(lu + rng.range(-0.35, 0.35), lv + rng.range(-0.35, 0.35));
      if (!pointInPolygon(p, m.precinct) || ringDistance(p, m.precinct) < 2.6) continue;
      if (Math.hypot(p[0] - m.gate[0], p[1] - m.gate[1]) < 7) continue;
      if (clearOf.some(poly => pointInPolygon(p, poly) || ringDistance(p, poly) < 2.4)) continue;
      trees.push({ at: p, radius: rng.range(1.5, 1.95) });
    }
  return trees;
}
