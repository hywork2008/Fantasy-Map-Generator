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

/**
 * Kiln works stand out of town, apart (docs/plan/ce-outskirts-workshop-sizes.md §8.14, §8.15): tile kilns just
 * outside a town's walls one at a time (Chichester, Warwick) or on a country road in their own yard (Danbury), pottery
 * mostly made in the country where clay and fuel were, a town's potters on its edge (Laverstock by Salisbury), lime
 * burnt where it was wanted or where stone and fuel met. None of them lined the road at the gate, which inns, stables,
 * food trades and shops held, with gardens behind them (London outside its walls, 1430-1540).
 */
const EDGE_WORKS = [":workshop:limeAndTile:", ":workshop:pottery:"] as const;
/** Whether a request is a kiln works laid beyond the roadside houses (or else taken to lie beyond the map). */
export const isEdgeWorks = (r: BVFacilityRequest) => EDGE_WORKS.some(k => r.id.includes(k));

/** Past the end of the houses along a road, this much open ground before the first works. */
const PAST_HOUSES_METERS = 20;
/** Kiln works keep this far from one another (fire and smoke; a yard of its own), centre to centre. Provisional. */
const APART_METERS = 60;
/** Their yards stand back this far from the road's edge; a lane joins their gate to the road. */
const SETBACK_METERS = 4;
const LANE_METERS = 3;
const SITE_MARGIN_METERS = 1;
/** Starts tried along a road, this far apart. */
const STEP_METERS = 6;

/**
 * Lays the kiln works (lime and tile yards, potters) beside the roads out of the gates, past the end of the houses
 * along them and apart from one another, as many as the map shows. The map of a walled town reaches two and a half
 * wall diameters across (`editorInput.ts`), so the length of road it shows beyond the houses, and so the number of
 * works drawn, follows the town's size and the map's; the rest stand further out on the roads, beyond the map's
 * edge, and are reported so (`offMap`), not put on the town's lots. Laid before the street plan, as the ropewalks are.
 */
