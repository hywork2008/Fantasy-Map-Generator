import type { RoadRibbon } from "../../utils/roadSurface";
import type { CityDocument, Face, Point } from "../types/document";
import type { Id } from "../types/primitives";
import type { CityTerrain, TerrainPatch as Patch, TerrainModel } from "../types/terrain";
import { fortCircle } from "./fortSiteGeometry";
import { fortSiteTerrainFeatures } from "./fortSiteTerrain";
import { clipPolygonHalfPlane, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { facePoints, faceVertices } from "./mesh";
import { intersectConvex, subtractConvex } from "./parcelGeometry";
import { gradeRoads } from "./roadGrading";
import {
  evaluateTerrainFeatures,
  type OutlineSegment,
  onPlatformSummit,
  onTerrainEscarpment,
  type ResolvedTerrainFeature,
  rampDeckAt,
  resolveTerrainFeatures,
  terrainFeatureBreaklines,
  terrainFeatureCreases,
  terrainFeatureFoci,
  terrainLevelAt
} from "./terrainModel";

export type { CityTerrain } from "../types/terrain";

/** Triangles near a graded road are split at least down to this edge, so a corridor cannot slip between samples. */
const COARSE_CORRIDOR_EDGE_METERS = 8;
/** Below that, split only where the graded ground departs this far from the flat triangle. */
const REFINE_TOLERANCE_METERS = 0.25;
const MIN_REFINE_EDGE_METERS = 2;
const MAX_REFINE_DEPTH = 8;

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** A fort site grades flat ground; every other document adds its saved earthworks to the cell elevations. */
export function cityTerrainModel(document: CityDocument): TerrainModel {
  const site = document.fortSite;
  return site
    ? {
        base: { kind: "flat", elevationMeters: site.groundElevationMeters },
        features: fortSiteTerrainFeatures(site),
        ramps: []
      }
    : { base: { kind: "cells" }, features: document.terrain?.features ?? [], ramps: document.terrain?.ramps ?? [] };
}

/** The cell containing a point, through a grid of cell bounding boxes. */
function faceLocator(document: CityDocument): (point: Point) => Id | null {
  const size = Math.max(10, document.frame.blockSizeMeters || 50);
  const bins = new Map<string, Array<{ id: Id; ring: Point[] }>>();
  for (const face of Object.values(document.mesh.faces)) {
    const ring = facePoints(document.mesh, face);
    if (ring.length < 3) continue;
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]);
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
      for (let y = Math.floor(Math.min(...ys) / size); y <= Math.floor(Math.max(...ys) / size); y++) {
        const key = `${x},${y}`;
        const list = bins.get(key);
        if (list) list.push({ id: face.id, ring });
        else bins.set(key, [{ id: face.id, ring }]);
      }
  }
  return point => {
    for (const { id, ring } of bins.get(`${Math.floor(point[0] / size)},${Math.floor(point[1] / size)}`) ?? [])
      if (pointInPolygon(point, ring)) return id;
    return null;
  };
}

