import RBush from "rbush";
import { DEDICATED_TANNERY } from "../../../../buildings/medieval/dedicatedTanneryProfile";
import { placementFootprint } from "../../../../buildings/placementModels";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPath, VectorPlacement } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { TanneryBends } from "../../../types/vector/urban";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { convexHull, isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { intersectConvex, plotArea } from "../../parcelGeometry";
import { riverFlowsFromDescriptor } from "../../riverFlow";
import { fabricLineSurface } from "../editing/fabricLineSurface";
import { curveSource } from "../editing/paths";
import { builtFeatureReservations, featureReservations } from "../environmentState";
import { fabricLaneId, fabricStreetId } from "../fabric/lines";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening, junctionSurface, nearestRoadAnchor } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour, surfacesOverlap } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import type { VectorPerimeterPlan } from "./perimeter";
import { TANNERS_ROW_DEFAULTS, type TannersRowYard, tannersRow } from "./tannersRow";
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
  unplaced: { id: string; reason: "space" | "district" | "river" | "frame" }[];
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
/** Margin each side of a recorded line's surface, beyond its centimetre rounding. */
const LINE_MARGIN_METERS = 0.1;
/** Slides of a facility's site along its front, in halves of its width (0 is centred on the seed lot's front). */
const SHIFTS = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1];

