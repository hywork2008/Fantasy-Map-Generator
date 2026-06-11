import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { LoopSubdivision } from "three-subdivide";
import { cloudImage } from "../assets/cloud-image";
import { rn } from "../utils";

interface ThreeDOptions {
  scale: number;
  lightness: number;
  shadow: number;
  sun: { x: number; y: number; z: number };
  rotateMesh: number;
  rotateGlobe: number;
  skyColor: string;
  waterColor: string;
  sunColor: string;
  extendedWater: number;
  labels3d: number;
  wireframe: number;
  resolution: number;
  resolutionScale: number;
  subdivide: number;
  isOn?: boolean;
  isGlobe?: boolean;
}

interface TimeOfDayPreset {
  sun: { x: number; y: number; z: number };
  sunColor: string;
  lightness: number;
  skyColor: string;
  waterColor: string;
}

const threeDOptions: ThreeDOptions = {
  scale: 50,
  lightness: 0.6,
  shadow: 0.5,
  sun: { x: 100, y: 800, z: 1000 },
  rotateMesh: 0,
  rotateGlobe: 0.5,
  skyColor: "#9ecef5",
  waterColor: "#466eab",
  sunColor: "#cccccc",
  extendedWater: 0,
  labels3d: 0,
  wireframe: 0,
  resolution: 2,
  resolutionScale: 2048,
  subdivide: 0
};

let Renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let controls: MapControls | OrbitControls | undefined;
let animationFrame: number;
let material: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | undefined;
let texture: THREE.Texture | undefined;
let geometry: THREE.BufferGeometry | undefined;
let mesh: THREE.Mesh | undefined;
let ambientLight: THREE.AmbientLight | undefined;
let spotLight: THREE.SpotLight | undefined;
let waterPlane: THREE.PlaneGeometry | undefined;
let waterMaterial: THREE.MeshBasicMaterial | undefined;
let waterMesh: THREE.Mesh | undefined;
let raycaster: THREE.Raycaster | undefined;

type LabelSprite = THREE.Sprite & { size: number };
let labels: LabelSprite[] = [];
let icons: THREE.Mesh[] = [];
let lines: THREE.Line[] = [];
let gridToPackCellMap: Map<number, number> | null = null;

const context2d = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;

const create = async (canvas: HTMLCanvasElement, type = "viewMesh"): Promise<boolean> => {
  threeDOptions.isOn = true;
  threeDOptions.isGlobe = type === "viewGlobe";
  return threeDOptions.isGlobe ? newGlobe(canvas) : newMesh(canvas);
};

const redraw = (): void => {
  deleteLabels();
  scene!.remove(mesh!);
  Renderer!.setSize(Renderer!.domElement.width, Renderer!.domElement.height);
  if (threeDOptions.isGlobe) updateGlobeTexure();
  else createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);
  render();
};

const update = (): void => {
  if (threeDOptions.isGlobe) updateGlobeTexure();
  else update3dTexture();
};

const stop = (): void => {
  if (controls) controls.dispose();
  cancelAnimationFrame(animationFrame);
  if (texture) texture.dispose();
  if (geometry) geometry.dispose();
  if (material) material.dispose();
  if (waterPlane) waterPlane.dispose();
  if (waterMaterial) waterMaterial.dispose();
  deleteLabels();

  Renderer!.renderLists.dispose();
  Renderer!.dispose();
  scene!.remove(mesh!);
  scene!.remove(spotLight!);
  scene!.remove(ambientLight!);
  scene!.remove(waterMesh!);

  Renderer = undefined;
  scene = undefined;
  controls = undefined;
  camera = undefined;
  material = undefined;
  texture = undefined;
  geometry = undefined;
  mesh = undefined;

  ThreeD.options.isOn = false;
};

const setScale = (scale: number): void => {
  threeDOptions.scale = scale;
  const vertices = geometry!.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    vertices.setZ(i, getMeshHeight(i));
  }
  geometry!.setAttribute("position", vertices);
  geometry!.computeVertexNormals();

  redraw();
};

const setSunColor = (color: string): void => {
  threeDOptions.sunColor = color;
  spotLight!.color = new THREE.Color(color);
  render();
};