export function reserveEdgeWorks(
  doc: VectorCityDocument,
  requests: readonly BVFacilityRequest[],
  /** Inside the town wall; by default inside the wall closed across its ends (a coastal town's). */
  insideWall?: (p: Point) => boolean
): { placed: string[]; sites: VectorPolygon[]; offMap: { id: string; reason: "offMap" }[] } {
  // Lime and tile yards and potters in turn, so the nearest ground is shared between the trades.
  const byTrade = EDGE_WORKS.map(k => requests.filter(r => r.id.includes(k))),
    pending: BVFacilityRequest[] = [];
  for (let i = 0; i < Math.max(0, ...byTrade.map(t => t.length)); i++)
    for (const trade of byTrade) if (trade[i]) pending.push(trade[i]);
  const out = {
    placed: [] as string[],
    sites: [] as VectorPolygon[],
    offMap: [] as { id: string; reason: "offMap" }[]
  };
  if (!pending.length || !doc.site) return out;
  const { bands, walls, ring } = vectorApproachBands(doc, { openWall: true });
  const finish = () => {
    out.offMap = pending
      .filter(r => !out.placed.includes(`urban:${r.id}`))
      .map(r => ({ id: r.id, reason: "offMap" as const }));
    return out;
  };
  if (!bands.length || !ring) return finish();
  const inside = insideWall ?? ((p: Point) => pointInPolygon(p, ring));
  const { occupied, protectedLand } = facilityLand(doc),
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface),
    water = allVectorWater(doc),
    half = doc.frame.extentMeters / 2,
    taken: VectorPolygon[] = [],
    centres: Point[] = [];
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

  const place = (request: BVFacilityRequest, start: number): boolean => {
    const asset = request.asset,
      entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
      outer = asset.footprint[0]?.outer;
    if (!entrance || !outer) return false;
    const o = entrance.outward,
      oLen = Math.hypot(o[0], o[1]) || 1,
      // From the footprint's centre to its gate side, along the gate's outward direction.
      reachToGate = Math.max(...outer.map(p => (p[0] * o[0] + p[1] * o[1]) / oLen));
    for (let k = 0; k < bands.length; k++) {
      const band = bands[(start + k) % bands.length],
        path = doc.paths[band.groupId];
      if (!path) continue;
      const line = band.points,
        halfRoad = Math.max(path.width.leftMeters, path.width.rightMeters),
        along = [0];
      for (let i = 1; i < line.length; i++)
        along.push(along[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const from = band.clearance + band.length + PAST_HOUSES_METERS;
      for (let s = from; s <= along.at(-1)!; s += STEP_METERS) {
        const i = Math.max(
          1,
          along.findIndex(a => a >= s)
        );
        if (i >= line.length) break;
        const a = line[i - 1],
          b = line[i],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
          t = (s - along[i - 1]) / len,
          at: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        for (const side of [1, -1] as const) {
          const n: Point = [-u[1] * side, u[0] * side],
            off = halfRoad + SETBACK_METERS + reachToGate,
            centre: Point = [at[0] + n[0] * off, at[1] + n[1] * off];
          if (inside(centre) || centres.some(c => Math.hypot(c[0] - centre[0], c[1] - centre[1]) < APART_METERS))
            continue;
          // The gate toward the road: turn the plan so its outward direction is -n.
          const angle = Math.atan2(-n[1], -n[0]) - Math.atan2(o[1], o[0]),
            c = Math.cos(angle),
            sn = Math.sin(angle),
            transform = (p: Point): Point => [p[0] * c - p[1] * sn + centre[0], p[0] * sn + p[1] * c + centre[1]];
          const xs = outer.map(p => p[0]),
            ys = outer.map(p => p[1]),
            m = SITE_MARGIN_METERS,
            yard = (
              [
                [Math.min(...xs) - m, Math.min(...ys) - m],
                [Math.max(...xs) + m, Math.min(...ys) - m],
                [Math.max(...xs) + m, Math.max(...ys) + m],
                [Math.min(...xs) - m, Math.max(...ys) + m]
              ] as Point[]
            ).map(transform),
            door = transform(entrance.point),
            // The lane from the gate to just short of the road's edge.
            mouth: Point = [door[0] - n[0] * (SETBACK_METERS - 0.3), door[1] - n[1] * (SETBACK_METERS - 0.3)],
            w: Point = [u[0] * (LANE_METERS / 2), u[1] * (LANE_METERS / 2)],
            lane: Point[] = [
              [door[0] - w[0], door[1] - w[1]],
              [door[0] + w[0], door[1] + w[1]],
              [mouth[0] + w[0], mouth[1] + w[1]],
              [mouth[0] - w[0], mouth[1] - w[1]]
            ],
            joined = regionBoolean([{ outer: yard, holes: [] }], [{ outer: lane, holes: [] }], "union");
          if (joined.length !== 1 || joined[0].holes.length) continue;
          const site = joined[0];
          if (
            site.outer.some(inside) ||
            site.outer.some(p => walls.some(wl => nearestOnPolyline(p, wl).dist < band.clearance)) ||
            !clear(site)
          )
            continue;
          const anchor = nearestRoadAnchor(path, mouth),
            end = evaluateAnchor(path, anchor),
            reach = Math.hypot(end[0] - door[0], end[1] - door[1]);
          if (reach < 0.01) continue;
          let id = `urban:${request.id}`;
          while (doc.placements[id]) id += "x";
          doc.placements[id] = {
            id,
            modelId: asset.bvModel!.id,
            position: centre,
            facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
            origin: "automatic",
            editPolicy: "editable",
            site,
            accesses: [anchor],
            building: {
              kind: "facility",
              label: asset.name,
              districtId: "edge-works",
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
          centres.push(centre);
          out.placed.push(id);
          return true;
        }
      }
    }
    return false;
  };
  // Round the roads in turn, so the works spread out of every gate.
  for (const [k, request] of pending.entries()) place(request, k);

  // Their ground joins the town's land, as the ropewalks' does; one whose ground will not join it is taken to lie
  // beyond the map like the rest.
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
    doc.site.domain.splice(0, doc.site.domain.length, ...grown);
    out.placed = kept;
  }
  out.sites = out.placed.map(id => doc.placements[id].site);
  return finish();
}
