import { TREE_SPECIES } from "../../../../buildings/landscape/treeSpecies";
import { isBurialCultureProfile } from "../../../../data/burialCultures";
import { isCivilizationContext } from "../../../../data/civilizationTraditions";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { validForestSettings } from "../../forestSettings";
import { treeCrown, VECTOR_LANDSCAPE_TREE_LIMIT } from "../geometry/landscape";
import { regionArea, regionBoolean } from "../geometry/regions";
import { ringInside } from "../geometry/routing";
import { simpleContour } from "../geometry/surfaces";

export function validateVectorLandscape(doc: VectorCityDocument): string[] {
  const p = doc.environment?.landscape;
  if (p === undefined) return [];
  let stage = "header";
  try {
    const fail = () => {
      throw Error(stage);
    };
    const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
    const keys = (x: object, allowed: string[]) => Object.keys(x).every(k => allowed.includes(k));
    const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e7;
    const point = (x: unknown): x is Point => Array.isArray(x) && x.length === 2 && x.every(finite);
    const line = (x: unknown, min = 1): x is Point[] =>
      Array.isArray(x) && x.length >= min && x.length <= 512 && x.every(point);
    const ring = (x: unknown): x is Point[] => line(x, 3) && simpleContour(x, true);
    const polygon = (x: unknown): x is VectorPolygon =>
      record(x) &&
      keys(x, ["outer", "holes"]) &&
      ring(x.outer) &&
      Array.isArray(x.holes) &&
      x.holes.length <= 64 &&
      x.holes.every(h => ring(h) && ringInside(h, x.outer as Point[]));
    const polygons = (x: unknown): x is VectorPolygon[] => Array.isArray(x) && x.length <= 256 && x.every(polygon);
    const id = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 256;
    if (
      !record(p) ||
      p.version !== 1 ||
      !keys(p, ["version", "context", "forest", "parks", "farmSources", "farms", "cemeteries", "trees"])
    )
      fail();
    const c = p.context;
    if (
      !record(c) ||
      !keys(c, ["seed", "biome", "temperatureC", "climateBiomeKey", "civilization", "burialProfile"]) ||
      !id(c.seed) ||
      (c.temperatureC !== undefined && !finite(c.temperatureC)) ||
      (c.climateBiomeKey !== undefined && (typeof c.climateBiomeKey !== "string" || c.climateBiomeKey.length > 128)) ||
      (c.civilization !== undefined && !isCivilizationContext(c.civilization)) ||
      (c.burialProfile !== undefined && !isBurialCultureProfile(c.burialProfile))
    )
      fail();
    if (
      c.biome &&
      (!record(c.biome) ||
        !keys(c.biome, ["id", "key", "name", "color", "tags"]) ||
        !finite(c.biome.id) ||
        typeof c.biome.name !== "string" ||
        typeof c.biome.color !== "string" ||
        (c.biome.key !== undefined && typeof c.biome.key !== "string") ||
        (c.biome.tags !== undefined &&
          (!Array.isArray(c.biome.tags) || c.biome.tags.length > 64 || c.biome.tags.some(t => typeof t !== "string"))))
    )
      fail();
    const f = p.forest;
    stage = "forest";
    if (
      !record(f) ||
      !keys(f, ["settings", "domains", "farmland", "regionIds", "farmRegionIds"]) ||
      !f.settings ||
      !keys(f.settings, ["version", "mode", "density"]) ||
      !validForestSettings(f.settings) ||
      !record(f.domains) ||
      !keys(f.domains, ["legacy", "farmland", "surroundings"]) ||
      !["legacy", "farmland", "surroundings"].every(mode => polygons(f.domains[mode as keyof typeof f.domains])) ||
      !polygons(f.farmland) ||
      !Array.isArray(f.regionIds) ||
      !Array.isArray(f.farmRegionIds)
    )
      fail();
    if (
      [...f.regionIds, ...f.farmRegionIds].length > 512 ||
      new Set([...f.regionIds, ...f.farmRegionIds]).size !== f.regionIds.length + f.farmRegionIds.length ||
      f.regionIds.some(id => !/^landscape:ground:forest:[0-9]+$/.test(id) || doc.regions[id]?.kind !== "forest") ||
      f.farmRegionIds.some(id => !/^landscape:ground:farm:[0-9]+$/.test(id) || doc.regions[id]?.kind !== "farm")
    )
      fail();
    for (const name of ["parks", "farmSources", "farms", "cemeteries", "trees"] as const)
      if (!Array.isArray(p[name]) || p[name].length > (name === "trees" ? VECTOR_LANDSCAPE_TREE_LIMIT : 256)) fail();
    const owners = new Set(["landscape:forest", ...p.parks.map(x => x.id), ...p.cemeteries.map(x => x.id)]);
    if (owners.size !== 1 + p.parks.length + p.cemeteries.length) fail();
    stage = "parks-and-farms";
    for (const park of p.parks)
      if (
        !keys(park, ["id", "lawns", "paths", "trees"]) ||
        !id(park.id) ||
        !polygons(park.lawns) ||
        !Array.isArray(park.paths) ||
        park.paths.length > 512 ||
        !park.paths.every(l => line(l, 2)) ||
        !Array.isArray(park.trees) ||
        park.trees.length > 2048 ||
        park.trees.some(
          t => !keys(t, ["point", "radiusMeters"]) || !point(t.point) || !finite(t.radiusMeters) || t.radiusMeters <= 0
        )
      )
        fail();
    for (const farm of [...p.farmSources, ...p.farms])
      if (
        !keys(farm, [
          "id",
          "polygon",
          "locked",
          "rows",
          "kind",
          "plotId",
          "orientationRadians",
          "managementGroupId",
          "system",
          "cropState",
          "rotationGroup",
          "holdingPolygon",
          "clippedByFrame",
          "tenureStrips",
          "boundaryKind",
          "boundaries"
        ]) ||
        !id(farm.id) ||
        !polygon(farm.polygon) ||
        typeof farm.locked !== "boolean" ||
        !Array.isArray(farm.rows) ||
        farm.rows.length > 4096 ||
        !farm.rows.every(l => line(l, 2)) ||
        (farm.orientationRadians !== undefined && !finite(farm.orientationRadians)) ||
        (farm.rotationGroup !== undefined && !finite(farm.rotationGroup)) ||
        (farm.holdingPolygon !== undefined && !ring(farm.holdingPolygon)) ||
        (farm.tenureStrips !== undefined &&
          (!Array.isArray(farm.tenureStrips) || farm.tenureStrips.length > 512 || !farm.tenureStrips.every(ring))) ||
        (farm.boundaries !== undefined &&
          (!Array.isArray(farm.boundaries) || farm.boundaries.length > 512 || !farm.boundaries.every(l => line(l, 2))))
      )
        fail();
    stage = "cemeteries";
    for (const cemetery of p.cemeteries) {
      if (
        !keys(cemetery, [
          "id",
          "version",
          "seed",
          "form",
          "boundary",
          "courtyards",
          "parts",
          "accesses",
          "trees",
          "gatePoint",
          "burialProfile",
          "provenance",
          "locked"
        ]) ||
        !id(cemetery.id) ||
        cemetery.version !== 1 ||
        !id(cemetery.seed) ||
        !["churchyard", "cloister", "field"].includes(cemetery.form) ||
        !ring(cemetery.boundary) ||
        typeof cemetery.locked !== "boolean" ||
        !["generated", "manual", "legacy"].includes(cemetery.provenance) ||
        (cemetery.burialProfile !== undefined && !isBurialCultureProfile(cemetery.burialProfile)) ||
        (cemetery.gatePoint !== undefined && !point(cemetery.gatePoint))
      )
        fail();
      if (
        !Array.isArray(cemetery.courtyards) ||
        cemetery.courtyards.length > 256 ||
        !cemetery.courtyards.every(ring) ||
        !Array.isArray(cemetery.parts) ||
        cemetery.parts.length > 2048 ||
        !Array.isArray(cemetery.accesses) ||
        cemetery.accesses.length > 512 ||
        !Array.isArray(cemetery.trees) ||
        cemetery.trees.length > 2048 ||
        !cemetery.trees.every(point)
      )
        fail();
      for (const part of cemetery.parts)
        if (
          !keys(part, ["id", "role", "kind", "footprint", "holes", "entrances", "locked"]) ||
          !id(part.id) ||
          ![
            "chapel",
            "ossuary",
            "rectory",
            "calvary",
            "graves",
            "sanctuary",
            "monument",
            "ritual",
            "boundary"
          ].includes(part.role) ||
          !ring(part.footprint) ||
          (part.holes !== undefined &&
            (!Array.isArray(part.holes) || part.holes.length > 64 || !part.holes.every(ring))) ||
          !line(part.entrances, 0) ||
          typeof part.locked !== "boolean" ||
          regionBoolean(
            [{ outer: part.footprint, holes: part.holes ?? [] }],
            [{ outer: cemetery.boundary, holes: [] }],
            "difference"
          ).some(r => regionArea(r) > 1e-5)
        )
          fail();
      for (const access of cemetery.accesses)
        if (
          !keys(access, ["points", "widthMeters"]) ||
          !line(access.points, 2) ||
          !finite(access.widthMeters) ||
          access.widthMeters <= 0
        )
          fail();
    }
    stage = "trees";
    if (new Set(p.trees.map(t => t.id)).size !== p.trees.length) fail();
    for (const tree of p.trees) {
      if (
        !keys(tree, ["id", "ownerId", "point", "radiusMeters", "heightMeters", "angleRadians", "species"]) ||
        !id(tree.id) ||
        !owners.has(tree.ownerId) ||
        !point(tree.point) ||
        !finite(tree.radiusMeters) ||
        tree.radiusMeters <= 0 ||
        tree.radiusMeters > 50 ||
        !finite(tree.heightMeters) ||
        tree.heightMeters <= 0 ||
        tree.heightMeters > 200 ||
        !finite(tree.angleRadians) ||
        !TREE_SPECIES.includes(tree.species)
      )
        fail();
      if (
        tree.ownerId === "landscape:forest" &&
        regionBoolean(
          [treeCrown(tree)],
          f.regionIds.map(id => doc.regions[id]),
          "difference"
        ).some(r => regionArea(r) > 1e-5)
      )
        fail();
    }
  } catch (error) {
    return [`landscape:${stage}:${error instanceof Error ? error.message : "invalid"}`];
  }
  return [];
}
