import { polygonOverlaps } from "../fortifications";
import { facePoints } from "../mesh";
import { regionalCoastalWaterPolygons } from "../regionalCoast";
import { flowingRivers } from "../riverFlow";
import type { CityDocument, Id, Point } from "../types";
import { ferryLandingReserves } from "./ferryLanding";
import { nearestOnPolyline, pointInPolygon, segmentsIntersect } from "./geom";
import { makeRng } from "./prng";

/** Average residents per dwelling used by FMG and city generation. */
export const URBAN_DWELLING_SIZE = 4.5;

export type WatermillKind = "gristmill" | "fulling" | "forge";

export interface WatermillWheel {
  center: Point;
  radius: number;
  width: number;
  angleRad: number;
  bladeCount: number;
}

export interface WatermillWeir {
  points: Point[];
  crestWidth: number;
  foamPoints: Point[];
}

export interface Watermill {
  id: Id;
  riverId: Id;
  kind: WatermillKind;
  name: string;
  bankSide: "left" | "right";
  millhousePolygon: Point[];
  millhouseRidge: [Point, Point];
  riverSideRoof: Point[];
  landSideRoof: Point[];
  wheel: WatermillWheel;
  weir?: WatermillWeir;
  wakePolyline: Point[];
  isBridgeMill?: boolean;
}

export interface WatermillPlan {
  mills: Watermill[];
  buildingCount: number;
  derivedPopulation: number;
}

type Passage = { points: Point[]; widthMeters: number };

/** Leave the complete passage width and a small walking margin beside a millhouse. */
function obstructsPassage(house: Point[], passage: Passage): boolean {
  const clearance = passage.widthMeters / 2 + 0.75;
  for (let i = 1; i < passage.points.length; i++) {
    const a = passage.points[i - 1];
    const b = passage.points[i];
    if (house.some(p => nearestOnPolyline(p, [a, b]).dist < clearance)) return true;
    if (pointInPolygon(a, house) || pointInPolygon(b, house)) return true;
    for (let j = 0; j < house.length; j++) {
      if (segmentsIntersect(a, b, house[j], house[(j + 1) % house.length])) return true;
    }
  }
  return false;
}

/**
 * Calculates the appropriate number of watermills based on building count (derived population).
 * In medieval Europe, towns along flowing rivers possessed watermills roughly in proportion
 * to grain consumption and industrial needs:
 * - Small settlement / hamlet (<300 pop, <67 buildings): 1 mill
 * - Small town (300-700 pop, 67-155 buildings): 1-2 mills
 * - Town (700-1,500 pop, 155-333 buildings): 2-3 mills
 * - Moderate city (1,500-3,500 pop, 333-777 buildings): 3-5 mills
 * - Large city (3,500-7,000 pop, 777-1,555 buildings): 5-7 mills
 * - Major city (7,000-13,000 pop, 1,555-2,888 buildings): 7-10 mills
 * - Metropolis (13,000+ pop, 2,888+ buildings): 10-15 mills
 */
export function calculateWatermillCount(buildingCount: number): number {
  if (buildingCount <= 0) return 0;
  const population = Math.round(buildingCount * URBAN_DWELLING_SIZE);
  if (population < 300) return 1;
  if (population < 700) return 2;
  if (population < 1500) return 3;
  if (population < 3500) return 4;
  if (population < 6000) return 6;
  if (population < 10000) return 8;
  if (population < 15000) return 10;
  return Math.min(15, 10 + Math.floor((population - 15000) / 3500));
}

interface RiverSegmentData {
  surveyed: boolean;
  riverId: Id;
  riverPoints: Point[];
  widthMeters: number;
  segIndex: number;
  a: Point;
  b: Point;
  length: number;
  tangent: Point;
  normal: Point; // Left-hand normal
}

/**
 * Identifies obstacles (bridges, gates, walls, harbor quays, existing mills) to avoid collision.
 */
