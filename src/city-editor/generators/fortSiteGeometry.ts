import { bridgeSkewDegrees, resolveBridgeSkewLimit, withinBridgeSkewLimit } from "../../utils/bridgeSkewPolicy";
import type { CityDocument, Point } from "../types/document";
import type { FortSite } from "../types/fortSite";
import { fortSiteTerrainFeatures } from "./fortSiteTerrain";
import { nearestOnPolyline, polygonArea } from "./geom";
import { bounds, boundsOverlap, subtractConvex } from "./parcelGeometry";
import { evaluateTerrainFeatures } from "./terrainModel";

export const FORT_CIRCLE_SEGMENTS = 64;
export function fortCircle(center: Point, radius: number, count = FORT_CIRCLE_SEGMENTS): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * Math.PI * 2) / count;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius] as Point;
  });
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A flat summit, an explicit slope and excavations over the original, unmodified cells. */
export function fortHeight(site: FortSite, point: Point): number {
  return evaluateTerrainFeatures(fortSiteTerrainFeatures(site), () => site.groundElevationMeters, point);
}

/** Disjoint water polygons: union the annuli, subtract the two dry islands. */
export function fortWaterPolygons(
  site: FortSite
): Array<{ moatId: string; polygon: Point[]; elevationMeters: number }> {
  const result: Array<{ moatId: string; polygon: Point[]; elevationMeters: number }> = [];
  const islands = [
    fortCircle(site.motte.center, site.motte.baseRadiusMeters),
    fortCircle(site.bailey.center, site.bailey.radiusMeters)
  ];
  for (const moat of site.moats) {
    const waterDepth = site.waterElevationMeters - site.groundElevationMeters + moat.depthMeters;
    if (waterDepth <= 0) continue;
    // The trapezoid bank reaches this horizontal water level at a narrower radius.
    const half = (moat.widthMeters / 2) * (1 - 0.35 * (1 - Math.min(1, waterDepth / moat.depthMeters)));
    const outer = fortCircle(moat.center, moat.radiusMeters + half),
      inner = fortCircle(moat.center, moat.radiusMeters - half);
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      let pieces: Point[][] = [[outer[i], outer[j], inner[j], inner[i]]];
      const cutters = [...islands, ...result.map(item => item.polygon)];
      for (const cutter of cutters) {
        const box = bounds(cutter);
        pieces = pieces.flatMap(piece =>
          boundsOverlap(bounds(piece), box) ? subtractConvex(piece, cutter, 1e-5) : [piece]
        );
        if (!pieces.length) break;
      }
      for (const polygon of pieces)
        result.push({ moatId: moat.id, polygon, elevationMeters: site.waterElevationMeters });
    }
  }
  return result;
}

