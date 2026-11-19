import {
  OPUS_ROPEWALK,
  OPUS_ROPEWALK_LENGTHS,
  type OpusRopewalkLength,
  opusRopewalkEntrance,
  opusRopewalkModelId
} from "../../../../buildings/medieval/opusTradeProfiles";
import type { LandmarkAsset } from "../../../types/document";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { bvFacilityAsset } from "../../bvFacilityAsset";
import { facilityUseOf } from "../../facilityUses";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon } from "../../geom";
import { evaluateAnchor, pathIsClosed } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { facilityLand } from "./facilityLots";
import { vectorApproachBands } from "./suburbs";

const ROPEWALK_MODEL = opusRopewalkModelId(OPUS_ROPEWALK.depth);
/** The walk lies behind the row of plots facing the road (their inns and shops keep the frontage), this far off the
 * road's edge; a lane this wide runs from the road past its head to its door. Its site keeps this much round it. */
const FRONT_ROW_METERS = 24;
const LANE_METERS = 3;
const SITE_MARGIN_METERS = 0.3;
/** The walk starts at least this far out along the road from where it leaves the wall (past the gate's own ground),
 * and never on the glacis. */
const GATE_CLEAR_METERS = 12;
/** Starts tried along a road, this far apart; the road under the walk, or the wall beside it, may bow this much off
 * its chord. */
const STEP_METERS = 4;
const STRAIGHT_METERS = 1;
/** The longest walk a town lays (docs/plan/ce-outskirts-workshop-sizes.md §8.9): a port's for ships' cables as at
 * Hamburg, an inland town's as long as Hebert's common walk. */
const PORT_LONGEST: OpusRopewalkLength = 300;
const INLAND_LONGEST: OpusRopewalkLength = 180;

/** Whether a request is a ropewalk's (laid beside the roads, not on lots or plots). */
export const isRopewalk = (r: BVFacilityRequest) => r.asset.bvModel?.id === ROPEWALK_MODEL;

/** A walk that fits: where it stands, its ground (walk and lane) and the road its lane meets. */
interface Fit {
  length: OpusRopewalkLength;
  centre: Point;
  /** Turn of the model's plan: its door end (local -Y) toward the head. */
  angle: number;
  transform: (p: Point) => Point;
  site: VectorPolygon;
  path: VectorPath;
  /** Where the lane meets the road, in the walk's own plan. */
  mouth: Point;
}

/** A walk's frame: centred at `centre`, its head (the door end, local -Y) toward `head`. */
function walkFrame(centre: Point, head: Point) {
  const angle = Math.atan2(head[1], head[0]) - Math.atan2(-1, 0),
    c = Math.cos(angle),
    sn = Math.sin(angle);
  return {
    angle,
    transform: (p: Point): Point => [p[0] * c - p[1] * sn + centre[0], p[0] * sn + p[1] * c + centre[1]]
  };
}

/** Distances along a polyline. */
function chainage(line: readonly Point[]) {
  const along = [0];
  for (let i = 1; i < line.length; i++)
    along.push(along[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return along;
}

/** Whether the line between `a` and `b` (both at chainage) keeps within STRAIGHT_METERS of the chord. */
function straightBetween(
  line: readonly Point[],
  along: readonly number[],
  from: number,
  to: number,
  a: Point,
  b: Point
) {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]),
    u: Point = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
  return !line.some(
    (p, i) =>
      along[i] > from && along[i] < to && Math.abs((p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]) > STRAIGHT_METERS
  );
}

/**
 * Straight runs of a closed wall ring (each side of a polygonal wall): from a corner, as far as the wall keeps within
 * STRAIGHT_METERS of the chord.
 */
