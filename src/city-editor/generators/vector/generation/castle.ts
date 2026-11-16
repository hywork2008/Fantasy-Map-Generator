import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorFeature } from "../../../types/vector/environment";
import type { VectorGenerationSettings, VectorPolygon } from "../../../types/vector/generation";
import { buildFortressPlanOnRing } from "../../castleLayoutBuilder";
import { resolveCastleStyle } from "../../castlePatterns";
import { pointInPolygon } from "../../geom";
import { makeRng } from "../../prng";
import { featureReservations } from "../environmentState";
import { buildVectorFeature } from "../featureBuild";
import { evaluateAnchor } from "../geometry/curves";
import { distance } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";

export const CASTLE_SITE_ID = "castle-site";
export const CASTLE_FEATURE_ID = "feature:castle";
/** The mesh editor's castle moat (`circuits.ts`: 8 m). */
const CASTLE_MOAT_METERS = 8;
type CastleSize = "tiny" | "small" | "standard" | "large";
/** The mesh editor's target precinct per size (`castlePlacement.ts`). */
const TARGET_AREA: Record<CastleSize, number> = { tiny: 1800, small: 4000, standard: 9000, large: 18000 };

const square = (center: Point, side: number, angle: number): VectorPolygon => {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    outer: [
      [-side / 2, -side / 2],
      [side / 2, -side / 2],
      [side / 2, side / 2],
      [-side / 2, side / 2]
    ].map(([x, y]) => [center[0] + x * c - y * s, center[1] + x * s + y * c] as Point),
    holes: []
  };
};

/**
 * Reserve the castle precinct before the streets are routed, by the mesh editor's siting rules on the site
 * instead of its cells: size by the town radius (small at 120 m or less, else standard, stepping down when it
 * does not fit), position on the edge in 85% of towns and central otherwise, backed away from the approach roads
 * (the land front), inside the town wall and clear of water, roads, walls and the civic precinct. A detached
 * castle outside the town is not sited: the meshless site holds the town alone.
 */
export function reserveVectorCastle(doc: VectorCityDocument, settings: VectorGenerationSettings): boolean {
  const castle = settings.castle;
  if (!castle || !doc.site) return false;
  const hub = doc.site.center,
    radius = Math.max(...doc.site.domain.flatMap(d => d.outer.map(p => distance(p, hub)))),
    rng = makeRng(`${settings.seed}:castle:placement`),
    preferred = castle.position === "auto" ? (rng() < 0.85 ? "edge" : "central") : castle.position,
    positions = castle.position === "auto" ? [preferred, preferred === "edge" ? "central" : "edge"] : [preferred],
    size: CastleSize = castle.size === "auto" ? (radius <= 120 ? "small" : "standard") : castle.size,
    sizes: CastleSize[] =
      castle.size !== "auto" ? [size] : size === "standard" ? ["standard", "small", "tiny"] : [size, "tiny"];
  const roads = Object.values(doc.paths).filter(p => p.role === "road"),
    // The land front: the mean bearing of the approach roads' outer ends.
    front = roads.reduce<Point>(
      (sum, road) => {
        const points = samplePath(road).map(s => s.point),
          far = distance(points[0], hub) > distance(points.at(-1)!, hub) ? points[0] : points.at(-1)!,
          d = distance(far, hub) || 1;
        return [sum[0] + (far[0] - hub[0]) / d, sum[1] + (far[1] - hub[1]) / d];
      },
      [0, 0]
    ),
    walls = Object.values(doc.paths).filter(p => p.role === "wall"),
    outerWall = walls
      .map(w => samplePath(w).map(s => s.point))
      .sort((a, b) => Math.abs(regionArea({ outer: b, holes: [] })) - Math.abs(regionArea({ outer: a, holes: [] })))[0],
    blocked = [
      ...allVectorWater(doc),
      ...featureReservations(doc),
      ...vectorOccupiedSites(doc, "reserved"),
      ...walls.map(pathSurface),
      ...roads.map(pathSurface),
      ...Object.values(doc.regions).filter(r => r.kind === "reservation")
    ];
  const angles = Array.from({ length: 32 }, (_, i) => (i * Math.PI) / 16).sort(
    (a, b) => Math.cos(a) * front[0] + Math.sin(a) * front[1] - (Math.cos(b) * front[0] + Math.sin(b) * front[1])
  );
  for (const position of positions)
    for (const sz of sizes) {
      const side = Math.sqrt(TARGET_AREA[sz]),
        reaches =
          position === "edge"
            ? Array.from({ length: 12 }, (_, i) => radius - side * 0.75 - i * radius * 0.04)
            : Array.from({ length: 6 }, (_, i) => side * 0.6 + i * radius * 0.04);
      for (const reach of reaches)
        for (const angle of angles) {
          if (reach < side * 0.5) continue;
          const center: Point = [hub[0] + Math.cos(angle) * reach, hub[1] + Math.sin(angle) * reach],
            site = square(center, side, angle);
          if (
            site.outer.some(p => !containsRegion(doc.site!.domain, p)) ||
            (outerWall && site.outer.some(p => !pointInPolygon(p, outerWall))) ||
            regionBoolean([site], blocked, "intersection").some(r => regionArea(r) > 1e-5)
          )
            continue;
          doc.regions[CASTLE_SITE_ID] = { id: CASTLE_SITE_ID, kind: "reservation", ...site };
          return true;
        }
    }
  return false;
}

