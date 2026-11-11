import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { convexHull, nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { intersectConvex, plotArea } from "../../parcelGeometry";
import { fabricLineSurface } from "../editing/fabricLineSurface";
import { fabricLaneId, fabricStreetId } from "../fabric/lines";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening, junctionSurface, nearestRoadAnchor } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { simpleContour, surfacesOverlap } from "../geometry/surfaces";
import { vectorOccupiedSites } from "../occupancy";
import type { VectorPerimeterPlan } from "./perimeter";
import { waterDistance } from "./urbanPacking";

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (ring: Point[], pad = 0): Box => ({
  minX: Math.min(...ring.map(p => p[0])) - pad,
  minY: Math.min(...ring.map(p => p[1])) - pad,
  maxX: Math.max(...ring.map(p => p[0])) + pad,
  maxY: Math.max(...ring.map(p => p[1])) + pad
});
/** Seeds tried per facility before it is reported as finding no room. */
const SEEDS_PER_REQUEST = 300;
/** A lot whose front lies this close to a street, lane or road faces it. */
const FRONT_METERS = 6;
/** Sample step when testing that a facility's site lies wholly on the lots it takes. */
const SAMPLE_METERS = 1;

export interface FacilityLotResult {
  placed: string[];
  unplaced: { id: string; reason: "space" | "district" | "river" }[];
  /** Street blocks a facility stands in; they stay recorded even when they hold no house. */
  cells: Set<string>;
}

/**
 * Population facilities on the CE street-block layout (gate-ribbon plan, facility mode): a facility takes a run of
 * neighbouring lots of one street block, its front on the street those lots face, and its parcel runs out to the lot
 * lines of every lot its site touches. The houses then fill every other lot, so a facility closes up to its neighbours
 * lot line to lot line, as a house does, with no remnant of a cut lot between them. Lots are tried in their CE occupancy draw order,
 * so facilities spread through the town the way vacant lots do; commerce takes the lots nearest the centre first and a
 * riverside works the lots nearest the water.
 */
