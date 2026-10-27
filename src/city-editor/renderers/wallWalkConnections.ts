import { outwardSign, ribbonSidePoints } from "../../city3d/core/structureGeometry";
import { polygonOverlaps } from "../generators/fortifications";
import { nearestOnPolyline, pointInPolygon, polygonCentroid, segmentSegmentHit } from "../generators/geom";
import { bounds, PlotIndex, subtractConvex } from "../generators/parcelGeometry";
import { STAIR_GRADE, STAIR_RISER_METERS } from "../generators/roadGrading";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";

const TREAD = STAIR_RISER_METERS / STAIR_GRADE;
const LEVEL_TOLERANCE = STAIR_RISER_METERS + 0.04;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

interface Walk {
  part: StructureMassing;
  line: Point[];
  stations: number[];
  offsets: Point[];
  total: number;
}
interface Joint {
  station: number;
  level: number;
  landing: number;
  steps: number;
  rise: number;
}
interface Segment {
  walk: Walk;
  index: number;
  a: Point;
  b: Point;
}
interface Opening {
  polygon: Point[];
  owner: string;
  levelAt(point: Point): number;
}

function walkOf(part: StructureMassing): Walk | null {
  const line = part.centerline;
  if (!line || line.length < 2 || !part.widthMeters) return null;
  const side = ribbonSidePoints(line, 1, part.ribbonOffsets);
  if (!side) return null;
  const stations = [0];
  for (let i = 1; i < line.length; i++) stations.push(stations[i - 1] + distance(line[i - 1], line[i]));
  return {
    part,
    line,
    stations,
    total: stations.at(-1)!,
    offsets: line.map((p, i) => [side[i % side.length][0] - p[0], side[i % side.length][1] - p[1]])
  };
}

function sample(walk: Walk, station: number) {
  const s = Math.max(0, Math.min(walk.total, station));
  let i = 0;
  while (i + 2 < walk.stations.length && walk.stations[i + 1] < s - 1e-8) i++;
  const t = (s - walk.stations[i]) / Math.max(1e-8, walk.stations[i + 1] - walk.stations[i]);
  const { part, line, offsets } = walk;
  const base = (j: number) => part.baseElevationsMeters?.[j] ?? part.baseElevationMeters;
  const top = (j: number) => part.topElevationsMeters?.[j] ?? part.baseElevationMeters + part.heightMeters;
  return {
    point: [lerp(line[i][0], line[i + 1][0], t), lerp(line[i][1], line[i + 1][1], t)] as Point,
    offset: [lerp(offsets[i][0], offsets[i + 1][0], t), lerp(offsets[i][1], offsets[i + 1][1], t)] as Point,
    base: lerp(base(i), base(i + 1), t),
    top: lerp(top(i), top(i + 1), t)
  };
}

function stationAt(walk: Walk, point: Point): number {
  const hit = nearestOnPolyline(point, walk.line);
  return walk.stations[hit.segIndex] + distance(walk.line[hit.segIndex], hit.point);
}

function junctions(walks: Walk[]): Map<Walk, Joint[]> {
  const index = new PlotIndex<Segment>(20);
  const result = new Map<Walk, Joint[]>();
  for (const walk of walks) {
    for (let i = 1; i < walk.line.length; i++) {
      const a = walk.line[i - 1],
        b = walk.line[i];
      const segment = { walk, index: i - 1, a, b };
      for (const other of index.query(bounds([a, b]))) {
        if (other.walk === walk) continue;
        const hit = segmentSegmentHit(a, b, other.a, other.b);
        // Collinear extensions still meet at a shared endpoint.
        const point = hit?.point ?? [a, b].find(p => [other.a, other.b].some(q => distance(p, q) < 1e-5));
        if (!point) continue;
        const s = stationAt(walk, point),
          os = stationAt(other.walk, point);
        const h = sample(walk, s).top,
          oh = sample(other.walk, os).top;
        if (Math.abs(h - oh) <= LEVEL_TOLERANCE) continue;
        const high = h > oh ? walk : other.walk,
          low = h > oh ? other.walk : walk;
        const at = h > oh ? s : os,
          level = Math.min(h, oh);
        const list = result.get(high) ?? [];
        if (list.some(j => Math.abs(j.station - at) < 0.01 && Math.abs(j.level - level) < 0.01)) continue;
        const delta = Math.abs(h - oh),
          steps = Math.ceil(delta / STAIR_RISER_METERS);
        list.push({ station: at, level, landing: low.part.widthMeters! / 2 + 0.5, steps, rise: delta / steps });
        result.set(high, list);
      }
      index.add(segment, bounds([a, b]));
    }
  }
  return result;
}

