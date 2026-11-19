import { OPUS_ROPEWALK } from "../../../../buildings/medieval/opusTradeProfiles";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon } from "../../geom";
import { evaluateAnchor } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { facilityLand } from "./facilityLots";
import { vectorApproachBands } from "./suburbs";

const ROPEWALK_MODEL = "trade-workshop.dedicated-ropewalk";
/** The walk lies behind the row of plots facing the road (their inns and shops keep the frontage), this far off the
 * road's edge; a lane this wide runs from the road past its head to its door. Its site keeps this much round it. */
const FRONT_ROW_METERS = 24;
const LANE_METERS = 3;
const SITE_MARGIN_METERS = 0.3;
/** The walk starts at least this far out along the road from where it leaves the wall (past the gate's own ground),
 * and never on the glacis. */
const GATE_CLEAR_METERS = 12;
/** Starts tried along a road, this far apart; the road under the walk may bow this much off its chord. */
const STEP_METERS = 4;
const STRAIGHT_METERS = 1;

/** Whether a request is a ropewalk's (laid beside the roads, not on lots or plots). */
export const isRopewalk = (r: BVFacilityRequest) => r.asset.bvModel?.id === ROPEWALK_MODEL;

/**
 * Ropewalks behind the roads out of the gates (docs/plan/ce-outskirts-workshop-sizes.md S1, §8.2): the rope-makers
 * worked a long straight walk on the edge of town, as Bridport's walks ran down the long gardens behind the houses of
 * its streets. Each walk lies parallel to a straight stretch of an approach road, on either side, behind the row of
 * plots facing it, its head (the hemp house and its door) toward the gate, a lane from the road past its head to the
 * door; clear of the road, the wall, water and land already taken, nearest the gate first. Laid before the street plan
 * like the tanners' row, so the streets and lots keep off it and its lane.
 */
