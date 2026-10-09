import { boundaryEdges, boundaryRings, refPoints } from "./fortifications";
import { closeShorelineToFrame } from "./gen/classifySea";
import { nearestOnPolyline, polygonArea } from "./gen/geom";
import { convexInfillParts, triangularInfillParts } from "./gen/lotGeometry";
import { subtractConvex } from "./gen/parcelGeometry";
import type { Cell } from "./gen/types";
import type { CityDocument, Point } from "./types";

const cache = new WeakMap<CityDocument, { key: string; polygons: Point[][] }>();

/** Sea beyond the editable town mesh. FMG supplies the drawn shore across the
 * whole display frame; generation closes it into `regionalWaterAreas`. The mesh
 * owns the detailed shore, so the mesh area is subtracted here — only the sea
 * the mesh cannot hold is returned, and islands, quays and edited cells keep
 * their own geometry. Documents without the field have no regional sea. */
export function regionalCoastalWaterPolygons(doc: CityDocument): Point[][] {
  const areas = doc.regionalWaterAreas;
  if (!areas?.length) return [];
  const vertices = Object.values(doc.mesh.vertices).map(v => v.point);
  if (!vertices.length) return [];
  // History normally replaces documents; the signature also covers in-place
  // vertex movement used by editing and debug tools.
  const key = `${doc.frame.extentMeters}:${areas.map(ring => ring.map(p => p.join(",")).join(";")).join("|")}:${vertices
    .map(p => p.join(","))
    .join(";")}:${Object.values(doc.mesh.edges)
    .map(e => `${e.a},${e.b},${e.leftFace},${e.rightFace}`)
    .join(";")}`;
  const previous = cache.get(doc);
  if (previous?.key === key) return previous.polygons;
  const polygons = outsideMesh(doc, areas);
  cache.set(doc, { key, polygons });
  return polygons;
}

/** Convex pieces of `rings` that lie outside the town mesh's outer boundary. */
function outsideMesh(doc: CityDocument, rings: Point[][]): Point[][] {
  const core = boundaryRings(doc.mesh, boundaryEdges(doc.mesh, Object.keys(doc.mesh.faces)))
    .map(refs => refPoints(doc.mesh, refs))
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  const coreParts = core?.length ? convexInfillParts(core) : [];
  return rings.flatMap(ring => {
    let parts = triangularInfillParts(ring);
    for (const corePart of coreParts) parts = parts.flatMap(part => subtractConvex(part, corePart, 0.001));
    return parts;
  });
}

export interface RegionalSurfaceLayer {
  kind: "land" | "water" | "unknown";
  parts: Point[][];
}

const surfaceCache = new WeakMap<CityDocument, RegionalSurfaceLayer[]>();

/** FMG islands and lakes beyond the town mesh, in paint order (largest first,
 * so a lake on an island paints over it), followed by the frame area beyond
 * the FMG map edge, which FMG knows nothing about and must not show terrain. */
export function regionalSurfaceLayers(doc: CityDocument): RegionalSurfaceLayer[] {
  const surface = doc.regionalSurface;
  if (!surface || !Object.keys(doc.mesh.vertices).length) return [];
  const cached = surfaceCache.get(doc);
  if (cached) return cached;
  const layers: RegionalSurfaceLayer[] = [
    ...surface.features.map(feature => ({ kind: feature.kind, parts: outsideMesh(doc, [feature.ring as Point[]]) })),
    ...(surface.unknown.length
      ? [{ kind: "unknown" as const, parts: outsideMesh(doc, surface.unknown as Point[][]) }]
      : [])
  ].filter(layer => layer.parts.length);
  surfaceCache.set(doc, layers);
  return layers;
}

/** Longest run of the polyline inside the frame, cut exactly at the frame edge.
 * Each segment is clipped on its own, so a segment with both ends outside the
 * frame but crossing it is kept. */
export function clipPolylineToFrame(poly: Point[], half: number): Point[] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let i = 1; i < poly.length; i++) {
    const [a, b] = [poly[i - 1], poly[i]];
    let t0 = 0,
      t1 = 1;
    for (const axis of [0, 1] as const) {
      const d = b[axis] - a[axis];
      for (const sign of [-1, 1] as const) {
        // sign * (a + t d) <= half, i.e. inside on this side
        const room = half - sign * a[axis];
        const rate = sign * d;
        if (Math.abs(rate) < 1e-12) {
          if (room < 0) t1 = -1;
        } else if (rate > 0) t1 = Math.min(t1, room / rate);
        else t0 = Math.max(t0, room / rate);
      }
    }
    if (t0 > t1) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (t0 > 1e-9 && run.length) {
      runs.push(run);
      run = [];
    }
    if (!run.length) run.push(at(t0));
    run.push(at(t1));
    if (t1 < 1 - 1e-9) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const length = (r: Point[]) => cumulative(r)[r.length - 1];
  return runs.sort((x, y) => length(y) - length(x))[0] ?? [];
}

