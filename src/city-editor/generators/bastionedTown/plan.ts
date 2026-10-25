// Plan a bastioned town as a skeleton the existing mesh can cut, without placeRing.
import type { CityDocument, DefenseRegion, DefenseWorkPlan, Point } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { GEN_PREFIX } from "../generation/constants";
import type { Plan } from "../generation/contracts";
import { planSkeletonCore } from "../generation/skeleton/cityCore";
import type { SkeletonGate, SkeletonInputs, SkeletonRoute } from "../generation/skeleton/contracts";
import { planSkeletonCity, prepareSkeletonRun } from "../generation/skeleton/toPlan";
import { add, dist, exitSquare, signedArea, sub, unit } from "../generation/skeleton/vector";
import { unitWallShape } from "../generation/skeleton/wallShapes";
import type { GenerationObserver } from "../generationDiagnostics";
import { reportGenerationFailure } from "../generationDiagnostics";
import { pointInPolygon } from "../geom";
import { makeRng } from "../prng";
import type { BastionedTownDraft } from "./draft";
import {
  clamp,
  edgeOutward,
  insetRing,
  insetToward,
  offsetRing,
  pathEntersRing,
  polygonsOverlap,
  ringCentroid,
  ringSelfIntersects
} from "./geometry";
import { fortressGround, gradeTooSteep, groundVaries, profile, WET_DITCH_LEVEL_RANGE } from "./ground";
import { excludeReserved } from "./reserve";
import {
  citadelRequested,
  ditchSpanDeviationDegrees,
  type FortressFailureReason,
  fortressFailureMessage
} from "./validate";
import {
  classifyMainLine,
  defenseBand,
  openingVertexRange,
  pointInChannel,
  squareRiverPath,
  type WaterOpening
} from "./waterGap";

const TRACE_ATTEMPTS = 16;
const MAX_EVALUATIONS = 64;
const GATE_SHIFTS = [0, 0.15, -0.15];
const CREST = 5;
const RAVELIN_CREST = 4.5;
const DITCH_BED = -3;
const WATER_LEVEL = -0.4;
const DECK = 1.2;
const PASSAGE = 6;

export interface BastionedTownFailure {
  reason: FortressFailureReason;
  message: string;
  evaluations: number;
}

function clean(path: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of path) if (!out.length || dist(out[out.length - 1], point) > 0.05) out.push(point);
  return out;
}

/** A fixed approach that enters a bastion cannot be bent onto a salient. */
export function fixedApproachHitsBastion(path: Point[], bastions: Point[][]): boolean {
  return bastions.some(poly => pathEntersRing(path, poly) || path.some(point => pointInPolygon(point, poly)));
}

function nearestRingPoint(ring: Point[], point: Point): Point {
  return ring.reduce((best, candidate) => (dist(candidate, point) < dist(best, point) ? candidate : best));
}

/** Straight ditch span on the curtain normal, then a bank path to the gorge. */
function defenderApproach(
  curtain: { a: Point; b: Point; normal: Point },
  ditchWidth: number,
  sally: Point
): { bridge: [Point, Point]; landAfter: Point[] } {
  const shoulder = add(curtain.a, sub(curtain.b, curtain.a), 0.25);
  const bridge: [Point, Point] = [shoulder, add(shoulder, curtain.normal, ditchWidth)];
  const gorgeBank = add(add(curtain.a, sub(curtain.b, curtain.a), 0.5), curtain.normal, ditchWidth);
  return { bridge, landAfter: clean([bridge[1], gorgeBank, sally]) };
}

function outsideEdge(point: Point, a: Point, b: Point): boolean {
  const normal = edgeOutward(a, b);
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return (point[0] - mid[0]) * normal[0] + (point[1] - mid[1]) * normal[1] > 0.4;
}

function inFrame(rings: Point[][], half: number): boolean {
  const limit = half * 0.98;
  return rings.every(ring => ring.every(p => Math.abs(p[0]) <= limit && Math.abs(p[1]) <= limit));
}

function outlineHitsWater(ring: Point[], inputs: SkeletonInputs): boolean {
  return ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    const mid: Point = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
    return pointInChannel(point, inputs) || pointInChannel(mid, inputs);
  });
}

function bankStub(land: Point, toward: Point): Point[] {
  const dir = unit(sub(toward, land));
  const side: Point = [-dir[1], dir[0]];
  const nose = add(land, dir, 0.8);
  return [land, nose, add(nose, side, 2), add(land, side, 2)];
}

