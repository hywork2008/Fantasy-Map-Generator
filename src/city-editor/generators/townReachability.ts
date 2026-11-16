import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { CityDocument, Point } from "../types/document";
import { circuitRing, outerTownCircuit } from "./fortifications";
import { convexHull, pointInPolygon, polygonArea } from "./geom";
import { facePoints } from "./mesh";
import { regionalCoastalWaterPolygons } from "./regionalCoast";
import { flowingRivers } from "./riverFlow";

/** Ground cleared round a gate beyond the wall's own width, so the gate links both sides. */
const GATE_LINK_METERS = 3;
/** Width of an imported FMG bridge deck when the crossing carries none. */
const BRIDGE_DECK_METERS = 6;

/** Land reached from the town centre: polygons (outer ring first, then holes); undefined means all of it. */
export type ReachableLand = MultiPolygon | undefined;

const close = (ring: Point[]): [number, number][] => {
  const r = ring.map(p => [p[0], p[1]] as [number, number]);
  return r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r;
};

/** A segment `width` wide with squared ends half a width long, so consecutive pieces overlap at a bend. */
function band(a: Point, b: Point, width: number): Polygon | undefined {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 1e-6 || width <= 0) return undefined;
  const h = width / 2,
    u: Point = [((b[0] - a[0]) / l) * h, ((b[1] - a[1]) / l) * h],
    n: Point = [-u[1], u[0]];
  return [
    close([
      [a[0] - u[0] + n[0], a[1] - u[1] + n[1]],
      [b[0] + u[0] + n[0], b[1] + u[1] + n[1]],
      [b[0] + u[0] - n[0], b[1] + u[1] - n[1]],
      [a[0] - u[0] - n[0], a[1] - u[1] - n[1]]
    ])
  ];
}

const line = (points: Point[], width: number): Polygon[] =>
  points.slice(1).flatMap((b, i) => {
    const piece = band(points[i], b, width);
    return piece ? [piece] : [];
  });

const disc = (c: Point, r: number, n = 16): Polygon => [
  close(
    Array.from(
      { length: n },
      (_, i): Point => [c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r]
    )
  )
];

const inPiece = (p: Point, piece: Polygon) =>
  pointInPolygon(p, piece[0] as Point[]) && !piece.slice(1).some(h => pointInPolygon(p, h as Point[]));

/**
 * The piece of `frame - barriers + links` that holds `centre` (pre-acceptance U5): a gateless wall or an unbridged
 * river cuts the land; only roads, bridges and gates (the links) join it again. Ferries are not links: a far bank
 * reached only by ferry is not reached. A clipping failure on both tries gives undefined: nothing is held back.
 */
export function reachableLand(half: number, barriers: Polygon[], links: Polygon[], centre: Point): ReachableLand {
  if (!barriers.length) return undefined;
  const frame: Polygon = [
    close([
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ])
  ];
  const run = (snap: (polygons: Polygon[]) => Polygon[]) => {
    const [f] = snap([frame]),
      cut = polygonClipping.difference(f, ...snap(barriers));
    return links.length ? polygonClipping.intersection(polygonClipping.union(cut, ...snap(links)), f) : cut;
  };
  let joined: MultiPolygon;
  try {
    joined = run(p => p);
  } catch {
    // The sweep kernel can lose an almost coincident edge (a road along a wall): retry on a centimetre lattice.
    try {
      joined = run(polygons => polygons.map(poly => poly.map(r => r.map(([x, y]) => [snapCm(x), snapCm(y)]))));
    } catch {
      return undefined;
    }
  }
  const home = joined.filter(piece => inPiece(centre, piece));
  return home.length ? home : undefined;
}

const snapCm = (v: number) => Math.round(v * 100) / 100;

/** Whether a footprint lies wholly on the reachable land (true when nothing cuts the frame). */
export function onReachableLand(reach: ReachableLand, footprint: Point[]): boolean {
  if (!reach) return true;
  let outside: MultiPolygon;
  try {
    outside = polygonClipping.difference([close(footprint)], reach);
  } catch {
    return footprint.every(p => pointOnReachableLand(reach, p));
  }
  return outside.reduce((n, piece) => n + Math.abs(polygonArea(piece[0] as Point[])), 0) < 0.5;
}

