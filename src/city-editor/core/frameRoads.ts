import { normalWaterSection, type PhysicalWaterPolygon, pointInWater } from "../../services/riverPhysicalGeometry";
import { planRiverCrossing } from "../../utils/riverCrossing";
import { BRIDGE_BANK_SEAT } from "./bridgeDeck";
import { townMeshExtentMeters } from "./document";
import { segmentSegmentHit } from "./gen/geom";
import type { BurgSiteDescriptor, BurgSiteRiver } from "./gen/site/burgSiteDescriptor";
import type { Point } from "./types";

/** Roads on the display frame, outside the fitted town mesh.
 * A bridge is the bank-to-bank span on the river normal through q.
 * The road's own chord is not a bridge, even when that chord is perpendicular to the current.
 */
export interface FrameRoadPiece {
  kind: "road" | "bridge";
  points: Point[];
  bridgeKind?: "fixedBridge" | "movableBridge";
}
export interface FrameRoadLeg {
  sourceIndex: number;
  routeId: number;
  pieces: FrameRoadPiece[];
}

const GRAZE_METERS = 2;
const MIN_PIECE_METERS = 0.5;
const APPROACH_METERS = 4;
const DECK_MATCH_METERS = 8;
const INTERIOR_METERS = 0.5;
const SEARCH_METERS = 120;
const SAMPLE_METERS = 4;
/** A coarse centerline farther than this yields to the bank edges at the road. */
const CENTERLINE_SNAP_METERS = 80;
/** A channel thinner than this is crossed on the road chord. */
const FORD_METERS = 4;

interface WaterBody {
  water: PhysicalWaterPolygon;
  river: BurgSiteRiver | null;
}
interface WetInterval {
  start: number;
  end: number;
  entry: Point;
  exit: Point;
  body: WaterBody;
}
interface RememberedDeck {
  q: Point;
  mid: Point;
  approachA: Point;
  approachB: Point;
  kind: "fixedBridge" | "movableBridge";
}
interface PlannedBridge {
  drawDeck: boolean;
  kind: "fixedBridge" | "movableBridge";
  nearDeck: Point;
  farDeck: Point;
  nearApproach: Point;
  farApproach: Point;
  q: Point;
}

/** `frame` draws each land road from the town center. `beyond-mesh` starts where the town square ends. */
export function frameRoadLegs(site: BurgSiteDescriptor, scope: "frame" | "beyond-mesh"): FrameRoadLeg[] {
  const bodies = waterBodies(site);
  const decks = rememberedDecks(site);
  const half = scope === "beyond-mesh" ? townMeshExtentMeters(site.frame) / 2 : 0;
  const legs: FrameRoadLeg[] = [];
  site.roads.forEach((road, sourceIndex) => {
    if (road.group === "searoutes") return;
    const paths = road.sharedBranches?.length
      ? road.sharedBranches.map(branch => ({ routeId: branch.routeId, path: branch.path }))
      : [{ routeId: road.routeId, path: road.path }];
    for (const item of paths) {
      const scoped =
        scope === "beyond-mesh" ? pathOutsideMesh(item.path, half, decks, site.frame.extentMeters / 2) : item.path;
      const outer = finitePath(scoped);
      const full = finitePath(item.path.map(point));
      const path = outer && scope === "beyond-mesh" && full ? shoreStart(full, outer, bodies) : outer;
      if (!path || polylineLength(path) < MIN_PIECE_METERS) continue;
      const pieces = piecesFor(path, bodies, site, decks);
      if (pieces.length) legs.push({ sourceIndex, routeId: item.routeId, pieces });
    }
  });
  return legs;
}

/** True when the open segment stays out of the surveyed channel interior. Boundary contact is dry. */
export function segmentClearsSurveyedWater(
  a: Point,
  b: Point,
  rings: readonly (readonly (readonly [number, number][])[])[]
): boolean {
  const bodies: WaterBody[] = rings.map((ringSet, index) => ({
    water: { id: index, rings: ringSet },
    river: null
  }));
  return segmentClears(a, b, bodies);
}

function waterBodies(site: BurgSiteDescriptor): WaterBody[] {
  const fixed = site.fixedCrossings;
  if (!fixed) return [];
  const rivers = new Map(site.rivers.map(river => [river.riverId, river]));
  const bodies: WaterBody[] = fixed.rivers.map(river => ({
    water: { id: river.id, rings: river.rings },
    river: rivers.get(river.id) ?? null
  }));
  for (const obstacle of fixed.obstacles ?? [])
    bodies.push({ water: { id: obstacle.id, rings: obstacle.rings }, river: null });
  return bodies;
}

