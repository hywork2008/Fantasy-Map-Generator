import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { parseIncomingPayload } from "../../../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../../services/io/shareRequest";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { buildBlockFabric } from "../../blockInfill";
import { generateCityOnDocument } from "../../generation/generateCity";
import { defaultGenerationSettings } from "../../generation/settings";
import { polygonArea } from "../../geom";
import { FabricCache } from "../../localInfill";
import { facePoints } from "../../mesh";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseRing, unpackLine, unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallShares } from "./urbanCapacity";
import { vectorWallChoice } from "./wallShape";

/**
 * Pre-acceptance U2 (docs/plan/ce-meshless-pre-acceptance-improvements.md): where the land inside the town wall
 * goes, by the meshless generator's own records. Opt-in:
 * CE_DENSITY_U2_OUT=docs/analytics/ce-meshless-density-u2-20261113.json npx vitest run <this file>
 */
const output = process.env.CE_DENSITY_U2_OUT;
Error.stackTraceLimit = 200_000;
const CASES = (
  process.env.CE_DENSITY_U2_CASES ??
  "synthetic-round-3000,synthetic-square-5000,synthetic-round-20000,gothengsfeld-20261012,erente-20261009,obern-20261027"
).split(",");
const ALL_MODES = ["medieval", "medieval-facilities"] as const;
const MODES = ALL_MODES.filter(m => (process.env.CE_DENSITY_U2_MODES?.split(",") ?? ALL_MODES).includes(m));

async function town(name: string, mode: (typeof ALL_MODES)[number]) {
  // The mode follows the setting as the editor sets it (`vectorUrbanMode`): facilities size the site only in facility mode.
  const settings = {
    ...defaultGenerationSettings(),
    ...(mode === "medieval-facilities" ? { facilityLayout: "population" as const } : {})
  };
  let seed = name,
    population: number,
    frame: { extentMeters: number; cityRadiusMeters: number; blockSizeMeters: number };
  if (name.startsWith("synthetic")) {
    const [, shape, pop] = name.split("-");
    population = Number(pop);
    settings.wallShape = shape as "round";
    settings.config = {
      ...settings.config,
      rivers: ["through"],
      features: { ...settings.config.features, walls: true, shanty: false, port: false }
    };
    const r = 396 * Math.sqrt(population / 5000);
    frame = { extentMeters: Math.round(r * 4), cityRadiusMeters: r, blockSizeMeters: 50 };
  } else {
    const raw = (await import(`../../../data/fixtures/${name}.json`)).default as { descriptor?: unknown };
    const d = structuredClone(raw.descriptor ?? raw) as BurgSiteDescriptor;
    d.burg.shanty = false;
    settings.descriptor = d;
    seed = d.burg.seed ?? name;
    population = d.burg.population;
    frame = { extentMeters: d.frame.extentMeters, cityRadiusMeters: d.frame.cityRadiusMeters, blockSizeMeters: 50 };
  }
  settings.population = defaultPopulationSettings(population);
  const input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 });
  input.context.targetPopulation = population;
  const wall = vectorWallChoice(
    settings,
    seed,
    input.context.historicalPeriod ?? "ageOfExploration",
    frame.extentMeters
  );
  const skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  const started = performance.now();
  const doc = generateVectorUrban(skeleton, {
    ...DEFAULT_VECTOR_URBAN,
    mode,
    population: population * Number(process.env.CE_DENSITY_U2_DEMAND ?? 1),
    lotOccupancy: 1
  });
  return { doc, population, wall: wall.wall, ms: Math.round(performance.now() - started) };
}