function placeWorks(
  inner: Point[],
  curtains: { normal: Point; tangent: Point }[],
  open: Set<number>,
  center: Point,
  citadel: Point[] | undefined
): DefenseWorkPlan[] | null {
  const placed: DefenseWorkPlan[] = [];
  const kinds = ["barracks", "magazine"] as const;
  for (const kind of kinds) {
    let polygon: Point[] | null = null;
    for (let i = 0; i < curtains.length && !polygon; i++) {
      if (open.has(i)) continue;
      const curtain = curtains[i];
      const a = inner[(i * 5 + 4) % inner.length];
      const b = inner[((i + 1) * 5) % inner.length];
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const at = add(mid, curtain.normal, -8);
      const rect = [-9, 9].flatMap(x =>
        [-3.5, 3.5].map(y => add(add(at, curtain.tangent, x), curtain.normal, -y) as Point)
      );
      const ordered = [rect[0], rect[1], rect[3], rect[2]];
      if (ordered.some(point => !pointInPolygon(point, inner) || dist(point, center) < 22)) continue;
      if (citadel && ordered.some(point => pointInPolygon(point, citadel))) continue;
      if (placed.some(work => ordered.some(point => pointInPolygon(point, work.polygon)))) continue;
      polygon = ordered;
    }
    if (!polygon) return null;
    placed.push({ id: `${GEN_PREFIX}${kind}`, ownerId: `${GEN_PREFIX}bastioned-town`, kind, polygon });
  }
  return placed;
}

function ditchLevels(
  region: DefenseRegion,
  ground: (point: Point) => number,
  vary: boolean
): { bed: number[]; bank: number[] } {
  const points = region.flatMap(poly => poly.outer);
  if (!vary) return { bed: points.map(() => DITCH_BED), bank: points.map(() => 0) };
  return { bed: points.map(point => ground(point) + DITCH_BED), bank: points.map(point => ground(point)) };
}

function openingId(opening: WaterOpening, index: number): string {
  const curtain = opening.slots.filter(slot => slot % 2 === 1).map(slot => (slot - 1) / 2)[0];
  return curtain === undefined ? `${GEN_PREFIX}curtain-gap-${index}` : `${GEN_PREFIX}curtain-${curtain}`;
}

function meshWalk(mesh: Point[], start: number, end: number): Point[] {
  const line: Point[] = [];
  let index = start;
  for (let step = 0; step <= mesh.length; step++) {
    line.push(mesh[index]);
    if (index === end) break;
    index = (index + 1) % mesh.length;
  }
  return line;
}

function grow(ring: Point[], distance: number): Point[] | null {
  const center = ringCentroid(ring);
  const out = ring.map(point => {
    const delta = sub(point, center);
    const len = Math.hypot(delta[0], delta[1]) || 1;
    return [center[0] + (delta[0] / len) * (len + distance), center[1] + (delta[1] / len) * (len + distance)] as Point;
  });
  if (!(signedArea(out) > 0) || ringSelfIntersects(out)) return null;
  return out;
}

interface Trace {
  center: Point;
  outer: Point[];
  sides: number;
  unitApothem: number;
  urban: Point[];
  urbanRadius: number;
}

function makeTrace(
  inputs: SkeletonInputs,
  settings: GenerationSettings,
  seed: string,
  attempt: number,
  corePoint: Point,
  urban: Point[],
  urbanRadius: number
): Trace | null {
  const rng = makeRng(`${seed}:bastioned-town:trace:${attempt}`);
  const sides = settings.wallSides ?? 5 + Math.floor(rng() * 5);
  const center = add(corePoint, [
    (rng() - 0.5) * Math.min(12, inputs.cellSize * 0.25),
    (rng() - 0.5) * Math.min(12, inputs.cellSize * 0.25)
  ]);
  const unitRing = unitWallShape("bastioned", rng, sides);
  if (!(signedArea(unitRing) > 0) || unitRing.length !== sides * 5) return null;
  let minApothem = Number.POSITIVE_INFINITY;
  let minCurtain = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sides; i++) {
    const a = unitRing[i * 5 + 4];
    const b = unitRing[((i + 1) * 5) % unitRing.length];
    minCurtain = Math.min(minCurtain, dist(a, b));
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    minApothem = Math.min(minApothem, Math.hypot(mid[0], mid[1]));
  }
  if (!(minApothem > 0.2) || !(minCurtain > 0.05)) return null;
  let scale = (urbanRadius + 28) / minApothem;
  for (let bump = 0; bump < 4; bump++) {
    const rampart = clamp(0.06 * scale * minCurtain, 10, 20);
    const need = (urbanRadius + rampart + 8) / minApothem;
    if (scale >= need) break;
    scale = need * 1.08;
  }
  const outer = unitRing.map(point => [center[0] + point[0] * scale, center[1] + point[1] * scale] as Point);
  if (!(signedArea(outer) > 0)) return null;
  return { center, outer, sides, unitApothem: minApothem, urban, urbanRadius };
}