function rememberedDecks(site: BurgSiteDescriptor): RememberedDeck[] {
  return (site.fixedCrossings?.crossings ?? []).map(crossing => ({
    q: point(crossing.q),
    mid: midpoint(crossing.deckA, crossing.deckB),
    approachA: point(crossing.approachA),
    approachB: point(crossing.approachB),
    kind: crossing.kind
  }));
}

function piecesFor(
  path: Point[],
  bodies: WaterBody[],
  site: BurgSiteDescriptor,
  decks: RememberedDeck[]
): FrameRoadPiece[] {
  const half = site.frame.extentMeters / 2;
  const intervals = wetIntervals(path, bodies);
  const pieces: FrameRoadPiece[] = [];
  let dry: Point[] = [];
  let consumed = 0;
  const total = polylineLength(path);
  const flush = () => {
    const cleaned = dedupe(dry);
    dry = [];
    if (cleaned.length >= 2 && polylineLength(cleaned) >= MIN_PIECE_METERS)
      pieces.push({ kind: "road", points: cleaned });
  };
  const absorb = (incoming: Point[]) => {
    if (!incoming.length) return;
    if (!dry.length) {
      dry = incoming;
      return;
    }
    if (segmentClears(dry.at(-1)!, incoming[0], bodies)) dry = dedupe([...dry, ...incoming]);
    else {
      flush();
      dry = incoming;
    }
  };
  for (const interval of intervals) {
    absorb(slicePath(path, consumed, interval.start));
    const bridge = planBridge(interval, path, site, decks);
    if (!bridge) {
      const around = skirtInterval(path, interval);
      if (!around) {
        // The far side stays undrawn. A target that never leaves the channel
        // still meets the frame where this bank does.
        landOnFrame(dry, path, bodies, half);
        flush();
        return finish(pieces, half);
      }
      absorb(around);
      consumed = interval.end;
      continue;
    }
    if ("through" in bridge) {
      absorb(slicePath(path, interval.start, interval.end));
      consumed = interval.end;
      continue;
    }
    const near = nearRoad(dry, bridge, bodies);
    dry = near;
    flush();
    if (bridge.drawDeck) {
      pieces.push({
        kind: "bridge",
        points: [bridge.nearDeck, bridge.farDeck],
        bridgeKind: bridge.kind
      });
      decks.push({
        q: bridge.q,
        mid: midpoint(bridge.nearDeck, bridge.farDeck),
        approachA: bridge.nearApproach,
        approachB: bridge.farApproach,
        kind: bridge.kind
      });
    }
    dry = bridge.drawDeck ? [bridge.farDeck, bridge.farApproach] : [bridge.farApproach];
    if (dist(bridge.farApproach, interval.exit) > 40) {
      const from = distanceAlong(path, bridge.farApproach, Infinity) ?? interval.start;
      const traced =
        dryTrace(path, Math.max(from, interval.start), interval.end, interval.body.water, bridge.farApproach) ??
        dryTrace(path, interval.start, interval.end, interval.body.water, interval.entry) ??
        alongBank(interval.body.water, bridge.farApproach, interval.exit, bankLimit(bridge.farApproach, interval.exit));
      if (traced) {
        let nearest = 0;
        let best = Infinity;
        traced.forEach((tracedPoint, index) => {
          const gap = dist(tracedPoint, bridge.farApproach);
          if (gap < best) {
            best = gap;
            nearest = index;
          }
        });
        dry = dedupe([...dry, ...traced.slice(nearest)]);
      }
    }
    consumed = interval.end;
  }
  const rest = slicePath(path, consumed, total);
  const tail = rest.at(-1);
  const restEndsWet = !!tail && bodies.some(item => item.river && deepInWater(tail, item.water));
  if (restEndsWet) landOnFrame(dry, path, bodies, half);
  absorb(rest);
  if (!restEndsWet) landOnFrame(dry, path, bodies, half);
  flush();
  return finish(pieces, half);
}

function nearRoad(dry: Point[], bridge: PlannedBridge, bodies: WaterBody[]): Point[] {
  const approach = attach(dry, bridge.nearApproach, bodies);
  if (!approach) return dry;
  if (!bridge.drawDeck) return approach;
  const last = approach.at(-1)!;
  if (segmentClears(last, bridge.nearDeck, bodies)) return dedupe([...approach, bridge.nearDeck]);
  const bank = dry.at(-1);
  if (bank && segmentClears(bank, bridge.nearDeck, bodies)) return dedupe([...dry, bridge.nearDeck]);
  return approach;
}

