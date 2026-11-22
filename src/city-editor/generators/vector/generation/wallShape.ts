import type { GenerationSettings, WallShape } from "../../../types/generation";
import type { HistoricalPeriod, Point } from "../../../types/primitives";
import type { VectorGenerationSettings } from "../../../types/vector/generation";
import { resolveEffectiveLayout } from "../../generation/settings";
import { bastionEra, resolveWallShape, unitWallShape } from "../../generation/skeleton/wallShapes";
import { polygonArea } from "../../geom";
import { makeRng } from "../../prng";
import { DEFAULT_INNER_WALLED_AREA_SHARE } from "../../settlementExtent";
import { portTargets } from "../../site/siteConfig";
import { unitBastionedTownArea } from "./bastions";
import { vectorCastleChoice } from "./castleChoice";

export const VECTOR_WALL_SHAPES: readonly WallShape[] = ["organic", "round", "oval", "square", "polygon", "bastioned"];
export const isVectorWallShape = (wall: string): wall is WallShape =>
  (VECTOR_WALL_SHAPES as readonly string[]).includes(wall);
/** Wall thickness of the mesh editor's wall styles (`edgeGroupStyle`). */
export const VECTOR_WALL_WIDTH_METERS = { stone: 4.5, wood: 2.4 } as const;
export const VECTOR_WALL_SIDES = { min: 3, max: 12 } as const;
/** Bastions a grown bastioned town may take: its fronts stay one gun range long however large the town. */
export const VECTOR_BASTION_COUNT_MAX = 48;
/** Longest front (salient to salient) of a bastioned wall: neighbouring bastions cover each other within a gun's
 * range. Palmanova was laid out from the 350 m effective range of its guns; Vauban's exterior side was 180 toises
 * (351 m). */
export const VECTOR_BASTION_FRONT_METERS = 350;

/**
 * The town wall the mesh editor's settings ask for (P4a). The skeleton-first shape families (`unitWallShape`) are
 * cell-free, so meshless draws the same outlines. `auto` resolves on the seed as the skeleton does: `bastioned`
 * only from the age of exploration. Material follows `resolveWallMaterial`: the choice, else stone from 1,500
 * people. Without town walls the city has none.
 */
export function vectorWallChoice(
  settings: Pick<
    GenerationSettings,
    | "config"
    | "wallShape"
    | "wallSides"
    | "population"
    | "descriptor"
    | "townWallRings"
    | "innerWallState"
    | "walledAreaShare"
    | "townWallBuildOrder"
    | "townFortification"
    | "moats"
    | "layout"
    | "castle"
    | "plotFabric"
  >,
  seed: string,
  period: HistoricalPeriod,
  /** The mesh editor's map extent: `auto` draws a concentric plan only on small maps (700 m or less). */
  extentMeters = 1200
): Pick<
  VectorGenerationSettings,
  "wall" | "wallSides" | "wallMaterial" | "innerWall" | "townMoat" | "layout" | "castle" | "port" | "wallCoast"
> {
  const resolved = resolveEffectiveLayout(settings.layout ?? settings.config.layout, extentMeters, seed),
    castle = vectorCastleChoice(settings),
    layout = {
      ...(resolved !== "organic" ? { layout: resolved } : {}),
      ...(castle ? { castle } : {}),
      ...(settings.config.features.port ? { port: true } : {})
    };
  // A roadside village is unwalled whatever the wall settings say (ce-meshless-roadside-burgage-village.md §4.3).
  if (settings.plotFabric === "burgage-village") return { wall: "none", ...layout };
  // A bastioned town brings its own trace as input geometry (P4c); the skeleton keeps it.
  if (settings.townFortification?.kind === "bastioned")
    return { wall: "none", ...(settings.config.features.port ? { port: true } : {}) };
  if (!settings.config.features.walls) return { wall: "none", ...layout };
  const rng = makeRng(`${seed}:vector-wall:choice`),
    wall = resolveWallShape(settings.wallShape, rng, bastionEra(period)),
    sides = settings.wallSides ?? 5 + Math.floor(rng() * 4),
    choice = settings.config.wall?.material,
    population = settings.population?.targetPopulation ?? settings.descriptor?.burg.population;
  return {
    ...layout,
    wall,
    // A bastioned wall's count left to the generator follows the town's size (`vectorBastionCount`).
    ...(wall === "polygon" || (wall === "bastioned" && settings.wallSides !== undefined)
      ? { wallSides: Math.min(VECTOR_WALL_SIDES.max, Math.max(VECTOR_WALL_SIDES.min, Math.round(sides))) }
      : {}),
    wallMaterial:
      choice === "stone" || choice === "wood"
        ? choice
        : population === undefined || population >= 1500
          ? "stone"
          : "wood",
    ...(settings.moats?.town ? { townMoat: true } : {}),
    // The mesh editor's Wall coast: `auto` leaves a port's waterfront open and walls any other shore.
    ...(() => {
      const coast = settings.config.wall?.coast ?? "auto",
        // Only a coast port opens it: a river port alone has no quay on the sea.
        resolved =
          coast === "auto"
            ? settings.config.features.port && portTargets(settings.config).coast
              ? "open"
              : "seaWall"
            : coast;
      return resolved === "seaWall" ? {} : { wallCoast: resolved };
    })(),
    // The mesh editor's old town takes the walled share, 45% by default (`innerWalledAreaShare`).
    // Circulade and Bram towns keep one wall, as in the mesh editor.
    ...(settings.townWallRings === "double" && (!layout.layout || layout.layout === "classic")
      ? {
          innerWall: {
            share: Math.max(0.1, Math.min(0.8, settings.walledAreaShare ?? DEFAULT_INNER_WALLED_AREA_SHARE)),
            state: settings.innerWallState === "razed" ? ("razed" as const) : ("standing" as const),
            ...(settings.townWallBuildOrder === "inner-first" ? { order: "inner-first" as const } : {})
          }
        }
      : {})
  };
}