function steppedWalk(walk: Walk, joints: Joint[]): StructureMassing[] {
  if (!joints.length) return [walk.part];
  const closed = distance(walk.line[0], walk.line.at(-1)!) < 1e-5;
  const expanded = closed
    ? joints.flatMap(j => [-walk.total, 0, walk.total].map(delta => ({ ...j, station: j.station + delta })))
    : joints;
  const cuts = [...walk.stations];
  for (const joint of expanded) {
    cuts.push(joint.station);
    for (let i = 0; i <= joint.steps; i++) {
      const reach = joint.landing + i * TREAD;
      cuts.push(joint.station - reach, joint.station + reach);
    }
  }
  const stations = [...new Set(cuts.filter(s => s >= 0 && s <= walk.total).map(s => Math.round(s * 1e7) / 1e7))].sort(
    (a, b) => a - b
  );
  const runs: Array<{ start: number; end: number; top: number | null }> = [];
  for (let i = 1; i < stations.length; i++) {
    const start = stations[i - 1],
      end = stations[i];
    if (end - start < 1e-6) continue;
    const mid = (start + end) / 2;
    const original = sample(walk, mid).top;
    let top = original;
    for (const joint of expanded) {
      const d = Math.abs(mid - joint.station);
      if (d >= joint.landing + joint.steps * TREAD) continue;
      const step = Math.max(0, Math.floor((d - joint.landing) / TREAD) + 1);
      top = Math.min(top, joint.level + step * joint.rise);
    }
    // A terrain crest cannot be carved below the footing of the wall.
    top = Math.max(top, sample(walk, start).base + 0.3, sample(walk, end).base + 0.3);
    const level = top < original - 1e-5 ? top : null;
    const previous = runs.at(-1);
    if (previous && previous.top === level) previous.end = end;
    else runs.push({ start, end, top: level });
  }
  return runs.map((run, index) => {
    const ss = [run.start, ...walk.stations.filter(s => s > run.start + 1e-6 && s < run.end - 1e-6), run.end];
    const samples = ss.map(s => sample(walk, s));
    return {
      ...walk.part,
      id: `${walk.part.id}:walk-${index}`,
      centerline: samples.map(s => s.point),
      ribbonOffsets: samples.map(s => s.offset),
      baseElevationsMeters: samples.map(s => s.base),
      topElevationsMeters: samples.map(s => run.top ?? s.top),
      wallWalkModified: run.top !== null
    };
  });
}

function ribbonPolygons(walk: Walk, lo: number, hi: number): Point[][] {
  const at = (i: number, d: number): Point => [
    walk.line[i][0] + walk.offsets[i][0] * d,
    walk.line[i][1] + walk.offsets[i][1] * d
  ];
  return walk.line.slice(1).map((_, i) => [at(i, lo), at(i + 1, lo), at(i + 1, hi), at(i, hi)]);
}