const setResolutionScale = (scale: number): void => {
  threeDOptions.resolutionScale = scale;
  redraw();
};

const setLightness = (intensity: number): void => {
  threeDOptions.lightness = intensity;
  ambientLight!.intensity = intensity;
  render();
};

const setSun = (x: number, y: number, z: number): void => {
  threeDOptions.sun = { x, y, z };
  spotLight!.position.set(x, y, z);
  render();
};

const setRotation = (speed: number): void => {
  if (threeDOptions.isGlobe) threeDOptions.rotateGlobe = speed;
  else threeDOptions.rotateMesh = speed;
  controls!.autoRotateSpeed = speed;

  const startAnimation = !controls!.autoRotate && Boolean(speed);
  const endAnimation = controls!.autoRotate && !speed;

  controls!.autoRotate = Boolean(speed);

  if (startAnimation) animate();
  if (endAnimation) cancelAnimationFrame(animationFrame);
};

const toggleSky = (): void => {
  if (threeDOptions.extendedWater) {
    scene!.background = null;
    scene!.fog = null;
    scene!.remove(waterMesh!);
  } else extendWater(graphWidth, graphHeight);

  threeDOptions.extendedWater = threeDOptions.extendedWater ? 0 : 1;
  redraw();
};

const toggleLabels = (): void => {
  threeDOptions.labels3d = threeDOptions.labels3d ? 0 : 1;

  if (threeDOptions.labels3d) {
    createLabels().then(() => update());
  } else {
    deleteLabels();
    update();
  }
};

const toggle3dSubdivision = (): void => {
  threeDOptions.subdivide = threeDOptions.subdivide ? 0 : 1;
  redraw();
};

const toggleWireframe = (): void => {
  threeDOptions.wireframe = threeDOptions.wireframe ? 0 : 1;
  redraw();
};

const setColors = (sky: string, water: string): void => {
  threeDOptions.skyColor = sky;
  scene!.background = (scene!.fog as THREE.Fog).color = new THREE.Color(sky);
  threeDOptions.waterColor = water;
  waterMaterial!.color = new THREE.Color(water);
  render();
};

const timeOfDayPresets: Record<string, TimeOfDayPreset> = {
  dawn: {
    sun: { x: -500, y: 400, z: 800 },
    sunColor: "#ff9a56",
    lightness: 0.4,
    skyColor: "#ffccaa",
    waterColor: "#2d4d6b"
  },
  noon: {
    sun: { x: 100, y: 800, z: 1000 },
    sunColor: "#cccccc",
    lightness: 0.6,
    skyColor: "#9ecef5",
    waterColor: "#466eab"
  },
  evening: {
    sun: { x: 500, y: 400, z: 800 },
    sunColor: "#ff6b35",
    lightness: 0.5,
    skyColor: "#ff8c42",
    waterColor: "#1e3a52"
  },
  night: {
    sun: { x: 0, y: -500, z: 1000 },
    sunColor: "#4a5568",
    lightness: 0.2,
    skyColor: "#1a1a2e",
    waterColor: "#0f1419"
  }
};

const setTimeOfDay = (presetName: string): void => {
  const preset = timeOfDayPresets[presetName];
  if (!preset) return;

  setSun(preset.sun.x, preset.sun.y, preset.sun.z);
  setSunColor(preset.sunColor);
  setLightness(preset.lightness);
  if (threeDOptions.extendedWater) setColors(preset.skyColor, preset.waterColor);
};

const setResolution = (resolution: number): void => {
  threeDOptions.resolution = resolution;
  update();
};

