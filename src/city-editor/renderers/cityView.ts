import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelQuality } from "../../buildings/modelQuality";
import { buildingSurfaces } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { createTownBuildingDetails, type TownBuildingDetails } from "../../city3d/three/buildingDetails";
import { createBvPrototypeCache } from "../../city3d/three/bvInstances";
import { type CityMassingMeshes, createCityMassing } from "../../city3d/three/cityMeshes";
import { createTownFarms, type TownFarmMeshes } from "../../city3d/three/farmMeshes";
import { createTownFriaries } from "../../city3d/three/friaryMeshes";
import { createTownOpenSpaces } from "../../city3d/three/openSpaceMeshes";
import { createTownPiers } from "../../city3d/three/pierMeshes";
import { createTownRegionalHouses, type TownRegionalHouses } from "../../city3d/three/regionalHouseMeshes";
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
import type { BuildingLot } from "../generators/buildingLots.types";
import { buildParkLawns } from "../generators/parkFabric";
import { RIVER_DROP_MIN, riverDropMeters } from "../generators/riverSurface";
import { type CityTerrain, cityTerrain, cityTerrainStamp } from "../generators/terrainElevation";
import { collectTownRoads, townRoadStamp } from "../generators/townRoads";
import { townWaterStamp } from "../generators/townWater";
import { waterPolygons } from "../generators/waterGeometry";
import type { FloorUse, RoofForm, RoofMaterial, WallMaterial } from "../types/contracts/buildingMassing";
import type { StructureKind, StructureMassing, StructureMaterial } from "../types/contracts/structureMassing";
import type { CityDocument } from "../types/document";
import { collectOpenSpacePlan } from "./openSpaceSites";
import { collectPierSites } from "./pierSites";
import { collectShipSites } from "./shipSites";
import { collectCityStructures, landmarkLotStructures } from "./structureMassing";
import { groundStructures, lotFoundations, rampStructures, stairStructures } from "./terrainMassing";
import { resolveCemeteryPlans } from "./townFacts";
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

interface Mount {
  own(cleanup: () => void): void;
  listen(target: EventTarget, type: string, handler: (event: Event) => void): void;
}

/**
 * CE-only 3D view. WebGL starts on the first open. Buildings follow the fabric
 * object. Water follows the stamp and the ce-water parent. A pan does not
 * rebuild either, and closing the view keeps the scene.
 */