export function placeFacilitiesOnLots(
  doc: VectorCityDocument,
  plan: VectorPerimeterPlan,
  requests: readonly BVFacilityRequest[],
  inside: (p: Point) => boolean,
  /** Yards of the tanners' row, reserved before the street plan (`reserveTanneryRow`). */
  rowIds: readonly string[] = []
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
        // A few centimetres wider: the fabric records the lines rounded to the centimetre, and the check on the
        // recorded lines (reattachFabricEntrances) must find no sliver the rounding moved onto the parcel.
        surfaces.set(k, fabricLineSurface({ ...lines[k], widthMeters: lines[k].widthMeters + LINE_MARGIN_METERS }));
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
  // The tanners' row was reserved on the bank before the street plan; each yard now opens onto the street, lane or
  // road before its door, or gives its bank back.
  const row = connectTanneryRow(doc, rowIds, { lines, lineIndex, surfaceOf });
  result.placed.push(...row.placed);
  result.unplaced.push(...row.unplaced);
  for (const request of requests) {
    if (isWetTannery(request)) continue;
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
      const local = convexHull(asset.minimumSite.flatMap(p => p.outer).map(rotate)),
        siteArea = Math.abs(plotArea(local));
      const along = local.map(p => p[0] * tangent[0] + p[1] * tangent[1]),
        depthOf = local.map(p => p[0] * inward[0] + p[1] * inward[1]),
        lo = Math.min(...along),
        hi = Math.max(...along),
        back = Math.min(...depthOf);
      // Slide the site along the front and keep the slide whose parcel is smallest: the parcel runs out to the lot
      // lines of every lot the site touches, so a site that clips a lot by a metre would take all of it as yard.
      let best:
        | { placement: VectorPlacement; under: (typeof lots)[number][]; site: VectorPolygon; area: number }
        | undefined;
      for (const shift of SHIFTS) {
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
        const candidate: VectorPlacement = {
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
        const area = regionArea(site);
        if (!best || area < best.area) best = { placement: candidate, under, site, area };
        // A parcel within a tenth of the building's own site is as tight as the lots allow.
        if (area <= siteArea * 1.1) break;
      }
      if (best) {
        placement = best.placement;
        doc.placements[placement.id] = placement;
        for (const l of best.under) used.add(l.i);
        occupied.insert({ ...boxOf(best.site.outer), polygon: best.site });
        result.cells.add(seed.cellId);
        break;
      }
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

const WET_TANNERY_MODEL = "trade-workshop.dedicated-wet-tannery";
const isWetTannery = (r: BVFacilityRequest) => r.asset.bvModel?.id === WET_TANNERY_MODEL;
/** How far beside a drawn centreline its surveyed water may lie, and the widest water crossed to a bank. */
const BANK_SEARCH_METERS = 40;
const BANK_WATER_MAX_METERS = 600;
/** Bank centreline step. */
const BANK_STEP_METERS = 2;
/** Open ground kept between a town wall and the row (its glacis). */
const ROW_WALL_CLEARANCE_METERS = 25;
/** A row breaks where the bank jumps by more than this between steps (a tributary mouth, a quay). */
const BANK_JUMP_METERS = 3;
/** Farthest a yard's door may stand from the street or road it opens onto. */
const ROW_ACCESS_METERS = 40;

/**
 * Each river's course, ordered downstream. An FMG town's rivers come from its descriptor, oriented downhill
 * (`riverFlowsFromDescriptor`): a surveyed river's own path is only a short witness of its crossing, its water the
 * surveyed banks. Other rivers are their drawn paths, already drawn downstream. Leats and moats are not rivers here.
 */
function riverCourses(doc: VectorCityDocument): Point[][] {
  const descriptor = doc.site?.descriptor,
    flows = descriptor ? riverFlowsFromDescriptor(descriptor) : [];
  const drawn = Object.values(doc.paths)
    .filter(p => p.role === "river" && !p.id.includes("moat") && !p.id.startsWith("urban-tanners-leat:"))
    .map(p => {
      const points = samplePath(p).map(q => q.point);
      // An FMG river's witness runs the way its descriptor river flows, where the fall decided it.
      const flow = flows.find(f => f.basis !== "descriptor" && p.id.startsWith(`fmg-river:${f.riverId}:`));
      if (flow && points.length > 1) {
        const d: Point = [points.at(-1)![0] - points[0][0], points.at(-1)![1] - points[0][1]],
          f: Point = [flow.points.at(-1)![0] - flow.points[0][0], flow.points.at(-1)![1] - flow.points[0][1]];
        if (d[0] * f[0] + d[1] * f[1] < 0) points.reverse();
      }
      return points;
    });
  // The descriptor's own course too: a witness covers only the crossing, and may stop short of the town's lower bank.
  return [...drawn, ...flows.map(f => f.points)].filter(c => c.length > 1);
}

/** Bank lines below the town, each ordered downstream with the side the land lies on. */
function bankRuns(doc: VectorCityDocument, core: (p: Point) => boolean, maxMeters: number) {
  const water = allVectorWater(doc),
    center = doc.site!.center,
    half = doc.frame.extentMeters / 2,
    wet = (p: Point) => water.some(w => containsRegion([w], p)),
    runs: { bank: Point[]; landSide: 1 | -1; startMeters: number }[] = [];
  let framed = false;
  for (const raw of riverCourses(doc)) {
    const line: Point[] = [raw[0]],
      s = [0];
    // Every BANK_STEP_METERS along the centreline (its order is the flow).
    for (let i = 1, walked = 0, next = BANK_STEP_METERS; i < raw.length; i++) {
      const a = raw[i - 1],
        b = raw[i],
        l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (l > 0 && next <= walked + l) {
        const t = (next - walked) / l;
        line.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        s.push(next);
        next += BANK_STEP_METERS;
      }
      walked += l;
    }
    if (line.length < 3) continue;
    const hit = nearestOnPolyline(center, line),
      below = s[hit.segIndex] + hit.t * BANK_STEP_METERS;
    for (const side of [1, -1] as const) {
      let current: Point[] = [],
        start = 0;
      const flush = () => {
        if (current.length > 1) runs.push({ bank: current, landSide: side, startMeters: start });
        current = [];
      };
      for (let k = 0; k < line.length; k++) {
        if (s[k] < below) continue;
        // Only the drawn frame, and only as far down the river as the row can use. The bank beyond the frame goes on
        // unseen: the town's map is not widened for its tanneries.
        if (Math.abs(line[k][0]) > half || Math.abs(line[k][1]) > half) {
          framed = true;
          break;
        }
        if (s[k] - below > maxMeters) break;
        const a = line[Math.max(0, k - 1)],
          b = line[Math.min(line.length - 1, k + 1)],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]),
          dir: Point = [(-(b[1] - a[1]) / l) * side, ((b[0] - a[0]) / l) * side];
        // The water under the centreline, or beside it where the river's surveyed water lies off its drawn line.
        let from: Point | undefined = wet(line[k]) ? line[k] : undefined;
        for (let d = 0.5; !from && d <= BANK_SEARCH_METERS; d += 0.5)
          for (const q of [
            [line[k][0] + dir[0] * d, line[k][1] + dir[1] * d],
            [line[k][0] - dir[0] * d, line[k][1] - dir[1] * d]
          ] as Point[])
            if (wet(q)) {
              from = q;
              break;
            }
        // Out across the water to the first dry ground: a coarse walk (a wide estuary), then a fine one.
        let p: Point | undefined;
        if (from) {
          let d = 0;
          while (d <= BANK_WATER_MAX_METERS && wet([from[0] + dir[0] * d, from[1] + dir[1] * d])) d += 2;
          if (d <= BANK_WATER_MAX_METERS) {
            let lo = Math.max(0, d - 2);
            while (d - lo > 0.1) {
              const mid = (lo + d) / 2;
              if (wet([from[0] + dir[0] * mid, from[1] + dir[1] * mid])) lo = mid;
              else d = mid;
            }
            p = [from[0] + dir[0] * (d + 0.1), from[1] + dir[1] * (d + 0.1)];
          }
        }
        // The bank jumps (a creek mouth, a quay) where it moves much farther than the centreline did.
        const last = current.at(-1);
        if (
          !p ||
          core(p) ||
          (last && Math.hypot(p[0] - last[0], p[1] - last[1]) > BANK_STEP_METERS + BANK_JUMP_METERS)
        ) {
          flush();
          if (!p || core(p)) continue;
        }
        if (!current.length) start = s[k] - below;
        current.push(p);
      }
      flush();
    }
  }
  return { runs, framed };
}

/**
 * The wet tanneries as one row on the bank below the town (tanners' row plan, method A): yards side by side on straight
 * chords of the bank, each turned and mirrored so its back stands on the water with the intake upstream. The row is
 * reserved before the street plan, so the streets and lots keep off it; a yard needs the town's land under it, clear of
 * roads, gates and other reserved land, and stands nearest the town first. Doors are joined to the streets once they are
 * laid (`connectTanneryRow`).
 */
export function reserveTanneryRow(
  doc: VectorCityDocument,
  requests: readonly BVFacilityRequest[],
  core: (p: Point) => boolean,
  /** Joins a new lane's start to the road it leaves (the urban pass's junction helper). */
  joinAnchors: (anchors: CurveAnchor[]) => void,
  /** How the row meets the river's bends (VectorUrbanSettings.tanneryBends). */
  bends: TanneryBends = "continuous"
): {
  placed: string[];
  unplaced: FacilityLotResult["unplaced"];
  lanes: string[];
  leats: string[];
  /** Ground between a leat and the river: drying grounds, kept clear of streets and houses. */
  islands: VectorPolygon[];
} {
  const row = requests.filter(isWetTannery);
  if (!row.length || !doc.site) return { placed: [], unplaced: [], lanes: [], leats: [], islands: [] };
  const asset = row[0].asset,
    entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
    fp = placementFootprint(WET_TANNERY_MODEL, asset.bvModel!.quality)!,
    half = doc.frame.extentMeters / 2,
    frameRing: Point[] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ],
    [intake, effluent] = DEDICATED_TANNERY.waterPorts,
    options = {
      ...TANNERS_ROW_DEFAULTS,
      frontageMeters: fp.halfX * 2,
      depthMeters: fp.halfZ * 2,
      intakeX: intake.position[0] - fp.centerX,
      effluentX: effluent.position[0] - fp.centerX,
      continuous: bends === "continuous"
    };
  const occupied = new RBush<Box & { polygon: VectorPolygon }>();
  occupied.load(vectorOccupiedSites(doc, "reserved").map(polygon => ({ ...boxOf(polygon.outer), polygon })));
  const protectedLand = [
    ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] as Point[][] })),
    ...Object.keys(doc.connections.nodes).flatMap(id => {
      const junction = junctionSurface(doc, id);
      return junction ? [junction] : [];
    })
  ];
  const roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => pathSurface(p)),
    water = allVectorWater(doc),
    walls = Object.values(doc.connections.circuits).map(c => {
      const ring = samplePath(doc.paths[c.pathId]).map(q => q.point);
      return [...ring, ring[0]];
    }),
    setAside = [
      ...featureReservations(doc),
      ...Object.values(doc.regions)
        .filter(r => r.kind !== "district")
        .map(r => ({ outer: r.outer, holes: r.holes }))
    ];
  const yards: { yard: TannersRowYard; key: number; apron: number; run: number }[] = [];
  const banks = bankRuns(doc, core, row.length * options.frontageMeters * 4 + 400);
  const leats: { id: string; yards: TannersRowYard[] }[] = [],
    islands: VectorPolygon[] = [];
  for (const [runIndex, run] of banks.runs.entries()) {
    const plan = tannersRow(run.bank, run.landSide, options),
      got = plan.reaches.reduce((n, r) => n + r.yards.length, 0),
      length = run.bank.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - run.bank[i][0], q[1] - run.bank[i][1]), 0),
      ideal = Math.floor(length / options.frontageMeters);
    // A bank too bent for a row (method B): a straight tanners' leat drawn off the river above the run and back
    // into it below, the yards lining its land side.
    const filled = plan.reaches.filter(r => r.yards.length).length;
    // With `leat` bends, a row the bends break into several reaches takes a leat too.
    if (
      ideal >= LEAT_MIN_YARDS &&
      (got < ideal * LEAT_TRIGGER_SHARE ||
        (filled >= 2 && got / filled < LEAT_YARDS_PER_REACH) ||
        (bends === "leat" && filled >= LEAT_SPLIT_REACHES))
    ) {
      const leat = tryTannersLeat(doc, run, options, leats.length, {
        roads,
        walls,
        setAside,
        protectedLand,
        occupied: occupied.all().map(o => o.polygon),
        half
      });
      if (leat) {
        doc.paths[leat.path.id] = leat.path;
        water.push(pathSurface(leat.path));
        islands.push(...leat.island);
        const yardsOnLeat = tannersRow(leat.bank, run.landSide, options).reaches.flatMap(r => r.yards);
        leats.push({ id: leat.path.id, yards: yardsOnLeat });
        for (const [k, yard] of yardsOnLeat.entries())
          yards.push({ yard, key: run.startMeters + k, apron: 0, run: runIndex });
        continue;
      }
    }
    for (const reach of plan.reaches)
      for (const yard of reach.yards)
        yards.push({ yard, key: run.startMeters + reach.fromMeters, apron: reach.apronMeters, run: runIndex });
  }
  // The trade gathers on one bank: the run holding the most yards fills first, nearest the town first along it.
  const capacity = new Map<number, number>();
  for (const y of yards) capacity.set(y.run, (capacity.get(y.run) ?? 0) + 1);
  yards.sort((a, b) => capacity.get(b.run)! - capacity.get(a.run)! || a.run - b.run || a.key - b.key);
  const placed: string[] = [];
  let framed = banks.framed;
  const overlaps = (a: VectorPolygon, b: VectorPolygon) =>
    regionBoolean([a], [b], "intersection").some(r => regionArea(r) > 1e-7);
  // Yards with no road or street before them are served by a tanners' lane along their fronts.
  // A lane may cross fields and woods as a farm track does, never a burial ground, a park or a reserved feature.
  const laneAside = [
    ...builtFeatureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district" && r.kind !== "farm" && r.kind !== "forest")
      .map(r => ({ outer: r.outer, holes: r.holes }))
  ];
  const lanes: string[] = [],
    used = new Set<number>(),
    barred = new Set<number>(),
    runOf = new Map<string, number>(),
    // Requests not yet standing in the row; a yard given back returns its request here.
    pending = [...row],
    requestOf = new Map<string, (typeof row)[number]>();
  // A run whose yards no lane can reach (a bank winding away from every road) gives its bank back, and the rest of
  // the row is laid on the next run instead.
  for (let round = 0; round < TANNERY_ROW_ROUNDS && placed.length < row.length; round++) {
    const fresh: string[] = [];
    for (const [index, { yard, apron, run }] of yards.entries()) {
      if (!pending.length) break;
      if (used.has(index) || barred.has(run)) continue;
      used.add(index);
      const a = (yard.facingDegrees * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a),
        mx = yard.mirrored ? -1 : 1,
        transform = (q: readonly number[]): Point => {
          const x = q[0] * mx;
          return [x * c - q[1] * s + yard.position[0], x * s + q[1] * c + yard.position[1]];
        },
        ring = (r: Point[]) => (yard.mirrored ? [...r].reverse() : r).map(transform);
      const site: VectorPolygon = { outer: ring(asset.minimumSite[0].outer), holes: [] };
      // Beyond the drawn frame the row goes on unseen: the town's map is not widened for its tanneries.
      if (site.outer.some(p => Math.abs(p[0]) > half - 1 || Math.abs(p[1]) > half - 1)) {
        framed = true;
        continue;
      }
      // On dry ground clear of the wall's glacis and of the land set aside (fields, woods, burial grounds).
      if (water.some(w => overlaps(site, w))) continue;
      if (walls.some(w => site.outer.some(p => nearestOnPolyline(p, w).dist < ROW_WALL_CLEARANCE_METERS))) continue;
      if (setAside.some(r => overlaps(site, r))) continue;
      if (occupied.search(boxOf(site.outer)).some(o => overlaps(site, o.polygon))) {
        continue;
      }
      if (protectedLand.some(o => surfacesOverlap(site, o))) {
        continue;
      }
      if (roads.some(r => overlaps(site, r))) {
        continue;
      }
      // The revetment behind the yard, out to the bank, is the yard's own ground.
      let reserved: VectorPolygon[] = [site];
      try {
        const back = fp.halfZ,
          strip = regionBoolean(
            regionBoolean(
              [
                {
                  outer: ring([
                    [-fp.halfX, back],
                    [fp.halfX, back],
                    [fp.halfX, back + apron + 0.5],
                    [-fp.halfX, back + apron + 0.5]
                  ]),
                  holes: []
                }
              ],
              [{ outer: frameRing, holes: [] }],
              "intersection"
            ),
            [...occupied.search(boxOf(site.outer, apron + 1)).map(o => o.polygon), ...roads, ...water, ...setAside],
            "difference"
          ),
          joined = regionBoolean([site, ...strip], [], "union").filter(r => regionArea(r) > 0.05);
        if (
          joined.length === 1 &&
          !joined[0].holes.length &&
          simpleContour(joined[0].outer, true) &&
          isSimplePolygon(joined[0].outer, 1e-12)
        )
          reserved = joined;
      } catch {
        reserved = [site];
      }
      const request = pending.shift()!,
        door = transform([entrance.point[0], entrance.point[1] - 0.3 * Math.sign(entrance.point[1] || -1)]),
        front: Point = [s, -c];
      let id = `urban:${request.id}`;
      while (doc.placements[id]) id += "x";
      doc.placements[id] = {
        id,
        modelId: WET_TANNERY_MODEL,
        position: yard.position,
        facingDegrees: yard.facingDegrees >= 360 - 1e-9 ? 0 : yard.facingDegrees,
        origin: "automatic",
        editPolicy: "editable",
        // The yard and its revetment are one parcel: the street plan keeps off both.
        site: reserved[0],
        accesses: [],
        ...(yard.mirrored ? { mirrored: true as const } : {}),
        building: {
          kind: "facility",
          label: asset.name,
          districtId: "tanners-row",
          provenance: "bv",
          dimensionSource: asset.dimensionSource ?? "Provisional dimensions",
          heightMeters: asset.bvModel?.heightMeters ?? 6,
          footprint: asset.footprint.map(p => ({ outer: ring(p.outer), holes: [] })),
          reserved,
          // Joined to its street by connectTanneryRow: the door, and a stub one metre before it.
          entrances: [
            {
              id: entrance.id,
              point: door,
              outward: front,
              widthMeters: entrance.widthMeters,
              connector: [door, [door[0] + front[0], door[1] + front[1]]]
            }
          ],
          dwellings: asset.residentialDwellings ?? 0,
          floorFootprintMeters2: 0,
          storeys: 0,
          residentialShare: 0,
          pool: facilityUseOf(request),
          riverbankDistanceMeters: waterDistance(doc, [site])
        }
      };
      for (const polygon of reserved) occupied.insert({ ...boxOf(polygon.outer), polygon });
      fresh.push(id);
      runOf.set(id, run);
      requestOf.set(id, request);
    }
    if (!fresh.length) break;
    const laid = [...fresh];
    lanes.push(
      ...layTannersLanes(doc, fresh, {
        roads,
        water,
        setAside: laneAside,
        walls,
        half,
        joinAnchors,
        // A continuous row keeps one lane round its bends.
        groupGapMeters: bends === "continuous" ? options.frontageMeters * 2.5 : LANE_GROUP_GAP_METERS
      })
    );
    for (const id of laid)
      if (!fresh.includes(id)) {
        barred.add(runOf.get(id)!);
        pending.push(requestOf.get(id)!);
      }
    placed.push(...fresh);
  }
  // A leat no yard stands on is not dug.
  const kept = new Set(placed.map(id => doc.placements[id].position.join(",")));
  for (const leat of leats.splice(0))
    if (leat.yards.some(y => kept.has(y.position.join(",")))) leats.push(leat);
    else delete doc.paths[leat.id];
  // The row's ground joins the town's land: a yard beyond the site disk or the wall's clipped domain is still the town.
  if (placed.length) {
    const simple = (regions: VectorPolygon[]) =>
      regions.every(
        p =>
          simpleContour(p.outer, true) &&
          isSimplePolygon(p.outer, 1e-12) &&
          p.holes.every(h => simpleContour(h, true) && isSimplePolygon(h, 1e-12))
      );
    let grown = regionBoolean(
      [...doc.site.domain, ...placed.flatMap(id => doc.placements[id].building!.reserved)],
      [],
      "union"
    );
    // A union that will not stay simple is grown yard by yard: a yard whose ground cannot join the town's land stays
    // only if it already stands inside it.
    if (!simple(grown)) {
      grown = doc.site.domain;
      for (const id of placed.splice(0)) {
        const reserved = doc.placements[id].building!.reserved,
          next = regionBoolean([...grown, ...reserved], [], "union");
        if (simple(next)) {
          grown = next;
          placed.push(id);
        } else if (!regionBoolean(reserved, grown, "difference").some(r => regionArea(r) > 1e-6)) placed.push(id);
        else delete doc.placements[id];
      }
    }
    // In place: the urban pass keeps the same array as its recorded domain.
    doc.site.domain.splice(0, doc.site.domain.length, ...grown);
  }
  return {
    placed,
    lanes,
    leats: leats.map(l => l.id),
    islands: leats.length ? islands : [],
    unplaced: row
      .filter(r => !placed.some(id => requestOf.get(id) === r))
      .map(r => ({ id: r.id, reason: framed ? ("frame" as const) : ("river" as const) }))
  };
}

