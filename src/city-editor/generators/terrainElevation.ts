import type { CityDocument, Face, Point } from "../types/document";
import type { CityTerrain, TerrainPatch as Patch, TerrainFeature, TerrainModel } from "../types/terrain";
import { fortCircle } from "./fortSiteGeometry";
import { fortSiteTerrainFeatures } from "./fortSiteTerrain";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { facePoints, faceVertices } from "./mesh";
import { intersectConvex, subtractConvex } from "./parcelGeometry";
import { evaluateTerrainFeatures, terrainFeatureBreaklines, terrainFeatureFoci } from "./terrainModel";

export type { CityTerrain } from "../types/terrain";

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** A fort site grades flat ground; every other document uses its cell elevations as they are. */
export function cityTerrainModel(document: CityDocument): TerrainModel {
  const site = document.fortSite;
  return site
    ? { base: { kind: "flat", elevationMeters: site.groundElevationMeters }, features: fortSiteTerrainFeatures(site) }
    : { base: { kind: "cells" }, features: [] };
}

interface BaseSurface {
  datumMeters: number;
  relief: boolean;
  /** Unsplit triangles per face with heights relative to the datum. */
  seeds: Array<{ face: Face; center: Point; patches: Patch[] }>;
}

/** Continuous shared-edge heights and cell-centre elevations, without altering the mesh. */
function cellSurface(document: CityDocument): BaseSurface {
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
  const seeds: BaseSurface["seeds"] = [];
  for (const face of faces) {
    const ids = faceVertices(document.mesh, face);
    const points = ids.map(id => document.mesh.vertices[id].point);
    if (points.length < 3) continue;
    const heights = ids.map(id => {
      const entry = sums.get(id)!;
      return entry.sum / entry.count;
    });
    const center = polygonCentroid(points);
    const patches: Patch[] = [];
    const add = (patch: Patch) => {
      if (Math.abs(cross(...patch.points)) >= 1e-8) patches.push(patch);
    };
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
    seeds.push({ face, center, patches });
  }
  return { datumMeters, relief, seeds };
}

/** Level ground under every face, fanned from the original convex cell centres. */
function flatSurface(document: CityDocument, elevationMeters: number): BaseSurface {
  return {
    datumMeters: elevationMeters,
    relief: false,
    seeds: Object.values(document.mesh.faces).map(face => {
      const ring = facePoints(document.mesh, face),
        center = polygonCentroid(ring);
      return {
        face,
        center,
        patches: ring.map((point, i) => ({
          faceId: face.id,
          points: [center, point, ring[(i + 1) % ring.length]] as Patch["points"],
          heights: [0, 0, 0] as Patch["heights"]
        }))
      };
    })
  };
}

class PatchIndex {
  private readonly bins = new Map<string, Patch[]>();
  constructor(
    readonly patches: readonly Patch[],
    private readonly step: number
  ) {
    for (const patch of patches) {
      const xs = patch.points.map(point => point[0]),
        ys = patch.points.map(point => point[1]);
      for (let x = Math.floor(Math.min(...xs) / step); x <= Math.floor(Math.max(...xs) / step); x++)
        for (let y = Math.floor(Math.min(...ys) / step); y <= Math.floor(Math.max(...ys) / step); y++) {
          const id = `${x},${y}`;
          const entries = this.bins.get(id) ?? [];
          entries.push(patch);
          this.bins.set(id, entries);
        }
    }
  }
  /** Linear interpolation inside the containing patch; zero outside every patch. */
  interpolate(point: Point): number {
    for (const patch of this.bins.get(`${Math.floor(point[0] / this.step)},${Math.floor(point[1] / this.step)}`) ??
      []) {
      const [a, b, c] = patch.points;
      const area = cross(a, b, c);
      const u = cross(point, b, c) / area,
        v = cross(a, point, c) / area,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-7) return u * patch.heights[0] + v * patch.heights[1] + w * patch.heights[2];
    }
    return 0;
  }
  near(ring: readonly Point[]): Set<Patch> {
    const candidates = new Set<Patch>();
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]);
    for (let x = Math.floor(Math.min(...xs) / this.step); x <= Math.floor(Math.max(...xs) / this.step); x++)
      for (let y = Math.floor(Math.min(...ys) / this.step); y <= Math.floor(Math.max(...ys) / this.step); y++)
        for (const patch of this.bins.get(`${x},${y}`) ?? []) candidates.add(patch);
    return candidates;
  }
}