/** Closed fence intervals omit a real opening for every associated gate. */
export function fortDefenseRuns(site: FortSite, defense: FortSite["defenses"][number]): Point[][] {
  const gates = site.gates.filter(gate => gate.defenseId === defense.id);
  const cuts = gates.map(gate => ({
    angle: (gate.angleRadians + Math.PI * 2) % (Math.PI * 2),
    half: gate.widthMeters / (2 * defense.radiusMeters)
  }));
  const angles = Array.from({ length: FORT_CIRCLE_SEGMENTS + 1 }, (_, i) => (i * Math.PI * 2) / FORT_CIRCLE_SEGMENTS);
  for (const cut of cuts)
    for (const sign of [-1, 1]) angles.push((cut.angle + sign * cut.half + Math.PI * 2) % (Math.PI * 2));
  angles.sort((a, b) => a - b);
  const runs: Point[][] = [];
  let run: Point[] = [];
  const point = (angle: number): Point => [
    defense.center[0] + Math.cos(angle) * defense.radiusMeters,
    defense.center[1] + Math.sin(angle) * defense.radiusMeters
  ];
  for (let i = 0; i < angles.length - 1; i++) {
    const middle = (angles[i] + angles[i + 1]) / 2;
    const blocked = cuts.some(
      cut => Math.abs(Math.atan2(Math.sin(middle - cut.angle), Math.cos(middle - cut.angle))) < cut.half
    );
    if (blocked) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      if (!run.length) run.push(point(angles[i]));
      run.push(point(angles[i + 1]));
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

export function fortBridgeSkew(site: FortSite, route: FortSite["routes"][number]): number {
  if (route.points.length !== 2) return Infinity;
  const [a, b] = route.points,
    middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const moat = site.moats.reduce(
    (best, item) =>
      Math.abs(distance(middle, item.center) - item.radiusMeters) <
      Math.abs(distance(middle, best.center) - best.radiusMeters)
        ? item
        : best,
    site.moats[0]
  );
  if (!moat) return Infinity;
  const axis: Point = [b[0] - a[0], b[1] - a[1]],
    normal: Point = [middle[0] - moat.center[0], middle[1] - moat.center[1]];
  return bridgeSkewDegrees(axis, [-normal[1], normal[0]]);
}

export function validateFortSite(document: CityDocument): string[] {
  const site = document.fortSite;
  if (site === undefined) return [];
  if (!site || typeof site !== "object") return ["Invalid fort site"];
  const errors: string[] = [];
  const point = (p: Point) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  if (
    site.version !== 1 ||
    !point(site.motte?.center) ||
    !point(site.bailey?.center) ||
    !positive(site.motte?.summitRadiusMeters) ||
    !positive(site.motte.baseRadiusMeters) ||
    !(site.motte.baseRadiusMeters > site.motte.summitRadiusMeters) ||
    !positive(site.motte.heightMeters) ||
    !positive(site.bailey.radiusMeters) ||
    !Number.isFinite(site.groundElevationMeters) ||
    !Number.isFinite(site.bailey.elevationMeters) ||
    !Number.isFinite(site.waterElevationMeters) ||
    site.waterElevationMeters > site.groundElevationMeters ||
    !Array.isArray(site.moats) ||
    !Array.isArray(site.defenses) ||
    !Array.isArray(site.gates) ||
    !Array.isArray(site.routes) ||
    !Array.isArray(site.buildings) ||
    !Array.isArray(site.junctions)
  )
    return ["Invalid fort site"];
  const ids = [
    site.id,
    ...site.moats.map(x => x.id),
    ...site.defenses.map(x => x.id),
    ...site.gates.map(x => x.id),
    ...site.routes.map(x => x.id),
    ...site.junctions.map(x => x.id)
  ];
  if (ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) errors.push("Duplicate fort ID");
  for (const moat of site.moats)
    if (
      !point(moat.center) ||
      !positive(moat.radiusMeters) ||
      !positive(moat.widthMeters) ||
      moat.widthMeters >= 2 * moat.radiusMeters ||
      !positive(moat.depthMeters)
    )
      errors.push(`Invalid moat ${moat.id}`);
  for (const defense of site.defenses)
    if (
      !point(defense.center) ||
      !positive(defense.radiusMeters) ||
      !positive(defense.heightMeters) ||
      !positive(defense.widthMeters)
    )
      errors.push(`Invalid defense ${defense.id}`);
  for (const gate of site.gates)
    if (
      !site.defenses.some(d => d.id === gate.defenseId) ||
      !Number.isFinite(gate.angleRadians) ||
      !positive(gate.widthMeters) ||
      !positive(gate.heightMeters)
    )
      errors.push(`Invalid gate ${gate.id}`);
  for (const node of site.junctions)
    if (!point(node.point) || !Number.isFinite(node.elevationMeters)) errors.push(`Invalid fort junction ${node.id}`);
  for (const item of [...site.moats, ...site.defenses])
    if (
      Math.abs(item.center[0]) + item.radiusMeters + item.widthMeters / 2 > document.frame.extentMeters / 2 ||
      Math.abs(item.center[1]) + item.radiusMeters + item.widthMeters / 2 > document.frame.extentMeters / 2
    )
      errors.push(`Fort component outside frame ${item.id}`);
  const castle = document.castles?.find(c => c.id === site.castleId);
  const parts = castle?.parts ?? [];
  const endpoints = new Set([...site.gates.map(g => g.id), ...parts.map(p => p.id), ...site.junctions.map(j => j.id)]);
  const routeNodes = fortRouteNodes(document);
  for (const route of site.routes) {
    if (
      !["path", "bridge", "stairs"].includes(route.kind) ||
      route.points.length < 2 ||
      !route.points.every(point) ||
      route.elevationsMeters.length !== route.points.length ||
      !route.elevationsMeters.every(Number.isFinite) ||
      !positive(route.widthMeters) ||
      !endpoints.has(route.from) ||
      !endpoints.has(route.to)
    )
      errors.push(`Invalid route ${route.id}`);
    const start = routeNodes.get(route.from),
      end = routeNodes.get(route.to);
    if (start && end && (distance(start, route.points[0]) > 0.02 || distance(end, route.points.at(-1)!) > 0.02))
      errors.push(`Disconnected route ${route.id}`);
    if (
      route.kind === "bridge" &&
      site.moats.length &&
      !withinBridgeSkewLimit(
        fortBridgeSkew(site, route),
        resolveBridgeSkewLimit(
          document.historicalPeriod,
          { maxBridgeSkewDegrees: document.maxBridgeSkewDegrees },
          "timber"
        )
      )
    )
      errors.push(`Skewed fort bridge ${route.id}`);
  }
  for (const building of site.buildings)
    if (
      !parts.some(p => p.id === building.partId) ||
      !positive(building.heightMeters) ||
      !["stone", "wood"].includes(building.material) ||
      !["flat", "gable"].includes(building.roof) ||
      !["keep", "hall", "chapel", "kitchen", "barracks", "blacksmith", "workshop", "stables", "stores"].includes(
        building.use
      ) ||
      (building.cornerTowerHeightMeters !== undefined && !positive(building.cornerTowerHeightMeters))
    )
      errors.push(`Invalid fort building ${building.partId}`);
  if (castle)
    for (const part of parts) {
      if (!site.buildings.some(b => b.partId === part.id)) errors.push(`Missing fort building ${part.id}`);
      const route = site.routes.find(r => r.to === part.id);
      if (route && !part.entrances.some(p => nearestOnPolyline(p, route.points).dist < 0.02))
        errors.push(`Invalid fort entrance ${part.id}`);
      if (
        part.role === "keep" &&
        part.footprint.some(p => distance(p, site.motte.center) > site.motte.summitRadiusMeters - 0.5)
      )
        errors.push(`Keep outside summit ${part.id}`);
      if (Math.abs(polygonArea(part.footprint)) < 20) errors.push(`Invalid fort footprint ${part.id}`);
    }
  return errors;
}

/** Named, position-checked endpoints make the assembly traversable rather than merely touching in a drawing. */
export function fortRouteNodes(document: CityDocument): Map<string, Point> {
  const site = document.fortSite,
    nodes = new Map<string, Point>();
  if (!site) return nodes;
  for (const node of site.junctions) nodes.set(node.id, node.point);
  for (const gate of site.gates) {
    const defense = site.defenses.find(d => d.id === gate.defenseId);
    if (defense)
      nodes.set(gate.id, [
        defense.center[0] + Math.cos(gate.angleRadians) * defense.radiusMeters,
        defense.center[1] + Math.sin(gate.angleRadians) * defense.radiusMeters
      ]);
  }
  for (const part of document.castles?.find(c => c.id === site.castleId)?.parts ?? [])
    if (part.entrances[0]) nodes.set(part.id, part.entrances[0]);
  return nodes;
}

/** Deliberate route deletion is editable; generation uses this audit to require a connected initial fort. */
export function auditFortAccess(document: CityDocument): string[] {
  const site = document.fortSite;
  if (!site) return [];
  const nodes = fortRouteNodes(document),
    graph = new Map<string, Set<string>>();
  for (const route of site.routes) {
    const on = [...nodes].filter(([, p]) => nearestOnPolyline(p, route.points).dist < 0.02).map(([id]) => id);
    for (const id of on) {
      const adjacent = graph.get(id) ?? new Set<string>();
      for (const other of on) adjacent.add(other);
      graph.set(id, adjacent);
    }
  }
  const seen = new Set(["fort:world"]),
    queue = ["fort:world"];
  for (const id of queue)
    for (const next of graph.get(id) ?? [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return (document.castles?.find(c => c.id === site.castleId)?.parts ?? [])
    .filter(part => !seen.has(part.id))
    .map(part => `Unreachable fort building ${part.id}`);
}

/** Scaling the map changes plan geometry; elevations retain their authored physical levels. */
export function scaleFortSite(site: FortSite, factor: number): void {
  const point = (p: [number, number]): [number, number] => [p[0] * factor, p[1] * factor];
  site.motte.center = point(site.motte.center);
  site.motte.summitRadiusMeters *= factor;
  site.motte.baseRadiusMeters *= factor;
  site.bailey.center = point(site.bailey.center);
  site.bailey.radiusMeters *= factor;
  for (const item of [...site.moats, ...site.defenses]) {
    item.center = point(item.center);
    item.radiusMeters *= factor;
    item.widthMeters *= factor;
  }
  for (const gate of site.gates) gate.widthMeters *= factor;
  for (const node of site.junctions) node.point = point(node.point);
  for (const route of site.routes) {
    route.points = route.points.map(point);
    route.widthMeters *= factor;
  }
}