export function placeFacilitiesOnLots(
  doc: VectorCityDocument,
  plan: VectorPerimeterPlan,
  requests: readonly BVFacilityRequest[],
  inside: (p: Point) => boolean
): FacilityLotResult {
  const result: FacilityLotResult = { placed: [], unplaced: [], cells: new Set() };
  if (!requests.length || !doc.site) return result;
  const center = doc.site.center;
  const lots = plan.houses.map((h, i) => ({
    i,
    cellId: h.cellId,
    polygon: h.polygon,
    draw: h.draw,
    centroid: polygonCentroid(h.polygon),
    hull: convexHull(h.polygon),
    core: inside(polygonCentroid(h.polygon)),
    box: boxOf(h.polygon)
  }));
  const lotIndex = new RBush<Box & { i: number }>();
  lotIndex.load(lots.map(l => ({ ...l.box, i: l.i })));
  const used = new Set<number>();
  /** Seed lots that took no site, by asset model. Taking a lot can only shrink the room around a seed, so a failed
   * seed never succeeds later for the same model. */
  const failed = new Map<string, Set<number>>();
  const cellRings = new Map(plan.districts.flatMap(d => d.cells.map(c => [c.id, c.ring] as const)));
  // Lines a front may face: CE streets and lanes (by their fabric ids) and the main roads (by anchor).
  const lines: { points: Point[]; widthMeters: number; fabric?: string; road?: string }[] = [];
  for (const d of plan.districts) {
    for (const [k, l] of d.streets.entries())
      lines.push({ points: l.points, widthMeters: l.widthMeters, fabric: fabricStreetId(d.id, k) });
    for (const c of d.cells)
      for (const [k, l] of c.lanes.entries())
        lines.push({ points: l.points, widthMeters: l.widthMeters, fabric: fabricLaneId(c.id, k) });
  }
  for (const p of Object.values(doc.paths).filter(p => p.role === "road"))
    lines.push({ points: samplePath(p).map(s => s.point), widthMeters: 0, road: p.id });
  const surfaces = new Map<number, VectorPolygon | undefined>();
  const surfaceOf = (k: number) => {
    if (!surfaces.has(k))
      try {
        surfaces.set(k, fabricLineSurface(lines[k]));
      } catch {
        surfaces.set(k, undefined);
      }
    return surfaces.get(k);
  };
  const lineIndex = new RBush<Box & { k: number }>();
  lineIndex.load(lines.map((l, k) => ({ ...boxOf(l.points), k })));
  const occupied = new RBush<Box & { polygon: VectorPolygon }>();
  occupied.load(vectorOccupiedSites(doc, "reserved").map(polygon => ({ ...boxOf(polygon.outer), polygon })));
  // Gate openings and junction discs are kept clear exactly as validation tests them, as the houses keep them.
  const protectedLand = new RBush<Box & { polygon: VectorPolygon }>();
  protectedLand.load(
    [
      ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] })),
      ...Object.keys(doc.connections.nodes).flatMap(id => {
        const junction = junctionSurface(doc, id);
        return junction ? [junction] : [];
      })
    ].map(polygon => ({ ...boxOf(polygon.outer), polygon }))
  );
  // A facility never stands across a lane of its street block.
  const lanesOf = new Map(plan.districts.flatMap(d => d.cells.map(c => [c.id, c.lanes] as const)));
  const water = new Map<number, number>();
  const waterOf = (i: number) => {
    let d = water.get(i);
    if (d === undefined) {
      d = waterDistance(doc, [{ outer: lots[i].polygon, holes: [] }]);
      water.set(i, d);
    }
    return d;
  };
  /** The lot's front: the edge whose midpoint lies nearest a line, with that line and its nearest point. */
  const frontOf = (polygon: Point[]) => {
    let best: { a: Point; b: Point; k: number; at: Point; d: number } | undefined;
    for (let e = 0; e < polygon.length; e++) {
      const a = polygon[e],
        b = polygon[(e + 1) % polygon.length],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const item of lineIndex.search(boxOf([mid], FRONT_METERS))) {
        const hit = nearestOnPolyline(mid, lines[item.k].points);
        if (!best || hit.dist < best.d) best = { a, b, k: item.k, at: hit.point, d: hit.dist };
      }
    }
    return best && best.d <= FRONT_METERS ? best : undefined;
  };
  for (const request of requests) {
    const asset = request.asset,
      entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0];
    const wantsWater = request.riverbankMaxDistanceMeters !== undefined;
    if (!entrance) {
      result.unplaced.push({ id: request.id, reason: "space" });
      continue;
    }
    const outskirts = request.zone === "outskirts",
      commerce = facilityUseOf(request) === "commerce";
    const failedHere = failed.get(asset.id) ?? new Set<number>();
    failed.set(asset.id, failedHere);
    const seeds = lots
      .filter(l => !used.has(l.i) && !failedHere.has(l.i) && l.core !== outskirts)
      .filter(l => !wantsWater || waterOf(l.i) <= request.riverbankMaxDistanceMeters! + 30)
      .sort((a, b) =>
        wantsWater
          ? waterOf(a.i) - waterOf(b.i)
          : commerce
            ? Math.hypot(a.centroid[0] - center[0], a.centroid[1] - center[1]) -
              Math.hypot(b.centroid[0] - center[0], b.centroid[1] - center[1])
            : a.draw - b.draw
      )
      .slice(0, SEEDS_PER_REQUEST);
    let placement: VectorPlacement | undefined;
    for (const seed of seeds) {
      const front = frontOf(seed.polygon);
      if (!front) continue;
      // The facility's frame: its door faces the line the seed lot fronts.
      const len = Math.hypot(front.b[0] - front.a[0], front.b[1] - front.a[1]);
      if (len < 0.5) continue;
      const tangent: Point = [(front.b[0] - front.a[0]) / len, (front.b[1] - front.a[1]) / len];
      let inward: Point = [-tangent[1], tangent[0]];
      const mid: Point = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
      if (!pointInPolygon([mid[0] + inward[0] * 0.2, mid[1] + inward[1] * 0.2], seed.polygon))
        inward = [-inward[0], -inward[1]];
      const angle = Math.atan2(-inward[1], -inward[0]) - Math.atan2(entrance.outward[1], entrance.outward[0]),
        c = Math.cos(angle),
        s = Math.sin(angle);
      const rotate = (p: Point): Point => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
      const local = convexHull(asset.minimumSite.flatMap(p => p.outer).map(rotate));
      const along = local.map(p => p[0] * tangent[0] + p[1] * tangent[1]),
        depthOf = local.map(p => p[0] * inward[0] + p[1] * inward[1]),
        lo = Math.min(...along),
        hi = Math.max(...along),
        back = Math.min(...depthOf);
      // Slide the site along the front so it covers whole neighbouring lots of the same block.
      for (const shift of [0, -0.5, 0.5, -1, 1]) {
        const offset = (len - (hi - lo)) / 2 + shift * (hi - lo) * 0.5,
          translation: Point = [
            front.a[0] + tangent[0] * (offset - lo) + inward[0] * (0.05 - back),
            front.a[1] + tangent[1] * (offset - lo) + inward[1] * (0.05 - back)
          ],
          transform = (p: Point): Point => {
            const q = rotate(p);
            return [q[0] + translation[0], q[1] + translation[1]];
          },
          hull = local.map((p): Point => [p[0] + translation[0], p[1] + translation[1]]);
        // The lots under the site, all of one street block and none taken.
        const under = lotIndex
          .search(boxOf(hull))
          .map(item => lots[item.i])
          .filter(l => Math.abs(plotArea(intersectConvex(hull, l.hull))) > 0.5);
        if (!under.length || under.some(l => used.has(l.i) || l.cellId !== seed.cellId)) continue;
        // The site lies wholly in the street block: every sample of it falls inside the block's outline.
        const ring = cellRings.get(seed.cellId)!,
          box = boxOf(hull);
        let covered = true;
        for (let x = box.minX + SAMPLE_METERS / 2; covered && x < box.maxX; x += SAMPLE_METERS)
          for (let y = box.minY + SAMPLE_METERS / 2; y < box.maxY; y += SAMPLE_METERS) {
            if (!pointInPolygon([x, y], hull)) continue;
            if (!pointInPolygon([x, y], ring)) {
              covered = false;
              break;
            }
          }
        if (!covered) continue;
        if (
          (lanesOf.get(seed.cellId) ?? []).some(lane =>
            // The lane's surface: its line and both edges, every half metre.
            lane.points.slice(1).some((b, k) => {
              const a = lane.points[k],
                l = Math.hypot(b[0] - a[0], b[1] - a[1]),
                n: Point = l
                  ? [(-(b[1] - a[1]) / l) * (lane.widthMeters / 2), ((b[0] - a[0]) / l) * (lane.widthMeters / 2)]
                  : [0, 0];
              for (let t = 0; t <= l; t += 0.5) {
                const q: Point = [a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l];
                if (
                  [q, [q[0] + n[0], q[1] + n[1]] as Point, [q[0] - n[0], q[1] - n[1]] as Point].some(r =>
                    pointInPolygon(r, hull)
                  )
                )
                  return true;
              }
              return false;
            })
          )
        )
          continue;
        // The parcel runs out to the lot lines of every lot the site touches, so the next house stands on its own whole
        // lot against the parcel's edge, with no remnant of a cut lot between them.
        let parcel: VectorPolygon[];
        try {
          parcel = regionBoolean(
            regionBoolean(
              [{ outer: hull, holes: [] }, ...under.map(l => ({ outer: l.polygon, holes: [] }))],
              [],
              "union"
            ),
            [{ outer: ring, holes: [] }],
            "intersection"
          ).filter(p => regionArea(p) > 0.5);
        } catch {
          continue;
        }
        if (parcel.length !== 1 || parcel[0].holes.length || !simpleContour(parcel[0].outer, true)) continue;
        // Lots share slivers with their neighbours; the parcel gives up any it shares with land already taken. A parcel
        // that would lose more than slivers is no parcel.
        let site = parcel[0];
        const touching = occupied
          .search(boxOf(site.outer))
          .map(o => o.polygon)
          .filter(o => regionBoolean([site], [o], "intersection").some(r => regionArea(r) > 1e-7));
        if (touching.length) {
          const before = regionArea(site),
            trimmed = regionBoolean([site], touching, "difference").filter(r => regionArea(r) > 0.05);
          if (
            trimmed.length !== 1 ||
            trimmed[0].holes.length ||
            !simpleContour(trimmed[0].outer, true) ||
            regionArea(trimmed[0]) < before - 2
          )
            continue;
          site = trimmed[0];
        }
        if (protectedLand.search(boxOf(site.outer, 1e-6)).some(o => surfacesOverlap(site, o.polygon))) continue;
        // No street or lane of the plan runs into the parcel (the CE lots keep off them; a site wider than its seed
        // lot can still reach a bend), tested on the line surfaces the fabric records keep.
        if (
          lineIndex.search(boxOf(site.outer, 4)).some(item => {
            const line = lines[item.k];
            if (!line.fabric) return false;
            const surface = surfaceOf(item.k);
            return !!surface && regionBoolean([site], [surface], "intersection").some(r => regionArea(r) > 1e-6);
          })
        )
          continue;
        const footprint = asset.footprint.map(p => ({
          outer: p.outer.map(transform),
          holes: p.holes.map(h => h.map(transform))
        }));
        // The building stands wholly on its parcel (the samples above can miss a corner across the block's edge).
        if (regionBoolean(footprint, [site], "difference").some(r => regionArea(r) > 1e-5)) continue;
        if (wantsWater && waterDistance(doc, [site]) > request.riverbankMaxDistanceMeters!) continue;
        // The door on the front, joined to the line the lots face.
        const door = transform(entrance.point),
          line = lines[front.k],
          hit = nearestOnPolyline(door, line.points);
        let end = hit.point,
          access: CurveAnchor | undefined;
        if (line.road) {
          access = nearestRoadAnchor(doc.paths[line.road], door);
          end = evaluateAnchor(doc.paths[line.road], access);
        }
        let point = door;
        if (!pointInPolygon(point, site.outer)) {
          // A door just outside the parcel (the site's own front) moves back onto it.
          const inner: Point = [door[0] + inward[0] * 0.3, door[1] + inward[1] * 0.3];
          if (!pointInPolygon(inner, site.outer)) continue;
          point = inner;
        }
        const reach = Math.hypot(end[0] - point[0], end[1] - point[1]);
        if (reach < 0.01) continue;
        let id = `urban:${request.id}`;
        while (doc.placements[id]) id += "x";
        placement = {
          id,
          modelId: asset.bvModel?.id ?? asset.id,
          position: translation,
          facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
          origin: "automatic",
          editPolicy: "editable",
          site,
          accesses: access ? [access] : [],
          building: {
            kind: "facility",
            label: asset.name,
            districtId: seed.cellId,
            provenance: asset.bvModel ? "bv" : "provisional",
            dimensionSource: asset.dimensionSource ?? "Provisional dimensions",
            heightMeters: asset.bvModel?.heightMeters ?? 6,
            footprint,
            reserved: [site],
            entrances: [
              {
                id: entrance.id,
                point,
                outward: [(end[0] - point[0]) / reach, (end[1] - point[1]) / reach],
                widthMeters: entrance.widthMeters,
                connector: [point, end],
                ...(access ? { accessIndex: 0 } : { fabricLine: line.fabric! })
              }
            ],
            dwellings: asset.residentialDwellings ?? 0,
            floorFootprintMeters2: 0,
            storeys: 0,
            residentialShare: 0,
            pool: facilityUseOf(request),
            ...(wantsWater ? { riverbankDistanceMeters: waterDistance(doc, [site]) } : {})
          }
        };
        doc.placements[id] = placement;
        for (const l of under) used.add(l.i);
        occupied.insert({ ...boxOf(site.outer), polygon: site });
        result.cells.add(seed.cellId);
        break;
      }
      if (placement) break;
      failedHere.add(seed.i);
    }
    if (placement) result.placed.push(placement.id);
    else
      result.unplaced.push({
        id: request.id,
        reason: wantsWater && !seeds.length ? "river" : outskirts ? "district" : "space"
      });
  }
  return result;
}