function collectObstacles(document: CityDocument): {
  bridges: Array<{ point: Point; radius: number }>;
  walls: Array<[Point, Point]>;
  gates: Point[];
  piers: Point[][];
  landings: Point[][];
} {
  const landings: Point[][] = [];
  const bridges: Array<{ point: Point; radius: number }> = [];
  const walls: Array<[Point, Point]> = [];
  const gates: Point[] = [];
  const piers: Point[][] = [];

  for (const group of document.featureGroups ?? []) {
    if (group.kind === "road" && (group.id.includes("bridge") || group.name?.toLowerCase().includes("bridge"))) {
      const pts = group.segments.flatMap(s => {
        const e = document.mesh.edges[s.edgeId];
        if (!e) return [];
        return [document.mesh.vertices[e.a]?.point, document.mesh.vertices[e.b]?.point].filter((p): p is Point => !!p);
      });
      if (pts.length) {
        const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
        const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
        bridges.push({ point: [cx, cy], radius: group.style.widthMeters / 2 + 10 });
      }
    } else if (group.kind === "wall") {
      for (const seg of group.segments) {
        const e = document.mesh.edges[seg.edgeId];
        if (e && document.mesh.vertices[e.a] && document.mesh.vertices[e.b]) {
          walls.push([document.mesh.vertices[e.a].point, document.mesh.vertices[e.b].point]);
        }
      }
    }
  }

  // FMG bridges are fixed crossings, not road groups.
  for (const crossing of document.importedFixedCrossings?.crossings ?? [])
    bridges.push({
      point: [crossing.q[0], crossing.q[1]],
      radius: Math.hypot(crossing.deckA[0] - crossing.deckB[0], crossing.deckA[1] - crossing.deckB[1]) / 2 + 10
    });

  // A ferry landing keeps its bank clear of a mill and its weir (Batonykut).
  landings.push(...ferryLandingReserves(document));

  for (const gate of document.gates ?? []) {
    const pt = document.mesh.vertices[gate.vertexId]?.point;
    if (pt) gates.push(pt);
  }

  return { bridges, walls, gates, piers, landings };
}

type Box = [number, number, number, number];
/** A ring with its edges bucketed by y band: a ray cast only meets edges spanning its y. */
type BandedRing = { ring: Point[]; minY: number; maxY: number; bandHeight: number; bands: number[][] };
type SurveyedWater = { rings: Point[][]; banded: BandedRing[]; box: Box };
const surveyedWaterCache = new WeakMap<CityDocument, SurveyedWater[]>();

