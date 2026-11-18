import RBush from "rbush";
import { streetHouseKind } from "../../../../buildings/medieval/streetHouses";
import { growthRandom } from "../../../../utils/urbanMorphology";
import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { BVFacilityRequest } from "../../allocateBVFacilities";
import { facilityUseOf } from "../../facilityUses";
import { convexHull, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { evaluateAnchor } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { simpleContour, surfacesOverlap } from "../geometry/surfaces";
import { connectTanneryRow, type FacilityLotResult, facilityLand, facilityLines, isWetTannery } from "./facilityLots";
import type { VectorPerimeterPlan } from "./perimeter";
import { waterDistance } from "./urbanPacking";
import { fittedWorkhomeAsset, type WorkhomeFit } from "./workhomeAssets";

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (ring: Point[], pad = 0): Box => ({
  minX: Math.min(...ring.map(p => p[0])) - pad,
  minY: Math.min(...ring.map(p => p[1])) - pad,
  maxX: Math.max(...ring.map(p => p[0])) + pad,
  maxY: Math.max(...ring.map(p => p[1])) + pad
});

/** Plots a facility may join (docs/plan/ce-burgage-plot-fabric.md §5.5, R3): the sources show one and a half to two;
 * three is the game's allowance, four for the large halls and inns. */
const MAX_PLOTS = 3;
const MAX_PLOTS_LARGE = 4;
/** A plot's front lies this close to the street, lane or road it faces. */
const FRONT_METERS = 6;
/** Fronts this close end to end are neighbours on one row; a binaire venelle (0.4 m) between two heads is too. */
const NEIGHBOUR_METERS = 0.6;
/** Seeds tried per facility before it is reported as finding no room. */
const SEEDS_PER_REQUEST = 300;
/** The building stands this far behind its front, as on compact lots. */
const FRONT_SETBACK_METERS = 0.05;
/** On dense burgage a facility's parcel ends this far behind its building; the rest of its plots builds over. */
const DENSE_FACILITY_COURT_METERS = 4;

/** Share of a plot's place in the facilities' order given by its distance from the centre, as for houses. */
const CENTRE_WEIGHT = 0.6;

const isLarge = (request: BVFacilityRequest) => /:(guild|inn|hall)/.test(request.id);

interface Plot {
  i: number;
  cellId: string;
  ring: Point[];
  kind: "plot" | "head" | "row";
  /** Front from `a` to `b` along its row's direction. */
  a: Point;
  b: Point;
  frontage: number;
  depth: number;
  centroid: Point;
  core: boolean;
  draw: number;
  /** The line the front faces. */
  line: number;
  row: number;
  /** Position along the row. */
  at: number;
}

/**
 * Population facilities on burgage plots (plan §5.5): a facility takes a run of one to three neighbouring plots of
 * one row, its building at the run's front and the rest of the plots its yard. No row gives facilities more than
 * half its plots (a binaire block's two heads both, its houses staying), so no street block becomes facilities
 * alone. A facility deeper than the plots, or wider than the run allowed, is reported as `plot`.
 */
export function placeFacilitiesOnPlots(
  doc: VectorCityDocument,
  plan: VectorPerimeterPlan,
  requests: readonly BVFacilityRequest[],
  inside: (p: Point) => boolean,
  /** Yards of the tanners' row, reserved before the street plan (`reserveTanneryRow`). */
  rowIds: readonly string[] = [],
  /** Street blocks kept free of facilities: a park ward becomes the park's lawn after the houses. */
  barredCell: (cellId: string) => boolean = () => false
): FacilityLotResult {
  const result: FacilityLotResult = { placed: [], unplaced: [], cells: new Set() };
  if (!requests.length || !doc.site) return result;
  const center = doc.site.center;
  const { lines, lineIndex, surfaceOf } = facilityLines(doc, plan),
    { occupied, protectedLand } = facilityLand(doc);
  const tanners = connectTanneryRow(doc, rowIds, { lines, lineIndex, surfaceOf });
  result.placed.push(...tanners.placed);
  result.unplaced.push(...tanners.unplaced);

  const plots = layPlots(plan, lines, lineIndex, inside);
  // Houses fill the plots nearest the centre first (`placeVectorPerimeterHouses`); facilities follow the same order,
  // so a workshop does not stand alone in a street block whose houses the town never needed.
  const reach = Math.max(1, ...plots.map(p => Math.hypot(p.centroid[0] - center[0], p.centroid[1] - center[1])));
  for (const p of plots)
    p.draw =
      (1 - CENTRE_WEIGHT) * p.draw +
      CENTRE_WEIGHT * Math.min(1, Math.hypot(p.centroid[0] - center[0], p.centroid[1] - center[1]) / reach);
  const rows = new Map<number, Plot[]>();
  for (const p of plots) rows.set(p.row, [...(rows.get(p.row) ?? []), p]);
  for (const row of rows.values()) row.sort((p, q) => p.at - q.at);
  const used = new Set<number>(plots.filter(p => barredCell(p.cellId)).map(p => p.i));
  const takenInRow = new Map<number, number>();
  const takenInCell = new Map<string, number>();
  const cellPlots = new Map<string, number>();
  for (const p of plots) cellPlots.set(p.cellId, (cellPlots.get(p.cellId) ?? 0) + 1);
  /** Plots of a row facilities may still take. */
  // Burgage keeps half of every row and street block for houses. Dense burgage (plan §8.7) packs workshops closer, as
  // a walled town's crafts streets were: a row keeps at least one house plot, and a street block a third of its plots,
  // so no facility, nor any group of them, takes a street block whole.
  // Binaire blocks are dense already; dense burgage changes only the strip plots.
  const dense = plan.plotFabric === "burgage-dense",
    binaireCells = new Set(plots.filter(p => p.kind !== "plot").map(p => p.cellId));
  const rowRoom = (row: Plot[]) => {
    const heads = row.every(p => p.kind === "head"),
      taken = takenInRow.get(row[0].row) ?? 0;
    if (heads) return row.length - taken;
    return dense ? row.length - 1 - taken : Math.floor(row.length / 2) - taken;
  };
  const cellRoom = (cellId: string) =>
    Math.floor(
      ((cellPlots.get(cellId) ?? 0) * (dense && !binaireCells.has(cellId) ? 2 : 1)) /
        (dense && !binaireCells.has(cellId) ? 3 : 2)
    ) - (takenInCell.get(cellId) ?? 0);
  const water = new Map<number, number>();
  const waterOf = (p: Plot) => {
    let d = water.get(p.i);
    if (d === undefined) {
      d = waterDistance(doc, [{ outer: p.ring, holes: [] }]);
      water.set(p.i, d);
    }
    return d;
  };
  const facilityRows = new Set<number>();
  /** Binaire houses of each street block, behind its heads. */
  const cellHouses = new Map<string, Plot[]>();
  for (const p of plots) if (p.kind === "row") cellHouses.set(p.cellId, [...(cellHouses.get(p.cellId) ?? []), p]);
  /** Whether a street or lane of the plan runs into the parcel, on the line surfaces the records keep. */
  const crossesLine = (site: VectorPolygon) =>
    lineIndex.search(boxOf(site.outer, 4)).some(item => {
      const line = lines[item.k];
      if (!line.fabric) return false;
      const surface = surfaceOf(item.k);
      return !!surface && regionBoolean([site], [surface], "intersection").some(r => regionArea(r) > 1e-6);
    });

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
      commerce = facilityUseOf(request) === "commerce",
      // Dense burgage halves the plots, so a facility may join twice as many; runs are tried fewest plots first, so it
      // never takes more than its building needs.
      limit = (isLarge(request) ? MAX_PLOTS_LARGE : MAX_PLOTS) * (dense ? 2 : 1);
    const seeds = plots
      .filter(p => !used.has(p.i) && p.core !== outskirts && p.kind !== "row")
      // Rows and street blocks already holding their share of facilities give no seed.
      .filter(p => rowRoom(rows.get(p.row)!) >= 1 && cellRoom(p.cellId) >= 1)
      .filter(p => !wantsWater || waterOf(p) <= request.riverbankMaxDistanceMeters! + 30)
      .map(p => ({ p, near: wantsWater || commerce ? 0 : facilityRows.has(p.row) ? 0 : 1 }))
      .sort(
        ({ p: a, near: na }, { p: b, near: nb }) =>
          na - nb ||
          (wantsWater
            ? waterOf(a) - waterOf(b)
            : commerce
              ? Math.hypot(a.centroid[0] - center[0], a.centroid[1] - center[1]) -
                Math.hypot(b.centroid[0] - center[0], b.centroid[1] - center[1])
              : a.draw - b.draw)
      )
      .map(({ p }) => p)
      .slice(0, SEEDS_PER_REQUEST);
    // A trade workhome is built to its plot (docs/plan/bv-workhome-facade-variation.md W4): one plot, its frontage
    // the building's, its door on its own side. Runs of more plots are for a plot too narrow for a shop-house. A
    // guild house (W5b) is a town house of one plot or two.
    const kind = request.asset.bvModel && streetHouseKind(request.asset.bvModel.id),
      workhome = !!kind,
      mirror = growthRandom(`workhome-door:${request.id}`) < 0.5;
    let placement: VectorPlacement | undefined,
      run: Plot[] | undefined,
      fit: WorkhomeFit | undefined,
      sized = false;
    for (const seed of seeds) {
      const row = rows.get(seed.row)!,
        room = Math.min(limit, rowRoom(row), cellRoom(seed.cellId));
      if (room < 1) continue;
      const k = row.indexOf(seed);
      // Runs holding the seed, fewest plots first, the seed at their start first.
      for (let n = 1; !placement && n <= room; n++)
        for (let start = k; !placement && start > k - n; start--) {
          if (start < 0 || start + n > row.length) continue;
          const candidate = row.slice(start, start + n);
          if (candidate.some(p => used.has(p.i) || p.kind === "row")) continue;
          const fitted = workhome
            ? fittedWorkhomeAsset(
                request.asset,
                Math.hypot(candidate.at(-1)!.b[0] - candidate[0].a[0], candidate.at(-1)!.b[1] - candidate[0].a[1]),
                Math.min(...candidate.map(p => p.depth)),
                mirror
              )
            : undefined;
          if (workhome && !fitted) continue;
          const asked = fitted ? { ...request, asset: fitted.asset } : request;
          let taken = candidate,
            laid = layFacility(
              doc,
              asked,
              fitted ? fitted.asset.entrances[0] : entrance,
              candidate,
              [],
              lines,
              wantsWater,
              dense && candidate.every(p => p.kind === "plot")
            );
          // A facility deeper than a binaire block's heads takes the houses behind them too, as a head house of two
          // parcels did (plan §5.7).
          if (laid && "deep" in laid && candidate.length === row.length && candidate.every(p => p.kind === "head")) {
            const behind = housesBehind(candidate, cellHouses.get(seed.cellId) ?? [], used, laid.deep);
            if (behind.length && cellRoom(seed.cellId) >= candidate.length + behind.length) {
              laid = layFacility(doc, request, entrance, candidate, behind, lines, wantsWater);
              taken = [...candidate, ...behind];
            }
          }
          if (laid && "deep" in laid) continue;
          sized = true;
          if (!laid) continue;
          if (
            occupied
              .search(boxOf(laid.site.outer))
              .some(o => regionBoolean([laid.site], [o.polygon], "intersection").some(r => regionArea(r) > 1e-5)) ||
            protectedLand.search(boxOf(laid.site.outer, 1e-6)).some(o => surfacesOverlap(laid.site, o.polygon)) ||
            crossesLine(laid.site) ||
            (wantsWater && waterDistance(doc, [laid.site]) > request.riverbankMaxDistanceMeters!)
          )
            continue;
          placement = laid;
          run = taken;
          fit = fitted?.fit;
        }
      if (placement) break;
    }
    if (placement && run) {
      // The plot-fitted envelope and door side; `dressWorkhomes` gives the rest of the street front.
      if (fit)
        placement.exterior =
          kind === "guild-house"
            ? { culture: "northern-urban", entranceFace: "gable", storeys: 3, door: "closed", shade: 1, ...fit }
            : {
                culture: "atlantic",
                entranceFace: "eave",
                storeys: 2,
                shop: "open",
                door: "closed",
                sign: "board",
                shade: 1,
                ...fit
              };
      doc.placements[placement.id] = placement;
      for (const p of run) used.add(p.i);
      takenInRow.set(run[0].row, (takenInRow.get(run[0].row) ?? 0) + run.length);
      takenInCell.set(run[0].cellId, (takenInCell.get(run[0].cellId) ?? 0) + run.length);
      facilityRows.add(run[0].row);
      occupied.insert({ ...boxOf(placement.site.outer), polygon: placement.site });
      result.cells.add(run[0].cellId);
      result.placed.push(placement.id);
    } else
      result.unplaced.push({
        id: request.id,
        reason:
          wantsWater && !seeds.length
            ? "river"
            : outskirts && !seeds.length
              ? "district"
              : seeds.length && !sized
                ? "plot"
                : "space"
      });
  }
  return result;
}

