import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { nearestOnPolyline, pointInPolygon, polygonCentroid, segmentsIntersect } from "../../geom";
import { buildPopulationFacilityRequests } from "../../populationFacilityRequests";
import { type ApproachBand, type SuburbanLotContext, suburbanLotKept, suburbanProfile } from "../../suburbanLanduse";
import { featureReservations } from "../environmentState";
import { pathIsClosed } from "../geometry/curves";
import { gateOpening } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** A road ending this close to the wall line ends at its gate. */
const GATE_METERS = 15;

/**
 * The approach land-use bands of a walled meshless town (P7a), by the mesh editor's rules (`suburbanProfile`): one
 * band per approach road beyond the wall, gate end first, profiled by its FMG traffic (trade from rank 0.5, else
 * rural) with the band's glacis clearance and ribbon length. Empty for an open town or one without approaches.
 */
export function vectorApproachBands(doc: VectorCityDocument): { bands: ApproachBand[]; walls: Point[][] } {
  const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => samplePath(p).map(s => s.point)),
    outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer) return { bands: [], walls };
  const ring = samplePath(outer).map(s => s.point),
    wallGap = (q: Point) => nearestOnPolyline(q, [...ring, ring[0]]).dist,
    roads = doc.site?.descriptor?.roads ?? [],
    owned = new Set(doc.urban?.ownedPaths ?? []);
  const bands = Object.values(doc.paths)
    .filter(p => p.role === "road" && !owned.has(p.id))
    .flatMap((p): ApproachBand[] => {
      let line = samplePath(p).map(s => s.point);
      if (!line.some(q => !pointInPolygon(q, ring))) return [];
      // Gate end first: the end inside the wall or nearest its line.
      const score = (q: Point) => (pointInPolygon(q, ring) ? -1 : wallGap(q));
      if (score(line.at(-1)!) < score(line[0])) line = [...line].reverse();
      if (score(line[0]) > GATE_METERS) return [];
      // The band starts at the gate: where the road leaves the wall, to within 2 m.
      line = line
        .slice(1)
        .flatMap((b, i): Point[] => {
          const a = line[i],
            n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          return Array.from(
            { length: n },
            (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
          );
        })
        .concat([line.at(-1)!]);
      const out = line.findIndex(q => !pointInPolygon(q, ring));
      if (out < 0) return [];
      line = line.slice(out);
      if (line.length < 2) return [];
      const i = roads.findIndex((r, k) => p.id === `fmg-road:${r.routeId}:${k}`),
        road = i >= 0 ? roads[i] : undefined,
        use =
          road && (road.traffic != null || road.trafficRank != null)
            ? { traffic: road.traffic ?? 0, trafficRank: road.trafficRank ?? 0, paved: road.group === "roads" }
            : null;
      return [{ groupId: p.id, points: line, ...suburbanProfile(undefined, doc.frame.extentMeters, true, use) }];
    });
  return { bands, walls };
}

/**
 * The lot test for houses beyond the wall (P7a): the mesh editor's roadside ribbon (`suburbanLotKept`) for land
 * outside the curtain, the glacis only for the shanty and for residential outskirts (asked for by `residential`
 * when the town inside the wall and the ribbon cannot house everyone, as the mesh editor opens its residential
 * outskirts as suburbs). Inside the wall, or in an open town, every
 * lot keeps its house. A town of an FMG burg with an urban-morphology profile grows by the mesh editor's other
 * system (`shapeUrbanGrowthFabric`), not ported yet, and keeps every lot too.
 */
export function vectorSuburbanLots(
  doc: VectorCityDocument,
  suburb: (cellId: string) => boolean
): (cellId: string, polygon: Point[], residential: boolean) => boolean {
  if (doc.site?.descriptor?.urbanMorphology) return () => true;
  const { bands, walls } = vectorApproachBands(doc);
  const outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer || !bands.length) return () => true;
  const ring = samplePath(outer).map(s => s.point),
    ctx: SuburbanLotContext = {
      bands,
      wallDistance: p => Math.min(...walls.map(w => nearestOnPolyline(p, w).dist)),
      slack: 0
    };
  return (cellId, polygon, residential) =>
    pointInPolygon(polygonCentroid(polygon), ring) ||
    suburbanLotKept(polygon, cellId, residential || suburb(cellId), ctx);
}

/** Half the width of the roadside ribbon land either side of its approach: one row of lots each side. */
const RIBBON_HALF_METERS = 28;
/** Dwellings a built-up roadside strip of one row each side holds per metre of road (gate-ribbon plan W0: street
 * blocks hold 0.017 dwellings per m², about 50 m² of blocks per metre of road). Provisional until measured on the
 * strips themselves. */