/** The reserved yards joined to the street, lane or road before their doors; a yard with none in reach is dropped. */
function connectTanneryRow(
  doc: VectorCityDocument,
  ids: readonly string[],
  ctx: {
    lines: { points: Point[]; widthMeters: number; fabric?: string; road?: string }[];
    lineIndex: RBush<Box & { k: number }>;
    surfaceOf: (k: number) => VectorPolygon | undefined;
  }
): { placed: string[]; unplaced: FacilityLotResult["unplaced"] } {
  const placed: string[] = [],
    unplaced: FacilityLotResult["unplaced"] = [];
  for (const id of ids) {
    const p = doc.placements[id],
      e = p?.building?.entrances[0];
    if (!p || !e) continue;
    const door = e.point,
      front = e.outward;
    let best: { k: number; end: Point; d: number } | undefined;
    for (const item of ctx.lineIndex.search(boxOf([door], ROW_ACCESS_METERS))) {
      const hit = nearestOnPolyline(door, ctx.lines[item.k].points);
      if ((hit.point[0] - door[0]) * front[0] + (hit.point[1] - door[1]) * front[1] < 0) continue;
      if (hit.dist <= ROW_ACCESS_METERS && (!best || hit.dist < best.d))
        best = { k: item.k, end: hit.point, d: hit.dist };
    }
    const line = best && ctx.lines[best.k];
    let access: CurveAnchor | undefined,
      end = best?.end;
    if (line?.road) {
      access = nearestRoadAnchor(doc.paths[line.road], door);
      end = evaluateAnchor(doc.paths[line.road], access);
    }
    const reach = end ? Math.hypot(end[0] - door[0], end[1] - door[1]) : 0;
    // A street or lane of the plan that still runs into the yard (a sliver block beside it) takes the bank back.
    const reserved = p.building!.reserved,
      crossed = ctx.lineIndex
        .search(
          boxOf(
            reserved.flatMap(r => r.outer),
            8
          )
        )
        .some(item => {
          if (!ctx.lines[item.k].fabric) return false;
          const surface = ctx.surfaceOf(item.k);
          return !!surface && regionBoolean(reserved, [surface], "intersection").some(r => regionArea(r) > 1e-6);
        });
    if (crossed || !line || !end || reach < 0.01) {
      delete doc.placements[id];
      unplaced.push({ id: id.replace(/^urban:/, "").replace(/x+$/, ""), reason: "river" });
      continue;
    }
    p.accesses = access ? [access] : [];
    p.building!.entrances = [
      {
        id: e.id,
        point: door,
        outward: [(end[0] - door[0]) / reach, (end[1] - door[1]) / reach],
        widthMeters: e.widthMeters,
        connector: [door, end],
        ...(access ? { accessIndex: 0 } : { fabricLine: line.fabric! })
      }
    ];
    placed.push(id);
  }
  return { placed, unplaced };
}