const saveScreenshot = async (): Promise<void> => {
  const URL = Renderer!.domElement.toDataURL("image/jpeg");
  const link = document.createElement("a");
  link.download = `${getFileName()}.jpeg`;
  link.href = URL;
  link.click();
  tip(`Screenshot is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
  window.setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
};

const saveOBJ = (): void => {
  const objexporter = new OBJExporter();
  const obj = objexporter.parse(mesh!);
  downloadFile(obj, `${getFileName()}.obj`, "text/plain;charset=UTF-8");
};

async function newMesh(canvas: HTMLCanvasElement): Promise<boolean> {
  scene = new THREE.Scene();

  ambientLight = new THREE.AmbientLight(0xcccccc, threeDOptions.lightness);
  scene.add(ambientLight);
  spotLight = new THREE.SpotLight(threeDOptions.sunColor, 0.8, 2000, 0.8, 0, 0);
  spotLight.position.set(threeDOptions.sun.x, threeDOptions.sun.y, threeDOptions.sun.z);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 2048;
  spotLight.shadow.mapSize.height = 2048;
  scene.add(spotLight);

  Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  Renderer.setSize(canvas.width, canvas.height);
  Renderer.shadowMap.enabled = true;
  Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (threeDOptions.extendedWater) extendWater(graphWidth, graphHeight);
  createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);

  camera = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.1, 2000);
  camera.position.set(0, 400, 500);
  controls = new MapControls(camera, canvas);

  if (controls.target) controls.target.set(0, 0, 0);

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 50;
  controls.maxDistance = 1000;
  controls.minZoom = 0.05;
  controls.maxZoom = 4;
  controls.zoomSpeed = 0.6;
  controls.panSpeed = 1.6;
  controls.enableRotate = true;
  controls.rotateSpeed = 0.5;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minPolarAngle = 0;

  controls.autoRotate = Boolean(threeDOptions.rotateMesh);
  controls.autoRotateSpeed = threeDOptions.rotateMesh;
  animate();

  controls.addEventListener("change", render);
  return true;
}

function textureToSprite(textureUrl: string, width: number, height: number): THREE.Sprite {
  const map = new THREE.TextureLoader().load(textureUrl);
  map.anisotropy = Renderer!.capabilities.getMaxAnisotropy();
  const mat = new THREE.SpriteMaterial({ map });

  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 1;
  return sprite;
}

async function createTextLabel({
  text,
  font,
  size,
  color,
  quality
}: {
  text: string;
  font: string;
  size: number;
  color: string;
  quality: number;
}): Promise<THREE.Sprite> {
  context2d.font = `${size * quality}px ${font}`;
  context2d.canvas.width = context2d.measureText(text).width;
  context2d.canvas.height = size * quality * 1.25;
  context2d.clearRect(0, 0, context2d.canvas.width, context2d.canvas.height);

  context2d.font = `${size * quality}px ${font}`;
  context2d.fillStyle = color;
  context2d.fillText(text, 0, size * quality);

  return textureToSprite(
    context2d.canvas.toDataURL(),
    context2d.canvas.width / quality,
    context2d.canvas.height / quality
  );
}

function get3dCoords(baseX: number, baseY: number): [number, number, number] {
  const x = baseX - graphWidth / 2;
  const z = baseY - graphHeight / 2;

  raycaster!.ray.origin.x = x;
  raycaster!.ray.origin.z = z;
  const y = raycaster!.intersectObject(mesh!)[0].point.y;
  return [x, y, z];
}

async function createLabels(): Promise<void> {
  raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));

  const states = viewbox.select("#labels #states");

  const stateOptions = {
    font: states.attr("font-family"),
    size: +states.attr("data-size") / 2,
    color: states.attr("fill"),
    elevation: 20,
    quality: 80
  };

  const iconMaterials: Record<string, any> = {};
  const iconGeometries: Record<string, any> = {};
  const lineMaterials: Record<string, any> = {};

  function getBurgLabelOptions(burg: any): any | null {
    if (!burg.group) return null;

    const labelGroup = burgLabels.select(`#${burg.group}`);
    if (labelGroup.empty()) return null;

    const font = labelGroup.attr("font-family") || "Arial";
    const size = +labelGroup.attr("data-size") || 10;
    const color = labelGroup.attr("fill") || "#000";

    const elevation = Math.max(5, size * 0.5);
    const iconSize = Math.max(0.3, size * 0.08);
    const iconColor = "#666";

    return { font, size, color, elevation, quality: 40, iconSize, iconColor };
  }

  function getIconMaterial(groupName: string, iconColor: string): any {
    if (!iconMaterials[groupName]) {
      const mat = new THREE.MeshPhongMaterial({ color: iconColor });
      mat.wireframe = Boolean(threeDOptions.wireframe);
      iconMaterials[groupName] = mat;
    }
    return iconMaterials[groupName];
  }

  function getIconGeometry(groupName: string, iconSize: number): any {
    const key = `${groupName}_${iconSize.toFixed(2)}`;
    if (!iconGeometries[key]) {
      iconGeometries[key] = new THREE.CylinderGeometry(iconSize * 2, iconSize * 2, iconSize, 16, 1);
    }
    return iconGeometries[key];
  }

  function getLineMaterial(groupName: string, iconColor: string): any {
    if (!lineMaterials[groupName]) {
      lineMaterials[groupName] = new THREE.LineBasicMaterial({ color: iconColor });
    }
    return lineMaterials[groupName];
  }

  for (let i = 1; i < pack.burgs.length; i++) {
    const burg = pack.burgs[i];
    if (burg.removed) continue;

    const burgOptions = getBurgLabelOptions(burg);
    if (!burgOptions) continue;

    const [x, y, z] = get3dCoords(burg.x, burg.y);

    if (layerIsOn("toggleLabels")) {
      const burgSprite = (await createTextLabel({ text: burg.name, ...burgOptions })) as LabelSprite;
      burgSprite.position.set(x, y + burgOptions.elevation, z);
      burgSprite.size = burgOptions.size;
      labels.push(burgSprite);
      scene!.add(burgSprite);
    }

    if (layerIsOn("toggleBurgIcons")) {
      const geo = getIconGeometry(burg.group ?? "", burgOptions.iconSize);
      const mat = getIconMaterial(burg.group ?? "", burgOptions.iconColor);
      const iconMesh = new THREE.Mesh(geo, mat);
      iconMesh.position.set(x, y, z);
      icons.push(iconMesh);
      scene!.add(iconMesh);

      const lineMat = getLineMaterial(burg.group ?? "", burgOptions.iconColor);
      const lineStart = y + burgOptions.iconSize / 2;
      const lineEnd = y + burgOptions.elevation - burgOptions.size * 0.5;
      const points = [new THREE.Vector3(x, lineStart, z), new THREE.Vector3(x, lineEnd, z)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat);
      lines.push(line);
      scene!.add(line);
    }
  }

  if (layerIsOn("toggleLabels")) {
    for (let i = 1; i < pack.states.length; i++) {
      const state = pack.states[i];
      if (state.removed) continue;

      const [x, y, z] = get3dCoords(state.pole![0], state.pole![1]);
      const text = states.select(`#stateLabel${state.i}`)?.text() || state.name;
      const stateSprite = (await createTextLabel({ text, ...stateOptions })) as LabelSprite;

      stateSprite.position.set(x, y + stateOptions.elevation, z);
      stateSprite.size = stateOptions.size;
      labels.push(stateSprite);
      scene!.add(stateSprite);
    }
  }

  doWorkOnRender();
}

