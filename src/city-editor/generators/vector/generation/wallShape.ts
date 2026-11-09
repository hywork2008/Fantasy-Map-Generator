import type { GenerationSettings, WallShape } from "../../../types/generation";
import type { HistoricalPeriod, Point } from "../../../types/primitives";
import type { VectorGenerationSettings } from "../../../types/vector/generation";
import { bastionEra, resolveWallShape, unitWallShape } from "../../generation/skeleton/wallShapes";
import { polygonArea } from "../../geom";
import { makeRng } from "../../prng";

export const VECTOR_WALL_SHAPES: readonly WallShape[] = ["organic", "round", "oval", "square", "polygon", "bastioned"];
export const isVectorWallShape = (wall: string): wall is WallShape =>
  (VECTOR_WALL_SHAPES as readonly string[]).includes(wall);
/** Wall thickness of the mesh editor's wall styles (`edgeGroupStyle`). */
export const VECTOR_WALL_WIDTH_METERS = { stone: 4.5, wood: 2.4 } as const;
export const VECTOR_WALL_SIDES = { min: 3, max: 12 } as const;

/**
 * The town wall the mesh editor's settings ask for (P4a). The skeleton-first shape families (`unitWallShape`) are
 * cell-free, so meshless draws the same outlines. `auto` resolves on the seed as the skeleton does: `bastioned`
 * only from the age of exploration. Material follows `resolveWallMaterial`: the choice, else stone from 1,500
 * people. Without town walls the city has none.
 */
export function vectorWallChoice(
  settings: Pick<GenerationSettings, "config" | "wallShape" | "wallSides" | "population" | "descriptor">,
  seed: string,
  period: HistoricalPeriod
): Pick<VectorGenerationSettings, "wall" | "wallSides" | "wallMaterial"> {
  if (!settings.config.features.walls) return { wall: "none" };
  const rng = makeRng(`${seed}:vector-wall:choice`),
    wall = resolveWallShape(settings.wallShape, rng, bastionEra(period)),
    sides = settings.wallSides ?? 5 + Math.floor(rng() * 4),
    choice = settings.config.wall?.material,
    population = settings.population?.targetPopulation ?? settings.descriptor?.burg.population;
  return {
    wall,
    ...(wall === "polygon" || wall === "bastioned"
      ? { wallSides: Math.min(VECTOR_WALL_SIDES.max, Math.max(VECTOR_WALL_SIDES.min, Math.round(sides))) }
      : {}),
    wallMaterial:
      choice === "stone" || choice === "wood"
        ? choice
        : population === undefined || population >= 1500
          ? "stone"
          : "wood"
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

/** Share of the inscribed circle the outline covers; the site grows by its inverse square root. */
export function vectorWallAreaShare(seed: string, shape: WallShape, sides?: number): number {
  return Math.abs(polygonArea(vectorUnitWallRing(seed, shape, sides))) / Math.PI;
}

/** The wall fields of saved or shared skeleton settings. */
export function vectorWallSettings(s: Partial<Pick<VectorGenerationSettings, "wall" | "wallSides" | "wallMaterial">>) {
  return (
    typeof s.wall === "string" &&
    (["none", "rectangle", "ellipse"].includes(s.wall) || isVectorWallShape(s.wall)) &&
    (s.wallSides === undefined ||
      (Number.isInteger(s.wallSides) &&
        s.wallSides >= VECTOR_WALL_SIDES.min &&
        s.wallSides <= VECTOR_WALL_SIDES.max)) &&
    (s.wallMaterial === undefined || s.wallMaterial === "stone" || s.wallMaterial === "wood")
  );
}