/** Times the row is laid again on other runs after a run's yards found no lane. */
const TANNERY_ROW_ROUNDS = 4;
/** Width of a tanners' lane: a cart's way. */
const TANNERS_LANE_METERS = 3;
/** Fronts closer than this along the row share one lane. */
const LANE_GROUP_GAP_METERS = 30;
/** Farthest road a lane may run back to. */
const LANE_REACH_METERS = 400;
/** Lane routes tried per run of yards, nearest first. */
const LANE_TRIES = 12;
/** Sharpest turn a lane takes: cos of 120°. */
const LANE_MAX_TURN_COS = -0.5;
/** Clearance the lane search keeps from the yards it runs along (the lane's centre is 1.7 m off their fronts). */
const YARD_CLEARANCE = 1.6;
/** Cell of the grid a lane's way round obstacles is searched on. */
const LANE_GRID_METERS = 5;

/**
 * A lane along the fronts of each run of yards, run back to the nearest road (tanners' row plan T2). The lane keeps off
 * the water, the yards, the land set aside and the town wall; a run it cannot serve gives its bank back.
 */
function layTannersLanes(
  doc: VectorCityDocument,
  placed: string[],
  ctx: {
    roads: VectorPolygon[];
    water: VectorPolygon[];
    setAside: VectorPolygon[];
    walls: Point[][];
    half: number;
    joinAnchors: (anchors: CurveAnchor[]) => void;
    /** Fronts closer than this along the row share one lane. */
    groupGapMeters: number;
  }
): string[] {
  const lanes: string[] = [];
  const offset = TANNERS_LANE_METERS / 2 + 0.5;
  // Each yard's front point, a lane's width before its door.
  const fronts = placed.map(id => {
    const e = doc.placements[id].building!.entrances[0];
    return { id, point: [e.point[0] + e.outward[0] * offset, e.point[1] + e.outward[1] * offset] as Point };
  });
  const groups: (typeof fronts)[] = [];
  for (const f of fronts) {
    const g = groups.at(-1),
      last = g?.at(-1);
    if (g && last && Math.hypot(f.point[0] - last.point[0], f.point[1] - last.point[1]) <= ctx.groupGapMeters)
      g.push(f);
    else groups.push([f]);
  }
  const roadPaths: VectorPath[] = Object.values(doc.paths).filter(p => p.role === "road");
  const wallSurfaces = Object.values(doc.paths)
    .filter(p => p.role === "wall")
    .map(p => pathSurface(p));
  const yardLand = () => placed.flatMap(id => doc.placements[id]?.building?.reserved ?? []);
  // Everything a lane keeps off, indexed by box; roads by path so a lane may meet the road it leaves.
  const obstacles = new RBush<Box & { polygon: VectorPolygon; road?: string; yard?: boolean }>();
  obstacles.load([
    ...[...ctx.water, ...ctx.setAside, ...wallSurfaces].map(polygon => ({ ...boxOf(polygon.outer), polygon })),
    // The lane runs close along the yards' fronts, so they are kept at a smaller clearance.
    ...yardLand().map(polygon => ({ ...boxOf(polygon.outer), polygon, yard: true }))
  ]);
  const addRoad = (p: VectorPath) => {
    const polygon = pathSurface(p);
    obstacles.insert({ ...boxOf(polygon.outer), polygon, road: p.id });
  };
  for (const p of roadPaths) addRoad(p);
  const blocked = (surface: VectorPolygon, except?: string) =>
    surface.outer.some(p => Math.abs(p[0]) > ctx.half || Math.abs(p[1]) > ctx.half) ||
    obstacles
      .search(boxOf(surface.outer))
      .some(
        o => o.road !== except && regionBoolean([surface], [o.polygon], "intersection").some(a => regionArea(a) > 1e-5)
      );
  const drop = (group: typeof fronts) => {
    for (const f of group) {
      delete doc.placements[f.id];
      placed.splice(placed.indexOf(f.id), 1);
    }
  };
  /** The lane for `order` (its first yard at the road end), run back to `route`'s point on the road. */
  const laneFor = (order: typeof fronts, route: { start: Point; via?: Point[] }) => {
    const head = order[0].point,
      next = order[1]?.point ?? fronts.find(f => f !== order[0])?.point ?? head,
      l = Math.hypot(head[0] - next[0], head[1] - next[1]) || 1,
      // The lane runs on past the end yard by half a frontage.
      lead: Point = [head[0] + ((head[0] - next[0]) / l) * 9, head[1] + ((head[1] - next[1]) / l) * 9],
      points: Point[] = [];
    // A way round obstacles was searched from the end yard itself.
    for (const q of [
      route.start,
      ...(route.via ?? []),
      order.length > 1 && !route.via ? lead : head,
      ...order.map(f => f.point)
    ]) {
      const prev = points.at(-1);
      if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 0.5) points.push(q);
    }
    return points;
  };
  /**
   * A way round what lies between `head` and the roads (the town wall, a burial ground, a bend of the river): a search
   * on a grid of LANE_GRID_METERS cells to the nearest road, its corners then pulled straight.
   */
  const routeAround = (head: Point) => {
    const g = LANE_GRID_METERS,
      r = Math.ceil(LANE_REACH_METERS / g),
      clearance = TANNERS_LANE_METERS / 2 + 1.5,
      at = (i: number, j: number): Point => [head[0] + i * g, head[1] + j * g],
      probe = (p: Point, clearance: number) =>
        [
          p,
          [p[0] + clearance, p[1]],
          [p[0] - clearance, p[1]],
          [p[0], p[1] + clearance],
          [p[0], p[1] - clearance]
        ] as Point[];
    const cellCache = new Map<number, 0 | 1 | 2>();
    // 0 free, 1 blocked, 2 on a road.
    const cell = (i: number, j: number): 0 | 1 | 2 => {
      const key = (i + r) * (2 * r + 1) + (j + r);
      let v = cellCache.get(key);
      if (v !== undefined) return v;
      const p = at(i, j);
      v = 0;
      if (Math.abs(p[0]) > ctx.half - clearance || Math.abs(p[1]) > ctx.half - clearance) v = 1;
      else
        for (const o of obstacles.search(boxOf([p], clearance)))
          if (
            o.road
              ? containsRegion([o.polygon], p)
              : probe(p, o.yard ? YARD_CLEARANCE : clearance).some(q => containsRegion([o.polygon], q))
          ) {
            v = o.road ? 2 : 1;
            if (v === 1) break;
          }
      cellCache.set(key, v);
      return v;
    };
    // A thin obstacle (a wall, a narrow creek) can lie between two cells: the way between them is sampled too.
    // Cached on a half-metre lattice: neighbouring moves share most of their samples.
    const blockedAt = new Map<number, boolean>();
    const pointBlocked = (p: Point) => {
      const k = Math.round(p[0] * 2) * 100003 + Math.round(p[1] * 2);
      let v = blockedAt.get(k);
      if (v === undefined) {
        v =
          Math.abs(p[0]) > ctx.half - clearance ||
          Math.abs(p[1]) > ctx.half - clearance ||
          obstacles
            .search(boxOf([p], clearance))
            .some(
              o => !o.road && probe(p, o.yard ? YARD_CLEARANCE : clearance).some(q => containsRegion([o.polygon], q))
            );
        blockedAt.set(k, v);
      }
      return v;
    };
    const wayClear = (a: Point, b: Point) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let t = 1; t < n; t++)
        if (pointBlocked([a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n])) return false;
      return true;
    };
    const key = (i: number, j: number) => (i + r) * (2 * r + 1) + (j + r);
    const came = new Map<number, number>(),
      cost = new Map<number, number>([[key(0, 0), 0]]),
      open: [number, number, number][] = [[0, 0, 0]];
    let goal: [number, number] | undefined;
    while (open.length && !goal) {
      // The cheapest open cell (the grid is small; a linear scan keeps this short).
      let k = 0;
      for (let n = 1; n < open.length; n++) if (open[n][2] < open[k][2]) k = n;
      const [i, j] = open.splice(k, 1)[0],
        base = cost.get(key(i, j))!;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]) {
        const ni = i + di,
          nj = j + dj;
        if (Math.abs(ni) > r || Math.abs(nj) > r) continue;
        const v = cell(ni, nj);
        if (v === 1 || !wayClear(at(i, j), at(ni, nj))) continue;
        const c = base + Math.hypot(di, dj);
        if (c >= (cost.get(key(ni, nj)) ?? Infinity)) continue;
        cost.set(key(ni, nj), c);
        came.set(key(ni, nj), key(i, j));
        if (v === 2) {
          goal = [ni, nj];
          break;
        }
        open.push([ni, nj, c]);
      }
    }
    if (!goal) return undefined;
    const cells: [number, number][] = [];
    for (let c: number | undefined = key(goal[0], goal[1]); c !== undefined; c = came.get(c))
      cells.push([Math.floor(c / (2 * r + 1)) - r, (c % (2 * r + 1)) - r]);
    // Road end first; corners pulled straight where the cells between are free.
    const clear = (a: [number, number], b: [number, number]) => wayClear(at(...a), at(...b));
    const kept: [number, number][] = [cells[0]];
    for (let n = 1; n < cells.length; n++)
      if (n === cells.length - 1 || !clear(kept.at(-1)!, cells[n + 1])) kept.push(cells[n]);
    const end = at(...kept[0]);
    const road = obstacles.search(boxOf([end], 0.1)).find(o => o.road && containsRegion([o.polygon], end))?.road;
    const path = road ? roadPaths.find(p => p.id === road) : undefined;
    if (!path) return undefined;
    const anchor = nearestRoadAnchor(path, end);
    return {
      road: path,
      anchor,
      start: evaluateAnchor(path, anchor),
      via: kept.slice(1, -1).map(c => at(...c)),
      d: 0
    };
  };
  const routesFrom = (head: Point) => {
    const around = routeAround(head);
    return [...straightRoutes(head), ...(around ? [around] : [])];
  };
  const straightRoutes = (head: Point) =>
    roadPaths
      .flatMap(road => {
        // The nearest point of each road, and points along it every 15 m, for a lane that cannot run straight there.
        const samples = samplePath(road);
        const targets: Point[] = [head];
        for (let i = 0, next = 0; i < samples.length; i++)
          if (samples[i].distance >= next) {
            targets.push(samples[i].point);
            next = samples[i].distance + 15;
          }
        return targets.map(q => {
          const anchor = nearestRoadAnchor(road, q, samples),
            start = evaluateAnchor(road, anchor);
          return { road, anchor, start, d: Math.hypot(start[0] - head[0], start[1] - head[1]) };
        });
      })
      .filter(r => r.d <= LANE_REACH_METERS)
      .sort((x, y) => x.d - y.d)
      .slice(0, LANE_TRIES / 2);
  const lay = (points: Point[], route: { road: VectorPath; anchor: CurveAnchor }, dryRun: boolean) => {
    if (points.length < 2) return false;
    // No hairpin: a cart lane doubling back on itself onto the row reads as a mistake.
    for (let i = 1; i + 1 < points.length; i++) {
      const a: Point = [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]],
        b: Point = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]],
        la = Math.hypot(a[0], a[1]),
        lb = Math.hypot(b[0], b[1]);
      if (la > 1e-6 && lb > 1e-6 && (a[0] * b[0] + a[1] * b[1]) / (la * lb) < LANE_MAX_TURN_COS) return false;
    }
    let id = `urban-tanners-lane:${lanes.length}`;
    while (doc.paths[id]) id += "x";
    const lane = {
      id,
      revision: 0,
      role: "road" as const,
      origin: "automatic" as const,
      editPolicy: "editable" as const,
      source: curveSource(points, "polyline", false),
      width: { leftMeters: TANNERS_LANE_METERS / 2, rightMeters: TANNERS_LANE_METERS / 2, stations: [] }
    };
    try {
      if (blocked(pathSurface(lane), route.road.id)) return false;
    } catch {
      return false;
    }
    if (dryRun) return true;
    doc.paths[id] = lane;
    ctx.joinAnchors([route.anchor, { pathId: id, segmentId: "segment:0", t: 0 }]);
    lanes.push(id);
    roadPaths.push(lane);
    addRoad(lane);
    return true;
  };
  // A run of yards is served from either end by the longest lane that keeps clear (a burial ground or a creek before
  // some fronts cuts the run); the yards beyond it are served from their own end, or give their bank back.
  const queue = [...groups];
  while (queue.length) {
    const group = queue.shift()!;
    let best:
      | {
          order: typeof fronts;
          k: number;
          route: { road: VectorPath; anchor: CurveAnchor; start: Point; via?: Point[] };
        }
      | undefined;
    for (const order of [group, [...group].reverse()])
      for (const route of routesFrom(order[0].point)) {
        if (best && best.k === group.length) break;
        if (!lay(laneFor(order.slice(0, 1), route), route, true)) continue;
        // The longest prefix that keeps clear: blocking only grows with the lane.
        let lo = 1,
          hi = order.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (lay(laneFor(order.slice(0, mid), route), route, true)) lo = mid;
          else hi = mid - 1;
        }
        if (!best || lo > best.k) best = { order, k: lo, route };
      }
    if (!best) {
      drop(group);
      continue;
    }
    lay(laneFor(best.order.slice(0, best.k), best.route), best.route, false);
    const rest = best.order.slice(best.k);
    if (rest.length) queue.push(rest);
  }
  return lanes;
}