function wallRuns(ring: Point[]): { a: Point; b: Point }[] {
  const n = ring.length;
  if (n < 3) return [];
  // Start at the sharpest corner so no run wraps round it.
  const turn = (i: number) => {
    const p = ring[(i - 1 + n) % n],
      q = ring[i],
      r = ring[(i + 1) % n];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]),
      b = Math.atan2(r[1] - q[1], r[0] - q[0]);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  };
  let start = 0;
  for (let i = 1; i < n; i++) if (turn(i) > turn(start)) start = i;
  const loop = [...ring.slice(start), ...ring.slice(0, start), ring[start]];
  const runs: { a: Point; b: Point }[] = [];
  let i = 0;
  while (i < loop.length - 1) {
    let j = i + 1;
    while (j + 1 < loop.length) {
      const a = loop[i],
        b = loop[j + 1],
        chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (chord < 1e-6) break;
      const u: Point = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
      if (loop.slice(i + 1, j + 1).some(p => Math.abs((p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]) > STRAIGHT_METERS))
        break;
      j++;
    }
    runs.push({ a: loop[i], b: loop[j] });
    i = j;
  }
  return runs;
}

/**
 * Ropewalks out of the gates (docs/plan/ce-outskirts-workshop-sizes.md S1, §8.2, §8.9): the rope-makers worked a long
 * straight walk on the edge of town, as Bridport's walks ran down the long gardens behind the houses of its streets.
 * Each walk is laid as long as the ground allows, up to a port's 300 m or an inland town's 180 m, down to the 54 m of
 * the original plot:
 * 1. parallel to a straight stretch of an approach road, on either side, behind the row of plots facing it, its head
 *    (the hemp house and its door) toward the gate, a lane from the road past its head to the door;
 * 2. failing that, along a straight side of the wall beyond its glacis (as Sandwich's Ropewalk follows the town's
 *    rampart), its head toward an approach road that crosses its line, a lane from that road to its door;
 * 3. failing both, not at all: the request is left unplaced, never put on a lot or plot.
 * Clear of the roads, the wall, water and land already taken, nearest the gate first. Laid before the street plan like
 * the tanners' row, so the streets and lots keep off it and its lane.
 */