export const RIBBON_DWELLINGS_PER_METER = 0.85;
/** Interior dwellings per m² of free land inside the wall, every lot built, at the measured 2.25 storeys
 * (gate-ribbon plan W2, measured on the W0 cases). */
export const INTERIOR_DWELLINGS_PER_M2 = 0.016;
/** A strip this close to the river below the town is left to the yards that foul the water (tanneries). */
const DOWNSTREAM_METERS = 80;

/** Ground within `meters` of a wall line, as one piece per wall segment (each run on past its ends so the joins are
 * covered): a mitred offset of a bastioned or folded line would cross itself. */
export function wallBerm(line: Point[], meters: number, closed = true): VectorPolygon[] {
  // Pieces are left as they are: a union of hundreds of overlapping quads defeats the polygon kernel. A sampled
  // round wall is eased to metre accuracy first, which a berm of several metres does not notice.
  const eased = simplifyFreehand(closed ? [...line, line[0]] : line, 1);
  if (closed) eased.pop();
  const pieces: VectorPolygon[] = [];
  const n = closed ? eased.length : eased.length - 1;
  for (let i = 0; i < n; i++) {
    const a = eased[i],
      b = eased[(i + 1) % eased.length],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const u: Point = [((b[0] - a[0]) / l) * meters, ((b[1] - a[1]) / l) * meters],
      v: Point = [-u[1], u[0]];
    pieces.push({
      outer: [
        [a[0] - u[0] + v[0], a[1] - u[1] + v[1]],
        [b[0] + u[0] + v[0], b[1] + u[1] + v[1]],
        [b[0] + u[0] - v[0], b[1] + u[1] - v[1]],
        [a[0] - u[0] - v[0], a[1] - u[1] - v[1]]
      ],
      holes: []
    });
  }
  return pieces;
}

/** The town's interior: the domain inside the closed outer wall, with its gate openings. */
function outerWallRing(doc: VectorCityDocument): Point[] | undefined {
  const outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  return outer ? samplePath(outer).map(s => s.point) : undefined;
}

/**
 * Cut the site to the walled town (gate-ribbon plan W1): the round site the town was planned on keeps only the land
 * inside the outer wall, the ground already reserved beyond it (cemetery, castle, fortress works) and placements.
 * The ring between the round site and a narrower wall holds no street block; the town grows beyond the wall only
 * along the approaches (`raiseVectorShantyLand`, `raiseVectorRibbonLand`). An open sea wall keeps the land on the
 * town's side of its line. A town without a wall keeps its site.
 */
export function clipVectorDomainToWall(doc: VectorCityDocument): VectorCityDocument {
  const site = doc.site;
  if (!site) return doc;
  const walls = Object.values(doc.paths).filter(p => p.role === "wall" && !p.id.includes("inner"));
  if (!walls.length) return doc;
  const keep: VectorPolygon[] = [
    ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] })),
    ...featureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind === "reservation")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...Object.values(doc.placements).map(p => ({ outer: p.site.outer, holes: p.site.holes }))
  ];
  let inside: VectorPolygon[];
  const ring = outerWallRing(doc);
  if (ring) inside = [{ outer: ring, holes: [] }];
  else {
    // An open wall line ending at the shore: the pieces of the site it cuts off from the centre are outside.
    const lines = walls.map(w => samplePath(w).map(q => q.point)),
      crosses = (a: Point, b: Point) =>
        lines.some(line => line.slice(1).some((q, i) => segmentsIntersect(a, b, line[i], q)));
    inside = regionBoolean(
      site.domain,
      walls.map(w => pathSurface(w)),
      "difference"
    ).filter(piece => {
      const c = polygonCentroid(piece.outer);
      return !crosses(c, site.center);
    });
  }
  let domain: VectorPolygon[];
  try {
    domain = regionBoolean(
      regionBoolean(site.domain, inside, "intersection"),
      regionBoolean(site.domain, keep, "intersection"),
      "union"
    ).filter(r => regionArea(r) > 1);
  } catch {
    return doc;
  }
  if (!domain.length || !domain.every(p => simpleContour(p.outer, true) && p.holes.every(h => simpleContour(h, true))))
    return doc;
  return { ...doc, site: { ...site, domain } };
}

/** Free land inside the outer wall: the site there less water, reserved ground, placements and every path. */
export function vectorInteriorFreeM2(doc: VectorCityDocument): number {
  const ring = outerWallRing(doc),
    site = doc.site;
  if (!ring || !site) return 0;
  const obstacles: VectorPolygon[] = [
    ...allVectorWater(doc),
    ...featureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind === "reservation")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...Object.values(doc.placements).map(p => ({ outer: p.site.outer, holes: p.site.holes })),
    ...Object.values(doc.paths).flatMap(p => {
      try {
        return [pathSurface(p)];
      } catch {
        return [];
      }
    })
  ];
  try {
    return regionBoolean(
      regionBoolean(site.domain, [{ outer: ring, holes: [] }], "intersection"),
      obstacles,
      "difference"
    ).reduce((n, r) => n + regionArea(r), 0);
  } catch {
    return 0;
  }
}

