import type { CityDocument, Point } from "../types/document";
import { pointInPolygon, polygonCentroid } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { faceVertices } from "./mesh";

interface Patch {
  faceId: string;
  points: [Point, Point, Point];
  heights: [number, number, number];
}

export interface CityTerrain {
  /** Absolute elevation represented by local Y=0. Uniform legacy land stays flat. */
  datumMeters: number;
  relief: boolean;
  heightAt(point: Point): number;
  /** Horizontal foundation above all terrain beneath this footprint. */
  foundationAt(ring: readonly Point[]): number;
  triangles: Patch[];
}

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Continuous shared-edge heights and cell-centre elevations, without altering the mesh. */
export function cityTerrain(document: CityDocument): CityTerrain {
  const faces = Object.values(document.mesh.faces).filter(
    face => face.properties.water === "land" && Number.isFinite(face.properties.elevation)
  );
  const elevations = faces.map(face => face.properties.elevation);
  const datumMeters = elevations.length ? Math.min(...elevations) : 1;
  const relief = elevations.some(height => Math.abs(height - datumMeters) > 1e-6);
  const sums = new Map<string, { sum: number; count: number }>();
  for (const face of faces)
    for (const id of faceVertices(document.mesh, face)) {
      const entry = sums.get(id) ?? { sum: 0, count: 0 };
      entry.sum += face.properties.elevation - datumMeters;
      entry.count++;
      sums.set(id, entry);
    }
  const triangles: Patch[] = [];
  const bins = new Map<string, Patch[]>();
  const step = Math.max(10, document.frame.blockSizeMeters || 50);
  const key = (x: number, y: number) => `${Math.floor(x / step)},${Math.floor(y / step)}`;
  const add = (patch: Patch) => {
    if (Math.abs(cross(...patch.points)) < 1e-8) return;
    triangles.push(patch);
    const xs = patch.points.map(point => point[0]),
      ys = patch.points.map(point => point[1]);
    for (let x = Math.floor(Math.min(...xs) / step); x <= Math.floor(Math.max(...xs) / step); x++)
      for (let y = Math.floor(Math.min(...ys) / step); y <= Math.floor(Math.max(...ys) / step); y++) {
        const id = `${x},${y}`;
        const entries = bins.get(id) ?? [];
        entries.push(patch);
        bins.set(id, entries);
      }
  };
  for (const face of faces) {
    const ids = faceVertices(document.mesh, face);
    const points = ids.map(id => document.mesh.vertices[id].point);
    if (points.length < 3) continue;
    const heights = ids.map(id => {
      const entry = sums.get(id)!;
      return entry.sum / entry.count;
    });
    const center = polygonCentroid(points);
    const signs = points
      .map((point, i) => Math.sign(cross(center, point, points[(i + 1) % points.length])))
      .filter(sign => sign !== 0);
    if (signs.every(sign => sign === signs[0])) {
      points.forEach((point, i) => {
        add({
          faceId: face.id,
          points: [center, point, points[(i + 1) % points.length]],
          heights: [face.properties.elevation - datumMeters, heights[i], heights[(i + 1) % points.length]]
        });
      });
    } else {
      for (const part of triangularInfillParts(points))
        for (let i = 1; i < part.length - 1; i++) {
          const tri: [Point, Point, Point] = [part[0], part[i], part[i + 1]];
          add({
            faceId: face.id,
            points: tri,
            heights: tri.map(point => heights[points.indexOf(point)]) as Patch["heights"]
          });
        }
    }
  }
  const heightAt = (point: Point): number => {
    if (!relief) return 0;
    for (const patch of bins.get(key(...point)) ?? []) {
      const [a, b, c] = patch.points;
      const area = cross(a, b, c);
      const u = cross(point, b, c) / area,
        v = cross(a, point, c) / area,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-7) return u * patch.heights[0] + v * patch.heights[1] + w * patch.heights[2];
    }
    return 0;
  };
  return {
    datumMeters,
    relief,
    heightAt,
    triangles,
    foundationAt(ring) {
      if (!relief || !ring.length) return 0;
      let top = Math.max(...ring.map(heightAt));
      const footprint = [...ring];
      // Include cell centres inside the footprint, so a broad building cannot cut through a hilltop.
      const candidates = new Set<Patch>();
      const xs = ring.map(p => p[0]),
        ys = ring.map(p => p[1]);
      for (let x = Math.floor(Math.min(...xs) / step); x <= Math.floor(Math.max(...xs) / step); x++)
        for (let y = Math.floor(Math.min(...ys) / step); y <= Math.floor(Math.max(...ys) / step); y++)
          for (const patch of bins.get(`${x},${y}`) ?? []) candidates.add(patch);
      for (const patch of candidates)
        for (let i = 0; i < 3; i++) {
          if (patch.heights[i] > top && pointInPolygon(patch.points[i], footprint)) top = patch.heights[i];
          const a = patch.points[i],
            b = patch.points[(i + 1) % 3];
          const dx = b[0] - a[0],
            dy = b[1] - a[1];
          for (let j = 0; j < ring.length; j++) {
            const c = ring[j],
              d = ring[(j + 1) % ring.length];
            const ex = d[0] - c[0],
              ey = d[1] - c[1],
              den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-10) continue;
            const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
            const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
              top = Math.max(top, patch.heights[i] + t * (patch.heights[(i + 1) % 3] - patch.heights[i]));
          }
        }
      return top;
    }
  };
}

/** Draw-time stamp includes edits even when the building fabric is reused. */
export function cityTerrainStamp(document: CityDocument): string {
  return JSON.stringify([
    document.mesh.vertices,
    Object.values(document.mesh.faces).map(face => [
      face.id,
      face.boundary,
      face.properties.elevation,
      face.properties.water
    ]),
    document.castles,
    document.gates,
    document.defenseCircuits
  ]);
}