/** Unit outline of a wall shape: counter-clockwise around the origin, farthest vertex at radius one. */
export function vectorUnitWallRing(seed: string, shape: WallShape, sides = 6, rotation = 0): Point[] {
  const ring = unitWallShape(shape, makeRng(`${seed}:vector-wall:ring`), sides),
    reach = Math.max(...ring.map(p => Math.hypot(p[0], p[1]))),
    cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  return ring.map(([x, y]) => [(x * cos - y * sin) / reach, (x * sin + y * cos) / reach]);
}

/**
 * Bastions of a bastioned wall whose salients stand `salientRadiusMeters` from its centre. A bastion is a gun
 * platform that covers its neighbours: a larger town takes more bastions, not larger ones, so every front stays
 * within `VECTOR_BASTION_FRONT_METERS`. A small town keeps a count drawn on the seed (five to eight); a count the
 * user chose is kept as it is.
 */
export function vectorBastionCount(seed: string, salientRadiusMeters: number, chosen?: number): number {
  if (chosen !== undefined) return chosen;
  const base = 5 + Math.floor(makeRng(`${seed}:vector-wall:bastions`)() * 4);
  for (let n = base; n < VECTOR_BASTION_COUNT_MAX; n++) {
    const salients = vectorUnitWallRing(seed, "bastioned", n).filter((_, i) => i % 5 === 2),
      front = Math.max(
        ...salients.map((p, i) => Math.hypot(salients[(i + 1) % n][0] - p[0], salients[(i + 1) % n][1] - p[1]))
      );
    if (front * salientRadiusMeters <= VECTOR_BASTION_FRONT_METERS) return n;
  }
  return VECTOR_BASTION_COUNT_MAX;
}

/** Share of the inscribed circle the outline covers as town land; the site grows by its inverse square root. */
export function vectorWallAreaShare(seed: string, shape: WallShape, sides?: number): number {
  const ring = vectorUnitWallRing(seed, shape, sides);
  // A bastion is a gun platform, not town (gate-ribbon plan §3.7): only the land inside the gorges counts.
  return (shape === "bastioned" ? unitBastionedTownArea(ring) : Math.abs(polygonArea(ring))) / Math.PI;
}

/** The wall fields of saved or shared skeleton settings. */
export function vectorWallSettings(
  s: Partial<
    Pick<
      VectorGenerationSettings,
      "wall" | "wallSides" | "wallMaterial" | "innerWall" | "townMoat" | "layout" | "castle" | "port" | "wallCoast"
    >
  >
) {
  return (
    typeof s.wall === "string" &&
    (["none", "rectangle", "ellipse"].includes(s.wall) || isVectorWallShape(s.wall)) &&
    (s.wallSides === undefined ||
      (Number.isInteger(s.wallSides) &&
        s.wallSides >= VECTOR_WALL_SIDES.min &&
        s.wallSides <= VECTOR_WALL_SIDES.max)) &&
    (s.wallMaterial === undefined || s.wallMaterial === "stone" || s.wallMaterial === "wood") &&
    (s.layout === undefined || s.layout === "circulade" || s.layout === "bram" || s.layout === "classic") &&
    (s.castle === undefined ||
      (typeof s.castle === "object" &&
        s.castle !== null &&
        Object.keys(s.castle).every(k => ["position", "size", "moat", "style"].includes(k)) &&
        ["auto", "edge", "central"].includes(s.castle.position) &&
        ["auto", "small", "standard", "large"].includes(s.castle.size) &&
        (s.castle.moat === undefined || typeof s.castle.moat === "boolean") &&
        (s.castle.style === undefined || (typeof s.castle.style === "string" && s.castle.style.length <= 64)))) &&
    (s.townMoat === undefined || (typeof s.townMoat === "boolean" && s.wall !== "none")) &&
    (s.port === undefined || typeof s.port === "boolean") &&
    (s.wallCoast === undefined || (["seaWall", "open", "opening"].includes(s.wallCoast) && s.wall !== "none")) &&
    (s.innerWall === undefined ||
      (s.wall !== "none" &&
        typeof s.innerWall === "object" &&
        s.innerWall !== null &&
        Object.keys(s.innerWall).every(k => ["share", "state", "order"].includes(k)) &&
        (s.innerWall.order === undefined ||
          s.innerWall.order === "outer-first" ||
          s.innerWall.order === "inner-first") &&
        Number.isFinite(s.innerWall.share) &&
        s.innerWall.share >= 0.1 &&
        s.innerWall.share <= 0.8 &&
        (s.innerWall.state === "standing" || s.innerWall.state === "razed")))
  );
}
