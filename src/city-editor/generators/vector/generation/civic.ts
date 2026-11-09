import { placementFootprint } from "../../../../buildings/placementModels";
import { type BurialCultureProfile, getBurialCulturePreset } from "../../../../data/burialCultures";
import type { HistoricalPeriod } from "../../../../types/historicalPeriod";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorFeature } from "../../../types/vector/environment";
import type { VectorPolygon } from "../../../types/vector/generation";
import { layoutCultureCemeteryOnSite } from "../../cultureCemeteryLayout";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "../../geom";
import { civicSizeForPopulation } from "../../housing";
import { insetConvexKernel } from "../../lotGeometry";
import { makeRng } from "../../prng";
import { MODERN_BURIAL_PERIODS } from "../../wards";
import { joinVectorGenerationAnchors, rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
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

/** Where a culture buries its dead (the mesh editor's cemetery zoning, `wards.ts`): beside the church, outside the
 * town along an approach road, or on a river bank. */
export type VectorBurialSite = "churchyard" | "extramural" | "riverbank";
type CivicOptions = { plaza: boolean; temple: boolean; burial?: VectorBurialSite };

/** The burial culture a town is generated with, as the mesh editor resolves it (settings, then the FMG descriptor),
 * and where it puts the cemetery: with no culture, beside the church, or away from the town in modern periods. */
export function vectorBurial(
  profile: BurialCultureProfile | undefined,
  period: HistoricalPeriod | undefined
): { profile: BurialCultureProfile; site: VectorBurialSite } {
  const zoning =
    profile?.zoning ?? (period && MODERN_BURIAL_PERIODS.has(period) ? "extramural_sanitary" : "intramural_core");
  return {
    profile: profile ? structuredClone(profile) : getBurialCulturePreset("medieval_parish"),
    site:
      zoning === "riverfront_ghat"
        ? "riverbank"
        : ["extramural_highway", "extramural_sanitary", "topographic_hill", "isolated_highland"].includes(zoning)
          ? "extramural"
          : "churchyard"
  };
}
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
  if (options.temple)
    specs.push({
      id: "feature:civic-church",
      kind: "temple",
      boundary: box(churchCenter, church.length + 4, church.width + 4),
      center: churchCenter
    });
  // A churchyard is laid out with the civic centre; a cemetery outside the town or on a bank is sited later.
  if (options.temple && (options.burial ?? "churchyard") === "churchyard") {
    const center: Point = [churchCenter[0], churchCenter[1] - church.width / 2 - 8 - graveDepth / 2];
    specs.push({
      id: "feature:civic-cemetery",
      kind: "cemetery",
      boundary: box(center, Math.max(church.length, 20), graveDepth),
      center
    });
  }
  const cemetery = { lengthMeters: Math.max(church.length, 20), depthMeters: graveDepth };
  return {
    church,
    churchCenter,
    specs,
    cemetery,
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
        : 0) +
      // A riverbank cemetery is sited in the town later, on land the houses would otherwise take.
      (options.temple && options.burial === "riverbank" ? cemetery.lengthMeters * cemetery.depthMeters : 0),
    /** Farthest civic corner from the site centre. */
    radiusMeters: Math.max(0, ...specs.flatMap(s => s.boundary.outer.map(p => Math.hypot(p[0], p[1]))))
  };
}

