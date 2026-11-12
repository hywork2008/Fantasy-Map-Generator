import { relationDefense } from "../../../../utils/urbanMorphology";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import { joinVectorGenerationAnchors, rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { evaluateAnchor, pathIsClosed, pathSegmentIds } from "../geometry/curves";
import { distance, nearestRoadAnchor } from "../geometry/network";
import { containsRegion } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** Gates closer than this round the wall share one: medieval towns kept four to eight gates. */
export const MIN_GATE_SEPARATION_DEGREES = 40;
/** Nor closer than this along the wall, for a small town. */
const MIN_GATE_ARC_METERS = 60;

export interface GateApproachMerge {
  roadId: string;
  intoRoadId: string;
}

/** Where a polyline, walked from its outer end, first comes within `radius` of `center`: the course up to there. */
function courseTo(line: Point[], center: Point, radius: number): Point[] | undefined {
  const r = (p: Point) => distance(p, center);
  if (r(line[0]) < radius) return undefined;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    if (r(b) >= radius) continue;
    // Bisection on the chord: r(a) >= radius > r(b).
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (r([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid]) >= radius) lo = mid;
      else hi = mid;
    }
    return [...line.slice(0, i), [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo]];
  }
  return undefined;
}

/**
 * Approach roads that would cross the wall close to one another are spread before the wall is drawn (U1 of the
 * pre-acceptance plan). The roads are taken busiest first. Each keeps its own gate where it already reaches the wall
 * at least `MIN_GATE_SEPARATION_DEGREES` from the gates taken so far. Otherwise, while the wall has room for another
 * gate, it bends round outside the wall to the nearest free bearing and ends there, so the approach continued
 * through the wall meets it square to its line. A road that finds no free bearing ends in a junction on the nearest
 * gate's road outside the wall instead. A road carrying a bridge, or whose new course would cross water or another
 * road, keeps its own course.
 *
 * `wallRadius` is the wall's largest half extent; new courses run `joinRadius` from the centre. Merged roads are
 * returned: they lead to no gate of their own.
 */
