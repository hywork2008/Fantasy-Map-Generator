import RBush from "rbush";
import type { Point } from "../../../types/document";
import type { CurveAnchor, VectorCityDocument, VectorPath, VectorPlacement } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import type { VectorUrbanSettings } from "../../../types/vector/urban";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { convexHull } from "../../geom";
import { intersectConvex, plotArea } from "../../parcelGeometry";
import { evaluateAnchor } from "../geometry/curves";
import { distance, gateOpening, junctionSurface } from "../geometry/network";
import { containsRegion, indexedContains, regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorTerrain } from "../terrain";
import { reachablePaths } from "./pipeline";
import {
  VECTOR_HOUSE_FLOOR_AREA,
  VECTOR_HOUSE_SHARE,
  VECTOR_HOUSE_STOREYS,
  vectorHouseDwellings
} from "./urbanCapacity";

/** Projection refines on the original curve; samples never become editable geometry. */
export function nearestRoadAnchor(path: VectorPath, p: Point, samples = samplePath(path)): CurveAnchor {
  let best = samples[0].anchor,
    score = Infinity;
  const segmentKind = (id: string) =>
    path.source.kind === "curve" ? path.source.segments.find(segment => segment.id === id)?.kind : undefined;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dx = b.point[0] - a.point[0],
      dy = b.point[1] - a.point[1],
      d = dx * dx + dy * dy;
    const t = d ? Math.max(0, Math.min(1, ((p[0] - a.point[0]) * dx + (p[1] - a.point[1]) * dy) / d)) : 0;
    const sameSegment = a.anchor.segmentId === b.anchor.segmentId;
    const lo = sameSegment ? a.anchor.t : 0;
    // A straight segment's closest point is the chord projection. Cubics still use ternary search.
    let refined = (l: number, r: number) => (l + r) / 2;
    if (!(sameSegment && segmentKind(b.anchor.segmentId) === "line")) {
      let l = lo,
        r = b.anchor.t;
      for (let n = 0; n < 28; n++) {
        const x = l + (r - l) / 3,
          y = r - (r - l) / 3;
        const at = (v: number) => distance(p, evaluateAnchor(path, { ...b.anchor, t: v }));
        if (at(x) < at(y)) r = y;
        else l = x;
      }
      refined = () => (l + r) / 2;
    }
    const candidates = [
      { ...b.anchor, t: lo + (b.anchor.t - lo) * t },
      { ...b.anchor, t: refined(lo, b.anchor.t) },
      a.anchor,
      b.anchor
    ];
    for (const c of candidates) {
      const value = distance(p, evaluateAnchor(path, c));
      if (value < score) {
        score = value;
        best = c;
      }
    }
  }
  return best;
}
export const polygonBounds = (p: VectorPolygon) => ({
  minX: Math.min(...p.outer.map(p => p[0])),
  minY: Math.min(...p.outer.map(p => p[1])),
  maxX: Math.max(...p.outer.map(p => p[0])),
  maxY: Math.max(...p.outer.map(p => p[1]))
});
export function waterDistance(doc: VectorCityDocument, polygons: VectorPolygon[]): number {
  let result = Infinity;
  for (const water of allVectorWater(doc))
    for (const ring of [water.outer, ...water.holes])
      for (let i = 0; i < ring.length; i++)
        for (const p of polygons.flatMap(p => p.outer))
          result = Math.min(result, pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  return result;
}
/** One request cannot spend the shared attempt budget. Housing uses one long allowance. */
export const FACILITY_SEARCH_LIMITS = { totalAttempts: 40000, requestAttempts: 240 };
export const HOUSING_SEARCH_LIMITS = { totalAttempts: 40000, requestAttempts: 40000 };
export interface UrbanSearchLimits {
  totalAttempts: number;
  requestAttempts: number;
}
export interface UrbanSearchStats {
  regionMs: number;
  curveMs: number;
}
export interface UrbanPlaceResult {
  placement?: VectorPlacement;
  attempts: number;
  /** True when the allowance ended before every feasible frontage offset was tested. */
  incomplete: boolean;
}
export function createUrbanPacker(
  doc: VectorCityDocument,
  blocks: VectorBlock[],
  settings: VectorUrbanSettings,
  inside: (p: Point) => boolean,
  uses: Map<string, string> = new Map(),
  limits: UrbanSearchLimits = FACILITY_SEARCH_LIMITS,
  stats?: UrbanSearchStats
) {
  const roads = Object.values(doc.paths).filter(p => p.role === "road"),
    surfaces = roads.map(pathSurface),
    reachable = reachablePaths(doc, doc.site!.center);
  const occupied = new RBush<ReturnType<typeof polygonBounds> & { polygon: VectorPolygon }>();
  const roadSurfaces = new RBush<ReturnType<typeof polygonBounds> & { polygon: VectorPolygon }>();
  roadSurfaces.load(surfaces.map(polygon => ({ ...polygonBounds(polygon), polygon })));
  const footprints = new RBush<ReturnType<typeof polygonBounds> & { ring: Point[] }>();
  const indexFootprint = (placement: VectorPlacement) => {
    if (!placement.building || placement.site.holes.length) return;
    const ring = convexHull(placement.site.outer);
    if (Math.abs(plotArea(ring) - regionArea(placement.site)) < 1e-7)
      footprints.insert({ ...polygonBounds(placement.site), ring });
  };
  for (const p of Object.values(doc.placements)) indexFootprint(p);
  for (const p of Object.values(doc.placements))
    for (const polygon of p.building?.reserved ?? [p.site]) occupied.insert({ ...polygonBounds(polygon), polygon });
  for (const polygon of [
    ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] })),
    ...Object.values(doc.connections.nodes).flatMap(n => {
      const surface = junctionSurface(doc, n.id);
      return surface ? [surface] : [];
    })
  ])
    occupied.insert({ ...polygonBounds(polygon), polygon });
  let attempts = 0;
  const clip = (a: VectorPolygon[], b: VectorPolygon[], operation: "union" | "difference" | "intersection") => {
    if (!stats) return regionBoolean(a, b, operation);
    const started = performance.now();
    const result = regionBoolean(a, b, operation);
    stats.regionMs += performance.now() - started;
    return result;
  };

  const samples = new Map<string, ReturnType<typeof samplePath>>();
  const anchorAt = (path: VectorPath, p: Point) => {
    let cached = samples.get(path.id);
    if (!cached) {
      const started = performance.now();
      cached = samplePath(path);
      if (stats) stats.curveMs += performance.now() - started;
      samples.set(path.id, cached);
    }
    if (!stats) return nearestRoadAnchor(path, p, cached);
    const started = performance.now();
    const anchor = nearestRoadAnchor(path, p, cached);
    stats.curveMs += performance.now() - started;
    return anchor;
  };
  const indexRings = (regions: VectorPolygon[]) => {
    const tree = new RBush<{ minX: number; minY: number; maxX: number; maxY: number }>();
    for (const region of regions)
      for (const ring of [region.outer, ...region.holes])
        tree.load(
          ring.map((a, i) => {
            const b = ring[(i + 1) % ring.length];
            return {
              minX: Math.min(a[0], b[0]),
              maxX: Math.max(a[0], b[0]),
              minY: Math.min(a[1], b[1]),
              maxY: Math.max(a[1], b[1])
            };
          })
        );
    return { regions, tree, inside: indexedContains(regions) };
  };
  // A site clear of every block edge is inside once one corner is. Touching the edge still uses the boolean.
  const outsideArea = (info: ReturnType<typeof indexRings>, polygon: VectorPolygon) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of polygon.outer) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const box = { minX: minX - 1e-6, minY: minY - 1e-6, maxX: maxX + 1e-6, maxY: maxY + 1e-6 };
    if (!info.tree.search(box).length) return info.inside(polygon.outer[0]) ? 0 : regionArea(polygon);
    return clip([polygon], info.regions, "difference").reduce((n, p) => n + regionArea(p), 0);
  };
  const blockClip = new Map(
    blocks.map(block => [block.id, indexRings([{ outer: block.outer, holes: block.holes }])] as const)
  );
  const overlapsOccupied = (polygon: VectorPolygon) =>
    occupied
      .search(polygonBounds(polygon))
      .some(q => clip([polygon], [q.polygon], "intersection").some(r => regionArea(r) > 1e-5));
  const slots = blocks.flatMap(block =>
    block.frontage
      .filter(f => reachable.has(f.pathId))
      .map(f => {
        const mid: Point = [(f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2];
        return {
          block,
          f,
          cursor: 0,
          mid,
          insideTown: inside(mid),
          water: waterDistance(doc, [{ outer: [f.from, f.to, mid], holes: [] }])
        };
      })
  );
  const place = (
    request: BVFacilityRequest,
    kind: "facility" | "housing",
    allowance = limits.requestAttempts
  ): UrbanPlaceResult => {
    const asset = request.asset,
      entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0];
    const missed = (incomplete: boolean, used: number): UrbanPlaceResult => ({ attempts: used, incomplete });
    if (!entrance) return missed(false, 0);
    let used = 0;
    const ranked = slots
      .map(slot => ({
        slot,
        score:
          (uses.has(slot.block.id) && uses.get(slot.block.id) !== facilityUseOf(request) ? 10000 : 0) +
          (request.riverbankMaxDistanceMeters !== undefined ? slot.water : 0) +
          (request.zone === "outskirts" && slot.insideTown ? 100000 : 0)
      }))
      .sort((a, b) => a.score - b.score || b.slot.f.lengthMeters - a.slot.f.lengthMeters);
    for (const { slot } of ranked) {
      const { f, block } = slot,
        len = f.lengthMeters;
      if (len < 2) continue;
      // The site sits a short way in from the frontage, so a bank farther than this cannot satisfy the limit.
      if (request.riverbankMaxDistanceMeters !== undefined && slot.water > request.riverbankMaxDistanceMeters + 80)
        continue;
      if (request.zone === "outskirts" && slot.insideTown) continue;
      const tangent: Point = [(f.to[0] - f.from[0]) / len, (f.to[1] - f.from[1]) / len];
      let normal: Point = [-tangent[1], tangent[0]];
      const mid: Point = [(f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2];
      if (!containsRegion([block], [mid[0] + normal[0] * 0.1, mid[1] + normal[1] * 0.1]))
        normal = [-normal[0], -normal[1]];
      const angle = Math.atan2(-normal[1], -normal[0]) - Math.atan2(entrance.outward[1], entrance.outward[0]),
        c = Math.cos(angle),
        s = Math.sin(angle);
      const rotate = (p: Point): Point => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
      const local = convexHull(asset.minimumSite.flatMap(p => p.outer).map(rotate));
      const along = local.map(p => p[0] * tangent[0] + p[1] * tangent[1]),
        depth = Math.min(...local.map(p => p[0] * normal[0] + p[1] * normal[1]));
      const lo = Math.min(...along),
        hi = Math.max(...along),
        span = hi - lo;
      const stride = kind === "housing" ? Math.max(2, span) : 2;
      let consecutive = 0;
      const abandon = (at: number) => {
        consecutive++;
        // Leave the rest of a failing frontage for the next house instead of scanning its whole length.
        if (kind !== "housing" || consecutive < 8) return false;
        slot.cursor = at + stride;
        return true;
      };
      for (
        let offset = Math.max(slot.cursor, settings.clearanceMeters - lo);
        offset + hi + settings.clearanceMeters <= len;
        offset += stride
      ) {
        if (used >= allowance || attempts >= limits.totalAttempts) return missed(true, used);
        used++;
        attempts++;
        const boundary: Point = [f.from[0] + tangent[0] * offset, f.from[1] + tangent[1] * offset],
          translation: Point = [
            boundary[0] + normal[0] * (settings.clearanceMeters - depth),
            boundary[1] + normal[1] * (settings.clearanceMeters - depth)
          ];
        const transform = (p: Point): Point => {
          const q = rotate(p);
          return [q[0] + translation[0], q[1] + translation[1]];
        };
        const site: VectorPolygon = {
          outer: local.map(p => [p[0] + translation[0], p[1] + translation[1]]),
          holes: []
        };
        // Convex site intersections avoid sweep-line clipping for the common
        // case of another building already occupying this frontage.
        if (footprints.search(polygonBounds(site)).some(p => plotArea(intersectConvex(site.outer, p.ring)) > 1e-5)) {
          if (abandon(offset)) break;
          continue;
        }
        const district = Object.values(doc.regions).find(
          r => r.kind === "district" && containsRegion([r], translation)
        );
        if (
          (district?.maxHeightMeters !== undefined && (asset.bvModel?.heightMeters ?? 6) > district.maxHeightMeters) ||
          (district?.density !== undefined &&
            ((Math.imul(attempts, 2654435761) >>> 0) % 1000) / 1000 > district.density) ||
          (district?.use &&
            (kind === "housing" ? district.use !== "residential" : district.use !== facilityUseOf(request))) ||
          (doc.environment?.terrain &&
            Math.max(...site.outer.map(vectorTerrain(doc).heightAt)) -
              Math.min(...site.outer.map(vectorTerrain(doc).heightAt)) >
              2) ||
          (request.zone === "outskirts" && inside(translation)) ||
          site.outer.some(corner => !containsRegion([block], corner)) ||
          outsideArea(blockClip.get(block.id)!, site) > 1e-5
        ) {
          if (abandon(offset)) break;
          continue;
        }
        // Reject occupied footprints before constructing and clipping entrance corridors.
        if (overlapsOccupied(site)) {
          if (abandon(offset)) break;
          continue;
        }
        const riverDistance = request.riverbankMaxDistanceMeters !== undefined ? waterDistance(doc, [site]) : undefined;
        if (riverDistance !== undefined && riverDistance > request.riverbankMaxDistanceMeters!) {
          if (abandon(offset)) break;
          continue;
        }
        const entrances: NonNullable<VectorPlacement["building"]>["entrances"] = [],
          accesses: CurveAnchor[] = [],
          corridors: VectorPolygon[] = [];
        let valid = true;
        for (const e of asset.entrances.filter(e => e.required)) {
          const point = transform(e.point),
            anchor = anchorAt(doc.paths[f.pathId], point),
            end = evaluateAnchor(doc.paths[f.pathId], anchor),
            outward = rotate(e.outward),
            axis: Point = [end[0] - point[0], end[1] - point[1]];
          if (axis[0] * outward[0] + axis[1] * outward[1] <= 0) {
            valid = false;
            break;
          }
          const width = Math.max(1, e.widthMeters),
            d = Math.hypot(...axis);
          if (d < 0.01) {
            valid = false;
            break;
          }
          const n: Point = [((-axis[1] / d) * width) / 2, ((axis[0] / d) * width) / 2];
          const corridor: VectorPolygon = {
            outer: [
              [point[0] + n[0], point[1] + n[1]],
              [end[0] + n[0], end[1] + n[1]],
              [end[0] - n[0], end[1] - n[1]],
              [point[0] - n[0], point[1] - n[1]]
            ],
            holes: []
          };
          const nearbyRoads = roadSurfaces.search(polygonBounds(corridor)).map(item => item.polygon);
          const offroad = nearbyRoads.length ? clip([corridor], nearbyRoads, "difference") : [corridor];
          // Removing roads first is equivalent to containment in block union roads,
          // without clipping every candidate against the entire street network.
          if (offroad.reduce((area, polygon) => area + outsideArea(blockClip.get(block.id)!, polygon), 0) > 1e-5) {
            valid = false;
            break;
          }
          corridors.push(...offroad);
          entrances.push({
            id: e.id,
            point,
            outward,
            widthMeters: e.widthMeters,
            connector: [point, end],
            accessIndex: accesses.length
          });
          accesses.push(anchor);
        }
        if (!valid || !entrances.length) {
          if (abandon(offset)) break;
          continue;
        }
        const reserved = clip([site], corridors, "union");
        if (reserved.some(p => [p.outer, ...p.holes].some(r => !simpleContour(r, true)))) {
          if (abandon(offset)) break;
          continue;
        }
        // A door on the clipped boundary is not inside the reserved polygon. Move it 4mm into the building.
        for (const entrance of entrances) {
          if (containsRegion(reserved, entrance.point)) continue;
          const length = Math.hypot(entrance.outward[0], entrance.outward[1]) || 1;
          const nudged: Point = [
            entrance.point[0] - (entrance.outward[0] / length) * 0.004,
            entrance.point[1] - (entrance.outward[1] / length) * 0.004
          ];
          if (!containsRegion(reserved, nudged)) {
            valid = false;
            break;
          }
          entrance.point = nudged;
          entrance.connector[0] = nudged;
        }
        if (!valid) {
          if (abandon(offset)) break;
          continue;
        }
        if (
          reserved.some(p =>
            occupied
              .search(polygonBounds(p))
              .some(q => clip([p], [q.polygon], "intersection").some(r => regionArea(r) > 1e-5))
          )
        ) {
          if (abandon(offset)) break;
          continue;
        }
        let id = `urban:${request.id}`;
        while (doc.placements[id]) id += "x";
        const placement: VectorPlacement = {
          id,
          modelId: asset.bvModel?.id ?? asset.id,
          position: translation,
          facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
          origin: "automatic",
          editPolicy: "editable",
          site,
          accesses,
          building: {
            kind,
            label: asset.name,
            districtId: block.id,
            provenance: asset.bvModel ? "bv" : "provisional",
            dimensionSource: asset.dimensionSource ?? "Provisional dimensions",
            heightMeters: asset.bvModel?.heightMeters ?? 6,
            footprint: asset.footprint.map(p => ({
              outer: p.outer.map(transform),
              holes: p.holes.map(h => h.map(transform))
            })),
            reserved,
            entrances,
            dwellings: kind === "housing" ? vectorHouseDwellings() : (asset.residentialDwellings ?? 0),
            floorFootprintMeters2: kind === "housing" ? VECTOR_HOUSE_FLOOR_AREA : 0,
            storeys: kind === "housing" ? VECTOR_HOUSE_STOREYS : 0,
            residentialShare: kind === "housing" ? VECTOR_HOUSE_SHARE : 0,
            ...(riverDistance === undefined ? {} : { riverbankDistanceMeters: riverDistance })
          }
        };
        doc.placements[id] = placement;
        indexFootprint(placement);
        for (const polygon of reserved) occupied.insert({ ...polygonBounds(polygon), polygon });
        slot.cursor = offset + span + settings.clearanceMeters;
        return { placement, attempts: used, incomplete: false };
      }
    }
    return missed(false, used);
  };
  return { place, budgetExceeded: () => attempts >= limits.totalAttempts };
}