/** Binaire houses behind a block's heads, as far back as `deep` from the heads' front. */
function housesBehind(heads: Plot[], houses: Plot[], used: ReadonlySet<number>, deep: number): Plot[] {
  const a = heads[0].a,
    b = heads.at(-1)!.b,
    length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    v = inwardOf(heads[0].ring, a, u);
  return houses.filter(house => {
    if (used.has(house.i)) return false;
    const along = house.ring.map(q => (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1]),
      depth = house.ring.map(q => (q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]);
    return (
      Math.min(...along) >= -NEIGHBOUR_METERS &&
      Math.max(...along) <= length + NEIGHBOUR_METERS &&
      Math.min(...depth) >= 0 &&
      Math.min(...depth) < deep + 0.1
    );
  });
}

/** The plan's plots with the line each faces, joined into rows of neighbours along one front. */
function layPlots(
  plan: VectorPerimeterPlan,
  lines: ReturnType<typeof facilityLines>["lines"],
  lineIndex: ReturnType<typeof facilityLines>["lineIndex"],
  inside: (p: Point) => boolean
): Plot[] {
  const plots: Plot[] = [];
  for (const d of plan.districts)
    for (const c of d.cells)
      for (const p of c.plots ?? []) {
        const [a, b] = p.front,
          mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let best: { k: number; d: number } | undefined;
        for (const item of lineIndex.search(boxOf([mid], FRONT_METERS))) {
          const hit = nearestOnPolyline(mid, lines[item.k].points);
          if (!best || hit.dist < best.d) best = { k: item.k, d: hit.dist };
        }
        if (!best || best.d > FRONT_METERS) continue;
        const frontage = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (frontage < 1e-6) continue;
        const u: Point = [(b[0] - a[0]) / frontage, (b[1] - a[1]) / frontage],
          v = inwardOf(p.ring, a, u);
        plots.push({
          i: plots.length,
          cellId: c.id,
          ring: p.ring,
          kind: p.kind,
          a,
          b,
          frontage,
          depth: Math.max(...p.ring.map(q => (q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1])),
          centroid: polygonCentroid(p.ring),
          core: inside(polygonCentroid(p.ring)),
          draw: growthRandom(JSON.stringify(p.front)),
          line: best.k,
          row: -1,
          at: 0
        });
      }
  // Neighbours: one street block, one line, parallel fronts meeting end to end.
  const index = new RBush<Box & { i: number }>();
  index.load(plots.map(p => ({ ...boxOf([p.a, p.b], NEIGHBOUR_METERS), i: p.i })));
  const parent = plots.map(p => p.i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const p of plots)
    for (const item of index.search(boxOf([p.a, p.b], NEIGHBOUR_METERS))) {
      const q = plots[item.i];
      if (q.i <= p.i || q.cellId !== p.cellId || q.line !== p.line) continue;
      const u: Point = [(p.b[0] - p.a[0]) / p.frontage, (p.b[1] - p.a[1]) / p.frontage],
        w: Point = [(q.b[0] - q.a[0]) / q.frontage, (q.b[1] - q.a[1]) / q.frontage];
      if (Math.abs(u[0] * w[1] - u[1] * w[0]) > 0.05) continue;
      const meet = [p.a, p.b].some(e => [q.a, q.b].some(f => Math.hypot(e[0] - f[0], e[1] - f[1]) <= NEIGHBOUR_METERS));
      if (meet) parent[find(q.i)] = find(p.i);
    }
  for (const p of plots) p.row = find(p.i);
  // Order each row along its first plot's front, and turn every front that way.
  const first = new Map<number, Plot>();
  for (const p of plots) if (!first.has(p.row)) first.set(p.row, p);
  for (const p of plots) {
    const f = first.get(p.row)!,
      u: Point = [(f.b[0] - f.a[0]) / f.frontage, (f.b[1] - f.a[1]) / f.frontage];
    if ((p.b[0] - p.a[0]) * u[0] + (p.b[1] - p.a[1]) * u[1] < 0) [p.a, p.b] = [p.b, p.a];
    p.at = (p.a[0] - f.a[0]) * u[0] + (p.a[1] - f.a[1]) * u[1];
  }
  return plots;
}