interface Built {
  draft: BastionedTownDraft;
}

function buildWorks(
  trace: Trace,
  inputs: SkeletonInputs,
  settings: GenerationSettings,
  seed: string,
  attempt: number,
  shift: number,
  glacisWidth: number
): { ok: Built } | { reason: FortressFailureReason } {
  const { center, outer, sides } = trace;
  const fort = settings.townFortification!;
  const lengths: number[] = [];
  const curtains: { a: Point; b: Point; normal: Point; tangent: Point; length: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = outer[i * 5 + 4];
    const b = outer[((i + 1) * 5) % outer.length];
    const tangent = unit(sub(b, a));
    curtains.push({ a, b, normal: edgeOutward(a, b), tangent, length: dist(a, b) });
    lengths.push(dist(a, b));
  }
  const minL = Math.min(...lengths);
  const meanL = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const rampartWidth = clamp(0.06 * minL, 10, 20);
  const ditchWidth = clamp(0.12 * meanL, 12, 30);
  const ravelinDitch = clamp(0.08 * meanL, 6, 12);
  const inner = insetRing(outer, center, rampartWidth);
  if (!inner) return { reason: "fortress-invalid-bastion" };
  if (!trace.urban.every(point => pointInPolygon(point, inner))) return { reason: "fortress-insufficient-space" };
  for (let i = 0; i < sides; i++) {
    const salient = outer[i * 5 + 2];
    const leftA = outer[((i + sides - 1) * 5 + 4) % outer.length];
    const leftB = outer[i * 5];
    const rightA = outer[i * 5 + 4];
    const rightB = outer[((i + 1) * 5) % outer.length];
    const flanks = [outer[i * 5 + 1], outer[i * 5 + 3]];
    if (!outsideEdge(salient, leftA, leftB) || !outsideEdge(salient, rightA, rightB))
      return { reason: "fortress-invalid-bastion" };
    if (flanks.some(point => !outsideEdge(point, leftA, leftB) && !outsideEdge(point, rightA, rightB)))
      return { reason: "fortress-invalid-bastion" };
  }
  const ditchOuter = offsetRing(outer, ditchWidth) ?? grow(outer, ditchWidth);
  if (!ditchOuter) return { reason: "fortress-invalid-bastion" };
  const coveredOuter = offsetRing(ditchOuter, 5) ?? grow(ditchOuter, 5);
  if (!coveredOuter) return { reason: "fortress-insufficient-space" };
  const glacisOuter = offsetRing(coveredOuter, glacisWidth) ?? grow(coveredOuter, glacisWidth);
  if (!glacisOuter) return { reason: "fortress-insufficient-space" };

  const water = classifyMainLine(outer, sides, inputs);
  if (!water) return { reason: "fortress-water-conflict" };
  const bastionPolys = Array.from({ length: sides }, (_, i) => [0, 1, 2, 3, 4].map(k => outer[i * 5 + k]));
  const rampartCurtain = (index: number) => !water.wetCurtains.has(index);
  const ravelins: { outline: Point[]; rampart: Point[]; platform: Point[]; sally: Point; curtain: number }[] = [];
  if (fort.outworks === "ravelins") {
    for (let i = 0; i < sides; i++) {
      if (!rampartCurtain(i)) continue;
      const curtain = curtains[i];
      let blockedByWater = false;
      let widthRatio = 0.35;
      let outline: Point[] | null = null;
      for (let shrink = 0; shrink < 2 && !outline; shrink++) {
        if (shrink) widthRatio = 0.25;
        const half = (widthRatio * curtain.length) / 2;
        const depth = 0.25 * curtain.length;
        const base = add(curtain.a, sub(curtain.b, curtain.a), 0.5);
        const baseCenter = add(base, curtain.normal, ditchWidth + ravelinDitch + 2);
        const left = add(baseCenter, curtain.tangent, -half);
        const right = add(baseCenter, curtain.tangent, half);
        const apex = add(baseCenter, curtain.normal, depth);
        const forward = [left, right, apex];
        const candidate = signedArea(forward) > 0 ? forward : [right, left, apex];
        if (outlineHitsWater(candidate, inputs)) {
          blockedByWater = true;
          continue;
        }
        if (ringSelfIntersects(candidate) || !(signedArea(candidate) > 0)) continue;
        const hitsBastion = bastionPolys.some(poly => polygonsOverlap(candidate, poly));
        const hitsNeighbor = ravelins.some(work => polygonsOverlap(candidate, work.outline));
        if (hitsBastion || hitsNeighbor) continue;
        const probe = add(base, curtain.normal, ditchWidth * 0.4);
        const rightFlank: Point = [
          (outer[i * 5 + 2][0] + outer[i * 5 + 3][0]) / 2,
          (outer[i * 5 + 2][1] + outer[i * 5 + 3][1]) / 2
        ];
        const next = (i + 1) % sides;
        const leftFlank: Point = [
          (outer[next * 5 + 1][0] + outer[next * 5 + 2][0]) / 2,
          (outer[next * 5 + 1][1] + outer[next * 5 + 2][1]) / 2
        ];
        if (pathEntersRing([rightFlank, probe], candidate) || pathEntersRing([leftFlank, probe], candidate)) continue;
        outline = candidate;
      }
      if (!outline) return { reason: blockedByWater ? "fortress-water-conflict" : "fortress-outwork-overlap" };
      const body = insetToward(outline, ringCentroid(outline), 1.2) ?? outline;
      ravelins.push({
        outline,
        rampart: body,
        platform: insetToward(body, ringCentroid(body), 1.2) ?? body,
        sally: [(outline[0][0] + outline[1][0]) / 2, (outline[0][1] + outline[1][1]) / 2],
        curtain: i
      });
    }
  }

  const footprint = [outer, ditchOuter, coveredOuter, glacisOuter, ...ravelins.map(work => work.outline)];
  if (!inFrame(footprint, inputs.half)) return { reason: "fortress-insufficient-space" };
  if (fort.ditch === "wet" && (inputs.rivers.length > 0 || inputs.water.length > 0))
    return { reason: "fortress-water-conflict" };
  const mainDitch = defenseBand(outer, ditchOuter, inputs);
  const coveredBand = defenseBand(ditchOuter, coveredOuter, inputs);
  const glacisBand = defenseBand(coveredOuter, glacisOuter, inputs);
  if (!mainDitch || !coveredBand || !glacisBand) return { reason: "fortress-water-conflict" };

  const roads = inputs.roads.length
    ? inputs.roads
    : [
        {
          id: 900,
          path: [center, exitSquare(center, [1, 0], inputs.half * 0.98)] as Point[],
          fixed: false,
          reachesFrame: true
        }
      ];
  const used = new Set<number>();
  const assignment: { roadIds: number[]; curtain: number }[] = [];
  const ordered = [...roads].sort((a, b) => {
    const aa = a.path[a.path.length - 1];
    const bb = b.path[b.path.length - 1];
    return Math.atan2(aa[1] - center[1], aa[0] - center[0]) - Math.atan2(bb[1] - center[1], bb[0] - center[0]);
  });
  for (const road of ordered) {
    if (road.fixed && fixedApproachHitsBastion(road.path, bastionPolys))
      return { reason: "fortress-access-unreachable" };
    const far = road.path[road.path.length - 1];
    const aim = unit(sub(far, center));
    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < sides; i++) {
      if (!rampartCurtain(i) || used.has(i)) continue;
      const dot = aim[0] * curtains[i].normal[0] + aim[1] * curtains[i].normal[1];
      if (dot > bestDot) {
        best = i;
        bestDot = dot;
      }
    }
    if (best < 0) {
      if (!assignment.length) return { reason: "fortress-access-unreachable" };
      assignment[assignment.length - 1].roadIds.push(road.id);
      continue;
    }
    used.add(best);
    assignment.push({ roadIds: [road.id], curtain: best });
  }
  if (assignment.length < Math.max(1, inputs.requiredExternalRoads)) return { reason: "fortress-access-unreachable" };

  const gatePoints = new Map<number, Point>();
  for (const item of assignment) {
    const curtain = curtains[item.curtain];
    const t = 0.5 + shift;
    gatePoints.set(item.curtain, add(curtain.a, sub(curtain.b, curtain.a), t));
  }
  const gateList = [...gatePoints.values()];
  for (let i = 0; i < gateList.length; i++)
    for (let j = i + 1; j < gateList.length; j++)
      if (dist(gateList[i], gateList[j]) < inputs.minGateSpacing) return { reason: "fortress-access-unreachable" };

  const mesh: Point[] = [];
  const bastionStart: number[] = [];
  const bastionEnd: number[] = [];
  for (let i = 0; i < sides; i++) {
    bastionStart[i] = mesh.length;
    for (let k = 0; k < 5; k++) mesh.push(outer[i * 5 + k]);
    bastionEnd[i] = mesh.length - 1;
    const gate = gatePoints.get(i);
    if (gate) mesh.push(gate);
  }
  const bastionVertices: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) if (!water.wetBastions.has(i)) bastionVertices.push([bastionStart[i], bastionEnd[i]]);
  const curtainVertices: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    if (!rampartCurtain(i)) continue;
    curtainVertices.push([bastionEnd[i], bastionStart[(i + 1) % sides]]);
  }
  for (const opening of water.openings)
    curtainVertices.push(openingVertexRange(opening, bastionStart, bastionEnd, sides));

  const roadRing = insetRing(inner, center, 8);
  if (!roadRing) return { reason: "fortress-insufficient-space" };
  const accessRng = makeRng(`${seed}:bastioned-town:access:${attempt}`);
  const gates: SkeletonGate[] = [];
  const routes: SkeletonRoute[] = [];
  const accesses: BastionedTownDraft["plan"]["accesses"] = [];
  assignment.forEach((item, index) => {
    const curtain = curtains[item.curtain];
    const gate = gatePoints.get(item.curtain)!;
    const outward = curtain.normal;
    if (ditchSpanDeviationDegrees([gate, add(gate, outward, ditchWidth)], outward) > 1) return;
    gates.push({ point: gate, edge: bastionEnd[item.curtain], outward, roadIds: item.roadIds });
    const bridge: [Point, Point] = [gate, add(gate, outward, ditchWidth)];
    const approach = add(gate, outward, -(rampartWidth + 10));
    const work = ravelins.find(entry => entry.curtain === item.curtain);
    const side = accessRng() < 0.5 ? -1 : 1;
    const half = work ? dist(work.outline[0], work.outline[1]) / 2 + 6 : 8;
    const base = add(curtain.a, sub(curtain.b, curtain.a), 0.5);
    const beside = add(add(base, outward, ditchWidth + 2), curtain.tangent, side * half);
    const beyond = add(beside, outward, work ? dist(work.sally, work.outline[2]) + ravelinDitch + 8 : 12);
    const frame = exitSquare(beyond, unit(sub(beyond, center)), inputs.half * 0.98);
    const outside = clean([bridge[1], beside, beyond, frame]);
    const ravelin = work?.outline;
    if (ravelin && (pathEntersRing(outside, ravelin) || pathEntersRing([bridge[0], bridge[1]], ravelin))) {
      accesses.length = -1;
      return;
    }
    const inside =
      fort.streetPlan === "radial"
        ? clean([center, approach])
        : clean([nearestRingPoint(roadRing, approach), approach]);
    const landAfter = outside.slice(1);
    if (!inside.length || !landAfter.length) {
      accesses.length = -1;
      return;
    }
    for (const roadId of item.roadIds) {
      routes.push({
        id: roadId,
        path: clean([...inside, gate, ...outside]),
        gateIndex: index,
        reachesFrame: true,
        dropped: false
      });
    }
    accesses.push({
      id: `${GEN_PREFIX}access-${index}`,
      ownerId: `${GEN_PREFIX}bastioned-town`,
      role: "civic",
      gateId: `${GEN_PREFIX}gate-${index}`,
      roadId: `${GEN_PREFIX}road-${item.roadIds[0]}`,
      landBefore: inside,
      bridge,
      landAfter,
      widthMeters: PASSAGE,
      elevations: [DECK, DECK]
    });
    if (work) {
      const defender = defenderApproach(curtain, ditchWidth, work.sally);
      if (pathEntersRing([...defender.bridge, ...defender.landAfter], work.outline)) {
        accesses.length = -1;
        return;
      }
      accesses.push({
        id: `${GEN_PREFIX}access-defender-${item.curtain}`,
        ownerId: `${GEN_PREFIX}bastioned-town`,
        role: "defender",
        gateId: `${GEN_PREFIX}curtain-${item.curtain}`,
        landBefore: [defender.bridge[0]],
        bridge: defender.bridge,
        landAfter: defender.landAfter,
        widthMeters: 3,
        elevations: [DECK, DECK]
      });
    }
  });
  if (accesses.length < 0 || gates.length !== assignment.length) return { reason: "fortress-access-unreachable" };
  for (let i = 0; i < sides; i++) {
    if (!rampartCurtain(i)) continue;
    if (accesses.some(access => access.id === `${GEN_PREFIX}access-defender-${i}`)) continue;
    if (fort.outworks !== "ravelins") break;
    const curtain = curtains[i];
    const work = ravelins[i];
    if (!work) return { reason: "fortress-access-unreachable" };
    const defender = defenderApproach(curtain, ditchWidth, work.sally);
    if (pathEntersRing([...defender.bridge, ...defender.landAfter], work.outline))
      return { reason: "fortress-access-unreachable" };
    accesses.push({
      id: `${GEN_PREFIX}access-defender-${i}`,
      ownerId: `${GEN_PREFIX}bastioned-town`,
      role: "defender",
      gateId: `${GEN_PREFIX}curtain-${i}`,
      landBefore: [defender.bridge[0]],
      bridge: defender.bridge,
      landAfter: defender.landAfter,
      widthMeters: 3,
      elevations: [DECK, DECK]
    });
  }

  routes.push({ id: 1000, path: [...roadRing, roadRing[0]], gateIndex: null, reachesFrame: false, dropped: false });
  if (fort.streetPlan === "organic") {
    const interior = makeRng(`${seed}:bastioned-town:interior`);
    const chords = Math.min(3, sides);
    for (let i = 0; i < chords; i++) {
      const a = roadRing[Math.floor(interior() * roadRing.length)];
      const b = roadRing[Math.floor(interior() * roadRing.length)];
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const bend = add(mid, [interior() - 0.5, interior() - 0.5], 8);
      routes.push({ id: 1001 + i, path: clean([a, bend, b]), gateIndex: null, reachesFrame: false, dropped: false });
    }
  }

  let citadelSquare: Point[] | undefined;
  if (citadelRequested(settings)) {
    const salient = outer[2];
    const toward = unit(sub(salient, center));
    const reach = Math.min(...inner.map(point => dist(center, point))) * 0.42;
    const squareCenter = add(center, toward, Math.max(30, reach));
    const halfSide = 24;
    citadelSquare = [
      [squareCenter[0] - halfSide, squareCenter[1] - halfSide],
      [squareCenter[0] + halfSide, squareCenter[1] - halfSide],
      [squareCenter[0] + halfSide, squareCenter[1] + halfSide],
      [squareCenter[0] - halfSide, squareCenter[1] + halfSide]
    ];
    if (!citadelSquare.every(point => pointInPolygon(point, roadRing)))
      return { reason: "fortress-insufficient-space" };
    const corner = [...citadelSquare].sort((a, b) => dist(a, center) - dist(b, center))[0];
    const door = add(corner, unit(sub(center, corner)), 8);
    routes.push({ id: 1100, path: clean([door, corner]), gateIndex: null, reachesFrame: false, dropped: false });
  }

  for (const route of routes) {
    const road = roads.find(item => item.id === route.id);
    const squared = squareRiverPath(route.path, inputs, road?.fixed ?? false, inputs.bridgeSkewLimit);
    if (!squared) return { reason: "fortress-access-unreachable" };
    route.path = squared;
  }
  for (const access of accesses) {
    if (access.role !== "civic") continue;
    const route = routes.find(
      item => item.gateIndex !== null && item.path.some(point => dist(point, access.bridge[0]) < 1.5)
    );
    if (!route) return { reason: "fortress-access-unreachable" };
  }

  const ground = fortressGround(settings, seed, inputs, inputs.half * 2);
  const gradeEdges: Array<[Point, Point]> = [];
  for (let i = 0; i < sides; i++) {
    if (water.wetBastions.has(i)) continue;
    for (let k = 0; k < 5; k++) gradeEdges.push([outer[i * 5 + k], outer[i * 5 + ((k + 1) % 5)]]);
    if (rampartCurtain(i)) gradeEdges.push([outer[i * 5 + 4], outer[((i + 1) * 5) % outer.length]]);
  }
  if (gradeTooSteep(gradeEdges, ground)) return { reason: "fortress-relief-too-steep" };
  const vary = groundVaries(gradeEdges.flat(), ground);
  const bankPoints = mainDitch.flatMap(poly => poly.outer);
  const bankHeights = bankPoints.map(point => (vary ? ground(point) : 0));
  if (fort.ditch === "wet" && Math.max(...bankHeights) - Math.min(...bankHeights) > WET_DITCH_LEVEL_RANGE)
    return { reason: "fortress-wet-ditch-level" };
  const works = placeWorks(
    inner,
    curtains,
    new Set(curtains.map((_, index) => index).filter(index => !rampartCurtain(index))),
    center,
    citadelSquare
  );
  if (!works) return { reason: "fortress-insufficient-space" };

  const townId = `${GEN_PREFIX}bastioned-town`;
  const circuitId = `${GEN_PREFIX}defense-town`;
  const mainDitchId = `${GEN_PREFIX}ditch-main`;
  const wet = fort.ditch === "wet";
  const supply = wet ? { kind: "closed-basin" as const, inlet: "none" as const, outlet: "none" as const } : undefined;
  const wetLevel = wet ? Math.min(...bankHeights) + WATER_LEVEL : undefined;
  const draft: BastionedTownDraft = {
    evaluations: 0,
    meshRing: mesh,
    bastionVertices,
    curtainVertices,
    citadelSquare,
    skeleton: {
      attempt,
      core: {
        core: center,
        urbanRadius: trace.urbanRadius,
        rays: [],
        urban: trace.urban,
        urbanArea: Math.abs(signedArea(trace.urban)),
        edgeRivers: []
      },
      wall: {
        shape: "bastioned",
        sides,
        polygon: mesh,
        waterGates: [],
        curtainMidpoints: curtains.map(curtain => add(curtain.a, sub(curtain.b, curtain.a), 0.5))
      },
      routes,
      gates,
      bridges: [],
      ...(citadelSquare ? { closedLines: [{ id: "citadel", points: citadelSquare }] } : {})
    },
    plan: {
      version: 1,
      id: townId,
      circuitId,
      boundaryKind: water.boundaryKind,
      locked: true,
      bastions: bastionPolys.flatMap((poly, i) =>
        water.wetBastions.has(i)
          ? []
          : [
              {
                id: `${GEN_PREFIX}bastion-${i}`,
                ownerId: circuitId,
                wallEdgeIds: [],
                rampart: [...poly, ...[4, 3, 2, 1, 0].map(k => inner[i * 5 + k])],
                platform: insetToward(poly, ringCentroid(poly), 1.2) ?? poly,
                elevations: profile(5, CREST, poly, ground, vary)
              }
            ]
      ),
      curtains: [
        ...curtains.flatMap((curtain, i) => {
          if (!rampartCurtain(i)) return [];
          const a = i * 5 + 4;
          const b = ((i + 1) * 5) % outer.length;
          return [
            {
              id: `${GEN_PREFIX}curtain-${i}`,
              ownerId: circuitId,
              wallEdgeIds: [] as string[],
              closure: "rampart" as const,
              rampart: [outer[a], outer[b], inner[b], inner[a]],
              elevations: profile(2, CREST, [outer[a], outer[b]], ground, vary)
            }
          ];
        }),
        ...water.openings.map((opening, index) => {
          const range = openingVertexRange(opening, bastionStart, bastionEnd, sides);
          const line = meshWalk(mesh, range[0], range[1]);
          return {
            id: openingId(opening, index),
            ownerId: circuitId,
            wallEdgeIds: [] as string[],
            closure: opening.closure,
            rampart: bankStub(line[0], line[Math.min(1, line.length - 1)]),
            elevations: profile(2, CREST, [line[0], line[line.length - 1]], ground, vary)
          };
        })
      ],
      outworks: ravelins.map((work, i) => ({
        id: `${GEN_PREFIX}ravelin-${i}`,
        ownerId: townId,
        curtainId: `${GEN_PREFIX}curtain-${work.curtain}`,
        outline: work.outline,
        rampart: work.rampart,
        platform: work.platform,
        ditchId: `${GEN_PREFIX}ditch-ravelin-${i}`,
        sally: work.sally,
        elevations: profile(3, RAVELIN_CREST, work.outline, ground, vary)
      })),
      ditches: [
        {
          id: mainDitchId,
          ownerId: townId,
          kind: fort.ditch,
          region: mainDitch,
          ...ditchLevels(mainDitch, ground, vary),
          ...(wet ? { waterLevel: wetLevel, supply } : {})
        },
        ...ravelins.map((work, i) => {
          const outerDitch = offsetRing(work.outline, ravelinDitch) ?? grow(work.outline, ravelinDitch) ?? work.outline;
          const region = defenseBand(work.outline, outerDitch, inputs) ?? [
            { outer: outerDitch, holes: [work.outline] }
          ];
          return {
            id: `${GEN_PREFIX}ditch-ravelin-${i}`,
            ownerId: townId,
            kind: fort.ditch,
            region,
            ...ditchLevels(region, ground, vary),
            ...(wet ? { waterLevel: wetLevel, supply } : {})
          };
        })
      ],
      coveredWays: [
        {
          id: `${GEN_PREFIX}covered-main`,
          ownerId: townId,
          region: coveredBand,
          elevations: coveredBand.flatMap(poly => poly.outer).map(point => (vary ? ground(point) : 0))
        }
      ],
      glacis: [glacisBand],
      accesses: accesses.map(access =>
        vary ? { ...access, elevations: [ground(access.bridge[0]) + DECK, ground(access.bridge[0]) + DECK] } : access
      ),
      ...(water.openings.length
        ? {
            sluices: water.openings.map((opening, index) => {
              const range = openingVertexRange(opening, bastionStart, bastionEnd, sides);
              const line = meshWalk(mesh, range[0], range[1]);
              return {
                id: `${GEN_PREFIX}sluice-${index}`,
                ownerId: townId,
                curtainId: openingId(opening, index),
                kind: opening.closure,
                opening: line,
                banks: [line[0], line[line.length - 1]] as [Point, Point]
              };
            })
          }
        : {}),
      works
    }
  };
  // The skeleton core must stay the dry star the mesh measures, not the nudged centre alone.
  draft.skeleton.core.core = center;
  return { ok: { draft } };
}

