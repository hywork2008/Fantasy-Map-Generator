import type { RoadRibbon } from "../../utils/roadSurface";
import type { CityDocument, Face, Point } from "../types/document";
import type { Id } from "../types/primitives";
import type { CityTerrain, TerrainPatch as Patch, TerrainGrid, TerrainModel } from "../types/terrain";
import { type CellRelief, cellRelief, faceLocator } from "./cellRelief";
import { fortCircle } from "./fortSiteGeometry";
import { fortSiteTerrainFeatures } from "./fortSiteTerrain";
import { clipPolygonHalfPlane, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { facePoints, faceVertices } from "./mesh";
import { intersectConvex, subtractConvex } from "./parcelGeometry";
import { gradeRoads } from "./roadGrading";
import { terrainFieldForDocument } from "./terrainField/build";
import { buildDrawGrid, resolveRenderSpacing } from "./terrainField/drawGrid";
import { fieldFoundation } from "./terrainField/lots";
import { sampleField } from "./terrainField/sample";
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

/** A fort site grades flat ground; a height-field recipe replaces cell elevations; every other document uses the cells. */
export function cityTerrainModel(document: CityDocument): TerrainModel {
  const site = document.fortSite;
  if (site)
    return {
      base: { kind: "flat", elevationMeters: site.groundElevationMeters },
      features: fortSiteTerrainFeatures(site),
      ramps: []
    };
  const field = document.terrain?.field ? terrainFieldForDocument(document) : null;
  return {
    base: field ? { kind: "field", field } : { kind: "cells" },
    features: document.terrain?.features ?? [],
    ramps: document.terrain?.ramps ?? []
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

/** Cell seed triangles; their heights come from `cellRelief`, which levels each cell and joins it to its neighbours. */
function cellSurface(document: CityDocument, relief: CellRelief): BaseSurface {
  const faces = Object.values(document.mesh.faces).filter(
    face => face.properties.water === "land" && Number.isFinite(face.properties.elevation)
  );
  const seeds: BaseSurface["seeds"] = [];
  for (const face of faces) {
    const points = faceVertices(document.mesh, face).map(id => document.mesh.vertices[id].point);
    if (points.length < 3) continue;
    const center = polygonCentroid(points);
    const patches: Patch[] = [];
    const add = (tri: [Point, Point, Point]) => {
      if (Math.abs(cross(...tri)) >= 1e-8) patches.push({ faceId: face.id, points: tri, heights: [0, 0, 0] });
    };
    const signs = points
      .map((point, i) => Math.sign(cross(center, point, points[(i + 1) % points.length])))
      .filter(sign => sign !== 0);
    if (signs.every(sign => sign === signs[0]))
      points.forEach((point, i) => {
        add([center, point, points[(i + 1) % points.length]]);
      });
    else
      for (const part of triangularInfillParts(points))
        for (let i = 1; i < part.length - 1; i++) add([part[0], part[i], part[i + 1]]);
    seeds.push({ face, center, patches });
  }
  return { datumMeters: relief.datumMeters, relief: relief.relief, seeds };
}

/**
 * Seed triangles only beside earthworks, ramps, and roads. The draw grid carries the rest of a height field,
 * so the whole frame is not triangulated.
 */
function fieldSeedSurface(
  document: CityDocument,
  datumMeters: number,
  relief: boolean,
  features: readonly ResolvedTerrainFeature[],
  ramps: readonly { centerline: readonly Point[] }[],
  roads: readonly RoadRibbon[] | undefined
): BaseSurface {
  const reach = Math.max(80, (document.frame.blockSizeMeters || 50) * 2);
  const foci: Point[] = [];
  for (const feature of features) {
    if (feature.kind === "ringCut") {
      foci.push(feature.axis.center);
      continue;
    }
    if (feature.summit.kind === "circle") foci.push(feature.summit.center);
    else for (const segment of feature.summit.segments) foci.push(segment.a, segment.b);
  }
  for (const ramp of ramps) foci.push(...ramp.centerline);
  for (const road of roads ?? []) for (const point of road.centerline) foci.push([point[0], point[1]]);
  const near = (point: Point) => foci.some(focus => Math.hypot(point[0] - focus[0], point[1] - focus[1]) <= reach);
  const seeds: BaseSurface["seeds"] = [];
  if (foci.length)
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land") continue;
      const points = facePoints(document.mesh, face);
      if (points.length < 3) continue;
      const center = polygonCentroid(points);
      if (!near(center) && !points.some(near)) continue;
      const patches: Patch[] = [];
      const add = (tri: [Point, Point, Point]) => {
        if (Math.abs(cross(...tri)) >= 1e-8) patches.push({ faceId: face.id, points: tri, heights: [0, 0, 0] });
      };
      const signs = points
        .map((point, i) => Math.sign(cross(center, point, points[(i + 1) % points.length])))
        .filter(sign => sign !== 0);
      if (signs.every(sign => sign === signs[0]))
        for (let i = 0; i < points.length; i++) add([center, points[i], points[(i + 1) % points.length]]);
      else
        for (const part of triangularInfillParts(points))
          for (let i = 1; i < part.length - 1; i++) add([part[0], part[i], part[i + 1]]);
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
  needsRefinement: (triangle: readonly Point[]) => boolean = () => false,
  cells?: CellRelief
): Patch[] {
  const blockSize = document.frame.blockSizeMeters;
  const foci = terrainFeatureFoci(features);
  const circles = terrainFeatureBreaklines(features).map(circle => ({
    center: circle.center,
    radius: circle.radiusMeters,
    ring: fortCircle(circle.center, circle.radiusMeters)
  }));
  const creases = [
    ...terrainFeatureCreases(features).map(({ segment, offsetMeters }) => ({
      segment,
      normal: segment.inward,
      offsetMeters
    })),
    ...(cells?.creases ?? [])
  ].map(({ segment, normal, offsetMeters }) => ({
    origin: [segment.a[0] + normal[0] * offsetMeters, segment.a[1] + normal[1] * offsetMeters] as Point,
    normal,
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
    // A band covered by a higher platform is not a face of its own.
    const escarpment =
      Math.max(...heights) - Math.min(...heights) > 0.01 &&
      [polygonCentroid(points), ...points].some(
        point => onTerrainEscarpment(features, faceId, point) || !!cells?.onWall(faceId, point)
      );
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
export function cityTerrain(
  document: CityDocument,
  options: { roads?: readonly RoadRibbon[]; renderSpacing?: number | "auto" } = {}
): CityTerrain {
  const model = cityTerrainModel(document);
  const locate = faceLocator(document);
  const features = resolveTerrainFeatures(
    model.features,
    faceIds => platformOutline(document, faceIds),
    model.features.length ? locate : undefined
  );
  const field = model.base.kind === "field" ? model.base.field : undefined;
  const cells = model.base.kind === "cells" ? cellRelief(document, locate) : undefined;
  let fieldDatum = 0;
  let fieldRelief = false;
  if (field) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of field.elevationsMeters) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    fieldDatum = Number.isFinite(min) ? min : 0;
    fieldRelief = max - min > 1e-6;
  }
  const surface = field
    ? fieldSeedSurface(document, fieldDatum, fieldRelief, features, model.ramps, options.roads)
    : cells
      ? cellSurface(document, cells)
      : flatSurface(document, model.base.kind === "flat" ? model.base.elevationMeters : 0);
  const { datumMeters } = surface;
  const { ramps } = model;
  const relief = surface.relief || features.length > 0 || ramps.length > 0;
  const step = Math.max(10, document.frame.blockSizeMeters || 50);
  const base = new PatchIndex(
    surface.seeds.flatMap(seed => seed.patches),
    step
  );
  const baseAt = (point: Point) => (field ? sampleField(field, point) - fieldDatum : (cells?.heightAt(point) ?? 0));
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
          features.some(feature => feature.kind === "platform" && feature.role === "terrace") || !!cells?.walled
        )
      : null;
  const heightAt = grading ? (point: Point) => grading.apply(point, groundAt(point)) : groundAt;
  const graded =
    features.length || grading || surface.relief
      ? new PatchIndex(
          gradedPatches(document, surface.seeds, features, heightAt, grading?.needsRefinement, cells),
          step
        )
      : base;
  const surfaceAt = (point: Point) => deckAt(point) ?? grading?.roadAt(point) ?? heightAt(point);
  const slopeAt = field
    ? (point: Point) => {
        const probe = 1;
        const zx = (heightAt([point[0] + probe, point[1]]) - heightAt([point[0] - probe, point[1]])) / (2 * probe);
        const zy = (heightAt([point[0], point[1] + probe]) - heightAt([point[0], point[1] - probe])) / (2 * probe);
        return Math.hypot(zx, zy);
      }
    : undefined;
  let drawGrid: TerrainGrid | undefined;
  const result: CityTerrain = {
    datumMeters,
    relief,
    ...(field ? { field: true as const } : {}),
    heightAt,
    ...(slopeAt ? { slopeAt } : {}),
    // Roads ride ramp decks, and in a terraced town the steps and ramps built over the ground.
    surfaceAt,
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
      if (field && slopeAt) {
        const center = polygonCentroid([...ring]);
        if (onPlatformSummit(features, center)) return heightAt(center);
        return fieldFoundation(ring, heightAt, surfaceAt);
      }
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
  // A spread would run the getter at once. Defining it here keeps the grid lazy.
  if (field)
    Object.defineProperty(result, "grid", {
      enumerable: true,
      get(): TerrainGrid {
        if (!drawGrid) {
          const spacing = resolveRenderSpacing(document.frame.extentMeters, options.renderSpacing ?? "auto");
          drawGrid = buildDrawGrid(document.frame.extentMeters, spacing, heightAt);
        }
        return drawGrid;
      }
    });
  return result;
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