/** Dwellings the town needs beyond its wall (gate-ribbon plan §3.3): what the free land inside the wall, every lot
 * built, falls short of the town's dwellings, with a tenth of the interior left for the vacancy CE draws spread. */
export function vectorRibbonShortfall(
  doc: VectorCityDocument,
  storeys: number,
  lotOccupancy = 1,
  /** Population facilities to come (facility mode): their sites inside the town and beyond it, in m². */
  facilities: VectorFacilityLand = NO_FACILITY_LAND
): { dwellings: number; riverside: number } {
  const site = doc.site;
  if (!site || !outerWallRing(doc)) return { dwellings: 0, riverside: 0 };
  const perM2 = INTERIOR_DWELLINGS_PER_M2 * (storeys / 2.25) * lotOccupancy,
    required = site.descriptor?.burg.dwellings ?? getUrbanDwellings(doc.context.targetPopulation ?? 0),
    interior = Math.max(0, vectorInteriorFreeM2(doc) - facilities.coreM2) * perM2 * 0.9;
  // The outskirts facilities stand beyond the wall whatever the interior holds; their land is counted as the
  // dwellings it would take on the roadside. Riverside works (tanneries, dyers) go to the strips below the town.
  return {
    dwellings: Math.max(0, Math.ceil(required - interior)) + Math.ceil(facilities.outskirtsM2 * perM2),
    riverside: Math.ceil(facilities.riversideM2 * perM2)
  };
}

export interface VectorFacilityLand {
  coreM2: number;
  outskirtsM2: number;
  riversideM2: number;
}
/** Parcel a facility takes per m² of its minimum site: its site runs out to the lot lines of every lot it touches
 * (measured 2026-11-11, 5,000 people, facility mode: 1.78). */
const FACILITY_PARCEL_FACTOR = 1.8;
const NO_FACILITY_LAND: VectorFacilityLand = { coreM2: 0, outskirtsM2: 0, riversideM2: 0 };

/** Sites of the population facilities a facility-mode town will raise, inside it, beyond it and beyond it on the
 * river, as the parcels they take on the CE lots. */
export function vectorFacilityLand(
  population: number,
  period: string,
  port: boolean,
  facilityLayout: string | undefined
): VectorFacilityLand {
  if (facilityLayout !== "population" || !population) return NO_FACILITY_LAND;
  const land = { coreM2: 0, outskirtsM2: 0, riversideM2: 0 };
  for (const r of buildPopulationFacilityRequests(population, { period, port }).requests) {
    const m2 =
      r.asset.minimumSite.reduce((n, p) => n + regionArea({ outer: p.outer, holes: [] }), 0) * FACILITY_PARCEL_FACTOR;
    if (r.zone !== "outskirts") land.coreM2 += m2;
    else if (r.riverbankMaxDistanceMeters !== undefined) land.riversideM2 += m2;
    else land.outskirtsM2 += m2;
  }
  return land;
}

/** Whether a band runs beside the river below the town: the run of each river after it last leaves the wall. */
function downstreamOf(doc: VectorCityDocument, ring: Point[]): (line: Point[]) => boolean {
  const runs = Object.values(doc.paths)
    .filter(p => p.role === "river" && !p.id.includes("moat"))
    .map(p => {
      const pts = samplePath(p).map(q => q.point),
        last = pts.reduce((k, q, i) => (pointInPolygon(q, ring) ? i : k), -1);
      return last < 0 ? [] : pts.slice(last + 1);
    })
    .filter(run => run.length > 1);
  return line => runs.some(run => line.some(q => nearestOnPolyline(q, run).dist < DOWNSTREAM_METERS));
}

/**
 * Land for the roadside ribbon of a walled town (P7a, gate-ribbon plan W2): a strip along each approach band from its
 * glacis clearance to the end of its ribbon, measured from the gate, as the mesh editor's outskirts cells hold them.
 * A frontier approach keeps none. The dwellings the interior cannot hold (`shortfall`) lengthen the strips by the
 * approaches' traffic; a strip beside the river below the town takes none of them (the tanneries' bank), and one
 * reaching the frame's edge widens to a second row instead. In the barbican era each lengthened strip keeps the
 * reach of a barbican to come. The strips start beyond the glacis, so they never join the town's land.
 */