export function planBastionedTown(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string
): { draft: BastionedTownDraft } | { failure: BastionedTownFailure } {
  const prepared = prepareSkeletonRun(document, settings, seed, { skipUnsupported: true });
  const inputs = prepared.inputs;
  const core = planSkeletonCore(inputs);
  if ("reason" in core)
    return {
      failure: {
        reason: core.reason === "core-in-water" ? "fortress-water-conflict" : "fortress-insufficient-space",
        message: fortressFailureMessage(
          core.reason === "core-in-water" ? "fortress-water-conflict" : "fortress-insufficient-space"
        ),
        evaluations: 1
      }
    };
  if (settings.townFortification?.ditch === "wet" && (inputs.rivers.length > 0 || inputs.water.length > 0))
    return {
      failure: {
        reason: "fortress-water-conflict",
        message: fortressFailureMessage("fortress-water-conflict"),
        evaluations: 1
      }
    };
  let evaluations = 0;
  let dryFailure: FortressFailureReason = "fortress-insufficient-space";
  let sawDry = false;
  let sawWater = false;
  let sawRelief = false;
  let sawWetLevel = false;
  for (let attempt = 0; attempt < TRACE_ATTEMPTS && evaluations < MAX_EVALUATIONS; attempt++) {
    const trace = makeTrace(inputs, settings, seed, attempt, core.core, core.urban, core.urbanRadius);
    if (!trace) {
      sawDry = true;
      dryFailure = "fortress-invalid-bastion";
      continue;
    }
    for (const shift of GATE_SHIFTS) {
      if (evaluations >= MAX_EVALUATIONS) break;
      evaluations++;
      let reason: FortressFailureReason = "fortress-insufficient-space";
      for (const glacis of [40, 32, 25]) {
        const built = buildWorks(trace, inputs, settings, seed, attempt, shift, glacis);
        if ("ok" in built) {
          built.ok.draft.evaluations = evaluations;
          const nudged = built.ok.draft.skeleton.core.core;
          built.ok.draft.skeleton.core = { ...core, core: nudged };
          return { draft: built.ok.draft };
        }
        reason = built.reason;
        if (reason !== "fortress-insufficient-space") break;
      }
      if (reason === "fortress-water-conflict") sawWater = true;
      else if (reason === "fortress-relief-too-steep") sawRelief = true;
      else if (reason === "fortress-wet-ditch-level") sawWetLevel = true;
      else {
        sawDry = true;
        dryFailure = reason;
      }
    }
  }
  const reason =
    sawDry && dryFailure !== "fortress-insufficient-space"
      ? dryFailure
      : sawRelief
        ? "fortress-relief-too-steep"
        : sawWetLevel
          ? "fortress-wet-ditch-level"
          : sawDry
            ? dryFailure
            : sawWater
              ? "fortress-water-conflict"
              : "fortress-insufficient-space";
  return { failure: { reason, message: fortressFailureMessage(reason), evaluations } };
}

export function planBastionedCity(
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  observer?: GenerationObserver,
  attempt = 1
): ReturnType<typeof planSkeletonCity> {
  const planned = planBastionedTown(document, settings, seed);
  if ("failure" in planned) {
    reportGenerationFailure(observer, attempt, "bastioned-town", planned.failure.reason, planned.failure.message, {
      evaluations: planned.failure.evaluations
    });
    return null;
  }
  const assembled = planSkeletonCity(document, settings, seed, observer, attempt, planned.draft.skeleton);
  if (!assembled) return null;
  excludeReserved(assembled.plan, planned.draft.plan);
  assembled.plan.bastionedTown = planned.draft;
  observer?.({
    phase: "bastioned-town",
    elapsedMs: 0,
    attempt,
    counts: { evaluations: planned.draft.evaluations }
  });
  return assembled;
}

export function reservedPlan(plan: Plan): BastionedTownDraft | undefined {
  return plan.bastionedTown;
}