function planBridge(
  interval: WetInterval,
  path: Point[],
  site: BurgSiteDescriptor,
  decks: RememberedDeck[]
): PlannedBridge | { through: true } | null {
  // Obstacles are water without a surveyed river. A road stops at that bank.
  if (!interval.body.river) return null;
  const located = locateCrossing(interval, path);
  const existing = matchDeck(interval.entry, interval.exit, located?.q ?? null, decks);
  if (existing) {
    const nearA = dist(interval.entry, existing.approachA) <= dist(interval.entry, existing.approachB);
    return {
      drawDeck: false,
      kind: existing.kind,
      nearDeck: nearA ? existing.approachA : existing.approachB,
      farDeck: nearA ? existing.approachB : existing.approachA,
      nearApproach: nearA ? existing.approachA : existing.approachB,
      farApproach: nearA ? existing.approachB : existing.approachA,
      q: existing.q
    };
  }
  if (!located) return null;
  const { q, tangent } = located;
  const travel = unit(sub(interval.exit, interval.entry));
  let normal = rotate(tangent);
  if (travel && dot(normal, travel) < 0) normal = [-normal[0], -normal[1]];
  const placed = sectionAt(q, normal, tangent, interval.body.water);
  if (!placed) return null;
  const span = placed.section.positive.distance - placed.section.negative.distance;
  if (span < FORD_METERS) return { through: true };
  // A long run along the channel is not a crossing. The caller keeps that road on the bank.
  const wet = interval.end - interval.start;
  if ((!travel || Math.abs(dot(travel, tangent)) > 0.85) && wet > Math.max(span * 3, 80)) return null;
  const kind = planRiverCrossing({
    widthMeters: span,
    depthMeters: interval.body.river?.depthMeters,
    period: site.historicalPeriod,
    transport: site.transport,
    vessel: interval.body.river?.navigationVessel
  }).kind;
  if (kind !== "fixedBridge" && kind !== "movableBridge") return null;
  const seat = BRIDGE_BANK_SEAT / 2;
  const nearDeck = add(placed.section.negative.point, scale(normal, -seat));
  const farDeck = add(placed.section.positive.point, scale(normal, seat));
  const deckDir = unit(sub(farDeck, nearDeck));
  const qT = parameterOn(placed.q, nearDeck, farDeck);
  if (
    !deckDir ||
    Math.abs(dot(deckDir, tangent)) > 1e-6 ||
    qT <= 0 ||
    qT >= 1 ||
    distanceToSegment(placed.q, nearDeck, farDeck) > 1e-4
  )
    return null;
  return {
    drawDeck: true,
    kind,
    nearDeck,
    farDeck,
    nearApproach: add(nearDeck, scale(normal, -APPROACH_METERS)),
    farApproach: add(farDeck, scale(normal, APPROACH_METERS)),
    q: placed.q
  };
}

function sectionAt(
  q: Point,
  normal: Point,
  tangent: Point,
  water: PhysicalWaterPolygon
): { q: Point; section: NonNullable<ReturnType<typeof normalWaterSection>> } | null {
  const shifts = [0, 0.5, -0.5, 1, -1, 2, -2];
  for (const shift of shifts) {
    const at = add(q, scale(tangent, shift));
    if (!pointInWater(at, water)) continue;
    const section = normalWaterSection(at, normal, water);
    if (section) return { q: at, section };
  }
  return null;
}

function locateCrossing(interval: WetInterval, path: Point[]): { q: Point; tangent: Point } | null {
  const river = interval.body.river;
  const midDist = (interval.start + interval.end) / 2;
  const mid = pointAt(path, midDist);
  const centerline = river ? centerlineOf(river) : [];
  const onLine = centerlineHit(path, interval, centerline, interval.body.water);
  if (onLine && dist(onLine.q, mid) <= CENTERLINE_SNAP_METERS) return onLine;
  const banks = bankTangent(interval.body.water, interval.entry, interval.exit);
  if (banks && pointInWater(mid, interval.body.water)) return { q: mid, tangent: banks };
  return null;
}

function centerlineOf(river: BurgSiteRiver): Point[] {
  const points: Point[] = [];
  for (const segment of river.segments)
    for (const sample of segment.points) {
      const next = point(sample);
      if (!points.length || dist(points.at(-1)!, next) > 1e-6) points.push(next);
    }
  return points;
}

