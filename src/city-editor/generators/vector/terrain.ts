import type { Point } from "../../types/primitives";
import type { TerrainFeature } from "../../types/terrain";
import type { VectorCityDocument } from "../../types/vector/document";
import { landingPlatforms, steppedFlights } from "../freeform/wayTerrain";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../geom";
import { gradeRoads } from "../roadGrading";
import { fieldFromParts } from "../terrainField/conform";
import { corridorWaterAt } from "../terrainField/corridor";
import { sampleField } from "../terrainField/sample";
import { evaluateTerrainFeatures, resolveTerrainFeatures } from "../terrainModel";
import { evaluateAnchor, pathIsClosed } from "./geometry/curves";
import { bridgeGeometry } from "./geometry/network";
import { sampledWidth, samplePath } from "./geometry/sampling";
import { vectorWaterSurfaces } from "./geometry/water";
import { reliefHeightFunction } from "./relief";

/** Rise from the street into a house: one step (§5.1). */
export const ENTRANCE_STEP_METERS = 0.15;
/** How deep a building's uphill side may sink into the slope (§5.1). */
export const EMBED_MAX_METERS = 2.5;
/** A downhill plinth taller than this holds an undercroft storey (§5.1). */
export const PLINTH_MAX_METERS = 1.2;
/** Most a house may stand above its lowest ground, undercroft included (§5.1). */
export const EXPOSURE_MAX_METERS = 3.5;
/** A castle, church or religious house may stand this high on its downhill side (§5.1). */
export const LANDMARK_EXPOSURE_MAX_METERS = 7;
/** Ground steeper than this under a footprint is not built on (§5.1). */
export const UNBUILDABLE_GROUND_SLOPE = 0.35;