const area = (polygons: VectorPolygon[]) => polygons.reduce((n, p) => n + regionArea(p), 0);
const clip = (polygons: VectorPolygon[], to: VectorPolygon[]) => {
  try {
    return area(regionBoolean(polygons, to, "intersection"));
  } catch {
    return Number.NaN;
  }
};
const union = (polygons: VectorPolygon[]) => (polygons.length ? regionBoolean(polygons, [], "union") : []);
const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function measure(doc: VectorCityDocument) {
  const circuit = Object.values(doc.connections.circuits).find(c => !c.parentCircuitId);
  if (!circuit) return undefined;
  const inside = [ring(sampledClosedRing(doc, circuit.pathId))],
    wallArea = area(inside);
  // Houses of the fabric and as placements.
  const houses: VectorPolygon[] = [];
  for (const cell of Object.values(doc.fabric?.cells ?? {})) {
    const detached = new Set(cell.detached);
    for (let i = 0; i < cell.houses.offsets.length; i++)
      if (!detached.has(i)) houses.push(ring(cellHouseRing(cell, i)));
  }
  const placements = Object.values(doc.placements),
    facilities = placements.filter(p => p.building?.kind === "facility"),
    housePlacements = placements.filter(p => p.building?.kind === "housing");
  houses.push(...housePlacements.map(p => p.site));
  const facilitySites = facilities.map(p => p.site),
    facilityFootprints = facilities.flatMap(p => p.building!.footprint),
    others = placements.filter(p => !p.building).map(p => p.site),
    features = Object.values(doc.environment?.features ?? {}).map(f => f.boundary),
    parks = (doc.urban?.parks ?? []).flatMap(p => p.lawns.map(l => ring(l as Point[]))),
    residual = doc.urban?.residualLand ?? [],
    lines = Object.values(doc.paths)
      .filter(p => p.role === "road" || p.role === "wall" || p.role === "river")
      .flatMap(p => {
        try {
          return [pathSurface(p)];
        } catch {
          return [];
        }
      }),
    water = (doc.site?.water ?? []).flatMap(w => w.polygons);
  const inHouses = clip(union(houses), inside),
    inFacilitySites = clip(union(facilitySites), inside),
    inFacilityFootprints = clip(union(facilityFootprints), inside),
    inResidual = clip(union(residual), inside),
    inFeatures = clip(union(features), inside),
    inParks = clip(union(parks), inside),
    inOthers = clip(union(others), inside),
    inLinesWater = clip(union([...lines, ...water]), inside);
  // Street blocks: everything not road, wall, river or water.
  const blockLand = wallArea - inLinesWater;
  // Street blocks (fabric cells) inside the wall, and the streets and lanes as length times width.
  const cells = Object.values(doc.fabric?.cells ?? {}).filter(c => c.inside),
    cellLand = clip(union(cells.map(c => ring(unpackPoints(c.ring, c.origin)))), inside);
  const lineArea = (
    lines: { widths: number[]; offsets: number[] },
    origin: Point,
    full: Parameters<typeof unpackLine>[0]
  ) =>
    lines.widths.reduce((n, w, i) => {
      const pts = unpackLine(full, i, origin);
      let length = 0;
      for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      return n + length * w;
    }, 0);
  const lanesM2 = cells.reduce((n, c) => n + lineArea(c.lanes, c.origin, c.lanes), 0),
    insideDistricts = new Set(cells.map(c => c.districtId)),
    streetsM2 = Object.values(doc.fabric?.districts ?? {})
      .filter(d => insideDistricts.has(d.id))
      .reduce((n, d) => n + lineArea(d.streets, d.origin, d.streets), 0);
  // Vacant land: on a street or lane (an unbuilt lot) or in a block's core (land the lots never reached).
  const frontLines = [
    ...cells.flatMap(c => c.lanes.widths.map((_, i) => unpackLine(c.lanes, i, c.origin))),
    ...Object.values(doc.fabric?.districts ?? {})
      .filter(d => insideDistricts.has(d.id))
      .flatMap(d => d.streets.widths.map((_, i) => unpackLine(d.streets, i, d.origin))),
    ...Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => samplePath(p).map(q => q.point))
  ];
  const nearLine = (p: Point, reach: number) =>
    frontLines.some(line => line.slice(1).some((b, k) => pointSegmentDistance(p, line[k], b) < reach));
  let frontVacant = 0,
    coreVacant = 0;
  for (const r of regionBoolean(residual, inside, "intersection")) {
    const a = regionArea(r);
    if (a < 1) continue;
    if (r.outer.some(p => nearLine(p, 6))) frontVacant += a;
    else coreVacant += a;
  }
  const houseAreas = houses.filter(h => regionBoolean([h], inside, "intersection").length).map(h => regionArea(h));
  const shares = vectorWallShares(doc);
  return {
    wallAreaM2: Math.round(wallArea),
    roadWallRiverWaterM2: Math.round(inLinesWater),
    blockLandM2: Math.round(blockLand),
    housesM2: Math.round(inHouses),
    facilitySitesM2: Math.round(inFacilitySites),
    facilityFootprintsM2: Math.round(inFacilityFootprints),
    facilityYardsM2: Math.round(inFacilitySites - inFacilityFootprints),
    featuresM2: Math.round(inFeatures),
    parksM2: Math.round(inParks),
    otherPlacementsM2: Math.round(inOthers),
    residualM2: Math.round(inResidual),
    residualOnFrontM2: Math.round(frontVacant),
    residualInCoresM2: Math.round(coreVacant),
    streetBlocksM2: Math.round(cellLand),
    fabricStreetsM2: Math.round(streetsM2),
    fabricLanesM2: Math.round(lanesM2),
    // Built roof cover over the block land (houses and facility buildings).
    coverOfBlockLand: +((inHouses + inFacilityFootprints) / blockLand).toFixed(3),
    houseCountInside: houseAreas.length,
    houseLotMedianM2: Math.round(median(houseAreas)),
    shares
  };
}

