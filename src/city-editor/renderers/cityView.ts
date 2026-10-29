import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelQuality } from "../../buildings/modelQuality";
import { sceneVariants } from "../../city3d/adoption";
import { buildingSurfaces } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { WATER_Y } from "../../city3d/core/waterGeometry";
import { createTownBridges, type TownBridges } from "../../city3d/three/bridgeMeshes";
import { createTownBuildingDetails, type TownBuildingDetails } from "../../city3d/three/buildingDetails";
import { bvInstanceGeometry, createBvPrototypeCache } from "../../city3d/three/bvInstances";
import type { CityMassingMeshes } from "../../city3d/three/cityMeshes";
import { createTownCranes, createTownHarborCargo } from "../../city3d/three/craneMeshes";
import { createTownFacilities, type TownFacilities } from "../../city3d/three/facilityMeshes";
import { createTownFarms, type TownFarmMeshes } from "../../city3d/three/farmMeshes";
import { createTownForest, type TownForest } from "../../city3d/three/forestMeshes";
import { createTownFriaries } from "../../city3d/three/friaryMeshes";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { createTownOpenSpaces } from "../../city3d/three/openSpaceMeshes";
import { createTownPiers } from "../../city3d/three/pierMeshes";
import { createTownRegionalHouseLod, type TownRegionalHouseLod } from "../../city3d/three/regionalHouseLod";
import { createTownRoads, roadStampChanged, type TownRoadMeshes } from "../../city3d/three/roadMeshes";
import { createTownShips } from "../../city3d/three/shipMeshes";
import { createTownSpecialBuildings, type TownSpecialBuildings } from "../../city3d/three/specialBuildingMeshes";
import { type CityStructureMeshes, createStructureMassing } from "../../city3d/three/structureMeshes";
import { createTownWalls, type TownWalls } from "../../city3d/three/townWallMeshes";
import {
  createTownWater,
  planCity3dRefresh,
  type TownWaterMeshes,
  townWaterHeightAt,
  waterStampChanged
} from "../../city3d/three/waterMeshes";
import { createTownWells, type TownWells } from "../../city3d/three/wellMeshes";
import type { EditorMessageKey } from "../../i18n/editorMessages";
import { editorText } from "../../i18n/editorMessages";
import type { RoadRibbon } from "../../utils/roadSurface";
import { buildBlockFabric, type DistrictFabric } from "../generators/blockInfill";
import { riverRibbons } from "../generators/bridgeDeck";
import { createBuildingFrontageResolver } from "../generators/buildingFrontage";
import type { BuildingLot } from "../generators/buildingLots.types";
import { cachedForestPlan } from "../generators/forestPlan";
import { hasForestState } from "../generators/forestSettings";
import { buildParkLawns } from "../generators/parkFabric";
import { RIVER_DROP_MIN, riverDropMeters } from "../generators/riverSurface";
import { type CityTerrain, cityTerrain, cityTerrainStamp } from "../generators/terrainElevation";
import { collectTownRoads, townRoadStamp } from "../generators/townRoads";
import { townWaterStamp } from "../generators/townWater";
import { waterPolygons } from "../generators/waterGeometry";
import type { FloorUse, RoofForm, RoofMaterial, WallMaterial } from "../types/contracts/buildingMassing";
import type { ForestPlan, ForestQualityPreference } from "../types/contracts/forest";
import type { SimplificationPreferences } from "../types/contracts/simplification";
import type { StructureKind, StructureMassing, StructureMaterial } from "../types/contracts/structureMassing";
import type { CityDocument } from "../types/document";
import { createFogControls, readFogSettings } from "./fogControls";
import { ForestAutoQuality } from "./forestAutoQuality";
import { collectOpenSpacePlan } from "./openSpaceSites";
import { collectPierSites } from "./pierSites";
import { type City3dPerformanceSnapshot, type City3dRenderMetrics, collectSceneMetrics } from "./renderMetrics";
import { createSceneryControls, readScenerySettings } from "./sceneryControls";
import { collectShipSites } from "./shipSites";
import { createSkyBackdrop } from "./skyBackdrop";
import { standaloneHousingAppearance, standaloneHousingDocument } from "./standaloneHousingAppearance";
import { collectCityStructures, landmarkLotStructures } from "./structureMassing";
import { createSunControls } from "./sunControls";
import { readSunSettings, updateSun, writeSunSettings } from "./sunLighting";
import { groundStructures, lotFoundations, rampStructures, stairStructures } from "./terrainMassing";
import { prepareTownFacts, resolveCemeteryPlans } from "./townFacts";
import { connectWallWalks } from "./wallWalkConnections";
import { collectWellSites } from "./wellSites";