export function mountCity3d(options: {
  canvasHost: HTMLElement;
  map: HTMLElement;
  scope: Mount;
  getDocument: () => CityDocument;
  /** Current 2D viewBox half-size in plan meters. */
  getViewHalfSize?: () => number;
  getViewCenter?: () => readonly [number, number];
  /** Requested detailed-model quality; each model falls back to the tiers it ships. */
  getModelQuality?: () => ModelQuality;
  /** Draw-grid spacing for a height field. Absent uses the automatic spacing. */
  getTerrainSpacing?: () => number | "auto";
  /** Metres the river surface sits below the land it touches. Absent keeps 1 m. */
  getRiverDropMeters?: () => number;
}): { sync(): void; resetCamera(): void; dispose(): void } {
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
  options.canvasHost.append(viewport, button, readout);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let massing: CityMassingMeshes | null = null;
  let buildingDetails: TownBuildingDetails | null = null;
  let structures: CityStructureMeshes | null = null;
  let townWalls: TownWalls | null = null;
  let wells: TownWells | null = null;
  let specialBuildings: TownSpecialBuildings | null = null;
  let regionalHouses: TownRegionalHouses | null = null;
  const bvPrototypes = createBvPrototypeCache();
  let openSpaces: CityStructureMeshes | null = null;
  let farmland: TownFarmMeshes | null = null;
  let farmlandSource: DistrictFabric["farms"] | null = null;
  let friaries: CityStructureMeshes | null = null;
  let friaryStamp: string | null = null;
  let openSpaceStamp: string | null = null;
  let ships: CityStructureMeshes | null = null;
  let shipStamp: string | null = null;
  let piers: CityStructureMeshes | null = null;
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
  let running = false;
  let raf = 0;
  let disposed = false;
  let pointer: { x: number; y: number } | null = null;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const resize = () => {
    if (!renderer || !camera || viewport.hidden) return;
    const rect = options.canvasHost.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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

  const showLot = (lot: BuildingLot | undefined) => {
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
    const surfaces = buildingSurfaces(lot.polygon, mass);
    if (!surfaces) return;
    const positions = new Float32Array(surfaces.walls.positions.length + surfaces.roofs.positions.length);
    positions.set(surfaces.walls.positions, 0);
    positions.set(surfaces.roofs.positions, surfaces.walls.positions.length);
    const elevation = terrain?.foundationAt(lot.polygon) ?? 0;
    if (elevation) for (let i = 1; i < positions.length; i += 3) positions[i] += elevation;
    outline(positions);
  };

  const rebuild = (
    city: CityDocument,
    fabric: DistrictFabric,
    allowColorUpdate = false,
    quality: ModelQuality = "standard"
  ) => {
    if (!scene) return;
    clearHighlight();
    readout.hidden = true;
    // Detailed regional houses replace their lots' plain massing; acquire before releasing the old layer.
    const nextHouses = createTownRegionalHouses(
      fabric.buildings,
      bvPrototypes,
      terrain?.relief ? terrain.foundationAt : undefined,
      quality
    );
    if (regionalHouses) {
      scene.remove(regionalHouses.group);
      regionalHouses.dispose();
    }
    regionalHouses = nextHouses;
    scene.add(regionalHouses.group);
    const plainLots = fabric.buildings.map((lot, index) =>
      nextHouses.replaced.has(index) ? { ...lot, massing: undefined } : lot
    );
    const reused = allowColorUpdate && massing?.updateAppearance?.(plainLots);
    if (buildingDetails) {
      scene.remove(buildingDetails.group);
      buildingDetails.dispose();
    }
    buildingDetails = createTownBuildingDetails(plainLots, terrain?.relief ? terrain.foundationAt : undefined);
    scene.add(buildingDetails.group);
    if (!reused) {
      massing?.dispose();
      if (massing) scene.remove(massing.group);
      massing = createCityMassing(plainLots, terrain?.relief ? terrain.foundationAt : undefined);
      scene.add(massing.group);
    }
    structures?.dispose();
    if (structures) scene.remove(structures.group);
    const parts = [...collectCityStructures(city), ...landmarkLotStructures(fabric.buildings)];
    const grounded = terrain
      ? [
          ...groundStructures(parts, terrain),
          ...lotFoundations(fabric.buildings, terrain),
          ...rampStructures(terrain),
          ...stairStructures(terrain)
        ]
      : parts;
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
    structureList = grounded.filter(
      part => !specialBuildings!.replaced.has(part.id) && !townWalls!.replaced.has(part.id)
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
    if (renderer || disposed) return;
    const canvas = document.createElement("canvas");
    canvas.className = "ce-3d-canvas";
    viewport.appendChild(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xc5c5bf);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.5, 80000);
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(1, 1.6, 0.4);
    scene.add(sun);
    ground = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshLambertMaterial({ color: 0xd5cfbf }));
    ground.name = "ce-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    scene.add(ground);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    resize();
  };

  const tick = () => {
    if (!running || !renderer || !scene || !camera) return;
    controls?.update();
    buildingDetails?.update(camera, renderer.domElement.clientHeight);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
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
    ensure();
    if (!scene) return;
    const city = options.getDocument();
    // Fabric first: lane geometry is part of the road stamp, and graded roads shape the terrain.
    const fabric = buildBlockFabric(city);
    const quality = options.getModelQuality?.() ?? "standard";
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
      terrainStamp = nextTerrainStamp;
    }
    const plan = planCity3dRefresh({
      fabricChanged: fabric !== built || terrainChanged || quality !== builtQuality,
      stampChanged: terrainChanged || waterStampChanged(waterStamp, stamp, Boolean(scene.getObjectByName("ce-water"))),
      roadStampChanged:
        terrainChanged || roadStampChanged(roadStamp, roads, Boolean(scene.getObjectByName("ce-roads"))),
      open: true
    });
    const farmlandChanged = terrainChanged || plan.water || farmlandSource !== fabric.farms || !farmland;
    const shipSites = collectShipSites(city);
    const nextShipStamp = JSON.stringify(shipSites);
    const shipsChanged = plan.water || shipStamp !== nextShipStamp || !scene.getObjectByName("ce-ships");
    const pierSites = collectPierSites(city, fabric.harbor);
    const nextPierStamp = JSON.stringify(pierSites);
    const piersChanged =
      plan.water || terrainChanged || pierStamp !== nextPierStamp || !scene.getObjectByName("ce-piers");
    const nextOpenSpaceStamp = JSON.stringify([
      fabric.parks ?? null,
      city.cemeteries ?? city.mesh,
      city.burialProfile,
      city.historicalPeriod
    ]);
    const openSpacesChanged = terrainChanged || plan.buildings || openSpaceStamp !== nextOpenSpaceStamp || !openSpaces;
    const friaryPlans = (fabric.aerialLandmarks?.monasteries ?? []).filter(monastery => monastery.kind === "friary");
    const nextFriaryStamp = JSON.stringify(friaryPlans);
    const friariesChanged = terrainChanged || friaryStamp !== nextFriaryStamp || !friaries;
    if (
      !plan.buildings &&
      !plan.water &&
      !plan.roads &&
      !shipsChanged &&
      !piersChanged &&
      !openSpacesChanged &&
      !friariesChanged &&
      !farmlandChanged
    )
      return;
    if (friariesChanged) {
      if (friaries) scene.remove(friaries.group);
      friaries?.dispose();
      friaries = createTownFriaries(friaryPlans, terrain ?? undefined);
      scene.add(friaries.group);
      friaryStamp = nextFriaryStamp;
    }
    if (openSpacesChanged) {
      const openSpacePlan = collectOpenSpacePlan(fabric.parks ?? buildParkLawns(city), resolveCemeteryPlans(city));
      if (openSpaces) scene.remove(openSpaces.group);
      openSpaces?.dispose();
      openSpaces = createTownOpenSpaces(openSpacePlan, terrain ?? undefined);
      scene.add(openSpaces.group);
      openSpaceStamp = nextOpenSpaceStamp;
    }
    if (plan.buildings) {
      built = fabric;
      builtQuality = quality;
      rebuild(city, fabric, !terrainChanged, quality);
    }
    if (plan.water) {
      placeWater(city);
      waterStamp = stamp;
    }
    if (farmlandChanged) {
      const next = createTownFarms(fabric.farms, terrain ?? undefined, waterMeshes?.wetPolygons);
      farmland?.dispose();
      farmland = next;
      farmlandSource = fabric.farms;
      scene.add(next.parent);
    }
    if (shipsChanged && waterMeshes) {
      ships?.dispose();
      ships = createTownShips(shipSites, point => townWaterHeightAt(waterMeshes!, point));
      scene.add(ships.group);
      shipStamp = nextShipStamp;
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
  };

  const setOpen = (open: boolean) => {
    viewport.hidden = !open;
    options.map.hidden = open;
    button.textContent = editorText(open ? "cityEditor.messages.view2d" : "cityEditor.messages.view3d");
    button.setAttribute("aria-pressed", open ? "true" : "false");
    readout.hidden = true;
    if (!open) {
      running = false;
      cancelAnimationFrame(raf);
      return;
    }
    ensure();
    resize();
    built = null;
    sync();
    if (!running) {
      running = true;
      tick();
    }
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
      showLot(built?.buildings[house.lotIndex]);
      return;
    }
    const special = specialBuildings?.resolve(hit);
    const well = wells?.resolve(hit);
    if (special || well) {
      clearHighlight();
      const mesh = hit.object as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(hit.instanceId!, matrix);
      matrix.premultiply(mesh.matrixWorld);
      const geometry = mesh.geometry.clone().applyMatrix4(matrix);
      geometry.computeBoundingBox();
      readout.hidden = false;
      readout.textContent = `${editorText("cityEditor.messages.structureReadout", {
        value0: editorText(STRUCTURE_KEY.landmark),
        value1: editorText(STRUCTURE_MATERIAL.stone),
        value2: geometry.boundingBox!.max.y.toFixed(1)
      })}\n${special?.structure.name ?? special?.id ?? well!.id}`;
      outline(new Float32Array(geometry.getAttribute("position").array));
      geometry.dispose();
      return;
    }
    const attribute = (hit.object as THREE.Mesh).geometry.getAttribute("buildingIndex");
    const index = attribute?.getX(hit.face.a) ?? -1;
    if (structures?.pickables.includes(hit.object as THREE.Mesh)) showStructure(structureList[index]);
    else showLot(built?.buildings[index]);
  };

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
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resize());
  observer?.observe(options.canvasHost);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    clearHighlight();
    massing?.dispose();
    buildingDetails?.dispose();
    structures?.dispose();
    townWalls?.dispose();
    waterMeshes?.dispose();
    wells?.dispose();
    specialBuildings?.dispose();
    regionalHouses?.dispose();
    ships?.dispose();
    openSpaces?.dispose();
    friaries?.dispose();
    farmland?.dispose();
    piers?.dispose();
    roadMeshes?.dispose();
    ground?.geometry.dispose();
    (ground?.material as THREE.Material | undefined)?.dispose();
    controls?.dispose();
    renderer?.dispose();
    viewport.remove();
    button.remove();
    readout.remove();
    options.map.hidden = false;
  };
  // Defer framing until the new terrain is built, including when 3D is hidden.
  const resetCamera = () => {
    framedRadius = 0;
  };

  return { sync, resetCamera, dispose };
}