function centerlineHit(
  path: Point[],
  interval: WetInterval,
  centerline: Point[],
  water: PhysicalWaterPolygon
): { q: Point; tangent: Point } | null {
  if (centerline.length < 2) return null;
  let best: { q: Point; tangent: Point; score: number } | null = null;
  const consider = (q: Point, tangent: Point, score: number) => {
    if (!pointInWater(q, water)) return;
    if (!best || score < best.score) best = { q, tangent, score };
  };
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = dist(a, b);
    const from = Math.max(0, interval.start - travelled);
    const to = Math.min(length, interval.end - travelled);
    if (to > from + 1e-6) {
      const left = add(a, scale(sub(b, a), from / length));
      const right = add(a, scale(sub(b, a), to / length));
      for (let s = 1; s < centerline.length; s++) {
        const c = centerline[s - 1],
          d = centerline[s];
        const tangent = unit(sub(d, c));
        const hit = tangent ? segmentSegmentHit(left, right, c, d) : null;
        if (hit && tangent)
          consider(
            hit.point,
            tangent,
            Math.abs(travelled + from + hit.t * (to - from) - (interval.start + interval.end) / 2)
          );
      }
    }
    travelled += length;
  }
  const mid = pointAt(path, (interval.start + interval.end) / 2);
  for (let s = 1; s < centerline.length; s++) {
    const c = centerline[s - 1],
      d = centerline[s],
      length = dist(c, d);
    const tangent = unit(sub(d, c));
    if (!tangent || length === 0) continue;
    const steps = Math.max(1, Math.ceil(length / 5));
    for (let step = 0; step <= steps; step++) {
      const q = add(c, scale(sub(d, c), step / steps));
      consider(q, tangent, dist(q, mid) + 1e6);
    }
  }
  return best ? { q: best.q, tangent: best.tangent } : null;
}

function bankTangent(water: PhysicalWaterPolygon, entry: Point, exit: Point): Point | null {
  const a = nearestEdgeTangent(water, entry);
  const b = nearestEdgeTangent(water, exit);
  if (!a) return b;
  if (!b) return a;
  const flipped = dot(a, b) < 0 ? ([-b[0], -b[1]] as Point) : b;
  return unit([a[0] + flipped[0], a[1] + flipped[1]]);
}

function nearestEdgeTangent(water: PhysicalWaterPolygon, at: Point): Point | null {
  let best = Infinity;
  let tangent: Point | null = null;
  for (const ring of water.rings)
    for (let i = 0; i < ring.length; i++) {
      const a = point(ring[i]),
        b = point(ring[(i + 1) % ring.length]);
      const gap = distanceToSegment(at, a, b);
      const direction = unit(sub(b, a));
      if (direction && gap < best) {
        best = gap;
        tangent = direction;
      }
    }
  return tangent;
}

function matchDeck(entry: Point, exit: Point, q: Point | null, decks: RememberedDeck[]): RememberedDeck | undefined {
  const mid = q ?? midpoint(entry, exit);
  return decks.find(
    deck =>
      dist(deck.mid, mid) <= DECK_MATCH_METERS ||
      dist(deck.q, mid) <= DECK_MATCH_METERS ||
      distanceToSegment(deck.q, entry, exit) <= DECK_MATCH_METERS
  );
}

function wetIntervals(path: Point[], bodies: WaterBody[]): WetInterval[] {
  if (path.length < 2 || !bodies.length) return [];
  const total = polylineLength(path);
  const cuts = [0, total];
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = dist(a, b);
    if (length > 0)
      for (const body of bodies)
        for (const ring of body.water.rings)
          for (let e = 0; e < ring.length; e++) {
            const c = point(ring[e]),
              d = point(ring[(e + 1) % ring.length]);
            if (dist(c, d) === 0) continue;
            const hit = segmentSegmentHit(a, b, c, d);
            if (hit) cuts.push(travelled + hit.t * length);
          }
    travelled += length;
  }
  const marks: { start: number; end: number; body: WaterBody }[] = [];
  const stops = uniqueSorted(cuts);
  for (let i = 1; i < stops.length; i++) {
    const start = stops[i - 1],
      end = stops[i];
    if (end - start < 1e-3) continue;
    const body = bodyAt(pointAt(path, (start + end) / 2), bodies);
    if (!body) continue;
    const previous = marks.at(-1);
    if (previous && previous.body === body && Math.abs(previous.end - start) < 1e-3) previous.end = end;
    else marks.push({ start, end, body });
  }
  return marks
    .filter(mark => mark.end - mark.start >= GRAZE_METERS)
    .map(mark => ({
      ...mark,
      entry: pointAt(path, mark.start),
      exit: pointAt(path, mark.end)
    }));
}