/** Edges between the given cells and any other cell or the frame, oriented by their inward normal. */
export function platformOutline(document: CityDocument, faceIds: readonly Id[]): OutlineSegment[] {
  const { mesh } = document;
  const set = new Set(faceIds.filter(id => mesh.faces[id]));
  const segments: OutlineSegment[] = [];
  for (const id of set) {
    const face = mesh.faces[id],
      ring = facePoints(mesh, face);
    for (const ref of face.boundary) {
      const edge = mesh.edges[ref.edgeId];
      if (!edge) continue;
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (other && set.has(other)) continue;
      const a = mesh.vertices[edge.a].point,
        b = mesh.vertices[edge.b].point;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-9) continue;
      let inward: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      const probe: Point = [(a[0] + b[0]) / 2 + inward[0] * 1e-3, (a[1] + b[1]) / 2 + inward[1] * 1e-3];
      if (!pointInPolygon(probe, ring)) inward = [-inward[0], -inward[1]];
      segments.push({ a, b, inward });
    }
  }
  return segments;
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
  features: readonly ResolvedTerrainFeature[],
  heightAt: (point: Point) => number,
  needsRefinement: (triangle: readonly Point[]) => boolean = () => false
): Patch[] {
  const blockSize = document.frame.blockSizeMeters;
  const foci = terrainFeatureFoci(features);
  const circles = terrainFeatureBreaklines(features).map(circle => ({
    center: circle.center,
    radius: circle.radiusMeters,
    ring: fortCircle(circle.center, circle.radiusMeters)
  }));
  const creases = terrainFeatureCreases(features).map(({ segment, offsetMeters }) => ({
    origin: [segment.a[0] + segment.inward[0] * offsetMeters, segment.a[1] + segment.inward[1] * offsetMeters] as Point,
    normal: segment.inward,
    reach: Math.abs(offsetMeters) + 1e-6,
    minX: Math.min(segment.a[0], segment.b[0]),
    maxX: Math.max(segment.a[0], segment.b[0]),
    minY: Math.min(segment.a[1], segment.b[1]),
    maxY: Math.max(segment.a[1], segment.b[1])
  }));
  const triangles: Patch[] = [];
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const push = (
    faceId: string,
    points: [Point, Point, Point],
    heights = points.map(heightAt) as [number, number, number],
    depth = 0
  ) => {
    // Road corridors are narrower than cells. Split near them until the triangles are small enough to meet the
    // corridor, then only where the graded ground still departs from the flat triangle.
    // A cliff or retaining-wall face is drawn as one near-vertical sheet; splitting it never makes it flatter.
    // Corner pieces of the face at a reflex corner reach into it only with a vertex.
    const escarpment = [polygonCentroid(points), ...points].some(point => onTerrainEscarpment(features, faceId, point));
    const longest = Math.max(
      ...points.map((p, k) => Math.hypot(p[0] - points[(k + 1) % 3][0], p[1] - points[(k + 1) % 3][1]))
    );
    if (!escarpment && depth < MAX_REFINE_DEPTH && longest > MIN_REFINE_EDGE_METERS && needsRefinement(points)) {
      const [a, b, c] = points,
        ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      const [ha, hb, hc] = heights;
      const mids = [heightAt(ab), heightAt(bc), heightAt(ca)];
      const center = heightAt(polygonCentroid(points));
      const error = Math.max(
        Math.abs(mids[0] - (ha + hb) / 2),
        Math.abs(mids[1] - (hb + hc) / 2),
        Math.abs(mids[2] - (hc + ha) / 2),
        Math.abs(center - (ha + hb + hc) / 3)
      );
      if (longest > COARSE_CORRIDOR_EDGE_METERS || error > REFINE_TOLERANCE_METERS) {
        const [hab, hbc, hca] = mids;
        push(faceId, [a, ab, ca], [ha, hab, hca], depth + 1);
        push(faceId, [ab, b, bc], [hab, hb, hbc], depth + 1);
        push(faceId, [ca, bc, c], [hca, hbc, hc], depth + 1);
        push(faceId, [ab, bc, ca], [hab, hbc, hca], depth + 1);
        return;
      }
    }
    const patch: Patch = { faceId, points, heights };
    if (escarpment) patch.escarpment = true;
    triangles.push(patch);
  };
  const emit = (faceId: string, triangle: [Point, Point, Point]) => {
    let pieces: Point[][] = [triangle];
    const xs = triangle.map(p => p[0]),
      ys = triangle.map(p => p[1]);
    for (const crease of creases) {
      if (
        Math.min(...xs) > crease.maxX + crease.reach ||
        Math.max(...xs) < crease.minX - crease.reach ||
        Math.min(...ys) > crease.maxY + crease.reach ||
        Math.max(...ys) < crease.minY - crease.reach
      )
        continue;
      const back: Point = [-crease.normal[0], -crease.normal[1]];
      pieces = pieces.flatMap(piece =>
        [
          clipPolygonHalfPlane(piece, crease.origin, crease.normal),
          clipPolygonHalfPlane(piece, crease.origin, back)
        ].filter(part => part.length >= 3 && Math.abs(polygonArea(part)) > 1e-9)
      );
    }
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
        if (Math.abs(polygonArea(points)) > 1e-9) push(faceId, points);
      }
  };
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

/**
 * The base field and its earthworks as one surface relative to the lowest base level.
 * Given the drawn road ribbons, roads get graded profiles and the ground is cut and filled to them.
 */
export function cityTerrain(document: CityDocument, options: { roads?: readonly RoadRibbon[] } = {}): CityTerrain {
  const model = cityTerrainModel(document);
  const features = resolveTerrainFeatures(
    model.features,
    faceIds => platformOutline(document, faceIds),
    model.features.length ? faceLocator(document) : undefined
  );
  const surface =
    model.base.kind === "flat" ? flatSurface(document, model.base.elevationMeters) : cellSurface(document);
  const { datumMeters } = surface;
  const { ramps } = model;
  const relief = surface.relief || features.length > 0 || ramps.length > 0;
  const step = Math.max(10, document.frame.blockSizeMeters || 50);
  const base = new PatchIndex(
    surface.seeds.flatMap(seed => seed.patches),
    step
  );
  const baseAt = (point: Point) => (model.base.kind === "flat" ? 0 : base.interpolate(point));
  const groundAt = (point: Point): number => {
    if (!relief) return 0;
    if (!features.length) return baseAt(point);
    return evaluateTerrainFeatures(features, p => datumMeters + baseAt(p), point) - datumMeters;
  };
  const deckAt = (point: Point): number | null => {
    const deck = ramps.length ? rampDeckAt(ramps, point) : null;
    return deck === null ? null : deck - datumMeters;
  };
  const grading =
    relief && options.roads?.length
      ? gradeRoads(
          options.roads,
          groundAt,
          point => terrainLevelAt(features, point),
          point => onPlatformSummit(features, point),
          deckAt,
          features.some(feature => feature.kind === "platform" && feature.role === "terrace")
        )
      : null;
  const heightAt = grading ? (point: Point) => grading.apply(point, groundAt(point)) : groundAt;
  const graded =
    features.length || grading
      ? new PatchIndex(gradedPatches(document, surface.seeds, features, heightAt, grading?.needsRefinement), step)
      : base;
  return {
    datumMeters,
    relief,
    heightAt,
    // Roads ride ramp decks, and in a terraced town the steps and ramps built over the ground.
    surfaceAt: point => deckAt(point) ?? grading?.roadAt(point) ?? heightAt(point),
    ramps: ramps.map(ramp => ({ ramp, elevations: ramp.elevationsMeters.map(level => level - datumMeters) })),
    ...(options.roads
      ? {
          roads: {
            ribbons: grading?.ribbons ?? [...options.roads],
            stairs: grading?.stairs ?? [],
            cliffBreaks: grading?.cliffBreaks ?? []
          }
        }
      : {}),
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
    document.fortSite,
    document.terrain
  ]);
}
