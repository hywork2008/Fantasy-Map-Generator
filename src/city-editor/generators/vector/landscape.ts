import { treeLodProfile } from "../../../buildings/landscape/trees";
import { getBurialCulturePreset, isBurialCulturePresetId } from "../../../data/burialCultures";
import { burialPresetsFor, getTradition } from "../../../data/civilizationTraditions";
import type { ForestSettings } from "../../types/contracts/forest";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorLandscapeTree } from "../../types/vector/landscape";
import { layoutCultureCemeteryOnSite } from "../cultureCemeteryLayout";
import { forestTreeCandidates, forestTreeRandom } from "../forestCandidates";
import { polygonCentroid, segmentSegmentHit } from "../geom";
import { treeSpeciesForClimate } from "../landscapeTreeSpecies";
import { type LandscapeClimate, treeBiomeForClimate } from "../landscapeVegetation";
import { insetConvexKernel } from "../lotGeometry";
import { prepareVectorEdit } from "./editing/dependencies";
import { featureReservations } from "./environmentState";
import { treeCrown, VECTOR_LANDSCAPE_TREE_LIMIT } from "./geometry/landscape";
import { containsRegion, regionArea, regionBoolean } from "./geometry/regions";
import { pathSurface } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";
import { assertVectorDocument } from "./validation/document";

const within = (polygon: VectorPolygon, domain: VectorPolygon[]) =>
  regionBoolean([polygon], domain, "difference").reduce((n, p) => n + regionArea(p), 0) < 1e-5;

function clippedLines(lines: Point[][], domain: VectorPolygon[]): Point[][] {
  const result: Point[][] = [];
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-8) continue;
      const ts = [0, 1];
      for (const ring of domain.flatMap(p => [p.outer, ...p.holes]))
        for (let j = 0; j < ring.length; j++) {
          const hit = segmentSegmentHit(a, b, ring[j], ring[(j + 1) % ring.length]);
          if (hit) ts.push(hit.t);
        }
      ts.sort((a, b) => a - b);
      const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let j = 1; j < ts.length; j++)
        if (ts[j] - ts[j - 1] > 1e-8 && containsRegion(domain, at((ts[j] + ts[j - 1]) / 2)))
          result.push([at(ts[j - 1]), at(ts[j])]);
    }
  return result;
}

/** Rebuild only derived landscape outputs on an isolated draft; no source document is required. */
export function rebuildVectorLandscape(doc: VectorCityDocument): void {
  const landscape = doc.environment!.landscape!,
    forest = landscape.forest;
  for (const id of [...forest.regionIds, ...forest.farmRegionIds]) delete doc.regions[id];
  forest.regionIds = [];
  forest.farmRegionIds = [];
  const withoutLandscape = { ...doc, environment: { ...doc.environment!, landscape: undefined } };
  const water = allVectorWater(doc);
  const obstacles = [
    ...water,
    ...featureReservations(withoutLandscape),
    ...Object.values(doc.paths)
      .filter(p => p.role === "road" || p.role === "wall")
      .map(pathSurface),
    ...Object.values(doc.placements).flatMap(p => p.building?.reserved ?? [p.site]),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...landscape.parks.flatMap(p => p.lawns),
    ...landscape.cemeteries.map(c => ({ outer: c.boundary, holes: [] })),
    ...landscape.farmSources.filter(f => f.locked).map(f => f.polygon)
  ];
  const regions =
    treeBiomeForClimate(landscape.context) === "none"
      ? []
      : regionBoolean(forest.domains[forest.settings.mode], obstacles, "difference");
  const adopt = (kind: "forest" | "farm", polygons: VectorPolygon[]) =>
    polygons.map((p, i) => {
      const id = `landscape:ground:${kind}:${i}`;
      if (doc.regions[id]) throw Error("landscape-region-collision");
      doc.regions[id] = { id, kind, ...p };
      return id;
    });
  forest.regionIds = adopt("forest", regions);
  forest.farmRegionIds = adopt("farm", regionBoolean(forest.farmland, regions, "difference"));
  landscape.farms = landscape.farmSources.flatMap(source => {
    const parts = source.locked ? [source.polygon] : regionBoolean([source.polygon], regions, "difference");
    return parts.map((polygon, i) => ({
      ...source,
      id: `${source.id}:part:${i}`,
      polygon,
      rows: clippedLines(source.rows, [polygon])
    }));
  });
  landscape.trees = [];
  const addTree = (
    id: string,
    ownerId: string,
    point: Point,
    radius: number,
    preferred: Parameters<typeof treeSpeciesForClimate>[0],
    context: "woodland" | "planting",
    domain?: VectorPolygon[]
  ) => {
    if (landscape.trees.length >= VECTOR_LANDSCAPE_TREE_LIMIT) return;
    const species = treeSpeciesForClimate(preferred, landscape.context, point, context);
    if (!species) return;
    const tree: VectorLandscapeTree = {
      id,
      ownerId,
      point: [...point],
      radiusMeters: radius,
      heightMeters: treeLodProfile(species)?.heightMeters ?? 10,
      angleRadians: forestTreeRandom(`${landscape.context.seed}:${id}:angle`) * Math.PI * 2,
      species
    };
    if (domain && !within(treeCrown(tree), domain)) return;
    if (regionBoolean([treeCrown(tree)], water, "intersection").some(p => regionArea(p) > 1e-5)) return;
    landscape.trees.push(tree);
  };
  // Authored park/cemetery planting precedes automatic woodland and never loses its slot to it.
  for (const park of landscape.parks)
    for (const [i, tree] of park.trees.entries())
      addTree(
        `${park.id}:tree:${i}`,
        park.id,
        tree.point,
        tree.radiusMeters,
        "garden_parkland",
        "planting",
        park.lawns
      );
  for (const c of landscape.cemeteries)
    if (c.burialProfile?.vegetation !== "barren_gravel")
      for (const [i, point] of c.trees.entries())
        addTree(`${c.id}:tree:${i}`, c.id, point, 2, c.burialProfile?.vegetation ?? "sacred_yew", "planting");
  const candidates = forestTreeCandidates(
    {
      regions: regions.map((r, i) => ({
        ...r,
        id: forest.regionIds[i],
        bounds: [
          Math.min(...r.outer.map(p => p[0])),
          Math.min(...r.outer.map(p => p[1])),
          Math.max(...r.outer.map(p => p[0])),
          Math.max(...r.outer.map(p => p[1]))
        ] as [number, number, number, number]
      }))
    },
    landscape.context.seed,
    true
  );
  const probability = forest.settings.density === "sparse" ? 0.5 : forest.settings.density === "dense" ? 1 : 0.8;
  for (const tree of candidates)
    if (forestTreeRandom(`${landscape.context.seed}:${tree.id}:density`) < probability)
      addTree(
        `landscape:forest-tree:${tree.id}`,
        "landscape:forest",
        tree.point,
        3.5 + forestTreeRandom(`${landscape.context.seed}:${tree.id}:radius`) * 1.5,
        "garden_parkland",
        "woodland",
        regions
      );
}

