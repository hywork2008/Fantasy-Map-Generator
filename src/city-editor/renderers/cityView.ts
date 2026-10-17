import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildingSurfaces } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { type CityMassingMeshes, createCityMassing } from "../../city3d/three/cityMeshes";
import { type CityStructureMeshes, createStructureMassing } from "../../city3d/three/structureMeshes";
import {
  createTownWater,
  planCity3dRefresh,
  type TownWaterMeshes,
  waterStampChanged
} from "../../city3d/three/waterMeshes";
import type { EditorMessageKey } from "../../i18n/editorMessages";
import { editorText } from "../../i18n/editorMessages";
import { buildBlockFabric, type DistrictFabric } from "../generators/blockInfill";
import type { BuildingLot } from "../generators/buildingLots.types";
import { townWaterStamp } from "../generators/townWater";
import type { FloorUse, RoofForm, RoofMaterial, WallMaterial } from "../types/contracts/buildingMassing";
import type { StructureKind, StructureMassing, StructureMaterial } from "../types/contracts/structureMassing";
import type { CityDocument } from "../types/document";
import { collectCityStructures, landmarkLotStructures } from "./structureMassing";

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
}): { sync(): void; dispose(): void } {
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
  let structures: CityStructureMeshes | null = null;
  let waterMeshes: TownWaterMeshes | null = null;
  let ground: THREE.Mesh | null = null;
  let waterStamp: string | null = null;
  let structureList: StructureMassing[] = [];
  let highlight: THREE.LineSegments | null = null;
  let built: DistrictFabric | null = null;
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

  const frameCamera = (document: CityDocument) => {
    if (!camera || !controls) return;
    const radius = Math.max(30, document.frame.cityRadiusMeters);
    camera.position.set(radius * 0.85, radius * 0.62, radius * 0.85);
    controls.target.set(0, 4, 0);
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
    outline(positions);
  };

  const rebuild = (city: CityDocument, fabric: DistrictFabric) => {
    if (!scene) return;
    clearHighlight();
    readout.hidden = true;
    massing?.dispose();
    if (massing) scene.remove(massing.group);
    structures?.dispose();
    if (structures) scene.remove(structures.group);
    massing = createCityMassing(fabric.buildings);
    scene.add(massing.group);
    structureList = [...collectCityStructures(city), ...landmarkLotStructures(fabric.buildings)];
    structures = createStructureMassing(structureList);
    scene.add(structures.group);
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
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  const placeWater = (city: CityDocument) => {
    if (!scene || !ground) return;
    waterMeshes?.dispose();
    waterMeshes = createTownWater(city);
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
    const stamp = townWaterStamp(city);
    const fabric = buildBlockFabric(city);
    const plan = planCity3dRefresh({
      fabricChanged: fabric !== built,
      stampChanged: waterStampChanged(waterStamp, stamp, Boolean(scene.getObjectByName("ce-water"))),
      open: true
    });
    if (!plan.buildings && !plan.water) return;
    if (plan.buildings) {
      built = fabric;
      rebuild(city, fabric);
    }
    if (plan.water) {
      placeWater(city);
      waterStamp = stamp;
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
    const hit = raycaster.intersectObjects([...(massing?.pickables ?? []), ...(structures?.pickables ?? [])], false)[0];
    if (!hit?.face) {
      clearHighlight();
      readout.hidden = true;
      return;
    }
    const attribute = hit.object.geometry.getAttribute("buildingIndex");
    const index = attribute?.getX(hit.face.a) ?? -1;
    if (structures?.pickables.includes(hit.object as THREE.Mesh)) showStructure(structureList[index]);
    else showLot(built?.buildings[index]);
  };

  options.scope.listen(button, "click", () => setOpen(viewport.hidden));
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
    structures?.dispose();
    waterMeshes?.dispose();
    ground?.geometry.dispose();
    (ground?.material as THREE.Material | undefined)?.dispose();
    controls?.dispose();
    renderer?.dispose();
    viewport.remove();
    button.remove();
    readout.remove();
    options.map.hidden = false;
  };
  return { sync, dispose };
}