/** A run whose bank holds fewer yards than this share of its length in frontages gets a leat. */
const LEAT_TRIGGER_SHARE = 0.6;
/** A run whose bends break its row into reaches of fewer yards than this, on average, gets a leat. */
const LEAT_YARDS_PER_REACH = 2.5;
/** With `leat` bends: a run whose yards fall into this many reaches or more gets a leat. */
const LEAT_SPLIT_REACHES = 3;
/** Shortest run worth a leat, in yards. */
const LEAT_MIN_YARDS = 3;
/** Width of a tanners' leat, and the ground kept between it and the river. */
const LEAT_WIDTH_METERS = 2.5;
const LEAT_ISLAND_METERS = 6;
/** Steepest slant of a leat's offtake and outfall off the river. */
const LEAT_SLANT = (35 * Math.PI) / 180;
/** Shortest run of the offtake and the outfall along the river. */
const LEAT_LEAD_METERS = 15;

/**
 * A tanners' leat for a bank run too bent for a row (tanners' row plan §6, method B): a straight channel parallel to
 * the run's chord, landward of every bend of the bank by LEAT_ISLAND_METERS, drawn off the river at the run's upstream
 * end and returned at its downstream end. It crosses no road (no new bridge to judge), wall, set-aside land or placed
 * site, and stays in the frame. Returns the path, the bank its yards line, and the ground between it and the river.
 */