/** Move a shore end along its own direction onto the frame boundary. */
function extendToFrame(end: Point, inner: Point, half: number): Point {
  const eps = 1e-3;
  if (Math.max(Math.abs(end[0]), Math.abs(end[1])) >= half - eps) return end;
  const dx = end[0] - inner[0],
    dy = end[1] - inner[1];
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (half - end[0]) / dx);
  if (dx < -1e-9) t = Math.min(t, (-half - end[0]) / dx);
  if (dy > 1e-9) t = Math.min(t, (half - end[1]) / dy);
  if (dy < -1e-9) t = Math.min(t, (-half - end[1]) / dy);
  return Number.isFinite(t) ? [end[0] + dx * t, end[1] + dy * t] : end;
}

/** The town mesh's own sea/land boundary as one chain from mesh border to mesh
 * border (the longest such chain), or null when the sea does not reach it.
 * This, not the coarse walk guide, is where the regional coast must join. */
export function meshShoreChain(cells: Cell[], sea: Set<number>): Point[] | null {
  const key = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const points = new Map<string, Point>();
  const links = new Map<string, Set<string>>();
  const link = (a: Point, b: Point) => {
    const ka = key(a),
      kb = key(b);
    points.set(ka, a);
    points.set(kb, b);
    (links.get(ka) ?? links.set(ka, new Set()).get(ka)!).add(kb);
    (links.get(kb) ?? links.set(kb, new Set()).get(kb)!).add(ka);
  };
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  for (const id of sea) {
    const cell = byId.get(id);
    if (!cell) continue;
    for (let i = 0; i < cell.polygon.length; i++) {
      const a = cell.polygon[i],
        b = cell.polygon[(i + 1) % cell.polygon.length];
      const [ka, kb] = [key(a), key(b)];
      const land = cell.neighbors.some(n => {
        const other = byId.get(n);
        if (!other || sea.has(n)) return false;
        const keys = new Set(other.polygon.map(key));
        return keys.has(ka) && keys.has(kb);
      });
      if (land) link(a, b);
    }
  }
  const used = new Set<string>();
  const chains: Point[][] = [];
  for (const [start, next] of links) {
    if (next.size !== 1 || used.has(start)) continue;
    const chain = [start];
    used.add(start);
    for (let at = start; ; ) {
      const step = [...(links.get(at) ?? [])].find(k => !used.has(k));
      if (!step) break;
      used.add(step);
      chain.push(step);
      at = step;
    }
    chains.push(chain.map(k => points.get(k)!));
  }
  const length = (c: Point[]) => cumulative(c)[c.length - 1];
  return chains.sort((a, b) => length(b) - length(a))[0] ?? null;
}

const SHORE_STEP_METERS = 20;
/** Distance over which the town's own shore relaxes into FMG's coast. */
const SHORE_BLEND_METERS = 160;

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function cumulative(poly: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < poly.length; i++)
    out.push(out[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  return out;
}

function pointAt(poly: Point[], cum: number[], s: number): Point {
  const clamped = Math.min(cum[cum.length - 1], Math.max(0, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < clamped) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const t = (clamped - cum[i - 1]) / span;
  return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t];
}

function resample(poly: Point[], step: number): Point[] {
  const clean = poly.filter((p, i) => !i || Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) > 1e-6);
  if (clean.length < 2) return clean;
  const cum = cumulative(clean);
  const count = Math.max(1, Math.round(cum[cum.length - 1] / step));
  return Array.from({ length: count + 1 }, (_, i) => pointAt(clean, cum, (cum[cum.length - 1] * i) / count));
}

/** 1-D value noise in [-1, 1] with the given feature size. */
function valueNoise(rng: () => number, length: number, feature: number): (s: number) => number {
  const lattice = Array.from({ length: Math.ceil(length / feature) + 2 }, () => rng() * 2 - 1);
  return s => {
    const x = s / feature,
      i = Math.floor(x);
    return lattice[i] + (lattice[i + 1] - lattice[i]) * smoothstep(x - i);
  };
}

/** The coast beyond the town mesh. FMG's coast is only a coarse guide (often a
 * straight line); the walked town shore carries the real local character. The
 * result starts at the town shore, relaxes into the FMG line over
 * SHORE_BLEND_METERS, and keeps the town shore's own roughness out to the frame. */
