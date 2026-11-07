import RBush from "rbush";
import type { Point } from "../../../types/document";
import type { CurveAnchor, VectorCityDocument, VectorPath, VectorPlacement } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import type { VectorUrbanSettings } from "../../../types/vector/urban";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { convexHull } from "../../geom";
import { evaluateAnchor } from "../geometry/curves";
import { distance, gateOpening, junctionSurface } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
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
export function nearestRoadAnchor(path: VectorPath, p: Point): CurveAnchor {
  const samples = samplePath(path);
  let best = samples[0].anchor,
    score = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dx = b.point[0] - a.point[0],
      dy = b.point[1] - a.point[1],
      d = dx * dx + dy * dy;
    const t = d ? Math.max(0, Math.min(1, ((p[0] - a.point[0]) * dx + (p[1] - a.point[1]) * dy) / d)) : 0;
    const lo = a.anchor.segmentId === b.anchor.segmentId ? a.anchor.t : 0;
    let l = lo,
      r = b.anchor.t;
    for (let n = 0; n < 28; n++) {
      const x = l + (r - l) / 3,
        y = r - (r - l) / 3;
      const at = (v: number) => distance(p, evaluateAnchor(path, { ...b.anchor, t: v }));
      if (at(x) < at(y)) r = y;
      else l = x;
    }
    const candidates = [
      { ...b.anchor, t: lo + (b.anchor.t - lo) * t },
      { ...b.anchor, t: (l + r) / 2 },
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
export function createUrbanPacker(
  doc: VectorCityDocument,
  blocks: VectorBlock[],
  settings: VectorUrbanSettings,
  inside: (p: Point) => boolean,
  uses: Map<string, string> = new Map()
) {
  const roads = Object.values(doc.paths).filter(p => p.role === "road"),
    surfaces = roads.map(pathSurface),
    reachable = reachablePaths(doc, doc.site!.center);
  const occupied = new RBush<ReturnType<typeof polygonBounds> & { polygon: VectorPolygon }>();
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
  const maxAttempts = 40000;
  const allowed = new Map(blocks.map(b => [b.id, regionBoolean([b], surfaces, "union")]));
  const slots = blocks.flatMap(block =>
    block.frontage.filter(f => reachable.has(f.pathId)).map(f => ({ block, f, cursor: 0 }))
  );
  const place = (request: BVFacilityRequest, kind: "facility" | "housing"): VectorPlacement | undefined => {
    const asset = request.asset,
      entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0];
    if (!entrance) return;
    const ranked = [...slots].sort((a, b) => {
      const score = (s: typeof a) => {
        const mid: Point = [(s.f.from[0] + s.f.to[0]) / 2, (s.f.from[1] + s.f.to[1]) / 2];
        return (
          (uses.has(s.block.id) && uses.get(s.block.id) !== facilityUseOf(request) ? 10000 : 0) +
          (request.riverbankMaxDistanceMeters !== undefined
            ? waterDistance(doc, [{ outer: [s.f.from, s.f.to, mid], holes: [] }])
            : 0) +
          (request.zone === "outskirts" && inside(mid) ? 100000 : 0)
        );
      };
      return score(a) - score(b);
    });
    for (const slot of ranked) {
      const { f, block } = slot,
        len = f.lengthMeters;
      if (len < 2) continue;
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
      for (
        let offset = Math.max(slot.cursor, settings.clearanceMeters - lo);
        offset + hi + settings.clearanceMeters <= len;
        offset += 2
      ) {
        if (++attempts > maxAttempts) return;
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
        const district = Object.values(doc.regions).find(
          r => r.kind === "district" && containsRegion([r], translation)
        );
        if (district?.maxHeightMeters !== undefined && (asset.bvModel?.heightMeters ?? 6) > district.maxHeightMeters)
          continue;
        if (
          district?.density !== undefined &&
          ((Math.imul(attempts, 2654435761) >>> 0) % 1000) / 1000 > district.density
        )
          continue;
        if (
          district?.use &&
          (kind === "housing" ? district.use !== "residential" : district.use !== facilityUseOf(request))
        )
          continue;
        if (doc.environment?.terrain) {
          const terrain = vectorTerrain(doc),
            heights = site.outer.map(terrain.heightAt);
          if (Math.max(...heights) - Math.min(...heights) > 2) continue;
        }
        if (request.zone === "outskirts" && inside(translation)) continue;
        if (regionBoolean([site], [block], "difference").reduce((n, p) => n + regionArea(p), 0) > 1e-5) continue;
        const riverDistance = request.riverbankMaxDistanceMeters !== undefined ? waterDistance(doc, [site]) : undefined;
        if (riverDistance !== undefined && riverDistance > request.riverbankMaxDistanceMeters!) continue;
        const entrances: NonNullable<VectorPlacement["building"]>["entrances"] = [],
          accesses: CurveAnchor[] = [],
          corridors: VectorPolygon[] = [];
        let valid = true;
        for (const e of asset.entrances.filter(e => e.required)) {
          const point = transform(e.point),
            anchor = nearestRoadAnchor(doc.paths[f.pathId], point),
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
          const offroad = regionBoolean([corridor], surfaces, "difference");
          if (
            regionBoolean([corridor], allowed.get(block.id)!, "difference").reduce((n, p) => n + regionArea(p), 0) >
            1e-5
          ) {
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
        if (!valid || !entrances.length) continue;
        const reserved = regionBoolean([site], corridors, "union");
        if (reserved.some(p => [p.outer, ...p.holes].some(r => !simpleContour(r, true)))) continue;
        if (
          reserved.some(p =>
            occupied
              .search(polygonBounds(p))
              .some(q => regionBoolean([p], [q.polygon], "intersection").some(r => regionArea(r) > 1e-5))
          )
        )
          continue;
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
        for (const polygon of reserved) occupied.insert({ ...polygonBounds(polygon), polygon });
        slot.cursor = offset + span + settings.clearanceMeters;
        return placement;
      }
    }
  };
  return { place, budgetExceeded: () => attempts > maxAttempts };
}