export function regenerateVectorLandscape(
  input: VectorCityDocument,
  changes: {
    forest?: ForestSettings;
    climate?: LandscapeClimate;
    seed?: string;
    burialPreset?: string;
    useCivilization?: boolean;
  } = {}
): VectorCityDocument {
  assertVectorDocument(input);
  if (!input.environment?.landscape) throw Error("landscape-missing");
  const doc = prepareVectorEdit(input),
    plan = doc.environment!.landscape!;
  if (changes.forest) plan.forest.settings = structuredClone(changes.forest);
  if (changes.climate) plan.context = { ...plan.context, ...structuredClone(changes.climate) };
  if (changes.seed !== undefined) plan.context.seed = changes.seed;
  let preset = changes.burialPreset;
  if (changes.useCivilization) {
    const civilization = plan.context.civilization;
    if (!civilization) throw Error("landscape-civilization-missing");
    preset = burialPresetsFor(
      civilization.faith,
      doc.context.historicalPeriod,
      getTradition(civilization.tradition)
    )[0];
  }
  if (preset !== undefined) {
    if (!isBurialCulturePresetId(preset)) throw Error("landscape-burial-preset");
    plan.context.burialProfile = structuredClone(getBurialCulturePreset(preset));
    plan.cemeteries = plan.cemeteries.map(c => {
      if (c.locked || c.parts.some(p => p.locked)) return c;
      const safe = insetConvexKernel(
        c.boundary,
        c.boundary.map(() => (c.form === "field" ? 1.4 : 2))
      );
      if (safe.length < 3) throw Error("landscape-cemetery-space");
      const center = polygonCentroid(safe),
        at = c.gatePoint ?? c.boundary.reduce((a, b) => (a[1] < b[1] ? a : b));
      const dx = center[0] - at[0],
        dy = center[1] - at[1],
        length = Math.hypot(dx, dy);
      if (length < 1) throw Error("landscape-cemetery-gate");
      return layoutCultureCemeteryOnSite(
        { water: allVectorWater(doc).map(p => p.outer), hasTrees: treeBiomeForClimate(plan.context) !== "none" },
        { ...c, burialProfile: structuredClone(plan.context.burialProfile!) },
        safe,
        at,
        center,
        [dy / length, -dx / length],
        [dx / length, dy / length]
      );
    });
  }
  rebuildVectorLandscape(doc);
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