function tryTannersLeat(
  doc: VectorCityDocument,
  run: { bank: Point[]; landSide: 1 | -1 },
  options: { frontageMeters: number },
  index: number,
  ctx: {
    roads: VectorPolygon[];
    walls: Point[][];
    setAside: VectorPolygon[];
    protectedLand: VectorPolygon[];
    occupied: VectorPolygon[];
    half: number;
  }
): { path: VectorPath; bank: Point[]; island: VectorPolygon[] } | undefined {
  // A run reaching the frame's edge is cut back until its leat stays inside: the bank beyond goes on unseen.
  const inside = (p: Point) => Math.abs(p[0]) <= ctx.half - 2 && Math.abs(p[1]) <= ctx.half - 2;
  let bankRun = run.bank;
  while (bankRun.length > 2 && !bankRun.every(inside)) bankRun = bankRun.slice(0, -1);
  for (let tries = 0; tries < 40 && bankRun.length > 2; tries++) {
    const leat = leatFor({ ...run, bank: bankRun });
    if (leat !== "frame") return leat;
    bankRun = bankRun.slice(0, Math.max(2, bankRun.length - Math.max(1, Math.round(bankRun.length / 20))));
  }
  return undefined;
  function leatFor(run: {
    bank: Point[];
    landSide: 1 | -1;
  }): { path: VectorPath; bank: Point[]; island: VectorPolygon[] } | undefined | "frame" {
    const a = run.bank[0],
      b = run.bank.at(-1)!,
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < LEAT_LEAD_METERS * 2 + options.frontageMeters * LEAT_MIN_YARDS) return undefined;
    const u: Point = [(b[0] - a[0]) / l, (b[1] - a[1]) / l],
      n: Point = [-u[1] * run.landSide, u[0] * run.landSide],
      bulge = Math.max(...run.bank.map(q => (q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1])),
      h = Math.max(0, bulge) + LEAT_ISLAND_METERS + LEAT_WIDTH_METERS / 2,
      // The offtake and the outfall slant at most LEAT_SLANT off the river, as a weir-fed channel leaves it.
      lead = Math.max(LEAT_LEAD_METERS, h / Math.tan(LEAT_SLANT)),
      at = (along: number, out: number): Point => [a[0] + u[0] * along + n[0] * out, a[1] + u[1] * along + n[1] * out],
      // Into the river a little at each end, so the leat's water meets the river's.
      points: Point[] = [at(0, -1), at(lead, h), at(l - lead, h), at(l, -1)];
    if (l - 2 * lead < options.frontageMeters * LEAT_MIN_YARDS) return undefined;
    if (points.some(p => Math.abs(p[0]) > ctx.half - 2 || Math.abs(p[1]) > ctx.half - 2)) return "frame";
    const path: VectorPath = {
      id: `urban-tanners-leat:${index}`,
      revision: 0,
      role: "river",
      origin: "automatic",
      editPolicy: "editable",
      source: curveSource(points, "polyline", false),
      width: { leftMeters: LEAT_WIDTH_METERS / 2, rightMeters: LEAT_WIDTH_METERS / 2, stations: [] }
    };
    while (doc.paths[path.id]) path.id += "x";
    let surface: VectorPolygon;
    try {
      surface = pathSurface(path);
    } catch {
      return undefined;
    }
    const meets = (r: VectorPolygon) => regionBoolean([surface], [r], "intersection").some(x => regionArea(x) > 1e-5);
    if (ctx.roads.some(meets)) return undefined;
    if ([...ctx.setAside, ...ctx.protectedLand, ...ctx.occupied].some(meets)) return undefined;
    if (ctx.walls.some(w => points.some(p => nearestOnPolyline(p, w).dist < ROW_WALL_CLEARANCE_METERS)))
      return undefined;
    // The yards' bank: the leat's land edge along its straight reach.
    const edge = LEAT_WIDTH_METERS / 2 + 0.1,
      bank = [at(lead + edge, h + edge), at(l - lead - edge, h + edge)];
    // The ground between leat and river, as the hull of both less any water.
    let island: VectorPolygon[] = [];
    try {
      island = regionBoolean(
        [{ outer: convexHull([...run.bank, ...points]), holes: [] }],
        [surface, ...allVectorWater(doc)],
        "difference"
      ).filter(r => regionArea(r) > 1);
    } catch {
      island = [];
    }
    return { path, bank, island };
  }
}