const BUILDING_HEIGHT: Record<string, number> = {
  main_keep: 24,
  small_keep: 16,
  great_hall: 12,
  palace_wing: 11,
  chapel: 14,
  barracks: 8,
  service: 7,
  watari_yagura: 9,
  tamon_yagura: 9
};

/**
 * Raise the castle on its reserved precinct once the streets exist (P4e): the curtain, gate, approach and moat
 * by the castle feature, and the works inside by the mesh editor's style builder on that curtain ring
 * (`buildFortressPlanOnRing`, style by period and culture as `resolveCastleStyle`). Its paths stay generated.
 */
export function raiseVectorCastle(doc: VectorCityDocument, settings: VectorGenerationSettings): VectorCityDocument {
  const site = doc.regions[CASTLE_SITE_ID];
  if (!site || !settings.castle) return doc;
  delete doc.regions[CASTLE_SITE_ID];
  const boundary: VectorPolygon = { outer: site.outer, holes: site.holes },
    center: Point = [
      site.outer.reduce((n, p) => n + p[0], 0) / site.outer.length,
      site.outer.reduce((n, p) => n + p[1], 0) / site.outer.length
    ],
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => ({ p, d: Math.min(...samplePath(p).map(s => distance(s.point, center))) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
  const origins = new Map(Object.values(doc.paths).map(p => [p.id, p.origin]));
  let built: VectorCityDocument | undefined;
  for (const { p } of roads)
    try {
      built = buildVectorFeature(
        doc,
        {
          kind: "castle",
          boundary,
          roadId: p.id,
          density: 0,
          heightMeters: BUILDING_HEIGHT.main_keep,
          activity: "closed",
          culture: settings.wallMaterial === "wood" ? "timber" : "stone",
          moatWidthMeters: settings.castle.moat ? CASTLE_MOAT_METERS : 0
        },
        CASTLE_FEATURE_ID
      );
      break;
    } catch {
      // the next road
    }
  if (!built) return doc;
  // The feature marks what it touched as hand-made; here it is generation output.
  for (const path of Object.values(built.paths))
    if (path.id.startsWith(`${CASTLE_FEATURE_ID}:`)) path.origin = "automatic";
    else if (origins.has(path.id)) path.origin = origins.get(path.id)!;
  const feature = built.environment!.features[CASTLE_FEATURE_ID],
    curtain = built.paths[`${CASTLE_FEATURE_ID}:curtain`],
    gate = Object.values(built.connections.gates).find(g => g.wallPathId === curtain?.id);
  if (curtain && gate) {
    const ring = samplePath(curtain).map(s => s.point),
      plan = buildFortressPlanOnRing(
        distance(ring[0], ring.at(-1)!) < 1e-6 ? ring.slice(0, -1) : ring,
        evaluateAnchor(curtain, gate.anchor),
        castle(settings.castle.style, built)
      ),
      inside = (polygon: Point[]) => polygon.every(p => containsRegion([feature.boundary], p));
    const pieces: VectorFeature["pieces"] = [];
    const piece = (role: VectorFeature["pieces"][number]["role"], polygon: Point[], height: number, color: string) => {
      const ring = polygon.filter((p, i) => distance(p, polygon[(i + polygon.length - 1) % polygon.length]) > 1e-3);
      // Only simple footprints within the precinct are kept, as the document requires of every piece.
      if (ring.length >= 3 && ring.length <= 512 && simpleContour(ring, true) && inside(ring))
        pieces.push({
          id: `${CASTLE_FEATURE_ID}:piece:${pieces.length + 1}`,
          role,
          polygon: { outer: ring, holes: [] },
          heightMeters: height,
          color
        });
    };
    for (const c of plan.courtyards) piece("ground", c.polygon, 0.05, "#cfc3a8");
    let keepKept = false;
    for (const b of plan.buildings) {
      const before = pieces.length;
      piece("structure", b.polygon, BUILDING_HEIGHT[b.kind] ?? 9, "#8e887e");
      if (b.kind === "main_keep" && pieces.length > before) keepKept = true;
    }
    const beforeTowers = pieces.length;
    for (const t of plan.towers)
      piece(
        "structure",
        t.polygon ??
          Array.from({ length: 10 }, (_, i) => {
            const a = (i * Math.PI * 2) / 10,
              r = t.radius ?? 3;
            return [t.point[0] + Math.cos(a) * r, t.point[1] + Math.sin(a) * r] as Point;
          }),
        14,
        "#7f796f"
      );
    const towersKept = pieces.length - beforeTowers;
    for (const g of plan.defensiveGates) if (g.polygon) piece("structure", g.polygon, 11, "#7f796f");
    // The feature's corner towers stand where the style draws none; its plain keep gives way to the style's.
    const [plainKeep, ...corners] = feature.pieces.filter(p => p.role === "structure");
    if (!towersKept)
      for (const c of corners) pieces.push({ ...c, id: `${CASTLE_FEATURE_ID}:piece:${pieces.length + 1}` });
    if (!keepKept && plainKeep) pieces.push({ ...plainKeep, id: `${CASTLE_FEATURE_ID}:piece:${pieces.length + 1}` });
    if (pieces.some(p => p.role === "structure")) feature.pieces = pieces;
  }
  return built;
}

function castle(style: string | undefined, doc: VectorCityDocument) {
  const civilization = doc.site?.descriptor?.civilization;
  return resolveCastleStyle(
    { historicalPeriod: doc.context.historicalPeriod, civilization, burialProfile: undefined },
    style ? ({ castleStyle: style } as never) : null
  );
}