/** Reserve central civic land before routing or housing. No facility search or city mesh is used. */
export function seedVectorCivicCentre(
  doc: VectorCityDocument,
  options: CivicOptions,
  profile: BurialCultureProfile = getBurialCulturePreset("medieval_parish")
) {
  if (!doc.site || (!options.plaza && !options.temple)) return;
  const layout = vectorCivicLayout(doc.context.targetPopulation ?? 0, options),
    { church, churchCenter } = layout,
    specs: (Omit<(typeof layout.specs)[number], "boundary"> & { boundary: VectorPolygon; axes?: [Point, Point] })[] = [
      ...layout.specs
    ],
    road = Object.values(doc.paths).find(p => p.role === "road")!;
  const water = allVectorWater(doc);
  // A cemetery outside the town or on a river bank (P6a); the site grows to take one outside it.
  if (options.temple && options.burial && options.burial !== "churchyard") {
    const sited = siteVectorCemetery(
      doc,
      options.burial,
      layout.cemetery,
      specs.map(s => s.boundary),
      profile
    );
    if (sited) {
      specs.push({ id: "feature:civic-cemetery", kind: "cemetery", ...sited });
      if (options.burial === "extramural") doc.site.domain = regionBoolean(doc.site.domain, [sited.boundary], "union");
    }
  }
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
    const cemetery = specs.find(s => s.kind === "cemetery");
    if (!cemetery) return;
    // The churchyard's gate faces the church; a sited cemetery's faces its road (its second axis points away).
    const [x, y] = cemetery.axes ?? [
        [1, 0],
        [0, 1]
      ],
      safe = insetConvexKernel(
        cemetery.boundary.outer,
        cemetery.boundary.outer.map(() => 1.4)
      ),
      center = polygonCentroid(safe),
      roadSide = Math.min(...safe.map(p => (p[0] - center[0]) * y[0] + (p[1] - center[1]) * y[1])),
      gate: Point = cemetery.axes
        ? [center[0] + y[0] * roadSide, center[1] + y[1] * roadSide]
        : [center[0], Math.max(...safe.map(p => p[1]))];
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
      x,
      y
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

/** Clear of every road surface, the water and the other civic land, by this much. */
const CEMETERY_CLEARANCE_METERS = 3;

/**
 * A cemetery sited by the mesh editor's zoning rules (`wards.ts`) on the meshless site (P6a). Outside the town it
 * lies alongside an approach road (its middle about 25 m from the road) beyond the built-up disc, best some 120 m
 * past the town's edge; a culture that burns its dead on a river bank takes the bank nearest the centre.
 */
function siteVectorCemetery(
  doc: VectorCityDocument,
  site: Exclude<VectorBurialSite, "churchyard">,
  size: { lengthMeters: number; depthMeters: number },
  taken: VectorPolygon[],
  profile: BurialCultureProfile
): { boundary: VectorPolygon; center: Point; axes: [Point, Point] } | undefined {
  const center = doc.site!.center,
    water = allVectorWater(doc),
    roads = Object.values(doc.paths).filter(p => p.role === "road"),
    blocked = [...roads.map(pathSurface), ...taken],
    half = doc.frame.extentMeters / 2 - 2,
    // The built-up disc: the site as sized for the houses.
    radius = Math.max(
      ...doc.site!.domain.flatMap(p => p.outer).map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))
    ),
    rng = makeRng(`${doc.recipe.seed}:cemetery:${profile.id}`),
    depth = size.depthMeters,
    length = Math.max(size.lengthMeters, site === "extramural" ? 30 : 20);
  const candidates: { boundary: VectorPolygon; center: Point; axes: [Point, Point]; score: number }[] = [];
  const lines =
    site === "extramural" ? roads : Object.values(doc.paths).filter(p => p.role === "river" && p.id !== "town-moat");
  for (const line of lines) {
    const offset =
      site === "extramural"
        ? depth / 2 + 8
        : Math.max(line.width.leftMeters, line.width.rightMeters) + depth / 2 + CEMETERY_CLEARANCE_METERS;
    const samples = samplePath(line).map(s => s.point);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i],
        span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 1e-6) continue;
      const u: Point = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      for (let t = 0; t < span; t += 10) {
        const p: Point = [a[0] + u[0] * t, a[1] + u[1] * t],
          out = Math.hypot(p[0] - center[0], p[1] - center[1]) - radius;
        if (site === "extramural" ? out < depth || out > 260 : out > -depth) continue;
        for (const side of [1, -1]) {
          const v: Point = [-u[1] * side, u[0] * side],
            c: Point = [p[0] + v[0] * offset, p[1] + v[1] * offset],
            corner = (du: number, dv: number): Point => [c[0] + u[0] * du + v[0] * dv, c[1] + u[1] * du + v[1] * dv],
            rect = (grow: number) => [
              corner(-length / 2 - grow, -depth / 2 - grow),
              corner(length / 2 + grow, -depth / 2 - grow),
              corner(length / 2 + grow, depth / 2 + grow),
              corner(-length / 2 - grow, depth / 2 + grow)
            ],
            outer = rect(0);
          if (outer.some(q => Math.abs(q[0]) > half || Math.abs(q[1]) > half)) continue;
          const ccw = (ring: Point[]) => (polygonArea(ring) < 0 ? ring.reverse() : ring),
            boundary: VectorPolygon = { outer: ccw(outer), holes: [] },
            grown: VectorPolygon = { outer: ccw(rect(CEMETERY_CLEARANCE_METERS)), holes: [] },
            wet = (regions: VectorPolygon[]) =>
              regionBoolean([grown], regions, "intersection").some(r => regionArea(r) > 1e-5);
          if (wet(water) || wet(blocked)) continue;
          if (
            site === "extramural"
              ? regionBoolean([boundary], doc.site!.domain, "intersection").some(r => regionArea(r) > 1e-5)
              : regionBoolean([boundary], doc.site!.domain, "difference").some(r => regionArea(r) > 1e-5)
          )
            continue;
          // The mesh editor's scores: near the gate road some 120 m out, or the bank nearest the centre.
          const score =
            site === "extramural"
              ? 30 / (1 + Math.abs(out - 120) / 60) +
                (profile.zoning === "topographic_hill" || profile.zoning === "isolated_highland" ? out * 0.2 : 0) +
                rng() * 10
              : -Math.hypot(c[0] - center[0], c[1] - center[1]) + rng() * 10;
          candidates.push({ boundary, center: c, axes: [u, v], score });
        }
      }
    }
  }
  return candidates.sort((x, y) => y.score - x.score)[0];
}