export function regionalShoreline(fmg: Point[], walked: Point[], rng: () => number): Point[] {
  const base = resample(fmg, SHORE_STEP_METERS);
  const town = walked.filter((p, i) => !i || Math.hypot(p[0] - walked[i - 1][0], p[1] - walked[i - 1][1]) > 1e-6);
  if (base.length < 2 || town.length < 2) return base;
  const cum = cumulative(base);
  const total = cum[cum.length - 1];
  const param = (p: Point) => {
    const hit = nearestOnPolyline(p, base);
    return cum[hit.segIndex] + hit.t * (cum[hit.segIndex + 1] - cum[hit.segIndex]);
  };
  const ordered = param(town[0]) <= param(town[town.length - 1]) ? town : [...town].reverse();
  const tA = param(ordered[0]),
    tB = param(ordered[ordered.length - 1]);
  // Roughness measured on the town shore itself, as signed offset from the FMG line.
  const offsets = ordered.map(p => {
    const hit = nearestOnPolyline(p, base);
    const a = base[hit.segIndex],
      b = base[hit.segIndex + 1];
    return Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * hit.dist;
  });
  const mean = offsets.reduce((sum, v) => sum + v, 0) / offsets.length;
  const deviation = Math.sqrt(offsets.reduce((sum, v) => sum + (v - mean) ** 2, 0) / offsets.length);
  const amplitude = Math.min(30, Math.max(3, deviation * 1.4));
  const coarse = valueNoise(rng, total, 220),
    fine = valueNoise(rng, total, 60);
  const normalAt = (s: number): Point => {
    const a = pointAt(base, cum, s - 5),
      b = pointAt(base, cum, s + 5);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };
  const rough = (s: number): Point => {
    const p = pointAt(base, cum, s);
    // Frame ends stay on the frame; the noise fades in from them.
    const taper = Math.min(1, s / 60, (total - s) / 60);
    const d = (coarse(s) * 0.75 + fine(s) * 0.25) * amplitude * taper;
    const n = normalAt(s);
    return [p[0] + n[0] * d, p[1] + n[1] * d];
  };
  const join = (anchor: Point, at: number, direction: 1 | -1): Point[] => {
    const origin = rough(at);
    const gap: Point = [anchor[0] - origin[0], anchor[1] - origin[1]];
    const out: Point[] = [];
    const limit = direction > 0 ? total - at : at;
    for (
      let walkedMeters = SHORE_STEP_METERS;
      walkedMeters < limit + SHORE_STEP_METERS;
      walkedMeters += SHORE_STEP_METERS
    ) {
      const s = Math.min(Math.max(at + direction * walkedMeters, 0), total);
      const p = rough(s);
      const keep = 1 - smoothstep(walkedMeters / SHORE_BLEND_METERS);
      out.push([p[0] + gap[0] * keep, p[1] + gap[1] * keep]);
      if (s <= 0 || s >= total) break;
    }
    return out;
  };
  return [...join(ordered[0], tA, -1).reverse(), ...ordered, ...join(ordered[ordered.length - 1], tB, 1)];
}

/** Close the regional shore (clipped to the frame) into a sea polygon. The wet
 * side is the side holding the town mesh's own sea cells, so a coast pulled
 * toward the town or classified on the flipped side stays consistent with the
 * mesh. `wetPoints` are sea-cell centroids from the town mesh. */
export function regionalSeaPolygon(source: Point[], frameHalf: number, wetPoints: Point[]): Point[] | null {
  const shore = clipPolylineToFrame(source, frameHalf);
  if (shore.length < 2 || !wetPoints.length) return null;
  const first = extendToFrame(shore[0], shore[1], frameHalf);
  const last = extendToFrame(shore[shore.length - 1], shore[shore.length - 2], frameHalf);
  const onFrame = (p: Point) => Math.max(Math.abs(p[0]), Math.abs(p[1])) >= frameHalf - 1e-3;
  if (!onFrame(first) || !onFrame(last)) return null;
  const line: Point[] = [first, ...shore.slice(1, -1), last];
  // The deepest known wet point is the least ambiguous side witness.
  const wet = wetPoints.map(p => ({ p, d: nearestOnPolyline(p, line).dist })).sort((a, b) => b.d - a.d)[0].p;
  const polygon = closeShorelineToFrame(line, frameHalf, wet);
  // The closure repeats its start point; ear clipping needs distinct vertices.
  return (
    polygon?.filter((p, i) => {
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      return Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 1e-6;
    }) ?? null
  );
}