/**
 * Facilities kept from before an edit (facility mode) against the CE plan laid again: a facility whose door still
 * meets a street or lane of the new plan takes that line's id; one whose line is gone, or that a new line crosses,
 * is released so it is placed again with the others. Returns the released placement ids, already removed.
 */
export function refitRetainedFacilities(doc: VectorCityDocument, plan: VectorPerimeterPlan, ids: readonly string[]) {
  const lines: { points: Point[]; id: string; widthMeters: number }[] = [];
  for (const d of plan.districts) {
    for (const [k, l] of d.streets.entries())
      lines.push({ points: l.points, id: fabricStreetId(d.id, k), widthMeters: l.widthMeters });
    for (const c of d.cells)
      for (const [k, l] of c.lanes.entries())
        lines.push({ points: l.points, id: fabricLaneId(c.id, k), widthMeters: l.widthMeters });
  }
  const released: string[] = [];
  for (const id of ids) {
    const p = doc.placements[id];
    if (!p?.building?.entrances.some(e => e.fabricLine !== undefined)) continue;
    const ring = p.site.outer;
    const crossed = lines.some(l => lineMeets(l.points, l.widthMeters, ring));
    let ok = !crossed;
    for (const e of p.building.entrances) {
      if (!ok || e.fabricLine === undefined) continue;
      // The same line drawn again keeps the door as it was.
      const same = lines.find(l => l.id === e.fabricLine);
      if (same && nearestOnPolyline(e.connector.at(-1)!, same.points).dist <= 0.02) continue;
      let best: { id: string; point: Point; d: number } | undefined;
      for (const l of lines) {
        const hit = nearestOnPolyline(e.point, l.points);
        if (!best || hit.dist < best.d) best = { id: l.id, point: hit.point, d: hit.dist };
      }
      const reach = Math.hypot(e.connector.at(-1)![0] - e.point[0], e.connector.at(-1)![1] - e.point[1]) + 2;
      if (!best || best.d > reach || best.d < 0.001) {
        ok = false;
        continue;
      }
      e.fabricLine = best.id;
      e.connector = [e.point, best.point];
      e.outward = [(best.point[0] - e.point[0]) / best.d, (best.point[1] - e.point[1]) / best.d];
    }
    if (!ok) {
      delete doc.placements[id];
      released.push(id);
    }
  }
  return released;
}

/** Whether a line's surface (its centre and both edges, every half metre) reaches into `ring`. */
function lineMeets(points: Point[], widthMeters: number, ring: Point[]): boolean {
  return points.slice(1).some((b, k) => {
    const a = points[k],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n: Point = l ? [(-(b[1] - a[1]) / l) * (widthMeters / 2), ((b[0] - a[0]) / l) * (widthMeters / 2)] : [0, 0];
    for (let t = 0; t <= l; t += 0.5) {
      const q: Point = [a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l];
      if (
        [q, [q[0] + n[0], q[1] + n[1]] as Point, [q[0] - n[0], q[1] - n[1]] as Point].some(r => pointInPolygon(r, ring))
      )
        return true;
    }
    return false;
  });
}