function bodyAt(at: Point, bodies: WaterBody[]): WaterBody | null {
  let found: WaterBody | null = null;
  for (const body of bodies) {
    if (!deepInWater(at, body.water)) continue;
    if (!found || (body.river && !found.river)) found = body;
  }
  return found;
}

function deepInWater(at: Point, water: PhysicalWaterPolygon): boolean {
  if (!pointInWater(at, water)) return false;
  let nearest = Infinity;
  for (const ring of water.rings)
    for (let i = 0; i < ring.length; i++)
      nearest = Math.min(nearest, distanceToSegment(at, point(ring[i]), point(ring[(i + 1) % ring.length])));
  return nearest > INTERIOR_METERS;
}

/** Beyond the town square, or — when that square is the whole frame — the road after a fixed crossing.
 * A descriptor path that continues past the fitted frame still has its dry tail inside the square.
 */
function pathOutsideMesh(
  path: readonly [number, number][] | undefined,
  meshHalf: number,
  decks: RememberedDeck[],
  frameHalf: number
): Point[] | null {
  const outer = outsideSquare(path, meshHalf);
  if (!path) return null;
  const tail = tailAfterCrossing(path.map(point), decks);
  if (tail && Math.abs(meshHalf - frameHalf) <= 0.5) return tail;
  if (outer) return outer;
  return tail;
}

/** When the town square cuts through a channel, start at the bank on the town side of that water. */
function shoreStart(full: Point[], outer: Point[], bodies: WaterBody[]): Point[] {
  if (!bodies.some(body => body.river && deepInWater(outer[0], body.water))) return outer;
  const along = distanceAlong(full, outer[0], 2);
  if (along == null) return outer;
  const hit = wetIntervals(full, bodies).find(
    interval => interval.body.river && interval.start <= along + 1e-6 && along <= interval.end + 1e-6
  );
  if (!hit) return outer;
  const pulled = slicePath(full, hit.start, polylineLength(full));
  return pulled.length >= 2 ? pulled : outer;
}

function tailAfterCrossing(path: Point[], decks: RememberedDeck[]): Point[] | null {
  const total = polylineLength(path);
  let best = -1;
  for (const deck of decks)
    for (const approach of [deck.approachA, deck.approachB]) {
      const along = distanceAlong(path, approach, DECK_MATCH_METERS);
      if (along != null && along > best) best = along;
    }
  if (best < 0) return null;
  const tail = slicePath(path, best, total);
  return polylineLength(tail) >= MIN_PIECE_METERS ? tail : null;
}

function distanceAlong(path: Point[], at: Point, limit: number): number | null {
  let travelled = 0;
  let best = Infinity;
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      delta = sub(b, a),
      length2 = dot(delta, delta);
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(at, a), delta) / length2));
    const closest = add(a, scale(delta, t));
    const gap = dist(at, closest);
    if (gap < best) {
      best = gap;
      distance = travelled + dist(a, closest);
    }
    travelled += Math.sqrt(length2);
  }
  return best <= limit ? distance : null;
}

/** The wet chord, pushed onto the bank we entered from. A long same-bank arc is the fallback. */
function skirtInterval(path: Point[], interval: WetInterval): Point[] | null {
  return (
    dryTrace(path, interval.start, interval.end, interval.body.water, interval.entry) ??
    alongBank(interval.body.water, interval.entry, interval.exit, bankLimit(interval.entry, interval.exit))
  );
}

function dryTrace(path: Point[], from: number, to: number, water: PhysicalWaterPolygon, prefer: Point): Point[] | null {
  if (to < from) return null;
  const length = to - from;
  const steps = Math.max(1, Math.ceil(length / 4));
  const points: Point[] = [];
  let previous = prefer;
  for (let i = 0; i <= steps; i++) {
    const at = pointAt(path, from + (length * i) / steps);
    let next: Point | null = null;
    for (const offset of [2, 6, 12, 24]) {
      const candidate = projectToBank(water, at, previous, offset);
      if (candidate && segmentClears(previous, candidate, [{ water, river: null }])) {
        next = candidate;
        break;
      }
    }
    if (!next) return null;
    points.push(next);
    previous = next;
  }
  const cleaned = dedupe(points);
  return cleaned.length >= 2 ? cleaned : null;
}