const WALL_KEY: Record<WallMaterial, EditorMessageKey> = {
  "timber-frame": "cityEditor.messages.massingTimberFrame",
  stone: "cityEditor.messages.massingStone",
  brick: "cityEditor.messages.massingBrick",
  mudbrick: "cityEditor.messages.massingMudbrick",
  wattle: "cityEditor.messages.massingWattle",
  plaster: "cityEditor.messages.massingPlaster"
};
const ROOF_KEY: Record<RoofMaterial, EditorMessageKey> = {
  thatch: "cityEditor.messages.massingThatch",
  tile: "cityEditor.messages.massingTile",
  slate: "cityEditor.messages.massingSlate",
  shingle: "cityEditor.messages.massingShingle",
  lead: "cityEditor.messages.massingLead",
  turf: "cityEditor.messages.massingTurf"
};
const FORM_KEY: Record<RoofForm, EditorMessageKey> = {
  gable: "cityEditor.messages.massingGable",
  hip: "cityEditor.messages.massingHip",
  flat: "cityEditor.messages.massingFlat",
  "lean-to": "cityEditor.messages.massingLeanTo",
  pyramid: "cityEditor.messages.massingPyramid",
  conical: "cityEditor.messages.massingConical",
  dome: "cityEditor.messages.massingDome",
  spire: "cityEditor.messages.massingSpire"
};
const STRUCTURE_KEY: Record<StructureKind, EditorMessageKey> = {
  wall: "cityEditor.messages.massingStructureWall",
  tower: "cityEditor.messages.massingStructureTower",
  gate: "cityEditor.messages.massingStructureGate",
  bridge: "cityEditor.messages.massingStructureBridge",
  landmark: "cityEditor.messages.massingStructureLandmark"
};
const STRUCTURE_MATERIAL: Record<StructureMaterial, EditorMessageKey> = {
  stone: "cityEditor.messages.massingStone",
  wood: "cityEditor.messages.massingTimber"
};
const USE_KEY: Record<FloorUse, EditorMessageKey> = {
  residential: "cityEditor.messages.massingResidential",
  retail: "cityEditor.messages.massingRetail",
  craft: "cityEditor.messages.massingCraft",
  storage: "cityEditor.messages.massingStorage",
  stable: "cityEditor.messages.massingStable",
  civic: "cityEditor.messages.massingCivic",
  religious: "cityEditor.messages.massingReligious",
  military: "cityEditor.messages.massingMilitary",
  service: "cityEditor.messages.massingService"
};

/** Wall runs already contain gate openings; do not block the gate passages themselves. */
function frontageStructurePolygons(parts: readonly StructureMassing[]): [number, number][][] {
  return parts.flatMap(part => {
    if (!["wall", "tower", "landmark"].includes(part.kind) || part.heightMeters <= 1 || part.baseElevationMeters > 0)
      return [];
    if (part.footprint?.length) return [part.footprint];
    const points = part.centerline ?? [];
    return points.slice(1).flatMap((b, i) => {
      const a = points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) return [];
      const halfWidth = (part.widthMeters ?? 1) / 2;
      const x = ((b[1] - a[1]) / length) * halfWidth,
        y = ((a[0] - b[0]) / length) * halfWidth;
      return [
        [
          [a[0] + x, a[1] + y],
          [b[0] + x, b[1] + y],
          [b[0] - x, b[1] - y],
          [a[0] - x, a[1] - y]
        ] as [number, number][]
      ];
    });
  });
}

interface Mount {
  own(cleanup: () => void): void;
  listen(target: EventTarget, type: string, handler: (event: Event) => void): void;
}

/**
 * CE-only 3D view. WebGL starts on the first open. Buildings follow the fabric
 * object. Water follows the stamp and the ce-water parent. A pan does not
 * rebuild either, and closing the view keeps the scene.
 */
export interface City3dMountOptions {
  canvasHost: HTMLElement;
  map: HTMLElement;
  scope: Mount;
  getDocument: () => CityDocument;
  /** Current 2D viewBox half-size in plan meters. */
  getViewHalfSize?: () => number;
  getViewCenter?: () => readonly [number, number];
  /** Requested detailed-model quality; each model falls back to the tiers it ships. */
  getModelQuality?: () => ModelQuality;
  getSimplification?: () => SimplificationPreferences;
  /** Forest display preference is independent of housing detail and city contents. */
  getForestQuality?: () => ForestQualityPreference;
  isFmgLinked?: () => boolean;
  /** Draw-grid spacing for a height field. Absent uses the automatic spacing. */
  getTerrainSpacing?: () => number | "auto";
  /** Metres the river surface sits below the land it touches. Absent keeps 1 m. */
  getRiverDropMeters?: () => number;
}