it.runIf(!!output)(
  "U2: land use inside the wall",
  async () => {
    const rows: Record<string, unknown>[] = [];
    for (const name of CASES)
      for (const mode of MODES) {
        try {
          const { doc, population, wall, ms } = await town(name, mode);
          const report = doc.urban!.report;
          rows.push({
            case: name,
            mode,
            population,
            wall,
            urbanMs: ms,
            requiredDwellings: report.requiredDwellings,
            capacityInside: report.capacityInside,
            capacityOutside: report.capacityOutside,
            unplacedPopulation: report.unplacedPopulation,
            placedFacilities: report.placedFacilities,
            requiredFacilities: report.requiredFacilities,
            ...measure(doc)
          });
        } catch (e) {
          rows.push({
            case: name,
            mode,
            error: String(e).slice(0, 200),
            stack: (e as Error).stack
              ?.split("\n")
              .filter(l => !l.includes("polygon-clipping"))
              .slice(0, 14)
              .join(" | ")
          });
        }
        console.log(JSON.stringify(rows.at(-1)));
      }
    writeFileSync(output!, `${JSON.stringify(rows, null, 2)}\n`);
  },
  3_600_000
);

/** The mesh editor's town on the same FMG fixtures, as the comparison U3 aims at: built lots over the core faces.
 * CE_DENSITY_U2_MESH_OUT=docs/analytics/ce-meshless-density-u2-mesh-20261113.json npx vitest run <this file> */
const meshOutput = process.env.CE_DENSITY_U2_MESH_OUT;
it.runIf(!!meshOutput)(
  "U2: the mesh editor's core on the same FMG fixtures",
  async () => {
    const rows: Record<string, unknown>[] = [];
    for (const name of CASES.filter(c => !c.startsWith("synthetic"))) {
      const raw = (await import(`../../../data/fixtures/${name}.json`)).default as { descriptor?: unknown };
      const share = parseIncomingPayload(JSON.stringify(raw.descriptor ?? raw))!;
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {});
      if (!city) {
        rows.push({ case: name, error: "generation-failed" });
        continue;
      }
      const lots = buildBlockFabric(city, new FabricCache()).buildings,
        core = Object.values(city.mesh.faces).filter(f => f.properties.settlement === "core"),
        coreIds = new Set(core.map(f => f.id)),
        coreArea = core.reduce((n, f) => n + Math.abs(polygonArea(facePoints(city.mesh, f))), 0),
        coreLots = lots.filter(l => coreIds.has(l.faceId)),
        built = coreLots.reduce((n, l) => n + Math.abs(polygonArea(l.polygon)), 0);
      rows.push({
        case: name,
        population: share.descriptor!.burg.population,
        dwellings: share.descriptor!.burg.dwellings,
        coreFacesM2: Math.round(coreArea),
        builtM2: Math.round(built),
        coverOfCoreFaces: +(built / coreArea).toFixed(3),
        lotsCore: coreLots.length,
        lotMedianM2: Math.round(median(coreLots.map(l => Math.abs(polygonArea(l.polygon))))),
        lotsOutskirts: lots.filter(l => city.mesh.faces[l.faceId]?.properties.settlement === "outskirts").length
      });
      console.log(JSON.stringify(rows.at(-1)));
    }
    writeFileSync(meshOutput!, `${JSON.stringify(rows, null, 2)}\n`);
  },
  3_600_000
);