export function reserveRopewalks(
  doc: VectorCityDocument,
  requests: readonly BVFacilityRequest[],
  /** Inside the town wall. */
  inside: (p: Point) => boolean
): { placed: string[]; sites: VectorPolygon[] } {
  const pending = requests.filter(isRopewalk);
  const out = { placed: [] as string[], sites: [] as VectorPolygon[] };
  if (!pending.length || !doc.site) return out;
  const { bands, walls } = vectorApproachBands(doc);
  if (!bands.length) return out;
  const { occupied, protectedLand } = facilityLand(doc),
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface),
    water = allVectorWater(doc),
    half = doc.frame.extentMeters / 2,
    taken: VectorPolygon[] = [];
  const length = OPUS_ROPEWALK.depth,
    width = OPUS_ROPEWALK.width;
  const clear = (site: VectorPolygon) => {
    const box = {
      minX: Math.min(...site.outer.map(p => p[0])),
      minY: Math.min(...site.outer.map(p => p[1])),
      maxX: Math.max(...site.outer.map(p => p[0])),
      maxY: Math.max(...site.outer.map(p => p[1]))
    };
    if (box.minX < -half || box.minY < -half || box.maxX > half || box.maxY > half) return false;
    const others = [
      ...occupied.search(box).map(o => o.polygon),
      ...protectedLand.search(box).map(o => o.polygon),
      ...taken,
      ...roads,
      ...water
    ];
    return !regionBoolean([site], others, "intersection").some(r => regionArea(r) > 1e-5);
  };
  for (const band of bands) {
    if (!pending.length) break;
    const path = doc.paths[band.groupId];
    if (!path) continue;
    const line = band.points,
      halfRoad = Math.max(path.width.leftMeters, path.width.rightMeters),
      along = [0];
    for (let i = 1; i < line.length; i++)
      along.push(along[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const at = (s: number): Point => {
      const i = Math.max(
        1,
        along.findIndex(a => a >= s)
      );
      const t = (s - along[i - 1]) / Math.max(1e-9, along[i] - along[i - 1]);
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    };
    let placedHere = true;
    // A road may take a walk on each side; then the next road.
    while (pending.length && placedHere) {
      placedHere = false;
      // Past the glacis the wall keeps clear (the band's clearance), as the roadside houses are.
      const from = Math.max(GATE_CLEAR_METERS, band.clearance);
      for (let s = from; !placedHere && s + length <= along.at(-1)!; s += STEP_METERS) {
        const a = at(s),
          b = at(s + length),
          chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (chord < length - 0.5) continue;
        const u: Point = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
        // A straight stretch: the road between keeps within a metre of the chord.
        const stretch = line.filter((_, i) => along[i] > s && along[i] < s + length);
        if (stretch.some(p => Math.abs((p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]) > STRAIGHT_METERS)) continue;
        for (const side of [1, -1] as const) {
          const n: Point = [-u[1] * side, u[0] * side],
            off = halfRoad + FRONT_ROW_METERS + width / 2,
            centre: Point = [(a[0] + b[0]) / 2 + n[0] * off, (a[1] + b[1]) / 2 + n[1] * off];
          if (inside(centre)) continue;
          // The head toward the gate: the model's door end (local plan -Y) points back along the road.
          const head: Point = [-u[0], -u[1]],
            angle = Math.atan2(head[1], head[0]) - Math.atan2(-1, 0),
            c = Math.cos(angle),
            sn = Math.sin(angle),
            transform = (p: Point): Point => [p[0] * c - p[1] * sn + centre[0], p[0] * sn + p[1] * c + centre[1]];
          const rect = (m: number): Point[] =>
            (
              [
                [-width / 2 - m, -length / 2 - m],
                [width / 2 + m, -length / 2 - m],
                [width / 2 + m, length / 2 + m],
                [-width / 2 - m, length / 2 + m]
              ] as Point[]
            ).map(transform);
          // The lane on the gate side of the head (local -Y), from the road's edge (local x toward the road is
          // `side`) to the walk's far side.
          const toRoad = off - halfRoad,
            lane = (
              [
                [-(width / 2 + SITE_MARGIN_METERS), -length / 2 - LANE_METERS],
                [toRoad, -length / 2 - LANE_METERS],
                [toRoad, -length / 2],
                [-(width / 2 + SITE_MARGIN_METERS), -length / 2]
              ] as Point[]
            ).map(([x, y]) => transform([x * side, y])),
            joined = regionBoolean(
              [{ outer: rect(SITE_MARGIN_METERS), holes: [] }],
              [{ outer: lane, holes: [] }],
              "union"
            );
          if (joined.length !== 1 || joined[0].holes.length) continue;
          const site: VectorPolygon = joined[0];
          if (
            site.outer.some(inside) ||
            site.outer.some(p => walls.some(w => nearestOnPolyline(p, w).dist < band.clearance)) ||
            !clear(site)
          )
            continue;
          const request = pending.shift()!,
            asset = request.asset,
            entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
            door = transform(entrance.point),
            // Joined to the road at the lane's mouth.
            anchor = nearestRoadAnchor(path, transform([toRoad * side, -length / 2 - LANE_METERS / 2])),
            end = evaluateAnchor(path, anchor),
            reach = Math.hypot(end[0] - door[0], end[1] - door[1]);
          if (reach < 0.01 || !pointInPolygon(door, site.outer)) {
            pending.unshift(request);
            continue;
          }
          let id = `urban:${request.id}`;
          while (doc.placements[id]) id += "x";
          doc.placements[id] = {
            id,
            modelId: ROPEWALK_MODEL,
            position: centre,
            facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
            origin: "automatic",
            editPolicy: "editable",
            site,
            accesses: [anchor],
            building: {
              kind: "facility",
              label: asset.name,
              districtId: "ropewalks",
              provenance: "bv",
              dimensionSource: asset.dimensionSource ?? "Provisional dimensions",
              heightMeters: asset.bvModel?.heightMeters ?? 6,
              footprint: asset.footprint.map(p => ({ outer: p.outer.map(transform), holes: [] })),
              reserved: [site],
              entrances: [
                {
                  id: entrance.id,
                  point: door,
                  outward: [(end[0] - door[0]) / reach, (end[1] - door[1]) / reach],
                  widthMeters: entrance.widthMeters,
                  connector: [door, end],
                  accessIndex: 0
                }
              ],
              dwellings: 0,
              floorFootprintMeters2: 0,
              storeys: 0,
              residentialShare: 0,
              pool: facilityUseOf(request)
            }
          };
          taken.push(site);
          out.placed.push(id);
          out.sites.push(site);
          placedHere = true;
          break;
        }
      }
    }
  }
  // The walks' ground joins the town's land, as the tanners' row's does (`reserveTanneryRow`): one whose ground will
  // not join it simply is given up, and its request placed as before.
  if (out.placed.length) {
    const simple = (regions: VectorPolygon[]) =>
      regions.every(
        p =>
          simpleContour(p.outer, true) &&
          isSimplePolygon(p.outer, 1e-12) &&
          p.holes.every(h => simpleContour(h, true) && isSimplePolygon(h, 1e-12))
      );
    let grown = doc.site.domain;
    const kept: string[] = [];
    for (const id of out.placed) {
      const next = regionBoolean([...grown, ...doc.placements[id].building!.reserved], [], "union");
      if (simple(next)) {
        grown = next;
        kept.push(id);
      } else delete doc.placements[id];
    }
    // In place: the urban pass keeps the same array as its recorded domain.
    doc.site.domain.splice(0, doc.site.domain.length, ...grown);
    out.placed = kept;
    out.sites = kept.map(id => doc.placements[id].site);
  }
  return out;
}