/** Splits seed triangles near earthworks and along their breaklines, sampling the graded height. */
function gradedPatches(
  document: CityDocument,
  seeds: BaseSurface["seeds"],
  features: readonly TerrainFeature[],
  heightAt: (point: Point) => number
): Patch[] {
  const blockSize = document.frame.blockSizeMeters;
  const foci = terrainFeatureFoci(features);
  const circles = terrainFeatureBreaklines(features).map(circle => ({
    center: circle.center,
    radius: circle.radiusMeters,
    ring: fortCircle(circle.center, circle.radiusMeters)
  }));
  const triangles: Patch[] = [];
  const emit = (faceId: string, triangle: [Point, Point, Point]) => {
    let pieces: Point[][] = [triangle];
    for (const circle of circles) {
      const radii = triangle.map(p => Math.hypot(p[0] - circle.center[0], p[1] - circle.center[1]));
      if (
        Math.max(...radii) < circle.radius * Math.cos(Math.PI / 64) - 1e-7 ||
        (Math.min(...radii) > circle.radius &&
          nearestOnPolyline(circle.center, [...triangle, triangle[0]]).dist > circle.radius + 1e-7)
      )
        continue;
      pieces = pieces.flatMap(piece => {
        const inside = intersectConvex(piece, circle.ring);
        if (inside.length < 3 || Math.abs(polygonArea(inside)) < 1e-9) return [piece];
        if (Math.abs(Math.abs(polygonArea(inside)) - Math.abs(polygonArea(piece))) < 1e-8) return [piece];
        return [...subtractConvex(piece, circle.ring, 1e-9), inside];
      });
    }
    for (const piece of pieces)
      for (let i = 1; i < piece.length - 1; i++) {
        const points: [Point, Point, Point] = [piece[0], piece[i], piece[i + 1]];
        if (Math.abs(polygonArea(points)) > 1e-9)
          triangles.push({ faceId, points, heights: points.map(heightAt) as [number, number, number] });
      }
  };
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const add = (faceId: string, a: Point, b: Point, c: Point, depth: number) => {
    if (depth > 0) {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      add(faceId, a, ab, ca, depth - 1);
      add(faceId, ab, b, bc, depth - 1);
      add(faceId, ca, bc, c, depth - 1);
      add(faceId, ab, bc, ca, depth - 1);
    } else emit(faceId, [a, b, c]);
  };
  for (const { face, center, patches } of seeds) {
    const nearby = foci.some(p => Math.hypot(center[0] - p[0], center[1] - p[1]) < 55 + blockSize);
    const depth = nearby ? Math.max(1, Math.min(5, Math.ceil(Math.log2(blockSize / 2)))) : 0;
    // Original convex starting cells keep coincident boundary subdivisions in adjacent patches.
    for (const patch of patches) add(face.id, ...patch.points, depth);
  }
  return triangles;
}

/** The base field and its earthworks as one surface relative to the lowest base level. */
export function cityTerrain(document: CityDocument): CityTerrain {
  const model = cityTerrainModel(document);
  const surface =
    model.base.kind === "flat" ? flatSurface(document, model.base.elevationMeters) : cellSurface(document);
  const { datumMeters } = surface;
  const relief = surface.relief || model.features.length > 0;
  const step = Math.max(10, document.frame.blockSizeMeters || 50);
  const base = new PatchIndex(
    surface.seeds.flatMap(seed => seed.patches),
    step
  );
  const baseAt = (point: Point) => (model.base.kind === "flat" ? 0 : base.interpolate(point));
  const heightAt = (point: Point): number => {
    if (!relief) return 0;
    if (!model.features.length) return baseAt(point);
    return evaluateTerrainFeatures(model.features, p => datumMeters + baseAt(p), point) - datumMeters;
  };
  const graded = model.features.length
    ? new PatchIndex(gradedPatches(document, surface.seeds, model.features, heightAt), step)
    : base;
  return {
    datumMeters,
    relief,
    heightAt,
    triangles: [...graded.patches],
    foundationAt(ring) {
      if (!relief || !ring.length) return 0;
      let top = Math.max(0, ...ring.map(heightAt), heightAt(polygonCentroid([...ring])));
      const footprint = [...ring];
      // Include patch vertices inside the footprint, so a broad building cannot cut through a hilltop.
      for (const patch of graded.near(ring))
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
    document.defenseCircuits,
    document.fortSite
  ]);
}