/** Open only the overlapping lips; all load-bearing wall and tower bodies remain. */
function openParapets(parts: StructureMassing[], owners: Map<StructureMassing, string>): StructureMassing[] {
  const openings = new PlotIndex<Opening>(20);
  for (const part of parts) {
    if (part.id.startsWith("tower:") && part.footprint && part.roof === "flat") {
      const level = part.baseElevationMeters + part.heightMeters;
      openings.add({ polygon: part.footprint, owner: part.id, levelAt: () => level }, bounds(part.footprint));
    }
    if (!part.id.startsWith("wall:") || part.parapet === "none") continue;
    const walk = walkOf(part);
    if (!walk) continue;
    const sign = outwardSign(walk.line, part.anchor ?? [0, 0]);
    const half = part.widthMeters! / 2;
    const polygons = ribbonPolygons(walk, sign * (-half + 0.25), sign * (half - part.parapetWidthMeters));
    for (const polygon of polygons)
      openings.add(
        {
          polygon,
          owner: owners.get(part) ?? part.id,
          levelAt: point => sample(walk, stationAt(walk, point)).top
        },
        bounds(polygon)
      );
  }
  return parts.flatMap(part => {
    const bastion = part.id.startsWith("bastion-parapet:");
    const standalone = bastion || part.id.startsWith("wall-walk-rail:");
    if (!standalone && (!part.id.startsWith("wall:") || part.parapet === "none")) return [part];
    const walk = walkOf(part);
    if (!walk) return [part];
    const owner = owners.get(part) ?? part.id;
    const lip = standalone ? part.widthMeters! : part.parapetWidthMeters;
    const sign = outwardSign(walk.line, part.anchor ?? [0, 0]);
    const shift = standalone ? 0 : (sign * (part.widthMeters! - lip)) / 2;
    const polygons = ribbonPolygons(walk, shift - lip / 2, shift + lip / 2);
    // Even when the lip misses the tower, overlapping deck faces must be united below.
    let changed =
      !standalone &&
      ribbonPolygons(walk, -part.widthMeters! / 2, part.widthMeters! / 2).some(poly =>
        openings
          .query(bounds(poly))
          .some(
            opening =>
              opening.owner.startsWith("tower:") &&
              polygonOverlaps(poly, opening.polygon) &&
              Math.abs(sample(walk, stationAt(walk, polygonCentroid(poly))).top - opening.levelAt(poly[0])) <=
                LEVEL_TOLERANCE
          )
      );
    const pieces: StructureMassing[] = [];
    polygons.forEach((polygon, i) => {
      const s0 = walk.stations[i],
        s1 = walk.stations[i + 1];
      const levelAt = (p: Point) => (standalone ? part.baseElevationMeters : sample(walk, stationAt(walk, p)).top);
      let kept = [polygon];
      for (const opening of openings.query(bounds(polygon))) {
        if (opening.owner === owner || (bastion && opening.owner === part.id.replace("bastion-parapet:", "tower:")))
          continue;
        kept = kept.flatMap(poly => {
          const probe = polygonCentroid(poly);
          // Ignore decks on a different storey. A stair landing is an ordinary deck here.
          const onOpening = nearestOnPolyline(probe, [...opening.polygon, opening.polygon[0]]).point;
          const point = pointInPolygon(probe, opening.polygon) ? probe : onOpening;
          if (Math.abs(levelAt(point) - opening.levelAt(point)) > LEVEL_TOLERANCE) return [poly];
          const next = subtractConvex(poly, opening.polygon, 0.0001);
          if (next.length !== 1 || next[0] !== poly) changed = true;
          return next;
        });
      }
      kept.forEach((footprint, j) => {
        const a = walk.line[i],
          b = walk.line[i + 1];
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          ll = dx * dx + dy * dy;
        const levels = footprint.map(p => {
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / Math.max(1e-8, ll)));
          return standalone ? part.baseElevationMeters : sample(walk, lerp(s0, s1, t)).top;
        });
        pieces.push({
          ...part,
          id: `${part.id}:lip-${i}-${j}`,
          centerline: undefined,
          ribbonOffsets: undefined,
          baseElevationsMeters: undefined,
          topElevationsMeters: undefined,
          footprint,
          sections: [
            { footprint, elevationsMeters: levels },
            { footprint, elevationsMeters: levels.map(h => h + (standalone ? part.heightMeters : part.parapetMeters)) }
          ],
          baseElevationMeters: Math.min(...levels),
          heightMeters: standalone ? part.heightMeters : part.parapetMeters,
          parapet: "none",
          wallWalkModified: true
        });
      });
    });
    if (!changed) return [part];
    return standalone ? pieces : [{ ...part, parapet: "none", wallWalkModified: true }, ...pieces];
  });
}

