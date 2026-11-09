import { placementFootprint } from "../../../../buildings/placementModels";
import { getBurialCulturePreset } from "../../../../data/burialCultures";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorFeature } from "../../../types/vector/environment";
import { layoutCultureCemeteryOnSite } from "../../cultureCemeteryLayout";
import { nearestOnPolyline, polygonCentroid } from "../../geom";
import { civicSizeForPopulation } from "../../housing";
import { insetConvexKernel } from "../../lotGeometry";
import { joinVectorGenerationAnchors, rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { allVectorWater } from "../geometry/water";

const box = (center: Point, width: number, height: number) => ({
  outer: [
    [center[0] - width / 2, center[1] - height / 2],
    [center[0] + width / 2, center[1] - height / 2],
    [center[0] + width / 2, center[1] + height / 2],
    [center[0] - width / 2, center[1] + height / 2]
  ] as Point[],
  holes: [] as Point[][]
});

type CivicOptions = { plaza: boolean; temple: boolean };
/** Plaza, church and churchyard around the site centre, from the target population alone. */
export function vectorCivicLayout(population: number, options: CivicOptions) {
  // Sized by the target population: the map window says nothing about how large the town is.
  const civic = civicSizeForPopulation(population),
    side = civic.plazaSideMeters,
    church = civic.temple,
    graveDepth = church.type === "chapel" ? (church.length < 20 ? 20 : 30) : 40;
  const plazaCenter: Point = [0, -side / 2 - 8],
    churchCenter: Point = [-side / 2 - 8 - church.length / 2, plazaCenter[1]];
  const specs: { id: string; kind: VectorFeature["kind"]; boundary: ReturnType<typeof box>; center: Point }[] = [];
  if (options.plaza)
    specs.push({
      id: "feature:civic-plaza",
      kind: "market",
      boundary: box(plazaCenter, side, side),
      center: plazaCenter
    });
  if (options.temple) {
    specs.push({
      id: "feature:civic-church",
      kind: "temple",
      boundary: box(churchCenter, church.length + 4, church.width + 4),
      center: churchCenter
    });
    const center: Point = [churchCenter[0], churchCenter[1] - church.width / 2 - 8 - graveDepth / 2];
    specs.push({
      id: "feature:civic-cemetery",
      kind: "cemetery",
      boundary: box(center, Math.max(church.length, 20), graveDepth),
      center
    });
  }
  return {
    church,
    churchCenter,
    specs,
    // The site sizing has always counted the church building on top of its precinct (the building is a reserved
    // placement inside the reserved precinct); it stays counted so the housing land is unchanged.
    areaM2:
      specs.reduce((n, s) => n + regionArea(s.boundary), 0) +
      (options.temple
        ? church.type === "basilica"
          ? (placementFootprint("catalogue:basilica-temple", "low")?.halfX ?? 0) *
            2 *
            (placementFootprint("catalogue:basilica-temple", "low")?.halfZ ?? 0) *
            2
          : church.length * church.width
        : 0),
    /** Farthest civic corner from the site centre. */
    radiusMeters: Math.max(0, ...specs.flatMap(s => s.boundary.outer.map(p => Math.hypot(p[0], p[1]))))
  };
}

/** Reserve central civic land before routing or housing. No facility search or city mesh is used. */
export function seedVectorCivicCentre(doc: VectorCityDocument, options: CivicOptions) {
  if (!doc.site || (!options.plaza && !options.temple)) return;
  const { church, churchCenter, specs } = vectorCivicLayout(doc.context.targetPopulation ?? 0, options),
    road = Object.values(doc.paths).find(p => p.role === "road")!;
  const water = allVectorWater(doc);
  if (
    specs.some(
      s =>
        regionBoolean([s.boundary], water, "intersection").some(p => regionArea(p) > 1e-5) ||
        regionBoolean([s.boundary], doc.site!.domain, "difference").some(p => regionArea(p) > 1e-5)
    )
  )
    throw Error("civic-site-space");
  doc.environment ??= { features: {}, hidden: [] };
  for (const s of specs) {
    const access = nearestRoadAnchor(road, s.center),
      target = evaluateAnchor(road, access),
      entrance = nearestOnPolyline(target, [...s.boundary.outer, s.boundary.outer[0]]).point;
    doc.environment.features[s.id] = {
      id: s.id,
      kind: s.kind,
      boundary: s.boundary,
      access,
      entrance,
      connector: [entrance, target],
      pathIds: [],
      placementIds: [],
      pieces:
        s.kind === "market"
          ? [{ id: `${s.id}:ground`, role: "ground", polygon: s.boundary, heightMeters: 0.02, color: "#d9cfba" }]
          : [],
      settings: {
        density: 0,
        heightMeters: church.heightMeters,
        activity: "closed",
        culture: "stone",
        moatWidthMeters: 0
      },
      editPolicy: "editable"
    };
  }
  if (options.temple) {
    const f = doc.environment.features["feature:civic-church"],
      basilica = church.type === "basilica",
      // Only the basilica has a catalogue model; a chapel is drawn as its massing.
      modelId = basilica ? "catalogue:basilica-temple" : "ce-civic-chapel",
      footprint = basilica ? placementFootprint(modelId, "low") : undefined;
    if (basilica && !footprint) throw Error("civic-church-model");
    const site = footprint
        ? box(churchCenter, footprint.halfX * 2, footprint.halfZ * 2)
        : box(churchCenter, church.length, church.width),
      id = "civic:church";
    doc.placements[id] = {
      id,
      modelId,
      position: churchCenter,
      facingDegrees: 180,
      origin: "manual",
      editPolicy: "editable",
      site,
      accesses: [f.access],
      appearance: { quality: "low" },
      display: {
        kind: "landmark",
        heightMeters: church.heightMeters,
        footprint: [site],
        provenance: "copied",
        note: basilica
          ? "Central CE basilica at catalogue dimensions; excluded from residential capacity."
          : "Parish chapel sized for the population; excluded from residential capacity.",
        dwellings: 0
      }
    };
    f.placementIds.push(id);
    const cemetery = specs.find(s => s.kind === "cemetery")!,
      profile = getBurialCulturePreset("medieval_parish"),
      safe = insetConvexKernel(
        cemetery.boundary.outer,
        cemetery.boundary.outer.map(() => 1.4)
      ),
      center = polygonCentroid(safe),
      gate: Point = [center[0], Math.max(...safe.map(p => p[1]))];
    const plan = layoutCultureCemeteryOnSite(
      { water: water.map(p => p.outer), hasTrees: true },
      {
        id: "civic:cemetery",
        version: 1 as const,
        seed: `civic-${doc.recipe.seed}`,
        form: "field" as const,
        boundary: cemetery.boundary.outer,
        courtyards: [],
        parts: [],
        accesses: [],
        trees: [],
        gatePoint: gate,
        burialProfile: profile,
        provenance: "generated" as const,
        locked: false
      },
      safe,
      gate,
      center,
      [1, 0],
      [0, 1]
    );
    doc.environment.landscape = {
      version: 1,
      context: { seed: doc.recipe.seed, burialProfile: profile },
      forest: {
        settings: { version: 1, mode: "legacy", density: "standard" },
        domains: { legacy: [], farmland: [], surroundings: [] },
        farmland: [],
        regionIds: [],
        farmRegionIds: []
      },
      parks: [],
      farmSources: [],
      farms: [],
      cemeteries: [plan],
      trees: []
    };
  }
}

/** Replace input-road witnesses with the completed, nearest public street. */
export function connectVectorCivicCentre(doc: VectorCityDocument) {
  const features = Object.values(doc.environment?.features ?? {}).filter(f => f.id.startsWith("feature:civic-"));
  if (!features.length) return;
  const roads = Object.values(doc.paths).filter(p => p.role === "road");
  for (const f of features) {
    const center = polygonCentroid(f.boundary.outer);
    const best = roads
      .map(road => {
        const access = nearestRoadAnchor(road, center),
          target = evaluateAnchor(road, access);
        return { access, target, distance: Math.hypot(target[0] - center[0], target[1] - center[1]) };
      })
      .filter(r => !containsRegion([f.boundary], r.target))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!best) throw Error("civic-street-access");
    f.access = best.access;
    f.entrance = nearestOnPolyline(best.target, [...f.boundary.outer, f.boundary.outer[0]]).point;
    f.connector = [f.entrance, best.target];
    for (const id of f.placementIds) doc.placements[id].accesses = [best.access];
    const pathId = `${f.id}:access`;
    if (Math.hypot(f.entrance[0] - best.target[0], f.entrance[1] - best.target[1]) > 0.05) {
      doc.paths[pathId] = {
        id: pathId,
        role: "road",
        revision: 0,
        origin: "automatic",
        editPolicy: "editable",
        source: curveSource(f.connector, "polyline", false),
        width: { leftMeters: 1.2, rightMeters: 1.2, stations: [] }
      };
      f.pathIds = [pathId];
      joinVectorGenerationAnchors(doc, [best.access, { pathId, segmentId: "segment:0", t: 1 }]);
    }
  }
  rebuildRoadGraph(doc);
}