function ringsBox(rings: Point[][]): Box {
  const pts = rings.flat();
  const xs = pts.map(p => p[0]),
    ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Surveyed water as the source rings (outer bank plus island holes), with bounding boxes.
 * The decomposed parts from waterPolygons have internal seams that a river centreline can
 * run along; the source rings have none. Cached per document, so the fixed payload is never
 * re-keyed per call as in polygonHitsDocumentWater. */
function surveyedWater(document: CityDocument): SurveyedWater[] {
  let water = surveyedWaterCache.get(document);
  if (!water) {
    const fixed = document.importedFixedCrossings;
    const sources: Point[][][] = [
      ...(document.waterAreas ?? []).map(area => [area.polygon]),
      ...(fixed ? [...fixed.rivers, ...(fixed.obstacles ?? [])] : []).map(w =>
        w.rings.map(ring => ring.map((p): Point => [p[0], p[1]]))
      )
    ].filter(rings => rings.some(ring => ring.length >= 3));
    water = sources.map(rings => ({ rings, banded: rings.map(bandRing), box: ringsBox(rings) }));
    surveyedWaterCache.set(document, water);
  }
  return water;
}

function bandRing(ring: Point[]): BandedRing {
  const ys = ring.map(p => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const count = Math.max(1, ring.length);
  const bandHeight = (maxY - minY) / count;
  const bands: number[][] = Array.from({ length: count }, () => []);
  const band = (y: number) => (bandHeight > 0 ? Math.min(count - 1, Math.floor((y - minY) / bandHeight)) : 0);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const lo = Math.min(ring[i][1], ring[j][1]);
    const hi = Math.max(ring[i][1], ring[j][1]);
    for (let b = band(lo); b <= band(hi); b++) bands[b].push(i);
  }
  return { ring, minY, maxY, bandHeight, bands };
}

/** `pointInPolygon` over the band's edges only. Same per-edge test, so the same parity. */
function inBandedRing(p: Point, banded: BandedRing): boolean {
  const { ring, minY, maxY, bandHeight, bands } = banded;
  // No edge straddles a ray outside the ring's y range.
  if (p[1] < minY || p[1] >= maxY) return false;
  const band = bands[bandHeight > 0 ? Math.min(bands.length - 1, Math.floor((p[1] - minY) / bandHeight)) : 0];
  let inside = false;
  for (const i of band) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[i === 0 ? ring.length - 1 : i - 1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd over a water body's rings, so islands stay dry. */
function inWater(p: Point, water: SurveyedWater): boolean {
  const [x0, y0, x1, y1] = water.box;
  if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return false;
  return water.banded.filter(ring => inBandedRing(p, ring)).length % 2 === 1;
}

function dryAt(document: CityDocument, p: Point): boolean {
  return !surveyedWater(document).some(water => inWater(p, water));
}

/** Whether a footprint touches surveyed water: a corner in the water or an edge crossing a bank. */
export function hitsSurveyedWater(document: CityDocument, polygon: Point[]): boolean {
  const box = ringsBox([polygon]);
  for (const water of surveyedWater(document)) {
    const w = water.box;
    if (w[0] > box[2] || w[2] < box[0] || w[1] > box[3] || w[3] < box[1]) continue;
    if (polygon.some(p => inWater(p, water))) return true;
    for (const ring of water.rings)
      for (let i = 0; i < ring.length; i++)
        for (let j = 0; j < polygon.length; j++)
          if (segmentsIntersect(ring[i], ring[(i + 1) % ring.length], polygon[j], polygon[(j + 1) % polygon.length]))
            return true;
  }
  return false;
}

/**
 * Distance from the centreline to the surveyed bank along `normal`, or null when no water is
 * near. FMG centrelines need not lie inside the surveyed water, so the search starts from the
 * wet point nearest the centre. The bank must be dry over a frontage of ±`halfFrontage` along
 * `tangent`, so a building set on it stays out of the water on a bend.
 */
export function fixedBankOffset(
  document: CityDocument,
  centre: Point,
  normal: Point,
  halfWidth: number,
  tangent: Point = [-normal[1], normal[0]],
  halfFrontage = 0
): number | null {
  const reach = halfWidth * 2 + 10;
  const at = (d: number, u = 0): Point => [
    centre[0] + normal[0] * d + tangent[0] * u,
    centre[1] + normal[1] * d + tangent[1] * u
  ];
  let wet: number | null = null;
  for (let k = 0; k <= reach * 2 && wet === null; k++)
    for (const d of k ? [k * 0.5, -k * 0.5] : [0])
      if (!dryAt(document, at(d))) {
        wet = d;
        break;
      }
  if (wet === null) return null;
  const front = halfFrontage > 0 ? [-halfFrontage, 0, halfFrontage] : [0];
  for (let d = wet + 0.5; d <= wet + reach; d += 0.5) if (front.every(u => dryAt(document, at(d, u)))) return d + 0.3;
  return null;
}

/**
 * Determines whether a given point is located on dry land (not in sea or deep water face).
 */
function isLandPoint(document: CityDocument, pt: Point): boolean {
  const margin = (document.frame?.extentMeters ?? 1000) / 2;
  if (Math.abs(pt[0]) > margin || Math.abs(pt[1]) > margin) return false;

  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water === "sea") {
      const poly = facePoints(document.mesh, face);
      if (poly.length >= 3 && pointInPolygon(pt, poly)) return false;
    }
  }
  // Sea beyond the town mesh is not a mesh face.
  return !regionalCoastalWaterPolygons(document).some(poly => pointInPolygon(pt, poly));
}

/**
 * Plans and generates watermills and millhouses along the city's rivers.
 */
export function buildWatermillPlan(
  document: CityDocument,
  buildingCount: number,
  seed = "watermill-fabric",
  lanes: Passage[] = [],
  fields: Point[][] = []
): WatermillPlan {
  const derivedPopulation = Math.round(buildingCount * URBAN_DWELLING_SIZE);
  const rivers = flowingRivers(document);
  if (!rivers.length || buildingCount <= 0) {
    return { mills: [], buildingCount, derivedPopulation };
  }

  const targetCount = calculateWatermillCount(buildingCount);
  if (targetCount <= 0) {
    return { mills: [], buildingCount, derivedPopulation };
  }

  const rng = makeRng(`${document.fabric?.seed ?? document.generationSeed ?? "watermill"}:${seed}`);
  const obstacles = collectObstacles(document);
  const passages: Passage[] = [...lanes];
  for (const group of document.featureGroups ?? []) {
    if (group.kind !== "road") continue;
    for (const segment of group.segments) {
      const edge = document.mesh.edges[segment.edgeId];
      const a = edge && document.mesh.vertices[edge.a]?.point;
      const b = edge && document.mesh.vertices[edge.b]?.point;
      if (a && b) passages.push({ points: [a, b], widthMeters: group.style.widthMeters });
    }
  }

  // Collect river segments
  const allSegments: RiverSegmentData[] = [];
  for (const river of rivers) {
    const pts = river.points;
    const width = river.widthMeters || 12;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 5) continue;
      const tx = (b[0] - a[0]) / len;
      const ty = (b[1] - a[1]) / len;
      allSegments.push({
        riverId: river.id,
        surveyed: river.surveyed,
        riverPoints: pts,
        widthMeters: width,
        segIndex: i,
        a,
        b,
        length: len,
        tangent: [tx, ty],
        normal: [-ty, tx]
      });
    }
  }

  if (!allSegments.length) {
    return { mills: [], buildingCount, derivedPopulation };
  }

  const mills: Watermill[] = [];
  const placedLocations: Point[] = [];
  const MIN_MILL_SPACING = 36; // meters between watermills

  // Candidate generation
  interface Candidate {
    seg: RiverSegmentData;
    fraction: number;
    side: "left" | "right";
    isNearBridge: boolean;
    score: number;
  }

  const candidates: Candidate[] = [];

  for (const seg of allSegments) {
    const samples = Math.max(1, Math.floor(seg.length / 18));
    for (let s = 1; s <= samples; s++) {
      const frac = s / (samples + 1);
      const px = seg.a[0] + seg.tangent[0] * (seg.length * frac);
      const py = seg.a[1] + seg.tangent[1] * (seg.length * frac);
      const pt: Point = [px, py];

      // Check distance to bridges
      let isNearBridge = false;
      let bridgeDist = Number.POSITIVE_INFINITY;
      for (const br of obstacles.bridges) {
        const d = Math.hypot(pt[0] - br.point[0], pt[1] - br.point[1]);
        if (d < bridgeDist) bridgeDist = d;
      }
      // Bridge mills sit slightly downstream of bridges (12-25m)
      if (bridgeDist >= 12 && bridgeDist <= 28) {
        isNearBridge = true;
      }

      for (const side of ["left", "right"] as const) {
        // Evaluate candidate quality
        let score = rng();
        if (isNearBridge) score += 3.0; // Strong historical preference for bridge mills!
        candidates.push({ seg, fraction: frac, side, isNearBridge, score });
      }
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  let millIndex = 0;
  for (const cand of candidates) {
    if (mills.length >= targetCount) break;

    const { seg, fraction, side, isNearBridge } = cand;
    const halfWidth = seg.widthMeters / 2;
    const nx = side === "left" ? seg.normal[0] : -seg.normal[0];
    const ny = side === "left" ? seg.normal[1] : -seg.normal[1];
    const normal: Point = [nx, ny];
    const tangent = seg.tangent;

    const px = seg.a[0] + tangent[0] * (seg.length * fraction);
    const py = seg.a[1] + tangent[1] * (seg.length * fraction);
    // Bank contact point. FMG water is the surveyed bank polygon, whose edge need not sit
    // at half the descriptor width: walk out from the centreline to the first dry ground.
    const bankOffset = seg.surveyed ? fixedBankOffset(document, [px, py], normal, halfWidth, tangent, 6.5) : halfWidth;
    if (bankOffset === null) continue;
    const bankPt: Point = [px + normal[0] * bankOffset, py + normal[1] * bankOffset];

    // Spacing check against already placed mills
    if (placedLocations.some(p => Math.hypot(p[0] - bankPt[0], p[1] - bankPt[1]) < MIN_MILL_SPACING)) {
      continue;
    }

    // Clearance check: too close to bridge structure (< 9m)
    if (obstacles.bridges.some(b => Math.hypot(bankPt[0] - b.point[0], bankPt[1] - b.point[1]) < 9)) {
      continue;
    }

    // Clearance check: ferry landing reserve, plus room for the weir
    if (
      obstacles.landings.some(
        ring => pointInPolygon(bankPt, ring) || nearestOnPolyline(bankPt, [...ring, ring[0]]).dist < 8
      )
    )
      continue;

    // Clearance check: city walls (< 8m)
    if (obstacles.walls.some(([w1, w2]) => nearestOnPolyline(bankPt, [w1, w2]).dist < 8)) {
      continue;
    }

    // Clearance check: city gates (< 14m)
    if (obstacles.gates.some(g => Math.hypot(bankPt[0] - g[0], bankPt[1] - g[1]) < 14)) {
      continue;
    }

    // Millhouse dimensions
    const houseLength = 8.5 + rng.range(0, 2.5); // along river
    const houseDepth = 5.8 + rng.range(0, 1.4); // inland
    const millCenter: Point = [bankPt[0] + normal[0] * (houseDepth / 2), bankPt[1] + normal[1] * (houseDepth / 2)];

    // Must be on land
    if (!isLandPoint(document, millCenter)) {
      continue;
    }

    // House vertices:
    // P1: river-side upstream
    // P2: river-side downstream
    // P3: land-side downstream
    // P4: land-side upstream
    const hl2 = houseLength / 2;
    const hd2 = houseDepth / 2;

    const p1: Point = [
      millCenter[0] - tangent[0] * hl2 - normal[0] * hd2,
      millCenter[1] - tangent[1] * hl2 - normal[1] * hd2
    ];
    const p2: Point = [
      millCenter[0] + tangent[0] * hl2 - normal[0] * hd2,
      millCenter[1] + tangent[1] * hl2 - normal[1] * hd2
    ];
    const p3: Point = [
      millCenter[0] + tangent[0] * hl2 + normal[0] * hd2,
      millCenter[1] + tangent[1] * hl2 + normal[1] * hd2
    ];
    const p4: Point = [
      millCenter[0] - tangent[0] * hl2 + normal[0] * hd2,
      millCenter[1] - tangent[1] * hl2 + normal[1] * hd2
    ];
    const millhousePolygon = [p1, p2, p3, p4];
    if (seg.surveyed && hitsSurveyedWater(document, millhousePolygon)) continue;
    if (passages.some(passage => obstructsPassage(millhousePolygon, passage))) continue;
    // Cultivated plots are already laid out by the district generator. A mill
    // needs its own bank-side parcel instead of covering a working field.
    if (fields.some(field => polygonOverlaps(millhousePolygon, field))) continue;
    if (mills.some(mill => polygonOverlaps(millhousePolygon, mill.millhousePolygon))) continue;

    // Ridge line (gable roof along river tangent)
    const ridgeStart: Point = [(p1[0] + p4[0]) / 2, (p1[1] + p4[1]) / 2];
    const ridgeEnd: Point = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
    const millhouseRidge: [Point, Point] = [ridgeStart, ridgeEnd];

    // Roof slopes
    const riverSideRoof = [p1, p2, ridgeEnd, ridgeStart];
    const landSideRoof = [ridgeStart, ridgeEnd, p3, p4];

    // Waterwheel dimensions and position (attached to river-side wall)
    const wheelRadius = 1.9 + rng.range(0, 0.4);
    const wheelWidth = 1.6 + rng.range(0, 0.3);
    const wheelCenter: Point = [
      bankPt[0] - normal[0] * (wheelWidth / 2 + 0.2),
      bankPt[1] - normal[1] * (wheelWidth / 2 + 0.2)
    ];

    const angleRad = Math.atan2(tangent[1], tangent[0]);

    const wheel: WatermillWheel = {
      center: wheelCenter,
      radius: wheelRadius,
      width: wheelWidth,
      angleRad,
      bladeCount: 8
    };

    // Diagonal Mill Weir (ダム・堰)
    // Runs from upstream corner of millhouse diagonally across the river
    let weir: WatermillWeir | undefined;
    if (!isNearBridge && seg.widthMeters >= 7) {
      const weirSpan = Math.min(seg.widthMeters * 0.85, 24);
      // Angle weir upstream across current
      const weirVec: Point = [
        -normal[0] * weirSpan - tangent[0] * (weirSpan * 0.35),
        -normal[1] * weirSpan - tangent[1] * (weirSpan * 0.35)
      ];
      const weirStart = p1;
      const weirEnd: Point = [weirStart[0] + weirVec[0], weirStart[1] + weirVec[1]];
      const foamEnd: Point = [weirEnd[0] + tangent[0] * 1.5, weirEnd[1] + tangent[1] * 1.5];
      const foamStart: Point = [weirStart[0] + tangent[0] * 1.5, weirStart[1] + tangent[1] * 1.5];

      weir = {
        points: [weirStart, weirEnd],
        crestWidth: 1.4,
        foamPoints: [foamStart, foamEnd]
      };
    }

    // Wake / Tailrace ripples downstream of wheel
    const wakeStart: Point = [wheelCenter[0] + tangent[0] * wheelRadius, wheelCenter[1] + tangent[1] * wheelRadius];
    const wakeEnd: Point = [
      wheelCenter[0] + tangent[0] * (wheelRadius + 6.0),
      wheelCenter[1] + tangent[1] * (wheelRadius + 6.0)
    ];
    const wakePolyline = [wakeStart, wakeEnd];

    // Determine mill kind based on position / index
    let kind: WatermillKind = "gristmill";
    if (millIndex === 1 && targetCount >= 4) {
      kind = "fulling";
    } else if (millIndex === 3 && targetCount >= 6) {
      kind = "forge";
    } else if (millIndex > 4 && millIndex % 3 === 0) {
      kind = "fulling";
    }

    const name =
      kind === "gristmill"
        ? `Watermill #${millIndex + 1} (Gristmill)`
        : kind === "fulling"
          ? `Watermill #${millIndex + 1} (Fulling Mill)`
          : `Watermill #${millIndex + 1} (Forge Mill)`;

    mills.push({
      id: `watermill-${millIndex}`,
      riverId: seg.riverId,
      kind,
      name,
      bankSide: side,
      millhousePolygon,
      millhouseRidge,
      riverSideRoof,
      landSideRoof,
      wheel,
      weir,
      wakePolyline,
      isBridgeMill: isNearBridge
    });

    placedLocations.push(bankPt);
    millIndex++;
  }

  return {
    mills,
    buildingCount,
    derivedPopulation
  };
}