/** Shorter ring arc between two banks, when it stays near the road and out of the channel. */
function alongBank(water: PhysicalWaterPolygon, from: Point, to: Point, limit: number): Point[] | null {
  let best: Point[] | null = null;
  let bestLength = Infinity;
  for (const ring of water.rings) {
    const points = ring.map(point);
    if (points.length < 2) continue;
    const start = nearestOnRing(points, from);
    const end = nearestOnRing(points, to);
    if (start.gap > 200 || end.gap > 200) continue;
    for (const direction of [1, -1] as const) {
      const arc = ringArc(points, start, end, direction);
      const length = polylineLength(arc);
      if (length < MIN_PIECE_METERS || length > limit || length >= bestLength) continue;
      const dry = shiftDry(water, arc, 2) ?? shiftDry(water, arc, 0);
      if (!dry) continue;
      best = dry;
      bestLength = length;
    }
  }
  if (!best) return null;
  const body: WaterBody[] = [{ water, river: null }];
  const joined = segmentClears(from, best[0], body) ? dedupe([from, ...best]) : best;
  return joined.length >= 2 ? joined : null;
}

function bankLimit(from: Point, to: Point): number {
  return Math.min(4000, Math.max(dist(from, to) * 4, 800));
}

/** The in-water end of a descriptor road is not a landing. Continue on the
 * bank already under the road until that bank leaves the frame. */
function landOnFrame(dry: Point[], path: Point[], bodies: WaterBody[], half: number): void {
  const target = path.at(-1);
  const here = dry.at(-1);
  if (!target || !here || reachesFrame(here, half)) return;
  const body = bodies.find(item => item.river && deepInWater(target, item.water));
  if (!body) return;
  const arc = bankToFrame(body.water, here, target, half);
  if (!arc || !segmentClears(here, arc[0], [{ water: body.water, river: null }])) return;
  dry.push(...arc);
}

function reachesFrame(at: Point, half: number): boolean {
  return half - Math.max(Math.abs(at[0]), Math.abs(at[1])) <= 1;
}

function bankToFrame(water: PhysicalWaterPolygon, from: Point, toward: Point, half: number): Point[] | null {
  let best: { arc: Point[]; score: number } | null = null;
  const limit = bankLimit(from, toward);
  for (const ring of water.rings) {
    const points = ring.map(point);
    if (points.length < 2) continue;
    const start = nearestOnRing(points, from);
    if (start.gap > 200) continue;
    for (const direction of [1, -1] as const) {
      const hit = walkToFrame(points, start, direction, half, limit);
      if (!hit) continue;
      const score = dist(hit.at, toward);
      if (!best || score < best.score) best = { arc: hit.arc, score };
    }
  }
  if (!best) return null;
  return shiftDry(water, best.arc, 2) ?? shiftDry(water, best.arc, 0);
}

function walkToFrame(
  ring: Point[],
  start: RingHit,
  direction: 1 | -1,
  half: number,
  limit: number
): { at: Point; arc: Point[] } | null {
  const n = ring.length;
  const arc: Point[] = [start.at];
  let travelled = 0;
  let edge = start.edge;
  for (let guard = 0; guard < n; guard++) {
    const next = ring[direction === 1 ? (edge + 1) % n : edge];
    const from = arc.at(-1)!;
    const hit = segmentFrameHit(from, next, half);
    const step = hit ?? next;
    travelled += dist(from, step);
    if (travelled > limit) return null;
    arc.push(step);
    if (hit) return { at: hit, arc: dedupe(arc) };
    edge = (edge + direction + n) % n;
  }
  return null;
}

function segmentFrameHit(a: Point, b: Point, half: number): Point | null {
  const inside = (p: Point) => Math.abs(p[0]) <= half + 1e-6 && Math.abs(p[1]) <= half + 1e-6;
  if (!inside(a) || inside(b)) return null;
  let t = 1;
  for (const axis of [0, 1] as const) {
    if (b[axis] > half) t = Math.min(t, (half - a[axis]) / (b[axis] - a[axis]));
    if (b[axis] < -half) t = Math.min(t, (-half - a[axis]) / (b[axis] - a[axis]));
  }
  if (!(t > 1e-9 && t <= 1)) return null;
  return add(a, scale(sub(b, a), t));
}

interface RingHit {
  edge: number;
  t: number;
  at: Point;
  gap: number;
}

function nearestOnRing(ring: Point[], at: Point): RingHit {
  let best: RingHit = { edge: 0, t: 0, at: ring[0], gap: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      delta = sub(b, a),
      length2 = dot(delta, delta);
    if (length2 === 0) continue;
    const t = Math.max(0, Math.min(1, dot(sub(at, a), delta) / length2));
    const closest = add(a, scale(delta, t));
    const gap = dist(at, closest);
    if (gap < best.gap) best = { edge: i, t, at: closest, gap };
  }
  return best;
}