export function spreadApproaches(
  doc: VectorCityDocument,
  center: Point,
  wallRadius: number,
  joinRadius: number
): GateApproachMerge[] {
  const roads = doc.site?.descriptor?.roads ?? [];
  const traffic = (id: string) => {
    const i = roads.findIndex((r, k) => id === `fmg-road:${r.routeId}:${k}`);
    return i >= 0 ? [roads[i].traffic ?? 0, roads[i].trafficRank ?? 0] : [0, 0];
  };
  const bridged = new Set(Object.values(doc.connections.bridges).map(b => b.roadPathId));
  // A road joined to a bridge's road (FMG's shared crossings and their branches) keeps its course.
  for (const node of Object.values(doc.connections.nodes))
    if (node.anchors.some(a => bridged.has(a.pathId))) for (const a of node.anchors) bridged.add(a.pathId);
  const bearingOf = (p: Point) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  // Each candidate walked from its outer end, with the bearing at which it reaches the wall's radius.
  // Each road reaching the wall, walked from its outer end, with the bearing at which it reaches the wall's radius.
  // Only a road that runs on into the town centre and carries no bridge may move; the others hold their gates.
  const crossing = Object.values(doc.paths)
    .filter(p => p.role === "road" && !pathIsClosed(p))
    .flatMap(p => {
      let line = samplePath(p).map(s => s.point);
      if (distance(line[0], center) < distance(line.at(-1)!, center)) line = [...line].reverse();
      const atWall = courseTo(line, center, wallRadius);
      return atWall
        ? [
            {
              path: p,
              line,
              bearing: bearingOf(atWall.at(-1)!),
              traffic: traffic(p.id),
              movable: !bridged.has(p.id) && distance(line.at(-1)!, center) <= wallRadius * 0.5
            }
          ]
        : [];
    });
  const candidates = crossing
    .filter(c => c.movable)
    .sort(
      (a, b) =>
        b.traffic[0] - a.traffic[0] ||
        b.traffic[1] - a.traffic[1] ||
        (a.path.id < b.path.id ? -1 : a.path.id > b.path.id ? 1 : 0)
    );
  if (crossing.length < 2 || !candidates.length) return [];
  const separation = Math.max((MIN_GATE_SEPARATION_DEGREES * Math.PI) / 180, MIN_GATE_ARC_METERS / wallRadius),
    capacity = Math.max(1, Math.floor((2 * Math.PI) / separation)),
    gap = (a: number, b: number) => {
      const d = Math.abs(a - b) % (2 * Math.PI);
      return Math.min(d, 2 * Math.PI - d);
    };
  const water = allVectorWater(doc),
    gates: { bearing: number; pathId: string; line: Point[] }[] = crossing
      .filter(c => !c.movable)
      .map(c => ({ bearing: c.bearing, pathId: c.path.id, line: c.line })),
    merges: GateApproachMerge[] = [];
  let changed = false;
  /** The first road `line` meets after its start, other than `self`. */
  const firstHit = (line: Point[], self: string) => {
    for (let i = 1; i < line.length; i++) {
      let best: { t: number; pathId: string } | undefined;
      for (const p of Object.values(doc.paths))
        if (p.role === "road" && p.id !== self) {
          const other = samplePath(p).map(q => q.point);
          for (let k = 1; k < other.length; k++) {
            const t = segmentHitT(line[i - 1], line[i], other[k - 1], other[k]);
            if (t !== undefined && (i > 1 || t > 1e-6) && (!best || t < best.t)) best = { t, pathId: p.id };
          }
        }
      if (best) {
        const a = line[i - 1],
          b = line[i];
        return {
          index: i,
          pathId: best.pathId,
          point: [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t] as Point
        };
      }
    }
    return undefined;
  };
  const wet = (line: Point[]) =>
    line.slice(1).some((b, i) => {
      const a = line[i],
        n = Math.max(1, Math.ceil(distance(a, b) / 2));
      return Array.from(
        { length: n + 1 },
        (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
      ).some(q => containsRegion(water, q));
    });
  /** Replaces the road's course; junctions left off it lose the road, and its new end joins `join` if given. */
  const relay = (id: string, points: Point[], join?: { pathId: string; point: Point }): boolean => {
    const path = doc.paths[id],
      laid: VectorPath = {
        ...path,
        source: curveSource(
          points.filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 0.05),
          "polyline",
          false
        ),
        width: { leftMeters: path.width.leftMeters, rightMeters: path.width.rightMeters, stations: [] }
      };
    if (!foldsFree(laid)) return false;
    if (!accessKept(doc, id, laid)) return false;
    moveAccess(doc, id, laid);
    doc.paths[id] = laid;
    for (const node of Object.values(doc.connections.nodes)) {
      node.anchors = node.anchors.flatMap(a => {
        if (a.pathId !== id) return [a];
        const moved = nearestRoadAnchor(laid, node.position);
        return distance(evaluateAnchor(laid, moved), node.position) < 0.05 ? [moved] : [];
      });
      if (!node.anchors.length) delete doc.connections.nodes[node.id];
    }
    for (const edge of Object.values(doc.connections.edges))
      if (!doc.connections.nodes[edge.fromNodeId] || !doc.connections.nodes[edge.toNodeId])
        delete doc.connections.edges[edge.id];
    const last: CurveAnchor = { pathId: id, segmentId: pathSegmentIds(laid).at(-1)!, t: 1 };
    if (join) joinVectorGenerationAnchors(doc, [nearestRoadAnchor(doc.paths[join.pathId], join.point), last]);
    changed = true;
    return true;
  };
  const free = (bearing: number) => gates.every(g => gap(g.bearing, bearing) >= separation);
  for (const road of candidates) {
    if (free(road.bearing)) {
      gates.push({ bearing: road.bearing, pathId: road.path.id, line: road.line });
      continue;
    }
    const course = courseTo(road.line, center, joinRadius);
    if (!course) {
      gates.push({ bearing: road.bearing, pathId: road.path.id, line: road.line });
      continue;
    }
    // Spread: an easy curve round the wall to the nearest free bearing (2-degree steps). It leaves the road farther
    // out the farther it goes round and ends on `joinRadius`; smoothstep in bearing makes it start and end radial.
    let spread: Point[] | undefined;
    if (gates.length < capacity) {
      const step = Math.PI / 90;
      for (let k = 1; k <= 90 && !spread; k++)
        for (const sign of [1, -1]) {
          if (!free(road.bearing + sign * k * step)) continue;
          const turn = k * step,
            depart = courseTo(road.line, center, joinRadius * (1 + 0.6 * turn));
          if (!depart) continue;
          const from = depart.at(-1)!,
            start = bearingOf(from),
            to = start + sign * turn;
          if (!free(to)) continue;
          const rFrom = distance(from, center),
            m = Math.max(6, Math.ceil(k / 2) + 4),
            curve = Array.from({ length: m }, (_, j): Point => {
              const u = (j + 1) / m,
                b = start + sign * turn * u * u * (3 - 2 * u),
                r = rFrom + (joinRadius - rFrom) * u;
              return [center[0] + Math.cos(b) * r, center[1] + Math.sin(b) * r];
            });
          const line = [from, ...curve];
          if (!wet(line) && !firstHit(line, road.path.id) && relay(road.path.id, [...depart, ...curve])) {
            spread = [...depart, ...curve];
            gates.push({ bearing: to, pathId: road.path.id, line: spread });
            break;
          }
        }
    }
    if (spread) continue;
    // Merge: a link to the nearest gate's road outside the wall, stopping at the first road it meets.
    const near = [...gates].sort((a, b) => gap(a.bearing, road.bearing) - gap(b.bearing, road.bearing))[0],
      target = courseTo(near.line, center, joinRadius)?.at(-1),
      chord = target ? 2 * joinRadius * Math.sin(gap(near.bearing, road.bearing) / 2) : 0,
      from = target ? courseTo(road.line, center, joinRadius + chord / 2) : undefined;
    const family = new Set([near.pathId, ...merges.filter(m => m.intoRoadId === near.pathId).map(m => m.roadId)]),
      hit = from && target ? firstHit([from.at(-1)!, target], road.path.id) : undefined;
    if (
      !from ||
      !target ||
      wet([from.at(-1)!, target]) ||
      !hit ||
      !family.has(hit.pathId) ||
      !relay(road.path.id, [...from, hit.point], hit)
    ) {
      gates.push({ bearing: road.bearing, pathId: road.path.id, line: road.line });
      continue;
    }
    merges.push({ roadId: road.path.id, intoRoadId: near.pathId });
  }
  if (!changed) return merges;
  rebuildRoadGraph(doc);
  doc.site!.fixedPaths = doc.site!.fixedPaths.map(p => (doc.paths[p.id] ? structuredClone(doc.paths[p.id]) : p));
  return merges;
}