function inwardOf(ring: Point[], a: Point, u: Point): Point {
  const c = polygonCentroid(ring);
  const v: Point = [-u[1], u[0]];
  return (c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] >= 0 ? v : [-v[0], -v[1]];
}

/** The facility on a run of plots: its building at the run's front, the plots its parcel. Its width and depth when the
 * building is wider than the run's front or, with no plots behind, deeper than its shallowest plot. */
function layFacility(
  doc: VectorCityDocument,
  request: BVFacilityRequest,
  entrance: BVFacilityRequest["asset"]["entrances"][number],
  run: Plot[],
  /** Plots behind the run that join its parcel (binaire houses behind the heads). */
  behind: Plot[],
  lines: ReturnType<typeof facilityLines>["lines"],
  wantsWater: boolean,
  /** Dense burgage: the parcel ends a court behind the building, and the plots' backs stay for rear houses. */
  shallowParcel = false
): VectorPlacement | { wide: number; deep: number } | undefined {
  const asset = request.asset,
    a = run[0].a,
    b = run.at(-1)!.b,
    length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.5) return;
  const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    inward = inwardOf(run[0].ring, a, tangent);
  const angle = Math.atan2(-inward[1], -inward[0]) - Math.atan2(entrance.outward[1], entrance.outward[0]),
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotate = (p: Point): Point => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const local = convexHull(asset.minimumSite.flatMap(p => p.outer).map(rotate));
  const along = local.map(p => p[0] * tangent[0] + p[1] * tangent[1]),
    depthOf = local.map(p => p[0] * inward[0] + p[1] * inward[1]),
    lo = Math.min(...along),
    hi = Math.max(...along),
    back = Math.min(...depthOf),
    deep = Math.max(...depthOf) - back;
  if (
    hi - lo > length - 0.1 ||
    (!behind.length && deep + FRONT_SETBACK_METERS > Math.min(...run.map(p => p.depth)) - 0.1)
  )
    return { wide: hi - lo, deep: deep + FRONT_SETBACK_METERS };
  const offset = (length - (hi - lo)) / 2,
    translation: Point = [
      a[0] + tangent[0] * (offset - lo) + inward[0] * (FRONT_SETBACK_METERS - back),
      a[1] + tangent[1] * (offset - lo) + inward[1] * (FRONT_SETBACK_METERS - back)
    ],
    transform = (p: Point): Point => {
      const q = rotate(p);
      return [q[0] + translation[0], q[1] + translation[1]];
    };
  // The parcel is the plots whole. Two binaire heads stand either side of the venelle, which the parcel closes over.
  let site: VectorPolygon | undefined;
  try {
    const union = regionBoolean(
      [...run, ...behind].map(p => ({ outer: p.ring, holes: [] })),
      [],
      "union"
    );
    if (union.length === 1 && !union[0].holes.length && simpleContour(union[0].outer, true)) site = union[0];
  } catch {
    site = undefined;
  }
  // Only binaire parcels stand apart (across the venelle); strip plots that do not join make no parcel.
  if (!site) {
    if (!run.some(p => p.kind === "head")) return;
    const all = [...run, ...behind],
      hull = convexHull(all.flatMap(p => p.ring)),
      area = all.reduce((n, p) => n + Math.abs(polygonArea(p.ring)), 0);
    if (Math.abs(polygonArea(hull)) > area * 1.08) return;
    site = { outer: hull, holes: [] };
  }
  if (shallowParcel && !behind.length) {
    // The run's front strip as deep as the building and its court; the parcel is the plots cut there (plan §8.7).
    const cut = deep + FRONT_SETBACK_METERS + DENSE_FACILITY_COURT_METERS,
      reach = length + 2;
    if (cut < Math.min(...run.map(p => p.depth)) - DENSE_FACILITY_COURT_METERS) {
      const band: Point[] = [
        [a[0] - tangent[0] - inward[0], a[1] - tangent[1] - inward[1]],
        [a[0] + tangent[0] * reach - inward[0], a[1] + tangent[1] * reach - inward[1]],
        [a[0] + tangent[0] * reach + inward[0] * cut, a[1] + tangent[1] * reach + inward[1] * cut],
        [a[0] - tangent[0] + inward[0] * cut, a[1] - tangent[1] + inward[1] * cut]
      ];
      try {
        const front = regionBoolean([site], [{ outer: band, holes: [] }], "intersection");
        if (front.length === 1 && !front[0].holes.length && simpleContour(front[0].outer, true)) site = front[0];
      } catch {
        // the whole plots
      }
    }
  }
  const footprint = asset.footprint.map(p => ({
    outer: p.outer.map(transform),
    holes: p.holes.map(h => h.map(transform))
  }));
  if (regionBoolean(footprint, [site], "difference").some(r => regionArea(r) > 1e-5)) return;
  // The door on the front, joined to the line the plots face.
  const door = transform(entrance.point),
    line = lines[run[0].line],
    hit = nearestOnPolyline(door, line.points);
  let end = hit.point,
    access: CurveAnchor | undefined;
  if (line.road) {
    access = nearestRoadAnchor(doc.paths[line.road], door);
    end = evaluateAnchor(doc.paths[line.road], access);
  }
  let point = door;
  if (!pointInPolygon(point, site.outer)) {
    const inner: Point = [door[0] + inward[0] * 0.3, door[1] + inward[1] * 0.3];
    if (!pointInPolygon(inner, site.outer)) return;
    point = inner;
  }
  const reach = Math.hypot(end[0] - point[0], end[1] - point[1]);
  if (reach < 0.01) return;
  let id = `urban:${request.id}`;
  while (doc.placements[id]) id += "x";
  return {
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
      districtId: run[0].cellId,
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
}