function ringArc(ring: Point[], start: RingHit, end: RingHit, direction: 1 | -1): Point[] {
  const n = ring.length;
  const points: Point[] = [start.at];
  const sameEdge = start.edge === end.edge && (direction === 1 ? end.t + 1e-9 >= start.t : end.t <= start.t + 1e-9);
  if (sameEdge) {
    points.push(end.at);
    return dedupe(points);
  }
  let edge = start.edge;
  for (let guard = 0; guard < n; guard++) {
    if (direction === 1) {
      points.push(ring[(edge + 1) % n]);
      edge = (edge + 1) % n;
      if (edge === end.edge) {
        points.push(end.at);
        return dedupe(points);
      }
    } else {
      points.push(ring[edge]);
      edge = (edge - 1 + n) % n;
      if (edge === end.edge) {
        points.push(end.at);
        return dedupe(points);
      }
    }
  }
  return dedupe(points);
}

function shiftDry(water: PhysicalWaterPolygon, arc: Point[], offset: number): Point[] | null {
  const shifted: Point[] = [];
  for (let i = 0; i < arc.length; i++) {
    const tangent = unit(sub(arc[Math.min(arc.length - 1, i + 1)], arc[Math.max(0, i - 1)]));
    if (!tangent || offset === 0) {
      shifted.push(arc[i]);
      continue;
    }
    const normal = rotate(tangent);
    const positive = add(arc[i], scale(normal, offset));
    const negative = add(arc[i], scale(normal, -offset));
    if (!deepInWater(positive, water) && deepInWater(negative, water)) shifted.push(positive);
    else if (!deepInWater(negative, water) && deepInWater(positive, water)) shifted.push(negative);
    else if (!deepInWater(arc[i], water)) shifted.push(arc[i]);
    else return null;
  }
  const body: WaterBody[] = [{ water, river: null }];
  for (let i = 1; i < shifted.length; i++) if (!segmentClears(shifted[i - 1], shifted[i], body)) return null;
  const cleaned = dedupe(shifted);
  return cleaned.length >= 2 ? cleaned : null;
}

function finish(pieces: FrameRoadPiece[], half: number): FrameRoadPiece[] {
  if (!Number.isFinite(half) || half <= 0) return pieces;
  const clipped: FrameRoadPiece[] = [];
  for (const piece of pieces) {
    if (piece.kind !== "road") {
      clipped.push(piece);
      continue;
    }
    const points = clipToSquare(piece.points, half);
    if (points.length >= 2 && polylineLength(points) >= MIN_PIECE_METERS) clipped.push({ ...piece, points });
  }
  return clipped;
}

function clipToSquare(points: Point[], half: number): Point[] {
  const inside = (p: Point) => Math.abs(p[0]) <= half + 1e-6 && Math.abs(p[1]) <= half + 1e-6;
  const out: Point[] = [];
  for (const next of points) {
    if (!out.length) {
      if (inside(next)) out.push(next);
      continue;
    }
    const prev = out.at(-1)!;
    if (inside(next)) {
      out.push(next);
      continue;
    }
    let t = 1;
    for (const axis of [0, 1] as const) {
      if (next[axis] > half) t = Math.min(t, (half - prev[axis]) / (next[axis] - prev[axis]));
      if (next[axis] < -half) t = Math.min(t, (-half - prev[axis]) / (next[axis] - prev[axis]));
    }
    if (t > 1e-6 && t < 1) out.push(add(prev, scale(sub(next, prev), t)));
    break;
  }
  return dedupe(out);
}

function projectToBank(water: PhysicalWaterPolygon, at: Point, prefer: Point, offset = 2): Point | null {
  if (!deepInWater(at, water)) return at;
  let nearest = Infinity;
  const candidates: { dry: Point; gap: number }[] = [];
  for (const ring of water.rings)
    for (let i = 0; i < ring.length; i++) {
      const a = point(ring[i]),
        b = point(ring[(i + 1) % ring.length]);
      const delta = sub(b, a);
      const length2 = dot(delta, delta);
      if (length2 === 0) continue;
      const t = Math.max(0, Math.min(1, dot(sub(at, a), delta) / length2));
      const closest = add(a, scale(delta, t));
      const gap = dist(at, closest);
      const tangent = unit(delta);
      if (!tangent) continue;
      const normal = rotate(tangent);
      for (const candidate of [add(closest, scale(normal, offset)), add(closest, scale(normal, -offset))]) {
        if (deepInWater(candidate, water)) continue;
        if (gap < nearest) nearest = gap;
        candidates.push({ dry: candidate, gap });
      }
    }
  let bank: Point | null = null;
  let best = Infinity;
  for (const candidate of candidates) {
    if (candidate.gap > nearest + 8) continue;
    const score = dist(candidate.dry, prefer);
    if (score < best) {
      best = score;
      bank = candidate.dry;
    }
  }
  return bank;
}