function deleteLabels(): void {
  raycaster = undefined;

  for (const m of labels) {
    scene!.remove(m);
    (m.material as THREE.SpriteMaterial).map?.dispose();
    m.material.dispose();
    m.geometry.dispose();
  }
  labels = [];

  for (const m of icons) {
    scene!.remove(m);
    (m.material as THREE.Material).dispose();
    m.geometry.dispose();
  }
  icons = [];

  for (const line of lines) {
    scene!.remove(line);
    (line.material as THREE.Material).dispose();
    line.geometry.dispose();
  }
  lines = [];
}

async function createMeshTextureUrl(): Promise<string> {
  const url = await getMapURL("mesh", {
    noLabels: Boolean(threeDOptions.labels3d),
    noWater: Boolean(threeDOptions.extendedWater),
    noViewbox: true,
    fullMap: true
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  canvas.width = threeDOptions.resolutionScale;
  canvas.height = threeDOptions.resolutionScale;
  const img = new Image();
  img.src = url;

  return new Promise(resolve => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        const blobObj = window.URL.createObjectURL(blob!);
        window.setTimeout(() => {
          canvas.remove();
          window.URL.revokeObjectURL(blobObj);
        }, 100);
        resolve(blobObj);
      });
    };
  });
}

async function createMesh(width: number, height: number, segmentsX: number, segmentsY: number): Promise<void> {
  gridToPackCellMap = new Map();
  if (pack.cells?.g && pack.cells?.i) {
    for (const packCellIndex of pack.cells.i) {
      const gridCellIndex = pack.cells.g[packCellIndex];
      if (!gridToPackCellMap.has(gridCellIndex)) {
        gridToPackCellMap.set(gridCellIndex, packCellIndex);
      }
    }
  }

  if (texture) texture.dispose();
  if (!threeDOptions.wireframe) {
    const url = await createMeshTextureUrl();
    await new Promise<void>(resolve => {
      texture = new THREE.TextureLoader().load(
        url,
        () => resolve(),
        undefined,
        () => resolve()
      );
    });
    if (texture && Renderer) {
      texture.anisotropy = Renderer.capabilities.getMaxAnisotropy();
    }
  }

  if (material) material.dispose();
  material = new THREE.MeshLambertMaterial();

  if (threeDOptions.wireframe) {
    material.wireframe = true;
  } else {
    material.map = texture ?? null;
    material.transparent = true;
  }

  if (geometry) geometry.dispose();
  geometry = new THREE.PlaneGeometry(width, height, segmentsX - 1, segmentsY - 1);

  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    vertices.setZ(i, getMeshHeight(i));
  }

  geometry.setAttribute("position", vertices);
  geometry.computeVertexNormals();
  if (mesh) scene!.remove(mesh);
  if (threeDOptions.subdivide) {
    const subdivideParams = {
      split: true,
      uvSmooth: false,
      preserveEdges: true,
      flatOnly: false,
      maxTriangles: Infinity
    };
    const smoothGeometry = LoopSubdivision.modify(geometry, 1, subdivideParams);
    mesh = new THREE.Mesh(smoothGeometry, material);
  } else {
    mesh = new THREE.Mesh(geometry, material);
  }
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene!.add(mesh);
  render();

  if (threeDOptions.labels3d) {
    await createLabels();
    render();
  }
}