/** Whether a point stands on the reachable land (true when nothing cuts the frame). */
export const pointOnReachableLand = (reach: ReachableLand, p: Point): boolean =>
  !reach || reach.some(piece => inPiece(p, piece));

const meshCache = new WeakMap<CityDocument, { key: string; reach: ReachableLand }>();

/**
 * The land a carter reaches from the town centre on a mesh town (pre-acceptance U5): the frame without its water
 * (water faces, surveyed and regional water, river channels) and its walls, joined again by the roads, the imported
 * bridges and the gates. The town inside its circuit (or its built-up core) counts as one: its own streets cross it.
 */
export function meshReachableLand(document: CityDocument): ReachableLand {
  const key = `${Object.keys(document.mesh.faces).length}:${Object.keys(document.mesh.edges).length}:${document.featureGroups.map(g => ("segments" in g ? g.segments.length : g.vertices.length)).join(",")}:${(document.gates ?? []).map(g => g.vertexId).join(",")}`,
    cached = meshCache.get(document);
  if (cached?.key === key) return cached.reach;
  const v = (id: string) => document.mesh.vertices[id]?.point,
    edgeLine = (edgeId: string): Point[] => {
      const e = document.mesh.edges[edgeId],
        a = e && v(e.a),
        b = e && v(e.b);
      return a && b ? [a, b] : [];
    },
    barriers: Polygon[] = [],
    links: Polygon[] = [];
  for (const face of Object.values(document.mesh.faces))
    if (face.properties.water !== "land") {
      const ring = facePoints(document.mesh, face);
      if (ring.length >= 3) barriers.push([close(ring)]);
    }
  for (const area of document.waterAreas ?? []) if (area.polygon.length >= 3) barriers.push([close(area.polygon)]);
  for (const ring of regionalCoastalWaterPolygons(document)) if (ring.length >= 3) barriers.push([close(ring)]);
  for (const river of flowingRivers(document)) barriers.push(...line(river.points, river.widthMeters || 12));
  let wallWidth = 0;
  for (const group of document.featureGroups) {
    if (group.kind === "wall") {
      wallWidth = Math.max(wallWidth, group.style.widthMeters);
      for (const s of group.segments) barriers.push(...line(edgeLine(s.edgeId), group.style.widthMeters));
    } else if (group.kind === "road")
      for (const s of group.segments) links.push(...line(edgeLine(s.edgeId), group.style.widthMeters));
  }
  const roadWidth = Math.max(4, ...document.featureGroups.filter(g => g.kind === "road").map(g => g.style.widthMeters));
  for (const road of document.frameRoads ?? [])
    for (const piece of road.pieces) links.push(...line(piece.points, roadWidth));
  for (const c of document.riverConnections ?? [])
    links.push(...line(c.townRoad, roadWidth), ...line(c.farRoad, roadWidth));
  for (const crossing of document.importedFixedCrossings?.crossings ?? [])
    links.push(...line([crossing.deckA as Point, crossing.deckB as Point], BRIDGE_DECK_METERS));
  for (const gate of document.gates ?? []) {
    const p = v(gate.vertexId);
    if (p) links.push(disc(p, wallWidth + GATE_LINK_METERS));
  }
  const circuit = outerTownCircuit(document),
    ring = circuit ? circuitRing(document, circuit) : [],
    town =
      ring.length >= 3
        ? ring
        : convexHull(
            Object.values(document.mesh.faces)
              .filter(f => f.properties.water === "land" && f.properties.settlement === "core")
              .flatMap(f => facePoints(document.mesh, f))
          );
  let reach: ReachableLand;
  if (town.length < 3) reach = undefined;
  else {
    links.push([close(town)]);
    const c = town.reduce<Point>((s, p) => [s[0] + p[0] / town.length, s[1] + p[1] / town.length], [0, 0]);
    reach = reachableLand(document.frame.extentMeters / 2, barriers, links, c);
  }
  meshCache.set(document, { key, reach });
  return reach;
}