/** Where segment p0-p1 crosses q0-q1, as a parameter along p0-p1. */
function segmentHitT(p0: Point, p1: Point, q0: Point, q1: Point): number | undefined {
  const r: Point = [p1[0] - p0[0], p1[1] - p0[1]],
    s: Point = [q1[0] - q0[0], q1[1] - q0[1]],
    den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return undefined;
  const qp: Point = [q0[0] - p0[0], q0[1] - p0[1]],
    t = (qp[0] * s[1] - qp[1] * s[0]) / den,
    u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

/** Straight run of a road on either side of the wall's face at a gate, beyond the wall's half thickness. */
const GATE_RUN_METERS = 12;

/**
 * Every road crossing `wallId` is laid square to the wall at the crossing (U1): the road keeps its course up to
 * a few gate runs either side, then runs straight along the wall's normal through the crossing. Junctions on the
 * road keep their places; a crossing with a junction, a bridge or water near it keeps its course.
 */
export function squareWallCrossings(
  doc: VectorCityDocument,
  wallId: string,
  /** Straight run beyond the wall's half thickness; a moat's bridge needs it to reach past the moat. */
  runMeters = GATE_RUN_METERS
): void {
  const wall = doc.paths[wallId],
    ring = samplePath(wall).map(s => s.point),
    half = Math.max(wall.width.leftMeters, wall.width.rightMeters),
    water = allVectorWater(doc),
    bridged = new Set(Object.values(doc.connections.bridges).map(b => b.roadPathId)),
    center = doc.site!.center;
  // Roads toward an enemy or a rival (FMG's diplomacy of the next town), with the paths joined to them.
  const roads = doc.site?.descriptor?.roads ?? [],
    military = new Set(
      roads.flatMap((r, i) =>
        [r.nextBurg, ...(r.nextBurgs ?? [])].some(b => b && relationDefense(b.diplomacyRelation) >= 0.6)
          ? [`fmg-road:${r.routeId}:${i}`]
          : []
      )
    );
  for (const node of Object.values(doc.connections.nodes))
    if (node.anchors.some(a => military.has(a.pathId)))
      for (const a of node.anchors) if (doc.paths[a.pathId]?.origin === "automatic") military.add(a.pathId);
  let changed = false;
  for (const road of Object.values(doc.paths).filter(p => p.role === "road" && !bridged.has(p.id))) {
    const line = samplePath(road).map(s => s.point),
      along = cumulative(line),
      total = along.at(-1)!;
    const crossings: { at: number; point: Point; tangent: Point }[] = [];
    for (let i = 1; i < line.length; i++)
      for (let k = 1; k < ring.length; k++) {
        const t = segmentHitT(line[i - 1], line[i], ring[k - 1], ring[k]);
        if (t === undefined) continue;
        const a = line[i - 1],
          b = line[i];
        crossings.push({
          at: along[i - 1] + (along[i] - along[i - 1]) * t,
          point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          tangent: [ring[k][0] - ring[k - 1][0], ring[k][1] - ring[k - 1][1]]
        });
      }
    if (!crossings.length) continue;
    // Junction positions along the road, ends excepted.
    const junctions = Object.values(doc.connections.nodes)
      .filter(n => n.anchors.some(a => a.pathId === road.id))
      .map(n => {
        const s = samplePath(road),
          j = s.reduce(
            (best, q, i) => (distance(q.point, n.position) < distance(s[best].point, n.position) ? i : best),
            0
          );
        return s[j].distance;
      })
      .filter(d => d > 1e-6 && d < total - 1e-6);
    // Along-road distances of the anchors features are reached from.
    const accesses = Object.values(doc.environment?.features ?? {})
      .filter(f => f.access.pathId === road.id)
      .map(f => {
        const at = evaluateAnchor(road, f.access);
        let best = 0;
        for (let i = 1; i < line.length; i++) if (distance(line[i], at) < distance(line[best], at)) best = i;
        return along[best];
      });
    const pointAt = (d: number): Point => {
      const i = Math.max(
        1,
        along.findIndex(x => x >= d)
      );
      const a = line[i - 1],
        b = line[i],
        t = (d - along[i - 1]) / (along[i] - along[i - 1] || 1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    let points = line,
      pointsAlong = along,
      done = false;
    const ends: { from: Point; to: Point; onward: Point }[] = [];
    // From the last crossing back, so earlier distances stay valid.
    for (const c of [...crossings].sort((a, b) => b.at - a.at)) {
      const run = half + runMeters,
        dir = unitAlong(pointAt(Math.max(0, c.at - 1)), pointAt(Math.min(total, c.at + 1))),
        tl = Math.hypot(c.tangent[0], c.tangent[1]) || 1,
        // Sine of the skew from square: the more oblique the road, the earlier it turns.
        skew = Math.abs((dir[0] * c.tangent[0] + dir[1] * c.tangent[1]) / tl),
        reach = run * (2.5 + 4 * skew),
        from = Math.max(0, c.at - reach),
        to = Math.min(total, c.at + reach);
      // A road ending just past the wall (an approach the extension carries on) moves its end out to the end of
      // the square run, with the junction there and the roads that leave it.
      const nearStart = c.at - from < run * 1.5,
        nearEnd = to - c.at < run * 1.5;
      if ((nearStart && from > 0) || (nearEnd && to < total)) continue;
      // A feature reached from between the gate and the end keeps its anchor: the end stays put and the road turns
      // to it just inside the gate. One reached from the end itself follows the moved end.
      const startNear = nearStart && !accesses.some(d => d > 1e-3 && d <= c.at),
        endNear = nearEnd && !accesses.some(d => d < total - 1e-3 && d >= c.at);
      if (junctions.some(d => d > from + 1e-6 && d < to - 1e-6)) continue;
      const len = Math.hypot(c.tangent[0], c.tangent[1]);
      let n: Point = [-c.tangent[1] / len, c.tangent[0] / len];
      // The normal pointing along the road's direction of travel.
      const before = pointAt(from);
      if ((c.point[0] - before[0]) * n[0] + (c.point[1] - before[1]) * n[1] < 0) n = [-n[0], -n[1]];
      const sBefore = startNear ? run : Math.min(run, (c.at - from) * (nearStart ? 0.5 : 0.8)),
        sAfter = endNear ? run : Math.min(run, (to - c.at) * (nearEnd ? 0.5 : 0.8)),
        square: Point[] = [
          [c.point[0] - n[0] * sBefore, c.point[1] - n[1] * sBefore],
          [c.point[0] + n[0] * sAfter, c.point[1] + n[1] * sAfter]
        ];
      const head = points.filter((_, i) => pointsAlong[i] < from - 1e-6),
        tail = points.filter((_, i) => pointsAlong[i] > to + 1e-6),
        first = startNear ? [] : [pointAt(from)],
        last = endNear ? [] : [pointAt(to)],
        plain = [...head, ...first, ...square, ...last, ...tail],
        options = [plain];
      // A gate toward an enemy is approached along the wall and entered by a sharp turn, so no rider reaches it at
      // speed: the outer leg runs beside the wall on the side the road comes from.
      if (military.has(road.id)) {
        const outerFirst = distance(square[0], center) > distance(square[1], center),
          q = outerFirst ? square[0] : square[1],
          beyond = outerFirst ? pointAt(from) : pointAt(to),
          t: Point = [c.tangent[0] / len, c.tangent[1] / len],
          out: Point = outerFirst ? [-n[0], -n[1]] : n,
          prefer = (beyond[0] - q[0]) * t[0] + (beyond[1] - q[1]) * t[1] >= 0 ? 1 : -1,
          bends: Point[][] = [];
        // Beside the wall toward the side the road comes from first, then the other side; shorter legs and an
        // outer turn onto the leg when the road comes in nearly square.
        for (const sign of [prefer, -prefer])
          for (const k of [2, 1.5, 1]) {
            const leg: Point = [q[0] + t[0] * sign * run * k, q[1] + t[1] * sign * run * k],
              turn: Point = [leg[0] + out[0] * run, leg[1] + out[1] * run];
            for (const outer of [[leg], [turn, leg]])
              bends.push(
                outerFirst
                  ? [...head, ...first, ...outer, ...square, ...last, ...tail]
                  : [...head, ...first, ...square, ...[...outer].reverse(), ...last, ...tail]
              );
          }
        options.unshift(...bends);
      }
      const next = options.find(
        o =>
          !wet(o.slice(head.length, o.length - tail.length)) &&
          foldsFree({
            ...road,
            source: curveSource(cleanCourse(o), "polyline", false),
            width: { ...road.width, stations: [] }
          })
      );
      if (!next) continue;
      if (startNear) ends.push({ from: line[0], to: next[0], onward: [-n[0], -n[1]] });
      if (endNear) ends.push({ from: line.at(-1)!, to: next.at(-1)!, onward: n });
      points = next;
      pointsAlong = cumulative(next);
      done = true;
    }
    if (!done) continue;
    const laid: VectorPath = {
      ...road,
      source: curveSource(cleanCourse(points), "polyline", false),
      width: { leftMeters: road.width.leftMeters, rightMeters: road.width.rightMeters, stations: [] }
    };
    if (!foldsFree(laid)) continue;
    // A moved end takes its junction along: every other road there must end there too, and is carried to it.
    const carried = new Map<string, VectorPath>(),
      shifted: { node: (typeof doc.connections.nodes)[string]; to: Point }[] = [];
    let blocked = false;
    for (const end of ends) {
      const node = Object.values(doc.connections.nodes).find(n => distance(n.position, end.from) < 1e-3);
      if (!node) continue;
      shifted.push({ node, to: end.to });
      for (const a of node.anchors) {
        if (a.pathId === road.id) continue;
        const other = carried.get(a.pathId) ?? doc.paths[a.pathId],
          ids = pathSegmentIds(other),
          atStart = a.segmentId === ids[0] && a.t === 0,
          atEnd = a.segmentId === ids.at(-1) && a.t === 1;
        if (other.role !== "road" || bridged.has(other.id) || pathIsClosed(other) || (!atStart && !atEnd)) {
          blocked = true;
          break;
        }
        let course = samplePath(other).map(q => q.point);
        const farEnd = atStart ? course.at(-1)! : course[0],
          loose = !Object.values(doc.connections.nodes).some(
            n => n !== node && n.anchors.some(b => b.pathId === other.id) && distance(n.position, farEnd) < 1e-3
          );
        if (other.origin === "automatic" && course.length === 2 && loose) {
          // A generated stub carrying the road into the town runs on straight out of the gate.
          const length = distance(course[0], course[1]),
            ahead: Point = [end.to[0] + end.onward[0] * length, end.to[1] + end.onward[1] * length];
          course = atStart ? [end.to, ahead] : [ahead, end.to];
        } else {
          // The carried road's own vertices near the moved end give way, so it bends gently onto it.
          const clear = (q: Point) => distance(q, end.to) > GATE_RUN_METERS * 2;
          const kept = atStart ? course.slice(1).filter(clear) : course.slice(0, -1).filter(clear);
          course = atStart
            ? [end.to, ...(kept.length ? kept : [course.at(-1)!])]
            : [...(kept.length ? kept : [course[0]]), end.to];
        }
        const relaid: VectorPath = {
          ...other,
          source: curveSource(cleanCourse(course), "polyline", false),
          width: { leftMeters: other.width.leftMeters, rightMeters: other.width.rightMeters, stations: [] }
        };
        if (cleanCourse(course).length < 2 || !foldsFree(relaid)) {
          blocked = true;
          break;
        }
        carried.set(other.id, relaid);
      }
      if (blocked) break;
    }
    // Features reached from a moved end (of this road or a carried one): their connector runs on to the new end.
    const followingOf = (id: string) =>
      Object.values(doc.environment?.features ?? {}).filter(f => {
        if (f.access.pathId !== id) return false;
        const at = evaluateAnchor(doc.paths[id], f.access);
        return ends.some(e => distance(e.from, at) < 1e-3);
      });
    const following = followingOf(road.id);
    if (
      blocked ||
      [...carried].some(([id, relaid]) => !accessKept(doc, id, relaid, followingOf(id))) ||
      !accessKept(doc, road.id, laid, following)
    )
      continue;
    // Every junction on the road must stay on the new course, or the road keeps its old one.
    const nodes = Object.values(doc.connections.nodes).filter(n => n.anchors.some(a => a.pathId === road.id)),
      targets = nodes.map(n => shifted.find(x => x.node === n)?.to ?? n.position),
      moved = targets.map(p => nearestRoadAnchor(laid, p));
    if (moved.some((a, i) => distance(evaluateAnchor(laid, a), targets[i]) > 1e-3)) continue;
    for (const { node, to } of shifted) node.position = to;
    const follow = (id: string, relaid: VectorPath, list: VectorFeatureLike[]) => {
      for (const f of list) {
        const to = ends.find(e => distance(e.from, evaluateAnchor(doc.paths[id], f.access)) < 1e-3)!.to;
        f.connector = [...f.connector, to];
        f.access = nearestRoadAnchor(relaid, to);
      }
    };
    for (const [id, relaid] of carried) {
      const list = followingOf(id);
      follow(id, relaid, list);
      moveAccess(doc, id, relaid, list);
      doc.paths[id] = relaid;
      for (const n of Object.values(doc.connections.nodes))
        n.anchors = n.anchors.map(a => (a.pathId === id ? nearestRoadAnchor(relaid, n.position) : a));
    }
    follow(road.id, laid, following);
    moveAccess(doc, road.id, laid, following);
    doc.paths[road.id] = laid;
    nodes.forEach((n, i) => {
      n.anchors = n.anchors.map(a => (a.pathId === road.id ? moved[i] : a));
    });
    changed = true;
  }
  function wet(line: Point[]) {
    return line.slice(1).some((b, i) => {
      const a = line[i],
        k = Math.max(1, Math.ceil(distance(a, b) / 2));
      return Array.from(
        { length: k + 1 },
        (_, j): Point => [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]
      ).some(q => containsRegion(water, q));
    });
  }
  if (!changed) return;
  rebuildRoadGraph(doc);
  doc.site!.fixedPaths = doc.site!.fixedPaths.map(p => (doc.paths[p.id] ? structuredClone(doc.paths[p.id]) : p));
}

/** A course without vertices closer than half a metre or lying on the line through their neighbours: polygon
 * operations on road surfaces fail on such near-degenerate vertices. The ends are kept. */
function cleanCourse(points: Point[]): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) if (distance(points[i], out.at(-1)!) > 0.5) out.push(points[i]);
  const last = points.at(-1)!;
  if (out.length > 1 && distance(out.at(-1)!, last) <= 0.5) out.pop();
  out.push(last);
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1],
      b = out[i + 1],
      l = distance(a, b) || 1;
    return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l > 0.05;
  });
}

