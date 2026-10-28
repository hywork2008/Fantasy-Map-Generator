import type { CityDocument, Mesh } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import type { Cell, CityGeography, CityParams, CityProgram } from "../../types/geometry";
import { buildEdgeGraph } from "../edgeGraph";
import { resolveWallMaterial } from "../features";
import { type GenerationObserver, generationTimer } from "../generationDiagnostics";
import type { Plan } from "./contracts";
import { planCoast } from "./planning/coast";
import { planDefenses } from "./planning/defenses";
import { planRivers } from "./planning/rivers";
import { outerFrameRoads } from "./planning/roadGeometry";
import { planRoads } from "./planning/roads";
import { planUrban } from "./planning/urban";
import { planWards } from "./planning/wards";
import { fmgCellElevations } from "./planning/waterTerrain";
import { resolveEffectiveLayout, resolveStreetSettings } from "./settings";

export function runPlan(
  mesh: Mesh,
  faceIdOf: string[],
  cells: Cell[],
  geo: CityGeography,
  program: CityProgram,
  params: CityParams,
  seed: string,
  half: number,
  cellSize: number,
  settings: GenerationSettings,
  stageStep: number,
  complete = false,
  observer?: GenerationObserver,
  attempt = 1,
  _resolveRiverSplit = true,
  gridKind?: "hex" | "voronoi" | "evolution",
  sourceDocument?: CityDocument
): Plan {
  const mark = generationTimer(observer, attempt);
  const streetOpts = resolveStreetSettings(settings);
  const effectiveLayout = resolveEffectiveLayout(settings.layout ?? settings.config?.layout, params.extentMeters, seed);
  const empty: Plan = {
    townWallBuildOrder: settings.townWallRings === "double" ? settings.townWallBuildOrder : undefined,
    burialProfile: settings.burialProfile ?? settings.descriptor?.burialProfile ?? sourceDocument?.burialProfile,
    fixedCrossings: settings.descriptor?.fixedCrossings,
    replaceFixedCrossings: !!settings.descriptor,
    urbanCoreMode: settings.urbanCoreMode,
    moats: settings.moats,
    legacyCastles: settings.legacyCastles,
    layout: effectiveLayout,
    sea: new Set(),
    ocean: new Set(),
    coastPath: [],
    waterPolygon: null,
    avoidSea: streetOpts.avoidSea,
    wallMaterial: resolveWallMaterial(
      sourceDocument ?? {
        format: "fmg-city-editor",
        version: 1,
        frame: {
          extentMeters: params.extentMeters,
          cityRadiusMeters: params.cityRadiusMeters,
          blockSizeMeters: params.cellSizeMeters
        },
        mesh: { vertices: {}, edges: {}, faces: {} },
        featureGroups: [],
        gates: [],
        elements: []
      },
      {
        choice: settings.config?.wall?.material,
        descriptor: settings.descriptor,
        population: settings.population?.targetPopulation
      }
    ),
    importedRoads: geo.importedRoads,
    frameRoads: outerFrameRoads(settings.descriptor),
    riverPort: geo.riverPort,
    openWaterfront:
      program.wallPlan?.coast === "open" &&
      !!settings.descriptor?.burg.riverPlacement?.coastConstrained &&
      !!settings.descriptor?.burg.waterAccess?.river &&
      !!settings.descriptor?.burg.waterAccess?.sea,
    rivers: [],
    urban: new Set(),
    outskirts: new Set(),
    builtUp: new Set(),
    urbanStages: [],
    borderLoops: [],
    gates: [],
    precincts: [],
    citadelOutline: null,
    roads: [],
    streets: [],
    wards: new Map(),
    wardOrder: [],
    templeHarbor: [],
    fmgElevations: fmgCellElevations(cells, settings.descriptor),
    elevationPreset: settings.elevationPreset ?? "flat",
    elevationRelief: settings.elevationRelief,
    elevationRotation: settings.elevationRotation,
    elevationSeed: seed
  };
  if (!cells.length) return empty;
  const graph = buildEdgeGraph(cells);
  if (!graph.points.length) return empty;
  mark("edge-graph");

  const {
    waterMetadata,
    classified,
    coast,
    coasts,
    coastPath,
    waterPolygon,
    sea,
    coastalWater,
    ocean,
    appliedChannels,
    landArea
  } = planCoast({
    geo,
    cells,
    graph,
    half,
    cellSize,
    seed,
    settings
  });
  Object.assign(empty, waterMetadata);

  mark("coast");
  if (stageStep < 2) return { ...empty, sea, ocean, coastPath, waterPolygon };

  const {
    outsideRiver,
    compactCore,
    preserveImportedCore,
    openCoastalCore,
    urbanRadius,
    urbanBearings,
    plannedUrban,
    plannedCore,
    burgCell,
    retainBurg,
    rivers,
    river
  } = planRivers({
    cells,
    sea,
    coast,
    settings,
    geo,
    program,
    params,
    complete,
    stageStep,
    effectiveLayout,
    seed,
    gridKind,
    mesh,
    faceIdOf,
    cellSize,
    half,
    graph
  });

  mark("river");
  if (stageStep < 3) return { ...empty, sea, ocean, coastPath, waterPolygon, rivers };

  let {
    residentialOutskirts,
    urbanStages,
    currentMesh,
    currentFaceIdOf,
    currentCells,
    currentUrban,
    currentBuiltUp,
    currentOutskirts,
    meshModified
  } = planUrban({
    landArea,
    plannedUrban,
    cells,
    sea,
    river,
    urbanBearings,
    urbanRadius,
    params,
    complete,
    stageStep,
    settings,
    program,
    compactCore,
    openCoastalCore,
    plannedCore,
    mark,
    mesh,
    faceIdOf,
    preserveImportedCore,
    effectiveLayout,
    outsideRiver,
    seed,
    gridKind,
    retainBurg,
    burgCell,
    rivers
  });

  if (stageStep < 4) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  const defenses = planDefenses({
    rivers,
    currentMesh,
    currentFaceIdOf,
    currentUrban,
    currentCells,
    sea,
    geo,
    params,
    settings,
    program,
    effectiveLayout,
    urbanRadius,
    seed,
    half,
    cellSize,
    sourceDocument,
    water: empty,
    currentOutskirts,
    currentBuiltUp,
    residentialOutskirts,
    ocean,
    coastalWater,
    meshModified,
    coast,
    streetOpts,
    waterPolygon
  });

  const {
    borderLoops,
    genBorders,
    precincts,
    citadelOutline,
    castleSite,
    castleFailure,
    castleFailureDetails,
    innerWall,
    streetHub,
    canPlaceTownGate,
    gates
  } = defenses;
  ({
    currentMesh,
    currentFaceIdOf,
    currentUrban,
    currentCells,
    currentOutskirts,
    currentBuiltUp,
    residentialOutskirts,
    meshModified
  } = defenses);

  empty.castleSite = castleSite;
  empty.castleFailure = castleFailure;
  empty.castleFailureDetails = castleFailureDetails;

  mark("wall-plan");
  if (stageStep < 5) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      borderLoops,
      gates,
      precincts,
      citadelOutline,
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  const { streetResult, routedGates, streetGeo, roads, gateStreets } = planRoads({
    currentCells,
    currentUrban,
    sea,
    waterPolygon,
    coast,
    genBorders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSize,
    half,
    rivers,
    streetOpts,
    canPlaceTownGate,
    settings,
    params,
    seed,
    coasts,
    appliedChannels,
    streetHub
  });

  mark("street-plan");
  if (stageStep < 6) {
    return {
      ...empty,
      sea,
      ocean,
      coastPath,
      waterPolygon,
      rivers,
      urban: currentUrban,
      outskirts: currentOutskirts,
      urbanStages,
      builtUp: currentBuiltUp,
      borderLoops,
      gates: routedGates,
      precincts,
      citadelOutline,
      roads,
      streets: [],
      mesh: meshModified ? currentMesh : undefined,
      faceIdOf: meshModified ? currentFaceIdOf : undefined,
      cells: meshModified ? currentCells : undefined
    };
  }

  const { fmgElevations, warded } = planWards({
    settings,
    sourceDocument,
    seed,
    half,
    params,
    currentCells,
    currentUrban,
    currentOutskirts,
    residentialOutskirts,
    sea,
    coastalWater,
    genBorders,
    routedGates,
    precincts,
    streetGeo,
    program,
    coast,
    classified,
    waterPolygon,
    streetResult,
    roads,
    rivers,
    geo,
    currentFaceIdOf
  });

  mark("wards");
  return {
    townWallBuildOrder: empty.townWallBuildOrder,
    innerWall,
    fmgElevations,
    elevationPreset: empty.elevationPreset,
    elevationRelief: empty.elevationRelief,
    elevationRotation: empty.elevationRotation,
    elevationSeed: empty.elevationSeed,
    burialProfile: empty.burialProfile,
    urbanCoreMode: settings.urbanCoreMode,
    layout: effectiveLayout,
    castleSite,
    castleFailure,
    castleFailureDetails,
    moats: settings.moats,
    legacyCastles: settings.legacyCastles,
    sea,
    ocean,
    coastPath,
    waterPolygon,
    avoidSea: streetOpts.avoidSea,
    wallMaterial: empty.wallMaterial,
    channelPolygons: empty.channelPolygons,
    regionalWater: empty.regionalWater,
    regionalSurface: empty.regionalSurface,
    fixedCrossings: empty.fixedCrossings,
    replaceFixedCrossings: empty.replaceFixedCrossings,
    rivers,
    urban: currentUrban,
    outskirts: currentOutskirts,
    urbanStages,
    builtUp: currentBuiltUp,
    borderLoops,
    gates: routedGates,
    precincts,
    citadelOutline,
    roads: complete ? roads : [...roads, ...gateStreets],
    roadPaths: geo.roadPaths,
    importedRoads: geo.importedRoads,
    frameRoads: empty.frameRoads,
    riverPort: geo.riverPort,
    openWaterfront: empty.openWaterfront,
    streets: complete ? streetResult.streets : gateStreets,
    wards: new Map(warded.wards.map(w => [w.cellId, w.kind])),
    wardOrder: warded.assignmentOrder,
    templeHarbor: warded.precincts,
    mesh: meshModified ? currentMesh : undefined,
    faceIdOf: meshModified ? currentFaceIdOf : undefined,
    cells: meshModified ? currentCells : undefined
  };
}