function outsideSquare(path: readonly [number, number][] | undefined, half: number): Point[] | null {
  if (!path || path.length < 2) return null;
  const points = path.map(point);
  const outside = (p: Point) => Math.abs(p[0]) > half + 1e-7 || Math.abs(p[1]) > half + 1e-7;
  if (outside(points[0])) return points;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    let t = 1;
    for (let axis = 0; axis < 2; axis++) {
      if (b[axis] > half) t = Math.min(t, (half - a[axis]) / (b[axis] - a[axis]));
      if (b[axis] < -half) t = Math.min(t, (-half - a[axis]) / (b[axis] - a[axis]));
    }
    if (t < 1 - 1e-9 && t >= -1e-9) {
      const exit = add(a, scale(sub(b, a), t));
      const rest = [exit, ...points.slice(i)];
      return polylineLength(rest) >= MIN_PIECE_METERS ? rest : null;
    }
  }
  return null;
}

function finitePath(path: Point[] | null): Point[] | null {
  if (!path || path.length < 2 || path.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  return path;
}

function attach(dry: Point[], target: Point, bodies: WaterBody[]): Point[] | null {
  if (!dry.length) return segmentClears(target, target, bodies) ? [target] : null;
  const length = polylineLength(dry);
  for (let back = 0; back <= SEARCH_METERS; back += SAMPLE_METERS) {
    const at = Math.max(0, length - back);
    const sample = pointAt(dry, at);
    if (!segmentClears(sample, target, bodies)) continue;
    return dedupe([...slicePath(dry, 0, at), target]);
  }
  return null;
}

function segmentClears(a: Point, b: Point, bodies: WaterBody[]): boolean {
  const length = dist(a, b);
  if (length < 1e-6) return !bodies.some(body => deepInWater(a, body.water));
  const steps = Math.max(1, Math.ceil(length / 2));
  for (let i = 1; i < steps; i++) {
    const at = add(a, scale(sub(b, a), i / steps));
    if (bodies.some(body => deepInWater(at, body.water))) return false;
  }
  return true;
}

function slicePath(path: Point[], start: number, end: number): Point[] {
  if (end < start) return [];
  const points = [pointAt(path, start)];
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const length = dist(path[i - 1], path[i]);
    const next = travelled + length;
    if (next > start + 1e-6 && travelled < end - 1e-6 && next <= end + 1e-6) points.push(path[i]);
    else if (travelled < end - 1e-6 && next > end + 1e-6) break;
    travelled = next;
  }
  points.push(pointAt(path, end));
  return dedupe(points);
}

function pointAt(path: Point[], distance: number): Point {
  if (distance <= 0) return path[0];
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const length = dist(path[i - 1], path[i]);
    if (travelled + length >= distance - 1e-9) {
      const t = length === 0 ? 0 : (distance - travelled) / length;
      return add(path[i - 1], scale(sub(path[i], path[i - 1]), Math.max(0, Math.min(1, t))));
    }
    travelled += length;
  }
  return path.at(-1)!;
}

function polylineLength(path: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
  return length;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const next of points) if (!out.length || dist(out.at(-1)!, next) > 0.05) out.push(next);
  return out;
}

function uniqueSorted(values: number[]): number[] {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) if (!out.length || value - out.at(-1)! > 1e-4) out.push(value);
  return out;
}

function parameterOn(q: Point, a: Point, b: Point): number {
  const length = dist(a, b);
  if (length === 0) return 0;
  return dot(sub(q, a), sub(b, a)) / (length * length);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const delta = sub(b, a);
  const length2 = dot(delta, delta);
  if (length2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), delta) / length2));
  return dist(p, add(a, scale(delta, t)));
}

function midpoint(a: readonly [number, number], b: readonly [number, number]): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
function point(value: readonly [number, number]): Point {
  return [value[0], value[1]];
}
function sub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}
function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}
function scale(a: Point, k: number): Point {
  return [a[0] * k, a[1] * k];
}
function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1];
}
function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function unit(value: Point): Point | null {
  const length = Math.hypot(value[0], value[1]);
  return length < 1e-9 ? null : [value[0] / length, value[1] / length];
}
function rotate(value: Point): Point {
  return [-value[1], value[0]];
}