export function mountCity3d(initialOptions: City3dMountOptions): {
  sync(): void;
  resetCamera(): void;
  dispose(): void;
  getPerformance(): City3dPerformanceSnapshot | null;
  /** Per-frame metrics without walking the resident scene. */
  getFramePerformance(): Pick<City3dPerformanceSnapshot, "frame" | "forest" | "forestQuality" | "housing"> | null;
  restoreView(saved: NonNullable<City3dPerformanceSnapshot["camera"]>): void;
  /** Adopted BV variants drawn by the open 3D view; null while it is closed. */
  getModelVariants(): string[] | null;
  /** Move the live scene into a rebuilt editor mount (language change) without regenerating meshes. */
  adopt(next: City3dMountOptions): void;
} {
  let options = initialOptions;
  const viewport = document.createElement("div");
  viewport.className = "ce-3d";
  viewport.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ce-view-toggle";
  button.textContent = editorText("cityEditor.messages.view3d");
  const readout = document.createElement("output");
  readout.className = "ce-3d-readout";
  readout.hidden = true;
  const zoomReadout = document.createElement("output");
  zoomReadout.className = "ce-3d-zoom";
  zoomReadout.hidden = true;
  zoomReadout.title = editorText("cityEditor.messages.zoom3dHint");
  options.canvasHost.append(viewport, button, readout, zoomReadout);

  const sunSettings = readSunSettings();
  const fogSettings = readFogSettings();
  const scenerySettings = readScenerySettings();
  if (options.isFmgLinked?.()) scenerySettings.style = "none";
  let sun: THREE.DirectionalLight | null = null;
  let shadowBounds = new THREE.Box3();
  const createLightingPanel = () => {
    const panel = createSunControls(
      sunSettings,
      (target, type, handler) => options.scope.listen(target, type, handler),
      () => {
        writeSunSettings(sunSettings);
        if (sun) updateSun(sun, shadowBounds, sunSettings);
        if (renderer) renderer.shadowMap.needsUpdate = true;
        requestRender();
      }
    );
    panel.append(
      createFogControls(
        fogSettings,
        (target, type, handler) => options.scope.listen(target, type, handler),
        () => requestRender()
      ),
      createSceneryControls(
        scenerySettings,
        (target, type, handler) => options.scope.listen(target, type, handler),
        () => requestRender()
      )
    );
    return panel;
  };
  let lightingPanel = createLightingPanel();
  options.canvasHost.append(lightingPanel);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  const atmosphere = new THREE.Fog(0xc5c5bf);
  const sky = createSkyBackdrop(() => requestRender());
  let atmosphereRange = 600;
  let mapHalfExtent = 1;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let massing: CityMassingMeshes | null = null;
  let buildingDetails: TownBuildingDetails | null = null;
  let structures: CityStructureMeshes | null = null;
  let townWalls: TownWalls | null = null;
  let wells: TownWells | null = null;
  let specialBuildings: TownSpecialBuildings | null = null;
  let regionalHouses: TownRegionalHouseLod | null = null;
  let simplification: SimplificationPreferences = { urban: "auto", outskirts: "auto" };
  let facilities: TownFacilities | null = null;
  let bridges: TownBridges | null = null;
  const bvPrototypes = createBvPrototypeCache();
  let openSpaces: ReturnType<typeof createTownOpenSpaces> | null = null;
  let farmland: TownFarmMeshes | null = null;
  let farmlandSource: DistrictFabric["farms"] | null = null;
  const forestQuality = new ForestAutoQuality();
  let previousMotionFrame: { at: number; endedAt: number; camera: string } | null = null;
  let cameraChanged = false;
  const requestCameraRender = () => {
    cameraChanged = true;
    requestRender();
  };
  let forest: TownForest | null = null;
  let forestSource: ForestPlan | null = null;
  let forestStyleStamp = "";
  let forestShadowPending = false;
  let forestShadowTimer: ReturnType<typeof setTimeout> | undefined;
  let lastForestShadowAt = -Infinity;
  let friaries: CityStructureMeshes | null = null;
  let friaryStamp: string | null = null;
  let openSpaceStamp: string | null = null;
  let ships: CityStructureMeshes | null = null;
  let shipStamp: string | null = null;
  let objects: ReturnType<typeof createTownObjects> | null = null;
  let objectStamp: string | null = null;
  let piers: CityStructureMeshes | null = null;
  let cranes: ReturnType<typeof createTownCranes> | null = null;
  let craneStamp = "";
  let harborCargo: ReturnType<typeof createTownHarborCargo> | null = null;
  let pierStamp: string | null = null;
  let waterMeshes: TownWaterMeshes | null = null;
  let roadMeshes: TownRoadMeshes | null = null;
  let ground: THREE.Mesh | null = null;
  let waterStamp: string | null = null;
  let roadStamp: string | null = null;
  let roadWarned: string | null = null;
  let structureList: StructureMassing[] = [];
  let terrain: CityTerrain | null = null;
  let terrainStamp: string | null = null;
  let highlight: THREE.LineSegments | null = null;
  let built: DistrictFabric | null = null;
  let builtQuality: ModelQuality | null = null;
  let framedRadius = 0;
  let raf = 0;
  let disposed = false;
  let pointer: { x: number; y: number } | null = null;
  let lastRender: City3dRenderMetrics | null = null;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const requestRender = () => {
    if (!disposed && !viewport.hidden && !raf) raf = requestAnimationFrame(tick);
  };

  const resize = () => {
    if (!renderer || !camera || viewport.hidden) return;
    const rect = options.canvasHost.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  };

  // Stay on +Z. planVertex maps plan +y to -Z, so the far side matches SVG up.
  const frameCamera = (document: CityDocument) => {
    if (!camera || !controls) return;
    const radius = Math.max(30, document.frame.cityRadiusMeters);
    const center = options.getViewCenter?.() ?? [0, 0];
    const elevation = terrain?.heightAt([center[0], center[1]]) ?? 0;
    // Keep the OrbitControls world-up axis on +Y, as before the nadir view.
    // A tiny +Z offset defines screen-up at the pole without a visible tilt.
    const halfView = Math.max(1, options.getViewHalfSize?.() ?? document.frame.extentMeters / 2);
    // Perspective projection at nadir: distance * tan(fov/2) is the visible half-height.
    // SVG fits its square viewBox into the shorter viewport dimension.
    const distance = halfView / Math.min(1, camera.aspect) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.position.set(center[0], elevation + distance, -center[1] + 0.001);
    controls.target.set(center[0], elevation, -center[1]);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
    framedRadius = radius;
  };

  const clearHighlight = () => {
    if (!highlight || !scene) return;
    scene.remove(highlight);
    highlight.geometry.dispose();
    (highlight.material as THREE.Material).dispose();
    highlight = null;
    requestRender();
  };

  const outline = (positions: Float32Array) => {
    if (!scene || !positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xf1cf55 })
    );
    geometry.dispose();
    scene.add(highlight);
    requestRender();
  };

  const showStructure = (structure: StructureMassing | undefined) => {
    clearHighlight();
    if (!structure) {
      readout.hidden = false;
      readout.textContent = editorText("cityEditor.messages.massingEmpty");
      return;
    }
    const top = structure.baseElevationMeters + structure.heightMeters;
    const line = editorText("cityEditor.messages.structureReadout", {
      value0: editorText(STRUCTURE_KEY[structure.kind]),
      value1: editorText(STRUCTURE_MATERIAL[structure.material]),
      value2: top.toFixed(1)
    });
    readout.hidden = false;
    readout.textContent = structure.name ? `${line}\n${structure.name}` : line;
    const surfaces = structureSurfaces(structure);
    if (!surfaces) return;
    const positions = new Float32Array(surfaces.walls.positions.length + surfaces.roofs.positions.length);
    positions.set(surfaces.walls.positions, 0);
    positions.set(surfaces.roofs.positions, surfaces.walls.positions.length);
    outline(positions);
  };

  const showLot = (lot: BuildingLot | undefined, geometry?: THREE.BufferGeometry) => {
    clearHighlight();
    if (!lot?.massing || !scene) {
      readout.hidden = false;
      readout.textContent = editorText("cityEditor.messages.massingEmpty");
      return;
    }
    const mass = lot.massing;
    readout.hidden = false;
    readout.textContent = `${editorText("cityEditor.messages.massingReadout", {
      value0: mass.storeys,
      value1: editorText(WALL_KEY[mass.wall]),
      value2: `${editorText(FORM_KEY[mass.roof.form])} · ${editorText(ROOF_KEY[mass.roof.material])}`,
      value3: mass.eaveHeightMeters.toFixed(1)
    })}\n${mass.floors.map(floor => editorText(USE_KEY[floor.use])).join(" / ")}`;
    if (geometry) {
      outline(new Float32Array(geometry.getAttribute("position").array));
      return;
    }
    const surfaces = buildingSurfaces(lot.polygon, mass);
    if (!surfaces) return;
    const positions = new Float32Array(surfaces.walls.positions.length + surfaces.roofs.positions.length);
    positions.set(surfaces.walls.positions, 0);
    positions.set(surfaces.roofs.positions, surfaces.walls.positions.length);
    const elevation = terrain?.foundationAt(lot.polygon) ?? 0;
    if (elevation) for (let i = 1; i < positions.length; i += 3) positions[i] += elevation;
    outline(positions);
  };

  const rebuild = (city: CityDocument, fabric: DistrictFabric, quality: ModelQuality = "standard") => {
    if (!scene) return;
    clearHighlight();
    readout.hidden = true;
    const parts = [...collectCityStructures(city), ...landmarkLotStructures(fabric.buildings)];
    let frontageRoads: RoadRibbon[] = [];
    try {
      frontageRoads = terrain?.roads?.ribbons ?? collectTownRoads(city, fabric.lanes);
    } catch {
      // The road layer reports invalid geometry; housing can keep its stable local facade.
    }
    const frontage = createBuildingFrontageResolver(
      [
        ...frontageRoads,
        ...(fabric.parcels ?? []).flatMap(parcel =>
          parcel.access.map(access => ({
            centerline: access.points,
            widthMeters: access.widthMeters,
            parcelId: parcel.id
          }))
        )
      ],
      fabric.buildings,
      [...waterPolygons(city), ...frontageStructurePolygons(parts)]
    );
    const foundation = terrain?.relief ? terrain.foundationAt : undefined;
    const reusedHousing = regionalHouses?.refresh(fabric.buildings, foundation, quality, frontage) ?? false;
    if (!reusedHousing) {
      regionalHouses?.dispose();
      regionalHouses = createTownRegionalHouseLod(
        fabric.buildings,
        bvPrototypes,
        foundation,
        quality,
        frontage,
        simplification.urban !== "off"
      );
      scene.add(regionalHouses.group);
      massing = regionalHouses.massing;
      buildingDetails?.dispose();
      buildingDetails?.group.removeFromParent();
      buildingDetails = createTownBuildingDetails(fabric.buildings, foundation, simplification.urban !== "off");
      scene.add(buildingDetails.group);
    }
    structures?.dispose();
    if (structures) scene.remove(structures.group);
    const grounded = connectWallWalks(
      terrain
        ? [
            ...groundStructures(parts, terrain),
            ...lotFoundations(fabric.buildings, terrain),
            ...rampStructures(terrain),
            ...stairStructures(terrain)
          ]
        : parts
    );
    // Acquire the next layer before releasing the old one, so prototypes survive refreshes.
    const nextSpecial = createTownSpecialBuildings(city, grounded, bvPrototypes, quality);
    if (specialBuildings) {
      scene.remove(specialBuildings.group);
      specialBuildings.dispose();
    }
    specialBuildings = nextSpecial;
    scene.add(specialBuildings.group);
    const nextWalls = createTownWalls(city, grounded, bvPrototypes, quality);
    if (townWalls) {
      scene.remove(townWalls.group);
      townWalls.dispose();
    }
    townWalls = nextWalls;
    scene.add(townWalls.group);
    const nextFacilities = createTownFacilities(city, fabric, grounded, bvPrototypes, quality, terrain ?? undefined);
    if (facilities) {
      scene.remove(facilities.group);
      facilities.dispose();
    }
    facilities = nextFacilities;
    scene.add(facilities.group);
    structureList = grounded.filter(
      part =>
        !specialBuildings!.replaced.has(part.id) &&
        !townWalls!.replaced.has(part.id) &&
        !facilities!.replaced.has(part.id) &&
        !bridges?.replaced.has(part.id)
    );
    structures = createStructureMassing(structureList);
    scene.add(structures.group);
    const nextWells = createTownWells(collectWellSites(city, fabric), terrain?.heightAt, bvPrototypes);
    if (wells) {
      scene.remove(wells.group);
      wells.dispose();
    }
    wells = nextWells;
    scene.add(wells.group);
    if (ground?.parent) {
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(Math.max(20, city.frame.extentMeters), 64);
    }
    if (!framedRadius || Math.abs(city.frame.cityRadiusMeters - framedRadius) / framedRadius > 0.25) frameCamera(city);
    if (!fabric.buildings.some(lot => lot.massing) && !structureList.length) showLot(undefined);
  };

  const ensure = () => {
    if (renderer || disposed) return Boolean(renderer);
    const canvas = document.createElement("canvas");
    canvas.className = "ce-3d-canvas";
    viewport.appendChild(canvas);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      canvas.remove();
      return false;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000);
    scene = new THREE.Scene();
    scene.add(sky.group);
    scene.fog = fogSettings.strength > 0 ? atmosphere : null;
    camera = new THREE.PerspectiveCamera(45, 1, 0.5, 80000);
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    sun = new THREE.DirectionalLight(0xffffff, sunSettings.intensity / 100);
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.autoUpdate = false;
    scene.add(sun, sun.target);
    ground = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshLambertMaterial({ color: 0xd5cfbf }));
    ground.name = "ce-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    scene.add(ground);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.zoomToCursor = true;
    // Keep the target on its horizontal ground plane. Screen-space cursor zoom
    // can lift it into the air, collapsing dolly and pan distances above the city.
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.addEventListener("change", requestCameraRender);
    return true;
  };

  const tick = () => {
    raf = 0;
    if (disposed || viewport.hidden || !renderer || !scene || !camera) return;
    const start = performance.now();
    const pose = [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.zoom].join(",");
    const moving = cameraChanged && previousMotionFrame?.camera !== pose;
    cameraChanged = false;
    const previous = previousMotionFrame;
    previousMotionFrame = moving ? { at: start, endedAt: start, camera: pose } : null;
    if (regionalHouses?.update(camera, renderer.domElement.clientHeight)) forestShadowPending = true;
    if (regionalHouses?.stats.pending) requestRender();
    buildingDetails?.update(camera, renderer.domElement.clientHeight, regionalHouses?.replaced);
    if (forest?.update(camera, renderer.domElement.clientHeight)) forestShadowPending = true;
    if (openSpaces?.update(camera, renderer.domElement.clientHeight)) forestShadowPending = true;
    if (forestShadowPending) {
      const delay = 250 - (performance.now() - lastForestShadowAt);
      if (delay <= 0) {
        renderer.shadowMap.needsUpdate = true;
        if (sun) sun.shadow.needsUpdate = true;
        lastForestShadowAt = performance.now();
        forestShadowPending = false;
        if (forestShadowTimer) clearTimeout(forestShadowTimer);
        forestShadowTimer = undefined;
      } else if (!forestShadowTimer)
        forestShadowTimer = setTimeout(() => {
          forestShadowTimer = undefined;
          requestRender();
        }, delay);
    }
    // Position the fog onset independently of its strength. Scale the transition
    // with the city so the controls remain useful across camera distances.
    const focusDistance = controls ? camera.position.distanceTo(controls.target) : 0;
    const visibleHalfExtent =
      (Math.max(0.001, focusDistance) *
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
        Math.min(1, camera.aspect)) /
      camera.zoom;
    zoomReadout.value = editorText("cityEditor.messages.zoom3d", {
      value0: (mapHalfExtent / visibleHalfExtent).toFixed(2)
    });
    atmosphere.near = (focusDistance * fogSettings.startPercent) / 100;
    atmosphere.far =
      atmosphere.near + Math.max(atmosphereRange, focusDistance * 0.75) * (100 / Math.max(1, fogSettings.strength));
    scene.fog = fogSettings.strength > 0 ? atmosphere : null;
    sky.update(camera, sunSettings);
    sky.setScenery(scenerySettings);
    atmosphere.color.copy(sky.horizon);
    renderer.render(scene, camera);
    const cpuMs = performance.now() - start;
    if (previousMotionFrame) previousMotionFrame.endedAt = start + cpuMs;
    if (!moving || (previous && start - previous.endedAt > 200) || document.hidden) forestQuality.interruptMotion();
    if (forest && moving && previous && !document.hidden) {
      const interval = start - previous.at;
      // Ignore pauses between gestures and sample only consecutive camera frames.
      if (start - previous.endedAt <= 200 && forestQuality.sample(Math.max(cpuMs, interval), start)) {
        forest.setQuality(forestQuality.effective);
        requestRender();
      }
    }
    if (renderer.info) {
      lastRender = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        lines: renderer.info.render.lines,
        points: renderer.info.render.points,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        cpuMs,
        sampledAt: performance.now()
      };
    }
  };

  const riverDrop = () => options.getRiverDropMeters?.() ?? RIVER_DROP_MIN;
  const placeWater = (city: CityDocument) => {
    if (!scene || !ground) return;
    waterMeshes?.dispose();
    waterMeshes = createTownWater(city, terrain ?? undefined, riverDrop());
    if (waterMeshes.replacesDisc) scene.remove(ground);
    else {
      if (!ground.parent) scene.add(ground);
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(Math.max(20, city.frame.extentMeters), 64);
    }
    if (waterMeshes.land) scene.add(waterMeshes.land);
    if (waterMeshes.unknown) scene.add(waterMeshes.unknown);
    scene.add(waterMeshes.parent);
    if (waterMeshes.bank) scene.add(waterMeshes.bank);
  };

  const sync = () => {
    if (viewport.hidden || disposed) return;
    if (!ensure() || !scene) return;
    const city = options.getDocument();
    mapHalfExtent = Math.max(1, city.frame.extentMeters / 2);
    atmosphereRange = Math.max(600, city.frame.cityRadiusMeters * 2);
    const nextSimplification = options.getSimplification?.() ?? { urban: "auto", outskirts: "auto" };
    const urbanChanged = simplification.urban !== nextSimplification.urban;
    const outskirtsChanged = simplification.outskirts !== nextSimplification.outskirts;
    simplification = { ...nextSimplification };
    if (urbanChanged) {
      regionalHouses?.dispose();
      regionalHouses = null;
    }
    // Fabric first: lane geometry is part of the road stamp, and graded roads shape the terrain.
    const quality = options.getModelQuality?.() ?? "standard";
    const fmgLinked = options.isFmgLinked?.() ?? false;
    const appearanceCity = standaloneHousingDocument(city, quality, fmgLinked);
    const fabric = standaloneHousingAppearance(city, buildBlockFabric(city), quality, fmgLinked);
    const stamp = `${townWaterStamp(city)}|${riverDropMeters(riverDrop())}`;
    const roads = townRoadStamp(city, fabric.lanes);
    const spacing = options.getTerrainSpacing?.() ?? "auto";
    const nextTerrainStamp = `${cityTerrainStamp(city)}|${roads}|${spacing}`;
    const terrainChanged = nextTerrainStamp !== terrainStamp;
    if (terrainChanged) {
      let ribbons: RoadRibbon[] | undefined;
      try {
        ribbons = collectTownRoads(city, fabric.lanes);
      } catch {
        // Reported once by the road meshes below; the terrain stays ungraded.
      }
      terrain = cityTerrain(city, { roads: ribbons, renderSpacing: spacing });
      sky.fit(city, terrain.heightAt);
      terrainStamp = nextTerrainStamp;
    }
    const plan = planCity3dRefresh({
      fabricChanged: fabric !== built || terrainChanged || quality !== builtQuality || urbanChanged,
      stampChanged: terrainChanged || waterStampChanged(waterStamp, stamp, Boolean(scene.getObjectByName("ce-water"))),
      roadStampChanged:
        terrainChanged || roadStampChanged(roadStamp, roads, Boolean(scene.getObjectByName("ce-roads"))),
      open: true
    });
    const farmlandChanged =
      outskirtsChanged || terrainChanged || plan.water || farmlandSource !== fabric.farms || !farmland;
    const objectElements = city.elements.filter(item => item.kind === "object");
    const nextObjectStamp = JSON.stringify(objectElements);
    const objectsChanged = terrainChanged || objectStamp !== nextObjectStamp || !objects;
    const shipSites = collectShipSites(city);
    const nextShipStamp = JSON.stringify(shipSites);
    const shipsChanged = plan.water || shipStamp !== nextShipStamp || !scene.getObjectByName("ce-ships");
    const pierSites = collectPierSites(city, fabric.harbor);
    const nextPierStamp = JSON.stringify(pierSites);
    const nextCraneStamp = JSON.stringify([fabric.harbor?.cranes ?? [], fabric.harbor?.cargoPiles ?? []]);
    const cranesChanged = terrainChanged || craneStamp !== nextCraneStamp || !cranes;
    const piersChanged =
      plan.water || terrainChanged || pierStamp !== nextPierStamp || !scene.getObjectByName("ce-piers");
    const nextOpenSpaceStamp = JSON.stringify([
      fabric.parks ?? null,
      city.cemeteries ?? city.mesh,
      city.burialProfile,
      city.biome,
      city.buildingAppearanceContext,
      city.fabric?.generation?.settings.descriptor?.climate,
      city.historicalPeriod
    ]);
    const openSpacesChanged = terrainChanged || plan.buildings || openSpaceStamp !== nextOpenSpaceStamp || !openSpaces;
    const friaryPlans = (fabric.aerialLandmarks?.monasteries ?? []).filter(monastery => monastery.kind === "friary");
    const nextFriaryStamp = JSON.stringify(friaryPlans);
    const friariesChanged = terrainChanged || friaryStamp !== nextFriaryStamp || !friaries;
    const bridgesChanged = plan.buildings || plan.water || plan.roads || !bridges;
    let nextForestSource: ForestPlan | null = null;
    if (hasForestState(city)) {
      const facts = prepareTownFacts(city, undefined, { modelQuality: quality, fmgLinked });
      nextForestSource = cachedForestPlan(city, {
        ...(facts.fabric ?? { farms: [], lanes: [], entrances: new Map() }),
        buildings: facts.lots,
        parks: facts.parks,
        watermills: facts.watermills
      });
    }
    const nextForestStyle = JSON.stringify([
      city.generationSeed,
      city.fabric?.seed,
      city.forestSettings?.density,
      city.biome,
      city.buildingAppearanceContext?.temperatureC,
      city.fabric?.generation?.settings.descriptor?.climate
    ]);
    const forestChanged =
      outskirtsChanged || terrainChanged || forestSource !== nextForestSource || forestStyleStamp !== nextForestStyle;
    if (
      forestQuality.setPreference(
        simplification.outskirts === "off" ? "high" : (options.getForestQuality?.() ?? "auto")
      )
    )
      previousMotionFrame = null;
    const forestQualityChanged = forest?.setQuality(forestQuality.effective) ?? false;
    if (
      !plan.buildings &&
      !plan.water &&
      !plan.roads &&
      !objectsChanged &&
      !shipsChanged &&
      !piersChanged &&
      !cranesChanged &&
      !openSpacesChanged &&
      !friariesChanged &&
      !bridgesChanged &&
      !farmlandChanged &&
      !forestChanged
    ) {
      if (!framedRadius) frameCamera(city);
      if (forestQualityChanged) requestRender();
      return;
    }
    if (friariesChanged) {
      if (friaries) scene.remove(friaries.group);
      friaries?.dispose();
      friaries = createTownFriaries(friaryPlans, terrain ?? undefined);
      scene.add(friaries.group);
      friaryStamp = nextFriaryStamp;
    }
    if (openSpacesChanged) {
      const openSpacePlan = collectOpenSpacePlan(
        fabric.parks ?? buildParkLawns(city),
        resolveCemeteryPlans(city),
        city
      );
      if (openSpaces) scene.remove(openSpaces.group);
      openSpaces?.dispose();
      openSpaces = createTownOpenSpaces(openSpacePlan, terrain ?? undefined);
      scene.add(openSpaces.group);
      openSpaceStamp = nextOpenSpaceStamp;
    }
    if (plan.water) {
      placeWater(city);
      waterStamp = stamp;
    }
    if (bridgesChanged) {
      const next = createTownBridges(
        city,
        terrain ?? undefined,
        point => (waterMeshes ? townWaterHeightAt(waterMeshes, point) : WATER_Y),
        quality
      );
      if (bridges) scene.remove(bridges.group);
      bridges?.dispose();
      bridges = next;
      scene.add(bridges.group);
    }
    if (plan.buildings) {
      built = fabric;
      builtQuality = quality;
      // Defenses and special buildings must use the same automatic culture as the housing preview.
      rebuild(appearanceCity, fabric, quality);
    }
    if (farmlandChanged) {
      const next = createTownFarms(
        fabric.farms,
        terrain ?? undefined,
        waterMeshes?.wetPolygons,
        simplification.outskirts !== "off"
      );
      farmland?.dispose();
      farmland = next;
      farmlandSource = fabric.farms;
      scene.add(next.parent);
    }
    if (forestChanged) {
      previousMotionFrame = null;
      forestQuality.resetSamples();
      const hadForest = Boolean(forest);
      forest?.dispose();
      forest = nextForestSource?.regions.length
        ? createTownForest(
            city,
            nextForestSource,
            terrain ?? undefined,
            forestQuality.effective,
            simplification.outskirts !== "off"
          )
        : null;
      if (forest) scene.add(forest.group);
      forestSource = nextForestSource;
      forestStyleStamp = nextForestStyle;
      forestShadowPending = hadForest || Boolean(forest);
    }
    if (objectsChanged) {
      if (objects) scene.remove(objects.group);
      objects?.dispose();
      objects = createTownObjects(objectElements, terrain?.heightAt, bvPrototypes);
      scene.add(objects.group);
      objectStamp = nextObjectStamp;
    }
    if (shipsChanged && waterMeshes) {
      ships?.dispose();
      ships = createTownShips(shipSites, point => townWaterHeightAt(waterMeshes!, point));
      scene.add(ships.group);
      shipStamp = nextShipStamp;
    }
    if (cranesChanged) {
      cranes?.dispose();
      harborCargo?.dispose();
      harborCargo = createTownHarborCargo(
        fabric.harbor?.cargoPiles ?? [],
        point => terrain?.heightAt(point) ?? 0,
        bvPrototypes
      );
      scene.add(harborCargo.group);
      cranes = createTownCranes(fabric.harbor?.cranes ?? [], point => terrain?.heightAt(point) ?? 0, bvPrototypes);
      scene.add(cranes.group);
      craneStamp = nextCraneStamp;
    }
    if (piersChanged && waterMeshes) {
      piers?.dispose();
      piers = createTownPiers(
        pierSites,
        point => townWaterHeightAt(waterMeshes!, point),
        point => terrain?.heightAt(point) ?? 0
      );
      scene.add(piers.group);
      pierStamp = nextPierStamp;
    }
    // 3D ignores hideStreetLines. That flag is true only while conceal plays back.
    if (plan.roads) {
      try {
        const next = createTownRoads(
          terrain?.roads?.ribbons ?? collectTownRoads(city, fabric.lanes),
          {
            polygons: waterPolygons(city),
            ribbons: riverRibbons(city).map(ribbon => ({ points: ribbon.points, width: ribbon.width }))
          },
          terrain?.relief ? terrain.surfaceAt : undefined,
          terrain?.field ? terrain.heightAt : undefined
        );
        roadMeshes?.dispose();
        scene.add(next.parent);
        roadMeshes = next;
        roadStamp = roads;
        roadWarned = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (roadWarned !== roads) {
          console.warn("town-roads", message);
          roadWarned = roads;
        }
      }
    }
    // Refresh flags and bounds only when geometry changes, never during slider input or camera movement.
    shadowBounds = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      // Sky walls are scenery, not occluders or part of the city's shadow bounds.
      if (object.userData.ceSky) return;
      if (object.userData.ceForest) return;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow =
        object !== ground && materials.some(material => !material.transparent || material.opacity >= 1);
      if (object !== ground && object.visible) shadowBounds.expandByObject(object);
    });
    if (forest) shadowBounds.union(forest.bounds);
    if (openSpaces) shadowBounds.union(openSpaces.treeBounds);
    if (shadowBounds.isEmpty()) shadowBounds.set(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 20, 20));
    if (sun) updateSun(sun, shadowBounds, sunSettings);
    if (renderer) renderer.shadowMap.needsUpdate = true;
    requestRender();
  };

  const setOpen = (open: boolean) => {
    viewport.hidden = !open;
    lightingPanel.hidden = !open;
    zoomReadout.hidden = !open;
    options.map.hidden = open;
    button.textContent = editorText(open ? "cityEditor.messages.view2d" : "cityEditor.messages.view3d");
    button.setAttribute("aria-pressed", open ? "true" : "false");
    readout.hidden = true;
    if (!open) {
      clearHighlight();
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    if (!ensure()) {
      viewport.hidden = true;
      lightingPanel.hidden = true;
      zoomReadout.hidden = true;
      options.map.hidden = false;
      button.textContent = editorText("cityEditor.messages.view3d");
      button.setAttribute("aria-pressed", "false");
      readout.textContent = editorText("cityEditor.messages.webglUnavailable");
      readout.hidden = false;
      return;
    }
    resize();
    sync();
  };

  const pick = (event: PointerEvent) => {
    if (!renderer || !camera || viewport.hidden) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObjects(
      [
        ...(massing?.pickables ?? []),
        ...(structures?.pickables ?? []),
        ...(townWalls?.pickables ?? []),
        ...(specialBuildings?.pickables ?? []),
        ...(regionalHouses?.pickables ?? []),
        ...(facilities?.pickables ?? []),
        ...(bridges?.pickables ?? []),
        ...(wells?.pickables ?? [])
      ],
      false
    )[0];
    if (!hit?.face) {
      clearHighlight();
      readout.hidden = true;
      return;
    }
    const defense = townWalls?.resolve(hit);
    if (defense) {
      showStructure(defense);
      return;
    }
    const house = regionalHouses?.resolve(hit);
    if (house) {
      const geometry = bvInstanceGeometry(hit);
      try {
        showLot(built?.buildings[house.lotIndex], geometry);
      } finally {
        geometry?.dispose();
      }
      return;
    }
    const special = specialBuildings?.resolve(hit);
    const bridge = bridges?.resolve(hit);
    if (bridge) {
      clearHighlight();
      const geometry =
        bvInstanceGeometry(hit) ?? (hit.object as THREE.Mesh).geometry.clone().applyMatrix4(hit.object.matrixWorld);
      geometry.computeBoundingBox();
      readout.hidden = false;
      readout.textContent = `${bridge.name}\n${editorText(STRUCTURE_KEY.bridge)} · ${bridge.points.reduce((length, p, i) => (i ? length + Math.hypot(p[0] - bridge.points[i - 1][0], p[1] - bridge.points[i - 1][1]) : 0), 0).toFixed(1)} m`;
      outline(new Float32Array(geometry.getAttribute("position").array));
      geometry.dispose();
      return;
    }
    const facility = facilities?.resolve(hit);
    const well = wells?.resolve(hit);
    if (special || facility || well) {
      clearHighlight();
      const geometry = bvInstanceGeometry(hit)!;
      readout.hidden = false;
      readout.textContent = `${editorText("cityEditor.messages.structureReadout", {
        value0: editorText(STRUCTURE_KEY.landmark),
        value1: editorText(STRUCTURE_MATERIAL.stone),
        value2: geometry.boundingBox!.max.y.toFixed(1)
      })}\n${special?.structure.name ?? special?.id ?? facility?.name ?? well!.id}`;
      outline(new Float32Array(geometry.getAttribute("position").array));
      geometry.dispose();
      return;
    }
    const attribute = (hit.object as THREE.Mesh).geometry.getAttribute("buildingIndex");
    const index = attribute?.getX(hit.face.a) ?? -1;
    if (structures?.pickables.includes(hit.object as THREE.Mesh)) showStructure(structureList[index]);
    else showLot(built?.buildings[index]);
  };

  const bindChrome = () => {
    options.scope.listen(button, "click", () => setOpen(Boolean(viewport.hidden)));
    options.scope.listen(viewport, "pointerdown", event => {
      const point = event as PointerEvent;
      pointer = { x: point.clientX, y: point.clientY };
    });
    options.scope.listen(viewport, "pointerup", event => {
      const point = event as PointerEvent;
      if (!pointer || Math.hypot(point.clientX - pointer.x, point.clientY - pointer.y) > 4) return;
      pick(point);
    });
  };
  bindChrome();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resize());
  observer?.observe(options.canvasHost);

  // Only DOM chrome and listeners follow the new mount; renderer, scene and stamps stay as built.
  const adopt = (next: City3dMountOptions) => {
    if (disposed) return;
    observer?.unobserve(options.canvasHost);
    options = next;
    const open = !viewport.hidden;
    lightingPanel.remove();
    lightingPanel = createLightingPanel();
    lightingPanel.hidden = !open;
    clearHighlight();
    readout.hidden = true;
    button.textContent = editorText(open ? "cityEditor.messages.view2d" : "cityEditor.messages.view3d");
    options.map.hidden = open;
    zoomReadout.title = editorText("cityEditor.messages.zoom3dHint");
    options.canvasHost.append(viewport, button, readout, lightingPanel, zoomReadout);
    bindChrome();
    observer?.observe(options.canvasHost);
    resize();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    observer?.disconnect();
    clearHighlight();
    buildingDetails?.dispose();
    structures?.dispose();
    townWalls?.dispose();
    waterMeshes?.dispose();
    wells?.dispose();
    specialBuildings?.dispose();
    regionalHouses?.dispose();
    facilities?.dispose();
    bridges?.dispose();
    objects?.dispose();
    ships?.dispose();
    openSpaces?.dispose();
    friaries?.dispose();
    farmland?.dispose();
    forest?.dispose();
    if (forestShadowTimer) clearTimeout(forestShadowTimer);
    piers?.dispose();
    cranes?.dispose();
    harborCargo?.dispose();
    roadMeshes?.dispose();
    ground?.geometry.dispose();
    sky.dispose();
    (ground?.material as THREE.Material | undefined)?.dispose();
    controls?.removeEventListener("change", requestCameraRender);
    controls?.dispose();
    sun?.shadow.dispose();
    renderer?.dispose();
    lightingPanel.remove();
    viewport.remove();
    button.remove();
    readout.remove();
    zoomReadout.remove();
    options.map.hidden = false;
  };
  // Defer framing until the new terrain is built, including when 3D is hidden.
  const resetCamera = () => {
    framedRadius = 0;
  };

  const getFramePerformance = (): Pick<
    City3dPerformanceSnapshot,
    "frame" | "forest" | "forestQuality" | "housing"
  > | null =>
    viewport.hidden || !scene
      ? null
      : {
          frame: lastRender,
          ...(regionalHouses ? { housing: { ...regionalHouses.stats } } : {}),
          ...(forest ? { forest: { ...forest.stats }, forestQuality: forestQuality.snapshot } : {})
        };

  const getPerformance = (): City3dPerformanceSnapshot | null =>
    viewport.hidden || !scene
      ? null
      : {
          camera:
            camera && controls
              ? {
                  position: camera.position.toArray(),
                  target: controls.target.toArray(),
                  zoom: camera.zoom,
                  fov: camera.fov
                }
              : null,
          ...getFramePerformance()!,
          scene: collectSceneMetrics(scene),
          buildings: built?.buildings.length ?? 0,
          quality: builtQuality
        };
  const restoreView = (saved: NonNullable<City3dPerformanceSnapshot["camera"]>) => {
    if (viewport.hidden) setOpen(true);
    if (!camera || !controls) return;
    camera.position.fromArray(saved.position);
    controls.target.fromArray(saved.target);
    camera.zoom = saved.zoom;
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  };
  const getModelVariants = () => (viewport.hidden || !scene ? null : sceneVariants(scene));
  return { sync, resetCamera, dispose, getPerformance, getFramePerformance, restoreView, getModelVariants, adopt };
}