function unitAlong(a: Point, b: Point): Point {
  const l = distance(a, b) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

/** Whether the road's surface, widened by the margins later steps add (bastion reservations: 2 m), keeps from
 * folding on itself. */
function foldsFree(path: VectorPath): boolean {
  try {
    pathSurface({
      ...path,
      width: { ...path.width, leftMeters: path.width.leftMeters + 2, rightMeters: path.width.rightMeters + 2 }
    });
    return true;
  } catch {
    return false;
  }
}

/** Distance along a polyline at each vertex. */
function cumulative(line: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distance(line[i - 1], line[i]));
  return out;
}

/** Whether every feature reached from the road (its access anchor) still lies on the new course. */
function accessKept(
  doc: VectorCityDocument,
  id: string,
  laid: VectorPath,
  skip: readonly VectorFeatureLike[] = []
): boolean {
  return Object.values(doc.environment?.features ?? {})
    .filter(f => f.access.pathId === id && !skip.includes(f))
    .every(f => {
      const at = evaluateAnchor(doc.paths[id], f.access);
      return distance(evaluateAnchor(laid, nearestRoadAnchor(laid, at)), at) < 1e-3;
    });
}
/** Re-anchors the features reached from the road on its new course (checked by `accessKept`). */
function moveAccess(
  doc: VectorCityDocument,
  id: string,
  laid: VectorPath,
  skip: readonly VectorFeatureLike[] = []
): void {
  for (const f of Object.values(doc.environment?.features ?? {}))
    if (f.access.pathId === id && !skip.includes(f))
      f.access = nearestRoadAnchor(laid, evaluateAnchor(doc.paths[id], f.access));
}

type VectorFeatureLike = NonNullable<VectorCityDocument["environment"]>["features"][string];