const cache = new WeakMap<VectorCityDocument, ReturnType<typeof buildTerrain>>();
export function vectorTerrain(doc: VectorCityDocument) {
  let terrain = cache.get(doc);
  if (!terrain) {
    terrain = buildTerrain(doc);
    cache.set(doc, terrain);
  }
  return terrain;
}
function buildTerrain(doc: VectorCityDocument) {
  const relief = doc.environment?.relief;
  // The natural relief is the ground of a generated city; Freeform's ledger the ground of a hand-graded one.
  const source = relief ? undefined : doc.environment?.terrain;
  const field = source
    ? fieldFromParts(
        source.frame.extentMeters,
        Math.max(source.ground.sampleMeters, source.frame.extentMeters / 256),
        source.ground.parts
      )
    : undefined;
  if (field && source)
    for (const stroke of source.sculpt) {
      const before = stroke.kind === "smooth" ? field.elevationsMeters.slice() : undefined;
      for (let row = 0; row < field.rows; row++)
        for (let col = 0; col < field.columns; col++) {
          const point: Point = [field.origin[0] + col * field.sampleMeters, field.origin[1] + row * field.sampleMeters];
          const d = Math.hypot(point[0] - stroke.center[0], point[1] - stroke.center[1]) / stroke.radiusMeters;
          if (d >= 1) continue;
          const index = row * field.columns + col,
            weight = (1 - d * d) ** 2;
          if (before) {
            let sum = 0,
              n = 0;
            for (let y = Math.max(0, row - 1); y <= Math.min(field.rows - 1, row + 1); y++)
              for (let x = Math.max(0, col - 1); x <= Math.min(field.columns - 1, col + 1); x++) {
                sum += before[y * field.columns + x];
                n++;
              }
            field.elevationsMeters[index] += (sum / n - before[index]) * Math.min(1, Math.abs(stroke.meters)) * weight;
          } else field.elevationsMeters[index] += (stroke.kind === "lower" ? -1 : 1) * stroke.meters * weight;
        }
    }
  const reliefAt = relief ? reliefHeightFunction(relief) : undefined;
  const baseAt = (p: Point) => (reliefAt ? reliefAt(p) : field ? sampleField(field, p) : 0);
  const rivers =
    source || relief
      ? Object.values(doc.paths)
          .filter(p => p.role === "river")
          .map(path => {
            const saved = source?.rivers.find(r => `freeform:river:${r.id}` === path.id || r.sourceId === path.id),
              samples = samplePath(path),
              widths = sampledWidth(path, samples);
            const natural = samples.map(sample => {
              if (saved) {
                const hit = nearestOnPolyline(sample.point, saved.centerline);
                return (
                  saved.bedMeters[hit.segIndex] +
                  (saved.bedMeters[hit.segIndex + 1] - saved.bedMeters[hit.segIndex]) * hit.t
                );
              }
              return baseAt(sample.point) - 2;
            });
            const descend = (levels: number[]) => {
              let prior = Infinity;
              return levels.map(level => (prior = Math.min(prior, level)));
            };
            // A generated relief's river runs whichever way cuts the less ground: down the land, not up it.
            let bed = descend(natural);
            if (relief && !saved) {
              const reverse = descend(natural.slice().reverse()).reverse(),
                cut = (levels: number[]) => levels.reduce((n, level, i) => n + natural[i] - level, 0);
              if (cut(reverse) < cut(bed)) bed = reverse;
            }
            // Where the bed is cut deep, the valley sides lie back at about 1:6, a broad valley rather than a gorge.
            const deepest = Math.max(0, ...bed.map((level, i) => natural[i] - level));
            if (pathIsClosed(path)) {
              const level = Math.min(...bed);
              bed.fill(level);
            }
            return {
              kind: "riverCorridor" as const,
              id: `terrain:${path.id}`,
              sourceId: path.id,
              centerline: samples.map(s => s.point),
              widthsMeters: widths.map(w => w.left + w.right),
              bedMeters: bed,
              depthMeters: saved?.depthMeters ?? 1,
              bank: saved?.bank ?? {
                kind: "slope" as const,
                runMeters: relief ? Math.min(300, Math.max(3, deepest * 6)) : 3
              }
            };
          })
      : [];
  const features: TerrainFeature[] = [
    ...rivers,
    ...landingPlatforms(source?.ways ?? [], baseAt),
    ...(source?.plots ?? []).map(p => ({
      kind: "platform" as const,
      id: p.id,
      ownerId: p.ownerId,
      role: "pad" as const,
      summit: { kind: "polygon" as const, points: p.outline },
      levelMeters: p.levelMeters,
      edge: p.edge
    }))
  ];
  const resolved = resolveTerrainFeatures(features);
  const naturalAt = (p: Point) => evaluateTerrainFeatures(resolved, baseAt, p);
  const ribbons = source
    ? Object.values(doc.paths)
        .filter(
          p => p.role === "road" && !source.ways.some(w => `freeform:way:${w.id}` === p.id && w.profile === "stepped")
        )
        .map(p => ({
          centerline: samplePath(p).map(s => s.point),
          widthMeters: p.width.leftMeters + p.width.rightMeters,
          surface: "earth" as const,
          gradeClass: "cart" as const,
          maxGrade: 0.1
        }))
    : [];
  const waterAt = (p: Point) => corridorWaterAt(rivers, p);
  const bridgeProfiles = Object.values(doc.connections.bridges).map(b => {
    const geometry = bridgeGeometry(doc, b, vectorWaterSurfaces(doc)),
      center = evaluateAnchor(doc.paths[b.riverAnchor.pathId], b.riverAnchor),
      top = Math.max(
        naturalAt(geometry.from) + 0.06,
        naturalAt(geometry.to) + 0.06,
        (waterAt(center) ?? -Infinity) + 0.3
      ),
      path = doc.paths[b.roadPathId];
    return {
      id: b.id,
      from: geometry.from,
      to: geometry.to,
      top,
      width: Math.max(path.width.leftMeters, path.width.rightMeters),
      run: Math.max(10, Math.abs(naturalAt(geometry.from) - naturalAt(geometry.to)) / 0.08)
    };
  });
  const deckAt = (p: Point) => {
    for (const b of bridgeProfiles) {
      const hit = nearestOnPolyline(p, [b.from, b.to]);
      if (hit.t > 0 && hit.t < 1 && hit.dist <= b.width) return b.top - 0.06;
    }
    return null;
  };
  const grading = gradeRoads(
    ribbons,
    naturalAt,
    () => null,
    () => false,
    deckAt
  );
  const flights = steppedFlights(source?.ways ?? []);
  const approachAt = (p: Point, base: number) => {
    for (const b of bridgeProfiles) {
      const dx = b.to[0] - b.from[0],
        dy = b.to[1] - b.from[1],
        length = Math.hypot(dx, dy),
        along = ((p[0] - b.from[0]) * dx + (p[1] - b.from[1]) * dy) / length,
        lateral = Math.abs((p[0] - b.from[0]) * dy - (p[1] - b.from[1]) * dx) / length;
      if (lateral > b.width || along < -b.run || along > length + b.run) continue;
      const weight = along < 0 ? 1 + along / b.run : along > length ? 1 - (along - length) / b.run : 1;
      return base + (b.top - 0.06 - base) * weight;
    }
    return base;
  };
  // The natural relief is not graded for roads: roads keep their own profile and sink into it (§5.2).
  const heightAt = (p: Point) =>
    waterAt(p) !== null ? naturalAt(p) : approachAt(p, relief ? naturalAt(p) : grading.apply(p, naturalAt(p)));
  const surfaceAt = (p: Point) => {
    for (const f of flights) {
      const hit = nearestOnPolyline(p, f.centerline);
      if (hit && hit.dist <= f.widthMeters / 2) {
        let best = 0,
          dist = Infinity;
        f.centerline.forEach((q, i) => {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (d < dist) {
            best = i;
            dist = d;
          }
        });
        return f.elevations[best];
      }
    }
    return deckAt(p) ?? heightAt(p);
  };
  const foundationAt = (id: string, ring: Point[]) => {
    if (relief) return floorAt(ring).floor;
    const plot = source?.plots.find(p => p.ownerId === id.replace(/^freeform:placement:/, ""));
    if (plot) return plot.levelMeters;
    let height = heightAt(polygonCentroid(ring));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      for (let j = 0; j <= 4; j++)
        height = Math.max(height, heightAt([a[0] + ((b[0] - a[0]) * j) / 4, a[1] + ((b[1] - a[1]) * j) / 4]));
    }
    return Number.isFinite(height) ? height : 0;
  };
  /** Lowest and highest ground under a footprint: its outline and a coarse lattice inside it. */
  const groundRange = (ring: readonly Point[]) => {
    let low = Infinity,
      high = -Infinity;
    const take = (p: Point) => {
      const h = heightAt(p);
      if (!Number.isFinite(h)) return;
      low = Math.min(low, h);
      high = Math.max(high, h);
    };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      for (let j = 0; j < 4; j++) take([a[0] + ((b[0] - a[0]) * j) / 4, a[1] + ((b[1] - a[1]) * j) / 4]);
    }
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]),
      step = Math.max(2, Math.sqrt(((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 36));
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step)
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
        if (pointInPolygon([x, y], ring as Point[])) take([x, y]);
    return Number.isFinite(low) ? { low, high } : { low: 0, high: 0 };
  };
  /**
   * A building's level floor and the lowest ground beneath it (docs/plan/ce-meshless-natural-relief.md §5.1): the
   * floor is a step above the street at its entrance; the downhill side stands on a plinth to the ground, the uphill
   * side is sunk into it, never deeper than {@link EMBED_MAX_METERS}. Without a street the floor clears the ground.
   */
  const floorAt = (ring: readonly Point[], street?: Point) => {
    const { low, high } = groundRange(ring);
    let floor = street ? surfaceAt(street) + ENTRANCE_STEP_METERS : high + ENTRANCE_STEP_METERS;
    floor = Math.max(floor, high - EMBED_MAX_METERS, low + ENTRANCE_STEP_METERS);
    return { floor, low, high };
  };
  /**
   * Whether a building may stand here (§5.1): its downhill side no more than `exposureMax` above its lowest ground,
   * undercroft included, and the ground under it no steeper than 35%. Level ground always fits.
   */
  const buildable = (ring: readonly Point[], street?: Point, exposureMax = EXPOSURE_MAX_METERS) => {
    if (!relief) return true;
    const { floor, low, high } = floorAt(ring, street);
    if (floor - low > exposureMax) return false;
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]),
      span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return span <= 0 || (high - low) / span <= UNBUILDABLE_GROUND_SLOPE;
  };
  return {
    buildable,
    floorAt,
    groundRange,
    heightAt,
    surfaceAt,
    waterAt,
    foundationAt,
    bridgeElevation: (id: string) =>
      bridgeProfiles.find(b => b.id === id)?.top !== undefined ? bridgeProfiles.find(b => b.id === id)!.top - 0.3 : 0,
    hasRelief: !!source || !!relief,
    relief,
    field,
    containsPad: (p: Point) => source?.plots.some(plot => pointInPolygon(p, plot.outline)) ?? false
  };
}
