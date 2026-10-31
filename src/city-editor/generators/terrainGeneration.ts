import type { CityDocument } from "../types/document";
import type { GenerationSettings } from "../types/generation";
import { cellRelief } from "./cellRelief";
import { elevationSampler, presetAmplitude } from "./elevationPreset";
import { applyPlan } from "./generation/assembly/applyPlan";
import { runPlan } from "./generation/pipeline";
import { prepareRun } from "./generation/prepareRun";
import { polygonCentroid } from "./geom";
import { clone, facePoints } from "./mesh";
import { attachTerrainField } from "./terrainField/attach";
import { terrainFieldForDocument } from "./terrainField/build";
import { buildRiverCorridors, SLOPE_BANK_RUN_METERS } from "./terrainField/corridor";
import { sampleField } from "./terrainField/sample";

/** Geography without settlement grading. The saved continuous field is shared by ground and trees. */
export function generateTerrainOnDocument(
  source: CityDocument,
  settings: GenerationSettings,
  seed: string
): CityDocument | null {
  const input = clone({ ...source, fabric: undefined });
  input.buildingHeightPolicy = settings.buildingHeightPolicy;
  input.buildingHeightLimit = settings.buildingHeightLimit;
  const clean = clone(input);
  clean.featureGroups = clean.featureGroups.filter(group => group.kind === "river");
  clean.elements = [];
  for (const key of [
    "castles",
    "defenseCircuits",
    "gates",
    "fortSite",
    "bastionedTown",
    "populationPlan",
    "populationReport",
    "residentialClusters",
    "urbanGrowth",
    "urbanMorphology",
    "housingCapacity",
    "townWallGeneration",
    "fixedCrossingApproaches",
    "cemeteries",
    "landmarks",
    "vacantLotTrees",
    "siteEconomy",
    "ruralFieldSnapshot",
    "terrain"
  ] as const)
    delete clean[key];
  for (const face of Object.values(clean.mesh.faces)) {
    face.properties.locked = false;
    face.properties.ward = null;
    delete face.properties.settlement;
    delete face.properties.wallRing;
  }
  const geography: GenerationSettings = {
    config: {
      ...settings.config,
      features: { walls: false, plaza: false, temple: false, citadel: false, port: false, shanty: false }
    },
    descriptor: settings.descriptor,
    elevationPreset: settings.elevationPreset,
    elevationRelief: settings.elevationRelief,
    elevationRotation: settings.elevationRotation,
    forestSettings: settings.forestSettings,
    historicalPeriod: settings.historicalPeriod
  };
  const prepared = prepareRun(clean, geography, seed);
  const { cells, faceIdOf, geo, program, params, half, cellSize } = prepared;
  const plan = runPlan(
    clean.mesh,
    faceIdOf,
    cells,
    geo,
    program,
    params,
    seed,
    half,
    cellSize,
    geography,
    2,
    false,
    undefined,
    1,
    true,
    clean.gridKind,
    clean
  );
  const next = applyPlan(clean, cells, faceIdOf, plan, program, 2, false);
  if (!next) return null;
  next.featureGroups = next.featureGroups.filter(group => group.kind === "river");
  next.frameRoads = undefined;
  next.importedFixedCrossings = undefined;
  next.riverConnections = undefined;
  next.elements = [];
  next.buildingHeightPolicy = settings.buildingHeightPolicy;
  next.buildingHeightLimit = settings.buildingHeightLimit;
  next.biome = settings.descriptor?.biome ?? source.biome;
  next.buildingAppearanceContext = source.buildingAppearanceContext;
  next.forestSettings = settings.forestSettings ?? { version: 1, mode: "surroundings", density: "standard" };
  next.ruralFieldSettings = { ...source.ruralFieldSettings, mode: "off" };
  next.farmlandAreaHectares = 0;
  for (const face of Object.values(next.mesh.faces)) {
    face.properties.ward = null;
    face.properties.buildable = false;
    if (face.properties.water === "land") face.properties.settlement = "outskirts";
  }
  if (settings.terrainField && (settings.elevationPreset ?? "flat") === "flat")
    attachTerrainField(next, settings, seed);
  installNaturalTerrainField(next, settings, seed);
  next.version = 6;
  next.appearance = "town";
  next.generationSeed = seed;
  next.fabric = {
    version: 4,
    seed,
    districts: [],
    generation: { algorithm: "terrain-v1", seed, settings: clone(settings), input }
  };
  return next;
}

/** A regular field avoids cell platforms even at large relief multipliers. */
export function installNaturalTerrainField(document: CityDocument, settings: GenerationSettings, seed: string): void {
  const extent = document.frame.extentMeters;
  const intervals = 128;
  const spacing = extent / intervals;
  const half = extent / 2;
  const preset = settings.elevationPreset ?? "flat";
  const existing = terrainFieldForDocument(document);
  const relief = cellRelief(document);
  const sample = elevationSampler({ ...settings, elevationSeed: seed, rivers: [], waterPolygon: null }, document.frame);
  const amplitude = presetAmplitude(extent, settings.elevationRelief);
  const elevations: number[] = [];
  for (let row = 0; row <= intervals; row++)
    for (let column = 0; column <= intervals; column++) {
      const point: [number, number] = [-half + column * spacing, -half + row * spacing];
      elevations.push(
        preset === "flat"
          ? existing
            ? sampleField(existing, point)
            : relief.datumMeters + relief.heightAt(point)
          : preset === "dome" || preset === "basin"
            ? 2 +
              (amplitude *
                (1 +
                  (preset === "dome" ? 1 : -1) *
                    Math.cos(Math.PI * Math.min(1, Math.hypot(...point) / (half * Math.SQRT2))))) /
                2
            : sample(point, 0, 1)
      );
    }
  document.terrain = {
    version: 1,
    features: [],
    ramps: [],
    field: {
      version: 1,
      template: "noise",
      seed: 0,
      sampleMeters: spacing,
      parts: [
        {
          kind: "coarse",
          origin: [-half, -half],
          spacingMeters: spacing,
          columns: intervals + 1,
          rows: intervals + 1,
          elevationsMeters: elevations
        }
      ]
    }
  };
  const field = terrainFieldForDocument(document)!;
  document.terrain.features = buildRiverCorridors(document, field).map(corridor => ({
    ...corridor,
    bank: { kind: "slope", runMeters: SLOPE_BANK_RUN_METERS }
  }));
  for (const face of Object.values(document.mesh.faces))
    if (face.properties.water === "land")
      face.properties.elevation = sampleField(field, polygonCentroid(facePoints(document.mesh, face)));
}