const LOWER_BY_WATER = 18;
const DIVIDER = 100 - LOWER_BY_WATER;

function getMeshHeight(i: number): number {
  const height = grid.cells.h[i];

  let waterCellId: number | null = null;
  if (height < 20) {
    waterCellId = i;
  } else if (grid.cells.c![i]) {
    waterCellId = grid.cells.c![i].find((c: number) => grid.cells.h[c] < 20) ?? null;
  }

  if (waterCellId !== null) {
    const packCellIndex = gridToPackCellMap!.get(waterCellId);
    const featureId = pack.cells.f![packCellIndex!];
    if (featureId === undefined) return 0;

    const feature = pack.features![featureId];
    const waterHeight = feature.type === "lake" && feature.height ? feature.height : 20;
    return ((waterHeight - LOWER_BY_WATER) / DIVIDER) * threeDOptions.scale;
  }

  return ((height - LOWER_BY_WATER) / DIVIDER) * threeDOptions.scale;
}

function extendWater(width: number, height: number): void {
  scene!.background = new THREE.Color(threeDOptions.skyColor);

  waterPlane = new THREE.PlaneGeometry(width * 10, height * 10, 1);
  waterMaterial = new THREE.MeshBasicMaterial({ color: threeDOptions.waterColor });
  scene!.fog = new THREE.Fog(scene!.background as THREE.Color, 500, 3000);

  waterMesh = new THREE.Mesh(waterPlane, waterMaterial);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y -= 3;
  scene!.add(waterMesh);
}

async function update3dTexture(): Promise<void> {
  if (texture) texture.dispose();
  const url = await createMeshTextureUrl();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
  texture = new THREE.TextureLoader().load(url, render);
  material!.map = texture ?? null;
}