export function reserveRopewalks(
  doc: VectorCityDocument,
  requests: readonly BVFacilityRequest[],
  /** Inside the town wall. */
  inside: (p: Point) => boolean
): { placed: string[]; sites: VectorPolygon[]; unplaced: { id: string; reason: "space" }[] } {
  const pending = requests.filter(isRopewalk);
  const out = {
    placed: [] as string[],
    sites: [] as VectorPolygon[],
    unplaced: [] as { id: string; reason: "space" }[]
  };
  if (!pending.length || !doc.site) return out;
  const { bands, walls } = vectorApproachBands(doc);
  if (!bands.length) return out;
  const { occupied, protectedLand } = facilityLand(doc),
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface),
    water = allVectorWater(doc),
    half = doc.frame.extentMeters / 2,
    taken: VectorPolygon[] = [],
    width = OPUS_ROPEWALK.width,
    longest = doc.site.descriptor?.burg.port ? PORT_LONGEST : INLAND_LONGEST,
    lengths = OPUS_ROPEWALK_LENGTHS.filter(l => l <= longest).sort((a, b) => b - a),
    glacis = Math.max(...bands.map(b => b.clearance));
  const assets = new Map<OpusRopewalkLength, LandmarkAsset>();
  const assetOf = (length: OpusRopewalkLength) => {
    let asset = assets.get(length);
    if (!asset) {
      asset = bvFacilityAsset(opusRopewalkModelId(length), [opusRopewalkEntrance(length)]);
      assets.set(length, asset);
    }
    return asset;
  };
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
  /** The walk's rectangle (with its margin) joined to its lane (in its own plan), if the ground is clear. */
  const ground = (
    length: number,
    transform: (p: Point) => Point,
    lane: Point[],
    clearance: number
  ): VectorPolygon | undefined => {
    const m = SITE_MARGIN_METERS,
      rect = (
        [
          [-width / 2 - m, -length / 2 - m],
          [width / 2 + m, -length / 2 - m],
          [width / 2 + m, length / 2 + m],
          [-width / 2 - m, length / 2 + m]
        ] as Point[]
      ).map(transform),
      joined = regionBoolean([{ outer: rect, holes: [] }], [{ outer: lane.map(transform), holes: [] }], "union");
    if (joined.length !== 1 || joined[0].holes.length) return undefined;
    const site = joined[0];
    if (
      site.outer.some(inside) ||
      site.outer.some(p => walls.some(w => nearestOnPolyline(p, w).dist < clearance)) ||
      !clear(site)
    )
      return undefined;
    return site;
  };

  /** Beside an approach road, behind the plots facing it. */
  const besideRoad = (length: OpusRopewalkLength): Fit | undefined => {
    for (const band of bands) {
      const path = doc.paths[band.groupId];
      if (!path) continue;
      const line = band.points,
        halfRoad = Math.max(path.width.leftMeters, path.width.rightMeters),
        along = chainage(line);
      const at = (s: number): Point => {
        const i = Math.max(
          1,
          along.findIndex(a => a >= s)
        );
        const t = (s - along[i - 1]) / Math.max(1e-9, along[i] - along[i - 1]);
        return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
      };
      // Past the glacis the wall keeps clear (the band's clearance), as the roadside houses are.
      const from = Math.max(GATE_CLEAR_METERS, band.clearance);
      for (let s = from; s + length <= along.at(-1)!; s += STEP_METERS) {
        const a = at(s),
          b = at(s + length),
          chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (chord < length - 0.5 || !straightBetween(line, along, s, s + length, a, b)) continue;
        const u: Point = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
        for (const side of [1, -1] as const) {
          const n: Point = [-u[1] * side, u[0] * side],
            off = halfRoad + FRONT_ROW_METERS + width / 2,
            centre: Point = [(a[0] + b[0]) / 2 + n[0] * off, (a[1] + b[1]) / 2 + n[1] * off];
          if (inside(centre)) continue;
          // The head toward the gate: the model's door end (local plan -Y) points back along the road.
          const { angle, transform } = walkFrame(centre, [-u[0], -u[1]]);
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
            ).map(([x, y]): Point => [x * side, y]),
            site = ground(length, transform, lane, band.clearance);
          if (site)
            return {
              length,
              centre,
              angle,
              transform,
              site,
              path,
              mouth: [toRoad * side, -length / 2 - LANE_METERS / 2]
            };
        }
      }
    }
    return undefined;
  };

  // The wall's sides, and the approach roads that may lead a lane to a walk along them.
  const outerWall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner")),
    runs = outerWall ? wallRuns(samplePath(outerWall).map(s => s.point)) : [],
    centre0 = doc.site.center;
  /** Along a straight side of the wall beyond the glacis, its head toward an approach road crossing its line. */
  const alongWall = (length: OpusRopewalkLength): Fit | undefined => {
    for (const run of runs) {
      const side = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
      if (side < length) continue;
      const u: Point = [(run.b[0] - run.a[0]) / side, (run.b[1] - run.a[1]) / side];
      let n: Point = [-u[1], u[0]];
      const mid: Point = [(run.a[0] + run.b[0]) / 2, (run.a[1] + run.b[1]) / 2];
      if ((mid[0] - centre0[0]) * n[0] + (mid[1] - centre0[1]) * n[1] < 0) n = [-n[0], -n[1]];
      // The walk's axis: parallel to the side, its near edge just beyond the glacis.
      const d = glacis + SITE_MARGIN_METERS + width / 2 + 0.5,
        base: Point = [run.a[0] + n[0] * d, run.a[1] + n[1] * d];
      for (const band of bands) {
        const path = doc.paths[band.groupId];
        if (!path) continue;
        const halfRoad = Math.max(path.width.leftMeters, path.width.rightMeters),
          line = band.points;
        for (let i = 1; i < line.length; i++) {
          // Where the road crosses the axis: base + u t = p + (q - p) r.
          const p = line[i - 1],
            q = line[i],
            e: Point = [q[0] - p[0], q[1] - p[1]],
            den = u[0] * -e[1] + u[1] * e[0];
          if (Math.abs(den) < 1e-9) continue;
          const w: Point = [p[0] - base[0], p[1] - base[1]],
            t = (w[0] * -e[1] + w[1] * e[0]) / den,
            r = (w[0] * -u[1] + w[1] * u[0]) / den;
          if (r < 0 || r > 1) continue;
          // The road's width and the plots facing it, measured along the slant of the axis.
          const sin = Math.abs(u[0] * e[1] - u[1] * e[0]) / Math.hypot(e[0], e[1]);
          if (sin < 0.5) continue;
          // The lane stops short of the road where its nearer corner meets the slanting edge.
          const cos = Math.sqrt(Math.max(0, 1 - sin * sin)),
            gap = (halfRoad + FRONT_ROW_METERS) / sin,
            toRoad = FRONT_ROW_METERS / sin - ((LANE_METERS / 2) * cos) / sin - SITE_MARGIN_METERS;
          for (const dir of [1, -1] as const) {
            // The walk keeps beside the side it follows.
            const near = t + dir * gap,
              far = t + dir * (gap + length);
            if (Math.min(near, far) < 0 || Math.max(near, far) > side) continue;
            const mid = t + dir * (gap + length / 2),
              centre: Point = [base[0] + u[0] * mid, base[1] + u[1] * mid];
            if (inside(centre)) continue;
            const { angle, transform } = walkFrame(centre, [-u[0] * dir, -u[1] * dir]);
            // The lane runs on from the head along the walk's line to the road.
            const lane: Point[] = [
                [-LANE_METERS / 2, -length / 2 - toRoad],
                [LANE_METERS / 2, -length / 2 - toRoad],
                [LANE_METERS / 2, -length / 2],
                [-LANE_METERS / 2, -length / 2]
              ],
              site = ground(length, transform, lane, glacis);
            if (site) return { length, centre, angle, transform, site, path, mouth: [0, -length / 2 - toRoad] };
          }
        }
      }
    }
    return undefined;
  };

  const place = (request: BVFacilityRequest, fit: Fit): boolean => {
    const asset = assetOf(fit.length),
      entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
      door = fit.transform(entrance.point),
      // Joined to the road at the lane's mouth.
      anchor = nearestRoadAnchor(fit.path, fit.transform(fit.mouth)),
      end = evaluateAnchor(fit.path, anchor),
      reach = Math.hypot(end[0] - door[0], end[1] - door[1]);
    if (reach < 0.01 || !pointInPolygon(door, fit.site.outer)) return false;
    let id = `urban:${request.id}`;
    while (doc.placements[id]) id += "x";
    doc.placements[id] = {
      id,
      modelId: opusRopewalkModelId(fit.length),
      position: fit.centre,
      facingDegrees: ((((fit.angle * 180) / Math.PI) % 360) + 360) % 360,
      origin: "automatic",
      editPolicy: "editable",
      site: fit.site,
      accesses: [anchor],
      building: {
        kind: "facility",
        label: asset.name,
        districtId: "ropewalks",
        provenance: "bv",
        dimensionSource: asset.dimensionSource ?? "Provisional dimensions",
        heightMeters: asset.bvModel?.heightMeters ?? 6,
        footprint: asset.footprint.map(p => ({ outer: p.outer.map(fit.transform), holes: [] })),
        reserved: [fit.site],
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
    taken.push(fit.site);
    out.placed.push(id);
    out.sites.push(fit.site);
    return true;
  };

  // Each walk as long as it will go: beside a road at any length first, then along the wall.
  for (const request of pending)
    for (const find of [besideRoad, alongWall]) {
      let done = false;
      for (const length of lengths) {
        const fit = find(length);
        if (fit && place(request, fit)) {
          done = true;
          break;
        }
      }
      if (done) break;
    }

  // The walks' ground joins the town's land, as the tanners' row's does (`reserveTanneryRow`): one whose ground will
  // not join it simply is given up, and its request left unplaced.
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
  // A walk is never put on a lot or plot: one with no ground of its own is left unplaced.
  out.unplaced = pending.filter(r => !out.placed.includes(`urban:${r.id}`)).map(r => ({ id: r.id, reason: "space" }));
  return out;
}