export function raiseVectorRibbonLand(
  doc: VectorCityDocument,
  faubourgAdded: boolean,
  shortfall = 0,
  barbicanSlack = 0,
  /** Dwellings' worth of riverside works for the strips beside the river below the town. */
  riverside = 0
): { document: VectorCityDocument; unplacedLength: number } {
  const site = doc.site;
  const none = { document: doc, unplacedLength: 0 };
  if (!site) return none;
  const outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer) return none;
  void faubourgAdded;
  const ring = samplePath(outer).map(s => s.point);
  const half = doc.frame.extentMeters / 2 - 4,
    strips: VectorPolygon[] = [],
    roads = site.descriptor?.roads ?? [],
    downstream = downstreamOf(doc, ring);
  const bands = vectorApproachBands(doc).bands.filter(b => b.profile !== "frontier");
  const traffic = (id: string) => {
    const i = roads.findIndex((r, k) => id === `fmg-road:${r.routeId}:${k}`);
    return i >= 0 ? Math.max(0, roads[i].traffic ?? 0) : 0;
  };
  const takers = bands.filter(b => !downstream(b.points)),
    weights = takers.map(b => traffic(b.groupId) + 1),
    total = weights.reduce((n, w) => n + w, 0);
  // The river below the town takes the works that foul the water; without such a strip they share the others.
  const below = bands.filter(b => downstream(b.points)),
    banks = below.length ? below : takers;
  let unplacedLength = 0;
  for (const band of bands) {
    const k = takers.indexOf(band),
      extra =
        (k >= 0 && shortfall > 0 ? (shortfall * weights[k]) / total / RIBBON_DWELLINGS_PER_METER + barbicanSlack : 0) +
        (riverside > 0 && banks.includes(band) ? riverside / banks.length / RIBBON_DWELLINGS_PER_METER : 0);
    const gate = band.points[0],
      from = (q: Point) => Math.hypot(q[0] - gate[0], q[1] - gate[1]),
      // Every 5 m along the road, then the stretch the ribbon may hold.
      line = band.points.slice(1).flatMap((b, i): Point[] => {
        const a = band.points[i],
          n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        return Array.from(
          { length: n + 1 },
          (_, j): Point => [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]
        );
      }),
      inFrame = (q: Point) =>
        Math.abs(q[0]) <= half - RIBBON_HALF_METERS && Math.abs(q[1]) <= half - RIBBON_HALF_METERS,
      wanted = band.length + extra,
      run = line.filter(q => from(q) >= band.clearance && from(q) <= band.clearance + wanted && inFrame(q));
    if (run.length < 2) continue;
    // A strip the frame cuts short takes the rest of its length as a second row.
    const reach = Math.hypot(run.at(-1)![0] - run[0][0], run.at(-1)![1] - run[0][1]),
      rows = extra > 0 && reach < wanted * 0.95 ? 2 : 1;
    if (extra > 0 && reach * rows < wanted * 0.95) unplacedLength += wanted - reach * rows;
    // Straight pieces along the road's own bends, so a long ribbon follows the road.
    for (let i = 0; i + 1 < run.length; ) {
      let j = i + 1;
      while (j + 1 < run.length && nearestOnPolyline(run[j], [run[i], run[j + 1]]).dist < 3) j++;
      const a = run[i],
        b = run[j],
        l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l >= 10) {
        const w = RIBBON_HALF_METERS * rows,
          n: Point = [(-(b[1] - a[1]) / l) * w, ((b[0] - a[0]) / l) * w],
          // Pieces overlap a little at the bends so the strip stays one piece.
          t: Point = [((b[0] - a[0]) / l) * 2, ((b[1] - a[1]) / l) * 2],
          a2: Point = [a[0] - t[0], a[1] - t[1]],
          b2: Point = [b[0] + t[0], b[1] + t[1]];
        strips.push({
          outer: (
            [
              [a2[0] + n[0], a2[1] + n[1]],
              [b2[0] + n[0], b2[1] + n[1]],
              [b2[0] - n[0], b2[1] - n[1]],
              [a2[0] - n[0], a2[1] - n[1]]
            ] as Point[]
          ).map(([x, y]): Point => [Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, y))]),
          holes: []
        });
      }
      i = j;
    }
  }
  if (!strips.length) return { ...none, unplacedLength };
  const glacis = bands.length ? Math.min(...bands.map(b => b.clearance)) : 25;
  const land = regionBoolean(
    regionBoolean(strips, [], "union"),
    [
      ...allVectorWater(doc),
      ...featureReservations(doc),
      { outer: ring, holes: [] },
      // The glacis along the whole wall, not only before the gates.
      ...wallBerm(ring, glacis)
    ],
    "difference"
  ).filter(r => regionArea(r) > 200);
  if (!land.length) return { ...none, unplacedLength };
  const domain = regionBoolean(site.domain, land, "union");
  return domain.every(p => simpleContour(p.outer, true) && p.holes.every(h => simpleContour(h, true)))
    ? { document: { ...doc, site: { ...site, domain } }, unplacedLength }
    : { ...none, unplacedLength };
}