async function newGlobe(canvas: HTMLCanvasElement): Promise<boolean> {
  scene = new THREE.Scene();
  scene.background = new THREE.TextureLoader().load(
    "https://i0.wp.com/azgaar.files.wordpress.com/2019/10/stars-1.png",
    render
  );

  Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  Renderer.setSize(canvas.width, canvas.height);

  if (material) material.dispose();
  material = new THREE.MeshBasicMaterial();
  updateGlobeTexure(true);

  camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000).translateZ(5);

  controls = new OrbitControls(camera, Renderer.domElement);
  controls.zoomSpeed = 0.25;
  controls.minDistance = 1.5;
  controls.maxDistance = 10;
  controls.autoRotate = Boolean(threeDOptions.rotateGlobe);
  controls.autoRotateSpeed = threeDOptions.rotateGlobe;

  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;

  controls.addEventListener("change", render);

  return true;
}

async function updateGlobeTexure(addMesh?: boolean): Promise<void> {
  const world = (mapCoordinates.latT || 0) > 179;

  const scale = threeDOptions.resolution;
  const height = 512 * scale;
  const width = 1024 * scale;

  const mapHeight = rn(((mapCoordinates.latT || 0) / 180) * height);
  const mapWidth = world ? mapHeight * 2 : rn((graphWidth / graphHeight) * mapHeight);
  const dy = world ? 0 : ((90 - (mapCoordinates.latN || 0)) / 180) * height;
  const dx = world ? 0 : mapWidth / 4;

  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  ctx.canvas.width = width;
  ctx.canvas.height = height;

  if (!world) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = cloudImage; // or public/images/textures/cloud.png
  }

  const img2 = new Image();
  img2.onload = () => {
    if (!Renderer || !material) return;
    ctx.drawImage(img2, dx, dy, mapWidth, mapHeight);
    if (texture) texture.dispose();
    texture = new THREE.CanvasTexture(ctx.canvas);
    material.map = texture;
    if (addMesh) addGlobe3dMesh();
    else render();
  };
  img2.src = await getMapURL("mesh", { noScaleBar: true, fullMap: true, noVignette: true });
}

function addGlobe3dMesh(): void {
  geometry = new THREE.SphereGeometry(1, 64, 64);
  mesh = new THREE.Mesh(geometry, material);
  scene!.add(mesh!);
  if (controls!.autoRotate) animate();
  else render();
}

const renderThrottled = throttle(doWorkOnRender, 200);
function render(): void {
  if (!Renderer) return;
  Renderer.render(scene!, camera!);
  renderThrottled();
}

function doWorkOnRender(): void {
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const dist = label.position.distanceTo(camera!.position);
    const isVisible = dist < 100 * label.size && dist > label.size * 6;
    label.visible = isVisible;
    if (lines[i]) lines[i].visible = isVisible;
  }
}

function animate(): void {
  animationFrame = requestAnimationFrame(animate);
  if (controls?.update) controls.update();
}

window.ThreeD = {
  create,
  redraw,
  update,
  stop,
  options: threeDOptions,
  setSunColor,
  setScale,
  setResolutionScale,
  setLightness,
  setSun,
  setRotation,
  toggleLabels,
  toggle3dSubdivision,
  toggleWireframe,
  toggleSky,
  setResolution,
  setColors,
  setTimeOfDay,
  timeOfDayPresets,
  saveScreenshot,
  saveOBJ
};

export type { ThreeDAPI, ThreeDOptions };

interface ThreeDAPI {
  create: (canvas: HTMLCanvasElement, type?: string) => Promise<boolean>;
  redraw: () => void;
  update: () => void;
  stop: () => void;
  options: ThreeDOptions;
  setSunColor: (color: string) => void;
  setScale: (scale: number) => void;
  setResolutionScale: (scale: number) => void;
  setLightness: (intensity: number) => void;
  setSun: (x: number, y: number, z: number) => void;
  setRotation: (speed: number) => void;
  toggleLabels: () => void;
  toggle3dSubdivision: () => void;
  toggleWireframe: () => void;
  toggleSky: () => void;
  setResolution: (resolution: number) => void;
  setColors: (sky: string, water: string) => void;
  setTimeOfDay: (presetName: string) => void;
  timeOfDayPresets: Record<string, TimeOfDayPreset>;
  saveScreenshot: () => Promise<void>;
  saveOBJ: () => void;
}