/** A tower owns its whole deck; remove coincident curtain faces instead of leaving z-fighting floors. */
function uniteBastionDecks(parts: StructureMassing[]): StructureMassing[] {
  const towers = parts.filter(p => p.id.startsWith("tower:") && p.footprint && p.roof === "flat");
  if (!towers.length) return parts;
  return parts.flatMap(part => {
    if (!part.id.startsWith("wall:") || part.parapet !== "none" || part.sections) return [part];
    const walk = walkOf(part);
    if (!walk) return [part];
    let changed = false;
    const bodies: StructureMassing[] = [];
    const polygons = ribbonPolygons(walk, -part.widthMeters! / 2, part.widthMeters! / 2);
    polygons.forEach((polygon, i) => {
      let kept = [polygon];
      for (const tower of towers) {
        const level = tower.baseElevationMeters + tower.heightMeters;
        if (Math.abs(sample(walk, (walk.stations[i] + walk.stations[i + 1]) / 2).top - level) > LEVEL_TOLERANCE)
          continue;
        kept = kept.flatMap(poly => {
          const next = subtractConvex(poly, tower.footprint!, 0.0001);
          if (next.length !== 1 || next[0] !== poly) changed = true;
          return next;
        });
      }
      kept.forEach((footprint, j) => {
        const a = walk.line[i],
          b = walk.line[i + 1];
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          ll = dx * dx + dy * dy;
        const levels = footprint.map(p =>
          sample(
            walk,
            lerp(
              walk.stations[i],
              walk.stations[i + 1],
              Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / Math.max(1e-8, ll)))
            )
          )
        );
        bodies.push({
          ...part,
          id: `${part.id}:body-${i}-${j}`,
          centerline: undefined,
          ribbonOffsets: undefined,
          footprint,
          sections: [
            { footprint, elevationsMeters: levels.map(s => s.base) },
            { footprint, elevationsMeters: levels.map(s => s.top) }
          ],
          wallWalkModified: true
        });
      });
    });
    return changed ? bodies : [part];
  });
}

/** Resolve wall-walk joints after grounding, so stairs and openings use actual scene elevations. */
export function connectWallWalks(parts: StructureMassing[]): StructureMassing[] {
  const walks = parts
    .filter(p => p.id.startsWith("wall:") && p.parapet !== "none" && !p.sections)
    .flatMap(p => {
      const walk = walkOf(p);
      return walk ? [walk] : [];
    });
  const joints = junctions(walks);
  const owners = new Map<StructureMassing, string>();
  const byPart = new Map(walks.map(walk => [walk.part, walk]));
  const stepped = parts.flatMap(part => {
    const walk = byPart.get(part);
    const result = walk ? steppedWalk(walk, joints.get(walk) ?? []) : [part];
    for (const piece of result) owners.set(piece, part.id);
    return result;
  });
  const rails = stepped.flatMap(part => {
    if (!part.wallWalkModified || !part.centerline) return [];
    const walk = walkOf(part);
    if (!walk) return [];
    const shift = (-outwardSign(walk.line, part.anchor ?? [0, 0]) * (part.widthMeters! - 0.25)) / 2;
    const rail: StructureMassing = {
      ...part,
      id: `wall-walk-rail:${part.id}`,
      widthMeters: 0.25,
      centerline: walk.line.map(
        (p, i): Point => [p[0] + walk.offsets[i][0] * shift, p[1] + walk.offsets[i][1] * shift]
      ),
      baseElevationMeters: sample(walk, 0).top,
      heightMeters: 0.7,
      baseElevationsMeters: undefined,
      topElevationsMeters: undefined,
      parapet: "none"
    };
    owners.set(rail, owners.get(part) ?? part.id);
    return [rail];
  });
  return uniteBastionDecks(openParapets([...stepped, ...rails], owners));
}
