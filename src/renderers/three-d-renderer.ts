import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LoopSubdivision } from "three-subdivide";
import { layerIsOn } from "../utils/nodeUtils";
import {
  disposeRiverFlowTexture,
  disposeSatelliteTexture,
  generateRiverFlowTexture,
  generateSatelliteTexture
} from "./draw-satellite-texture";
import * as ErosionBake from "./erosion-bake";

THREE.ColorManagement.enabled = false;

import { cloudImage } from "../assets/cloud-image";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { getMapURL } from "../io/export";
import { tip } from "../services/tooltipService";
import { revokeObjectURL, rn, throttle } from "../utils";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { getNightscapeBeamPose, getNightscapePopulationGlow } from "./nightscapeGlow";
import {
  buildLowPolyBurgSymbols,
  buildRoutePaths,
  type DeckPath,
  type LowPolyBurgShape
} from "./webgl/adapters/deckDataAdapters";
import { renderWebglMapTexture } from "./webgl/webglMapTexture";
import { getBurgIconStyle, getPathDashStyles, getPathPaintStyles } from "./webgl/webglStyleExtractors";

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
  erosion: boolean;
  erosionDetail: number;
  erosionStrength: number;
  erosionRiverDepth: number;
  erosionOctaves: number;
  satellite: boolean;
  sceneOnly: boolean;
  nightscapeBeamEnabled: boolean;
  nightscapeBeamReversed: boolean;
  nightscapeRouteGlowEnabled: boolean;
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

type LabelSprite = THREE.Sprite & { size: number };
type IconBatch = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
type LowPolyBurgSymbol = ReturnType<typeof buildLowPolyBurgSymbols>[number];
type NightscapeGlowBatch = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
type FloatingRouteBatch =
  | THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial | THREE.LineDashedMaterial>
  | LineSegments2;
// @types/three currently omits LineMaterial.linewidth, though the Three.js implementation exposes it.
type ScreenLineMaterial = LineMaterial & { linewidth: number };
interface ThreeDBurgPointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}
interface NightscapeGlowInstance {
  position: THREE.Vector3;
  intensity: number;
  level: number;
}
interface RouteLineBatch {
  positions: number[];
  colors: number[];
  opacity: number;
  dashSize: number;
  gapSize: number;
}

interface IconBatchBuild {
  shape: LowPolyBurgShape;
  opacity: number;
  glowLevel: number;
  symbols: LowPolyBurgSymbol[];
  mesh: IconBatch;
}

interface MeshRebuildOptions {
  /** Re-render the 2D map bitmap before rebuilding the 3D geometry. */
  refreshTerrainTexture: boolean;
  /** Keep scene overlays at their previous heights while a terrain-only change is processed. */
  preserveTerrainOverlays: boolean;
  /** Drives the 3D options lock while the latest erosion request is running. */
  erosionBuild: boolean;
}

const SEA_LEVEL = 20;
/** Vertical lift above the sampled terrain surface so route lines stay visually distinct from relief. */
const ROUTE_SURFACE_CLEARANCE = 0.75;
const ICONS_PER_FRAME = 24;
const ROUTES_PER_FRAME = 12;
const PORT_BURG_LIFT_MULTIPLIER = 3;

/**
 * Resolves a water vertex to its visual surface height. The grid feature is
 * authoritative here: reGraph intentionally omits most ocean cells from the
 * packed graph, so using the packed-cell lookup to classify an ocean makes
 * the same sea switch between height 0 and height 20 near islands.
 */
export function getWaterSurfaceHeight(
  world: Readonly<Pick<WorldContext, "grid" | "pack">>,
  gridCellId: number,
  gridToPackCellMap: ReadonlyMap<number, number>
): number {
  const gridFeature = world.grid.features[world.grid.cells.f[gridCellId]];
  if (gridFeature?.type !== "lake") return SEA_LEVEL;

  const packCellId = gridToPackCellMap.get(gridCellId);
  if (packCellId === undefined) return SEA_LEVEL;

  const featureId = world.pack.cells.f?.[packCellId];
  const feature = featureId === undefined ? undefined : world.pack.features?.[featureId];
  return feature?.type === "lake" && feature.height > SEA_LEVEL ? feature.height : SEA_LEVEL;
}

class ThreeDModule {
  options: ThreeDOptions = {
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
    subdivide: 0,
    erosion: false,
    // Erosion also runs a CPU river-bed correction pass. Start at a density that remains
    // responsive with the hybrid Deck context alive; higher densities remain available in 3D
    // options for users who need them.
    erosionDetail: 512,
    erosionStrength: 30,
    erosionRiverDepth: 10,
    erosionOctaves: 2,
    satellite: false,
    sceneOnly: false,
    nightscapeBeamEnabled: true,
    nightscapeBeamReversed: false,
    nightscapeRouteGlowEnabled: false
  };

  readonly timeOfDayPresets: Record<string, TimeOfDayPreset> = {
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

  private Renderer: THREE.WebGLRenderer | undefined;
  private scene: THREE.Scene | undefined;
  private camera: THREE.PerspectiveCamera | undefined;
  private controls: MapControls | OrbitControls | undefined;
  private animationFrame: number = 0;
  private material: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | undefined;
  private texture: THREE.Texture | undefined;
  private geometry: THREE.BufferGeometry | undefined;
  private mesh: THREE.Mesh | undefined;
  private ambientLight: THREE.AmbientLight | undefined;
  private spotLight: THREE.SpotLight | undefined;
  private nightscapeBeamLight: THREE.SpotLight | undefined;
  private nightscapeBeamTarget: THREE.Object3D | undefined;
  private readonly nightscapeBeamDirection = new THREE.Vector3();
  private waterPlane: THREE.PlaneGeometry | undefined;
  private waterMaterial: THREE.MeshBasicMaterial | undefined;
  private waterMesh: THREE.Mesh | undefined;
  private raycaster: THREE.Raycaster | undefined;
  private labels: LabelSprite[] = [];
  private iconBatches: IconBatch[] = [];
  private floatingRoutes: FloatingRouteBatch[] = [];
  private burgPickCanvas: HTMLCanvasElement | null = null;
  private burgPointerStart: ThreeDBurgPointerStart | null = null;
  private readonly burgPickRaycaster = new THREE.Raycaster();
  private readonly burgPickPointer = new THREE.Vector2();
  private nightscapeGlowBatches: NightscapeGlowBatch[] = [];
  private nightscapeGlowTexture: THREE.CanvasTexture | undefined;
  private gridToPackCellMap: Map<number, number> | null = null;
  private erosionBakeActive: boolean = false;
  private erosionBakeData: ErosionBake.ErosionBakeResult | null = null;
  // A full map texture is rendered by a short-lived deck.gl instance. Keep at most one such
  // render in flight: rapidly enabling several layers must resolve to one final bitmap, rather
  // than competing GPU renders that can temporarily exhaust the shared WebGL resources.
  private textureUpdateInFlight: boolean = false;
  private textureUpdateQueued: boolean = false;
  // Layer changes can arrive while the initial full-map bitmap is still rendering and before
  // `material` exists. Preserve the latest request rather than silently losing it.
  private textureRefreshPendingDuringMeshBuild: boolean = false;
  private textureRetryTimer: number | null = null;
  private textureRetryCount: number = 0;
  // Mesh creation waits on a Deck full-map capture. Multiple controls can be used while that
  // capture is pending, so serialize builds and let only the newest request commit a scene.
  private meshBuildRequestId: number = 0;
  private meshBuildQueue: Promise<void> = Promise.resolve();
  private erosionBuildPending: boolean = false;
  // Terrain must appear before CPU-projected scene overlays. Building the latter in small frames
  // keeps the camera and the Erode terrain controls responsive on dense maps.
  private terrainOverlayBuildToken: number = 0;
  private terrainOverlayBuildFrame: number | null = null;
  private waterAnimationFrame: number | null = null;
  private waterTime = { value: 0 };
  private labelBuildToken = 0;
  private labelsBuildFrame: number | null = null;
  private lastLabelVisibilityCamera = {
    x: Number.NaN,
    y: Number.NaN,
    z: Number.NaN,
    qx: Number.NaN,
    qy: Number.NaN,
    qz: Number.NaN,
    qw: Number.NaN
  };
  private renderThrottled: () => void;

  constructor() {
    this.renderThrottled = throttle(() => this.doWorkOnRender(), 200);
  }

  async create(canvas: HTMLCanvasElement, type = "viewMesh"): Promise<boolean> {
    this.options.isOn = true;
    this.options.isGlobe = type === "viewGlobe";
    return this.options.isGlobe ? this.newGlobe(canvas) : this.newMesh(canvas);
  }

  isErosionBuildPending(): boolean {
    return this.erosionBuildPending;
  }

  private setErosionBuildPending(pending: boolean): void {
    if (this.erosionBuildPending === pending) return;
    this.erosionBuildPending = pending;
    document.dispatchEvent(new CustomEvent<boolean>("fmg:3d-erosion-build-state", { detail: pending }));
  }

  redraw({
    refreshTerrainTexture = true,
    preserveTerrainOverlays = false,
    erosionBuild = false
  }: Partial<MeshRebuildOptions> = {}): void {
    // Keep the controls locked through a follow-up terrain request (for example a scale change
    // made after turning erosion off), until the newest queued geometry has committed.
    const locksErosionControls = erosionBuild || this.options.erosion || this.erosionBuildPending;
    if (!preserveTerrainOverlays) {
      this.deleteLabels();
      this.cancelTerrainOverlayBuild();
      this.deleteLowPolyBurgIcons();
      this.deleteFloatingRoutes();
    }
    if (locksErosionControls) this.setErosionBuildPending(true);
    this.Renderer!.setSize(this.Renderer!.domElement.width, this.Renderer!.domElement.height);
    if (this.options.isGlobe) this.updateGlobeTexure();
    else this.queueMeshBuild({ refreshTerrainTexture, preserveTerrainOverlays, erosionBuild: locksErosionControls });
    this.render();
  }

  update(): void {
    if (this.options.isGlobe) this.updateGlobeTexure();
    else {
      this.cancelTerrainOverlayBuild();
      this.deleteLowPolyBurgIcons();
      this.deleteFloatingRoutes();
      this.scheduleTerrainOverlays();
      this.updateTerrainTexture();
    }
  }

  /** Refreshes only the terrain bitmap; layer toggles must not rebuild every 3D burg icon batch. */
  updateTerrainTexture(): void {
    if (this.options.isGlobe) {
      this.updateGlobeTexure();
      return;
    }
    if (this.options.sceneOnly) this.render();
    else if (!this.material || !this.Renderer) this.textureRefreshPendingDuringMeshBuild = true;
    else this.update3dTexture();
  }

  stop(): void {
    this.detachBurgPicking();
    if (this.controls) this.controls.dispose();
    if (this.textureRetryTimer !== null) window.clearTimeout(this.textureRetryTimer);
    this.textureRetryTimer = null;
    this.textureRetryCount = 0;
    this.textureUpdateQueued = false;
    this.textureRefreshPendingDuringMeshBuild = false;
    // An in-flight terrain texture capture cannot be cancelled, but it must never attach its
    // result to a renderer that has already been stopped.
    this.meshBuildRequestId++;
    this.setErosionBuildPending(false);
    this.cancelTerrainOverlayBuild();
    cancelAnimationFrame(this.animationFrame);
    if (this.texture) this.texture.dispose();
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.waterPlane) this.waterPlane.dispose();
    if (this.waterMaterial) this.waterMaterial.dispose();
    ErosionBake.dispose();
    disposeSatelliteTexture();
    disposeRiverFlowTexture();
    this.stopWaterAnimation();
    this.erosionBakeActive = false;
    this.erosionBakeData = null;
    this.deleteLabels();
    this.deleteLowPolyBurgIcons();
    this.deleteFloatingRoutes();

    this.Renderer!.renderLists.dispose();
    this.Renderer!.dispose();
    this.scene!.remove(this.mesh!);
    this.scene!.remove(this.spotLight!);
    this.scene!.remove(this.ambientLight!);
    this.scene!.remove(this.nightscapeBeamLight!);
    this.scene!.remove(this.nightscapeBeamTarget!);
    this.scene!.remove(this.waterMesh!);

    this.Renderer = undefined;
    this.scene = undefined;
    this.controls = undefined;
    this.camera = undefined;
    this.material = undefined;
    this.texture = undefined;
    this.geometry = undefined;
    this.mesh = undefined;
    this.nightscapeBeamLight = undefined;
    this.nightscapeBeamTarget = undefined;

    this.options.isOn = false;
  }

  setScale(scale: number): void {
    this.options.scale = scale;
    const vertices = this.geometry!.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      vertices.setZ(i, this.getMeshHeight(i));
    }
    this.geometry!.setAttribute("position", vertices);
    this.geometry!.computeVertexNormals();

    this.redraw();
  }

  setSunColor(color: string): void {
    this.options.sunColor = color;
    this.spotLight!.color = new THREE.Color(color);
    this.render();
  }

  setResolutionScale(scale: number): void {
    this.options.resolutionScale = scale;
    this.redraw();
  }

  setLightness(intensity: number): void {
    this.options.lightness = intensity;
    this.syncNightscapeLighting();
    this.render();
  }

  setSun(x: number, y: number, z: number): void {
    this.options.sun = { x, y, z };
    this.spotLight!.position.set(x, y, z);
    this.render();
  }

  setRotation(speed: number): void {
    if (this.options.isGlobe) this.options.rotateGlobe = speed;
    else this.options.rotateMesh = speed;
    this.controls!.autoRotateSpeed = speed;

    const startAnimation = !this.controls!.autoRotate && Boolean(speed);
    const endAnimation = this.controls!.autoRotate && !speed;

    this.controls!.autoRotate = Boolean(speed);

    if (startAnimation) this.animate();
    if (endAnimation) cancelAnimationFrame(this.animationFrame);
  }

  toggleSky(): void {
    if (this.options.extendedWater) {
      this.scene!.background = null;
      this.scene!.fog = null;
      this.scene!.remove(this.waterMesh!);
    } else this.extendWater(worldContext.graphWidth, worldContext.graphHeight);

    this.options.extendedWater = this.options.extendedWater ? 0 : 1;
    this.redraw();
  }

  toggleLabels(): void {
    this.options.labels3d = this.options.labels3d ? 0 : 1;

    if (this.options.labels3d && !this.isSatelliteTerrainMode()) {
      this.invalidateLabelVisibilityCache();
      if (!this.labels.length) {
        this.createLabels();
      } else {
        this.setLabelsVisibility(true);
        this.doWorkOnRender();
      }
    } else {
      this.setLabelsVisibility(false);
    }

    // Make label toggle feel immediate; texture refresh can happen afterward if required.
    this.render();

    if (this.shouldRefreshTextureAfterLabelsToggle()) {
      this.update();
    }
  }

  /** Shows only the floating low-poly scene objects against the existing dark scene background. */
  toggleNightscape(): void {
    this.options.sceneOnly = !this.options.sceneOnly;
    this.notifySatelliteTerrainMode();
    this.syncNightscapeLighting();
    if (this.options.sceneOnly) {
      if (this.texture) this.texture.dispose();
      this.texture = undefined;
      if (this.material) this.material.map = null;
      if (this.mesh) this.mesh.visible = false;
      if (this.waterMesh) this.waterMesh.visible = false;
      if (this.scene) this.scene.background = new THREE.Color("#03050b");
      // Icons were initially built for the terrain scene. Rebuild them now so their per-city
      // emissive bands and halo batches use the newly enabled Nightscape presentation.
      this.cancelTerrainOverlayBuild();
      this.deleteLowPolyBurgIcons();
      this.deleteFloatingRoutes();
      this.scheduleTerrainOverlays();
      this.render();
      return;
    }

    if (this.mesh) this.mesh.visible = true;
    if (this.waterMesh) this.waterMesh.visible = Boolean(this.options.extendedWater);
    if (this.scene) this.scene.background = this.options.extendedWater ? new THREE.Color(this.options.skyColor) : null;
    this.redraw();
  }

  setNightscapeBeamEnabled(enabled: boolean): void {
    this.options.nightscapeBeamEnabled = enabled;
    this.syncNightscapeLighting();
    this.render();
  }

  setNightscapeBeamReversed(reversed: boolean): void {
    this.options.nightscapeBeamReversed = reversed;
    this.updateNightscapeBeam();
    this.render();
  }

  setNightscapeRouteGlowEnabled(enabled: boolean): void {
    this.options.nightscapeRouteGlowEnabled = enabled;
    if (!this.options.sceneOnly) return;

    this.deleteFloatingRoutes();
    this.scheduleFloatingRoutes();
    this.render();
  }

  private syncNightscapeLighting(): void {
    const ambientIntensity = this.options.lightness * Math.PI;
    if (this.ambientLight) {
      // A nearly black ambient term leaves the camera-aligned beam responsible for visible facets.
      this.ambientLight.intensity = this.options.sceneOnly ? Math.min(ambientIntensity, 0.12) : ambientIntensity;
    }
    if (this.spotLight) this.spotLight.visible = !this.options.sceneOnly;
    const beamVisible = this.options.sceneOnly && this.options.nightscapeBeamEnabled;
    if (this.nightscapeBeamLight) this.nightscapeBeamLight.visible = beamVisible;
    if (beamVisible) this.updateNightscapeBeam();
  }

  private shouldRefreshTextureAfterLabelsToggle(): boolean {
    // Mesh labels are sprites and never baked into the WebGL terrain texture.
    return false;
  }

  toggle3dSubdivision(): void {
    this.options.subdivide = this.options.subdivide ? 0 : 1;
    this.redraw({ refreshTerrainTexture: false });
  }

  toggleErosion(): void {
    this.options.erosion = !this.options.erosion;
    // Erosion changes only terrain height. Keeping the already-composited map bitmap avoids
    // a second full-map Deck render while the hidden hybrid Deck and Three.js renderer coexist.
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true, erosionBuild: true });
  }

  setErosionStrength(value: number): void {
    this.options.erosionStrength = value;
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true, erosionBuild: true });
  }

  setErosionRiverDepth(value: number): void {
    this.options.erosionRiverDepth = value;
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true, erosionBuild: true });
  }

  setErosionDetail(value: number): void {
    this.options.erosionDetail = value;
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true, erosionBuild: true });
  }

  setErosionOctaves(value: number): void {
    this.options.erosionOctaves = value;
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true, erosionBuild: true });
  }

  toggleSatellite(): void {
    this.options.satellite = !this.options.satellite;
    this.notifySatelliteTerrainMode();
    // Satellite replaces only the terrain texture; burg and route heights remain valid.
    this.redraw({ refreshTerrainTexture: false, preserveTerrainOverlays: true });
  }

  toggleWireframe(): void {
    this.options.wireframe = this.options.wireframe ? 0 : 1;
    this.notifySatelliteTerrainMode();
    this.redraw({ refreshTerrainTexture: false });
  }

  setColors(sky: string, water: string): void {
    this.options.skyColor = sky;
    this.scene!.background = (this.scene!.fog as THREE.Fog).color = new THREE.Color(sky);
    this.options.waterColor = water;
    this.waterMaterial!.color = new THREE.Color(water);
    this.render();
  }

  setTimeOfDay(presetName: string): void {
    const preset = this.timeOfDayPresets[presetName];
    if (!preset) return;

    this.setSun(preset.sun.x, preset.sun.y, preset.sun.z);
    this.setSunColor(preset.sunColor);
    this.setLightness(preset.lightness);
    if (this.options.extendedWater) this.setColors(preset.skyColor, preset.waterColor);
  }

  setResolution(resolution: number): void {
    this.options.resolution = resolution;
    this.update();
  }

  async saveScreenshot(): Promise<void> {
    const URL = this.Renderer!.domElement.toDataURL("image/jpeg");
    const link = document.createElement("a");
    link.download = `${getFileName()}.jpeg`;
    link.href = URL;
    link.click();
    tip(`Screenshot is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
    revokeObjectURL(URL, 5000);
  }

  saveOBJ(): void {
    const objexporter = new OBJExporter();
    const obj = objexporter.parse(this.mesh!);
    downloadFile(obj, `${getFileName()}.obj`, "text/plain;charset=UTF-8");
  }

  private async newMesh(canvas: HTMLCanvasElement): Promise<boolean> {
    this.scene = new THREE.Scene();

    this.ambientLight = new THREE.AmbientLight(0xcccccc, this.options.lightness * Math.PI);
    this.scene.add(this.ambientLight);
    this.spotLight = new THREE.SpotLight(this.options.sunColor, 0.8 * Math.PI, 2000, 0.8, 0, 0);
    this.spotLight.position.set(this.options.sun.x, this.options.sun.y, this.options.sun.z);
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 2048;
    this.spotLight.shadow.mapSize.height = 2048;
    this.scene.add(this.spotLight);

    this.Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    // CanvasTexture is explicitly tagged as sRGB in createMeshTexture. Encode the rendered
    // frame back to sRGB as well, otherwise viewMesh writes linear values straight to the
    // browser canvas and its colours no longer match the 2D WebGL map.
    this.Renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The full-map deck texture always has a background layer. Treat it as opaque so areas
    // outside the tilted terrain cannot blend with the page's white background while layers are
    // being refreshed.
    this.Renderer.setClearColor(0x000000, 1);
    this.Renderer.setSize(canvas.width, canvas.height);
    this.Renderer.shadowMap.enabled = true;
    this.Renderer.shadowMap.type = THREE.PCFShadowMap;
    if (this.options.extendedWater) this.extendWater(worldContext.graphWidth, worldContext.graphHeight);

    this.camera = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.1, 2000);
    this.camera.position.set(0, 400, 500);
    this.controls = new MapControls(this.camera, canvas);

    if (this.controls.target) this.controls.target.set(0, 0, 0);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 1000;
    this.controls.minZoom = 0.05;
    this.controls.maxZoom = 4;
    this.controls.zoomSpeed = 0.6;
    this.controls.panSpeed = 1.6;
    this.controls.enableRotate = true;
    this.controls.rotateSpeed = 0.5;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minPolarAngle = 0;

    this.controls.autoRotate = Boolean(this.options.rotateMesh);
    this.controls.autoRotateSpeed = this.options.rotateMesh;
    this.attachBurgPicking(canvas);
    this.createNightscapeBeamLight();
    this.syncNightscapeLighting();
    const erosionBuild = this.options.erosion;
    if (erosionBuild) this.setErosionBuildPending(true);
    this.queueMeshBuild({ refreshTerrainTexture: true, preserveTerrainOverlays: false, erosionBuild });
    this.animate();

    this.controls.addEventListener("change", () => this.render());
    return true;
  }

  private createNightscapeBeamLight(): void {
    if (!this.scene) return;

    this.nightscapeBeamTarget = new THREE.Object3D();
    this.nightscapeBeamLight = new THREE.SpotLight("#dcecff", 4.2, 0, 0.8, 0.88, 0);
    this.nightscapeBeamLight.castShadow = false;
    this.nightscapeBeamLight.visible = false;
    this.nightscapeBeamLight.target = this.nightscapeBeamTarget;
    this.scene.add(this.nightscapeBeamLight, this.nightscapeBeamTarget);
  }

  private textureToSprite(canvas: HTMLCanvasElement, width: number, height: number): THREE.Sprite {
    const map = new THREE.CanvasTexture(canvas);
    map.anisotropy = this.Renderer!.capabilities.getMaxAnisotropy();
    const mat = new THREE.SpriteMaterial({ map });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(width, height, 1);
    sprite.renderOrder = 1;
    return sprite;
  }

  private createTextLabel({
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
  }): THREE.Sprite {
    // CanvasTexture keeps a reference to its source canvas. Reusing one canvas for every label
    // means a later `fillText` overwrites every existing sprite after the next GPU upload.
    // Allocate one small canvas per sprite so a label keeps its own city/state text forever.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the 3D label canvas");

    context.font = `${size * quality}px ${font}`;
    canvas.width = Math.max(1, Math.ceil(context.measureText(text).width));
    canvas.height = Math.max(1, Math.ceil(size * quality * 1.25));
    // Setting canvas dimensions resets its 2D context state, including the font.
    context.font = `${size * quality}px ${font}`;
    context.fillStyle = color;
    context.fillText(text, 0, size * quality);

    return this.textureToSprite(canvas, canvas.width / quality, canvas.height / quality);
  }

  private get3dCoords(baseX: number, baseY: number): [number, number, number] {
    const surface = this.get3dSurface(baseX, baseY);
    return [surface.position.x, surface.position.y, surface.position.z];
  }

  private get3dSurface(baseX: number, baseY: number): { position: THREE.Vector3; normal: THREE.Vector3 } {
    const position = new THREE.Vector3(baseX - worldContext.graphWidth / 2, 0, baseY - worldContext.graphHeight / 2);
    const normal = new THREE.Vector3(0, 1, 0);
    if (!this.mesh) return { position, normal };

    this.raycaster ??= new THREE.Raycaster();
    this.raycaster.set(new THREE.Vector3(position.x, 10_000, position.z), new THREE.Vector3(0, -1, 0));
    const intersection = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!intersection) return { position, normal };

    position.copy(intersection.point);
    if (intersection.face) {
      normal.copy(intersection.face.normal).transformDirection(this.mesh.matrixWorld).normalize();
    }
    return { position, normal };
  }

  private attachBurgPicking(canvas: HTMLCanvasElement): void {
    this.detachBurgPicking();
    this.burgPickCanvas = canvas;
    canvas.addEventListener("pointerdown", this.onBurgPointerDown);
    canvas.addEventListener("pointerup", this.onBurgPointerUp);
    canvas.addEventListener("pointercancel", this.onBurgPointerCancel);
  }

  private detachBurgPicking(): void {
    if (!this.burgPickCanvas) return;
    this.burgPickCanvas.removeEventListener("pointerdown", this.onBurgPointerDown);
    this.burgPickCanvas.removeEventListener("pointerup", this.onBurgPointerUp);
    this.burgPickCanvas.removeEventListener("pointercancel", this.onBurgPointerCancel);
    this.burgPickCanvas = null;
    this.burgPointerStart = null;
  }

  private onBurgPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.burgPointerStart = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  };

  private onBurgPointerUp = (event: PointerEvent): void => {
    const pointerStart = this.burgPointerStart;
    this.burgPointerStart = null;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId || event.button !== 0) return;
    // MapControls uses the same canvas for drag panning. Treat only a stationary primary-button
    // gesture as a burg selection so releasing after a camera move never opens an editor.
    if (Math.hypot(event.clientX - pointerStart.clientX, event.clientY - pointerStart.clientY) > 5) return;
    this.pickBurgAt(event.clientX, event.clientY);
  };

  private onBurgPointerCancel = (): void => {
    this.burgPointerStart = null;
  };

  private pickBurgAt(clientX: number, clientY: number): void {
    const canvas = this.burgPickCanvas;
    if (!canvas || !this.camera || !this.iconBatches.length) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.burgPickPointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.burgPickRaycaster.setFromCamera(this.burgPickPointer, this.camera);

    for (const intersection of this.burgPickRaycaster.intersectObjects(this.iconBatches, false)) {
      const instanceId = intersection.instanceId;
      if (instanceId === undefined) continue;
      const burgIds: unknown = intersection.object.userData.burgIds;
      if (!Array.isArray(burgIds)) continue;
      const burgId = burgIds[instanceId];
      if (!Number.isInteger(burgId) || burgId <= 0) continue;
      document.dispatchEvent(new CustomEvent<{ burgId: number }>("fmg:3d-burg-select", { detail: { burgId } }));
      return;
    }
  }

  private createLowPolyBurgIcons(buildToken: number, onComplete: () => void): void {
    if (!this.scene || !layerIsOn("toggleBurgIcons")) {
      onComplete();
      return;
    }

    const symbols = buildLowPolyBurgSymbols(
      worldContext,
      viewContext.focusScope,
      getBurgIconStyle(worldContext, viewContext)
    );
    const largestPopulation = Math.max(
      1,
      ...symbols
        .filter(symbol => symbol.type === "burg")
        .map(symbol => (Number.isFinite(symbol.population) ? (symbol.population ?? 0) : 0))
    );
    const portBurgIds = new Set(symbols.filter(symbol => symbol.type === "anchor").map(symbol => symbol.burgId));
    const batches = new Map<string, Omit<IconBatchBuild, "mesh">>();
    for (const symbol of symbols) {
      const glow =
        this.options.sceneOnly && symbol.type === "burg"
          ? getNightscapePopulationGlow(symbol.population, largestPopulation)
          : { intensity: 0, level: 0 };
      const key = `${symbol.shape}|${symbol.opacity}|${glow.level}`;
      const batch = batches.get(key) ?? {
        shape: symbol.shape,
        opacity: symbol.opacity,
        glowLevel: glow.level,
        symbols: []
      };
      batch.symbols.push(symbol);
      batches.set(key, batch);
    }

    const jobs: IconBatchBuild[] = [];
    for (const batch of batches.values()) {
      const glowIntensity = this.options.sceneOnly ? 0.06 + batch.glowLevel * 0.32 : 0;
      const material = new THREE.MeshPhongMaterial({
        color: "#ffffff",
        opacity: batch.opacity,
        transparent: batch.opacity < 1,
        emissive: "#ffdca0",
        emissiveIntensity: glowIntensity,
        specular: this.options.sceneOnly ? "#fff0c5" : "#111111",
        shininess: this.options.sceneOnly ? 84 : 30,
        wireframe: Boolean(this.options.wireframe)
      });
      const mesh = new THREE.InstancedMesh(this.createLowPolyIconGeometry(batch.shape), material, batch.symbols.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.burgIds = batch.symbols.map(symbol => symbol.burgId);
      // Allocate each style batch once, then reveal its instances over several animation frames.
      // This keeps the final scene at the same draw-call count as an eager instanced build.
      mesh.count = 0;
      // Three computes an instanced mesh's bounds before its first visible instance otherwise;
      // progressive population would leave that stale empty bound eligible for frustum culling.
      mesh.frustumCulled = false;
      this.iconBatches.push(mesh);
      this.scene.add(mesh);
      jobs.push({ ...batch, mesh });
    }

    const up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const nightscapeGlowInstances: NightscapeGlowInstance[] = [];
    let batchIndex = 0;
    let symbolIndex = 0;

    const processChunk = (): void => {
      if (!this.isTerrainOverlayBuildCurrent(buildToken)) return;

      const deadline = performance.now() + 8;
      let processed = 0;
      const updatedMeshes = new Set<IconBatch>();
      while (batchIndex < jobs.length && processed < ICONS_PER_FRAME && performance.now() < deadline) {
        const job = jobs[batchIndex];
        const symbol = job.symbols[symbolIndex];
        const glow =
          this.options.sceneOnly && symbol.type === "burg"
            ? getNightscapePopulationGlow(symbol.population, largestPopulation)
            : { intensity: 0, level: 0 };
        const surface = this.get3dSurface(symbol.position[0], symbol.position[1]);
        // Lift from the sampled terrain along its normal. A port's anchor shares its burg's map
        // point, so reduce only the burg sphere/cube lift and leave the anchor's clearance intact.
        // This keeps the anchor from being visually swallowed by the larger city symbol.
        const isPortBurg = symbol.type === "burg" && portBurgIds.has(symbol.burgId);
        const clearance =
          Math.max(1.2, symbol.size * 0.35) + symbol.size * (isPortBurg ? PORT_BURG_LIFT_MULTIPLIER : 1);
        const position = surface.position.addScaledVector(surface.normal, clearance);
        quaternion.setFromUnitVectors(up, surface.normal);
        matrix.compose(position, quaternion, new THREE.Vector3(symbol.size, symbol.size, symbol.size));
        job.mesh.setMatrixAt(symbolIndex, matrix);

        const color = new THREE.Color(symbol.color);
        if (this.options.sceneOnly && symbol.type === "burg") {
          color.lerp(new THREE.Color("#fff1c4"), glow.intensity * 0.72);
          color.multiplyScalar(0.5 + glow.intensity * 0.9);
          if (glow.level > 0) {
            nightscapeGlowInstances.push({
              position: position.clone().addScaledVector(surface.normal, symbol.size * 0.35),
              intensity: glow.intensity,
              level: glow.level
            });
          }
        }
        job.mesh.setColorAt(symbolIndex, color);
        job.mesh.count = symbolIndex + 1;
        updatedMeshes.add(job.mesh);
        symbolIndex++;
        processed++;

        if (symbolIndex === job.symbols.length) {
          batchIndex++;
          symbolIndex = 0;
        }
      }

      for (const mesh of updatedMeshes) {
        mesh.instanceMatrix.needsUpdate = true;
        // setColorAt above creates instanceColor for every non-empty batch.
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      this.render();

      if (batchIndex < jobs.length) {
        this.terrainOverlayBuildFrame = requestAnimationFrame(processChunk);
        return;
      }

      this.terrainOverlayBuildFrame = null;
      this.createNightscapeBurgGlow(nightscapeGlowInstances);
      onComplete();
    };

    processChunk();
  }

  /** Satellite terrain uses a dedicated texture and suspends Deck; Three.js scene overlays still remain available. */
  private isSatelliteTerrainMode(): boolean {
    return Boolean(
      this.options.satellite && !this.options.isGlobe && !this.options.wireframe && !this.options.sceneOnly
    );
  }

  private notifySatelliteTerrainMode(): void {
    document.dispatchEvent(
      new CustomEvent<boolean>("fmg:viewmesh-satellite-terrain-mode-changed", {
        detail: this.isSatelliteTerrainMode()
      })
    );
  }

  private cancelTerrainOverlayBuild(): void {
    this.terrainOverlayBuildToken++;
    if (this.terrainOverlayBuildFrame !== null) {
      cancelAnimationFrame(this.terrainOverlayBuildFrame);
      this.terrainOverlayBuildFrame = null;
    }
  }

  /** Defers non-terrain scene work until the first terrain frame has been committed. */
  private scheduleTerrainOverlays(): void {
    if (!this.scene || !this.mesh) return;

    this.cancelTerrainOverlayBuild();
    const token = this.terrainOverlayBuildToken;
    this.terrainOverlayBuildFrame = requestAnimationFrame(() => {
      this.terrainOverlayBuildFrame = null;
      if (!this.isTerrainOverlayBuildCurrent(token)) return;

      this.createLowPolyBurgIcons(token, () => {
        if (!this.isTerrainOverlayBuildCurrent(token)) return;
        this.createFloatingRoutes(token);
      });
    });
  }

  /** Rebuilds only route batches when a route-specific display option changes. */
  private scheduleFloatingRoutes(): void {
    if (!this.scene || !this.mesh) return;

    this.cancelTerrainOverlayBuild();
    const token = this.terrainOverlayBuildToken;
    this.terrainOverlayBuildFrame = requestAnimationFrame(() => {
      this.terrainOverlayBuildFrame = null;
      if (this.isTerrainOverlayBuildCurrent(token)) this.createFloatingRoutes(token);
    });
  }

  private isTerrainOverlayBuildCurrent(token: number): boolean {
    return (
      token === this.terrainOverlayBuildToken &&
      this.options.isOn === true &&
      this.options.isGlobe !== true &&
      Boolean(this.scene && this.mesh)
    );
  }

  /**
   * Renders routes as lines floating above the terrain surface. Routes are grouped by dash pattern
   * and color within each animation-frame chunk, so a dense network becomes visible progressively
   * instead of blocking the terrain's first render.
   */
  private createFloatingRoutes(buildToken: number): void {
    if (
      !this.scene ||
      !this.mesh ||
      !layerIsOn("toggleRoutes") ||
      (this.options.sceneOnly && !this.options.nightscapeRouteGlowEnabled)
    ) {
      return;
    }

    const dashStyles = getPathDashStyles(viewContext);
    const paintStyles = getPathPaintStyles(viewContext);
    const routes = buildRoutePaths(
      worldContext,
      viewContext.focusScope,
      { roads: dashStyles.roads, trails: dashStyles.trails, searoutes: dashStyles.searoutes },
      { roads: paintStyles.roads, trails: paintStyles.trails, searoutes: paintStyles.searoutes }
    );

    let routeIndex = 0;

    const processRoute = (route: DeckPath, batches: Map<string, RouteLineBatch>): void => {
      const points = this.projectRoutePoints(route);
      if (points.length < 2) return;

      const [red, green, blue, alpha = 255] = route.color;
      // route.dashArray is normalized to multiples of path width (see getNormalizedDashArray in
      // deckDataAdapters.ts) for deck.gl's PathStyleExtension; convert back to world-space lengths.
      const [dashRatio = 0, gapRatio = 0] = route.dashArray ?? [];
      const dashSize = dashRatio * route.width;
      const gapSize = gapRatio * route.width;
      const key = `${dashSize.toFixed(3)}|${gapSize.toFixed(3)}|${red}|${green}|${blue}|${alpha}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { positions: [], colors: [], opacity: alpha / 255, dashSize, gapSize };
        batches.set(key, batch);
      }

      const r = red / 255;
      const g = green / 255;
      const b = blue / 255;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const c = points[i];
        batch.positions.push(a.x, a.y, a.z, c.x, c.y, c.z);
        batch.colors.push(r, g, b, r, g, b);
      }
    };

    const processChunk = (): void => {
      if (!this.isTerrainOverlayBuildCurrent(buildToken)) return;

      const deadline = performance.now() + 8;
      const routeBatches = new Map<string, RouteLineBatch>();
      let processed = 0;
      while (routeIndex < routes.length && processed < ROUTES_PER_FRAME && performance.now() < deadline) {
        processRoute(routes[routeIndex], routeBatches);
        routeIndex++;
        processed++;
      }

      for (const batch of routeBatches.values()) {
        if (batch.positions.length) this.addFloatingRouteBatch(batch);
      }
      this.render();

      if (routeIndex < routes.length) {
        this.terrainOverlayBuildFrame = requestAnimationFrame(processChunk);
        return;
      }

      this.terrainOverlayBuildFrame = null;
      if (!this.isTerrainOverlayBuildCurrent(buildToken)) return;
    };

    processChunk();
  }

  private projectRoutePoints(route: DeckPath): THREE.Vector3[] {
    return route.path.map(([x, y]) => {
      const height = this.sampleTerrainHeight(x, y) + ROUTE_SURFACE_CLEARANCE;
      return new THREE.Vector3(x - worldContext.graphWidth / 2, height, y - worldContext.graphHeight / 2);
    });
  }

  private addFloatingRouteBatch(batch: RouteLineBatch): void {
    if (!this.scene) return;

    if (this.options.sceneOnly) {
      this.addNightscapeRouteGlowBatch(batch);
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(batch.colors, 3));

    const isDashed = batch.dashSize > 0 && batch.gapSize > 0;
    const material = isDashed
      ? new THREE.LineDashedMaterial({
          vertexColors: true,
          opacity: batch.opacity,
          transparent: batch.opacity < 1,
          dashSize: batch.dashSize,
          gapSize: batch.gapSize,
          depthWrite: false
        })
      : new THREE.LineBasicMaterial({
          vertexColors: true,
          opacity: batch.opacity,
          transparent: batch.opacity < 1,
          depthWrite: false
        });

    const line = new THREE.LineSegments(geometry, material);
    if (isDashed) line.computeLineDistances();
    line.renderOrder = 1;
    this.floatingRoutes.push(line);
    this.scene.add(line);
  }

  /**
   * Uses Three's screen-space line renderer instead of LineBasicMaterial so the soft halo remains
   * visible on devices that clamp native WebGL line widths to one pixel. Two batched passes keep
   * the route's original colour and dash rhythm while producing a city-light-like glow.
   */
  private addNightscapeRouteGlowBatch(batch: RouteLineBatch): void {
    if (!this.scene) return;
    const scene = this.scene;

    const isDashed = batch.dashSize > 0 && batch.gapSize > 0;
    const addPass = (linewidth: number, opacity: number, renderOrder: number): void => {
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(batch.positions);
      geometry.setColors(batch.colors);
      const material = new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        dashed: isDashed,
        dashSize: batch.dashSize,
        gapSize: batch.gapSize,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      }) as ScreenLineMaterial;
      material.linewidth = linewidth;
      material.resolution.set(this.Renderer?.domElement.width ?? 1, this.Renderer?.domElement.height ?? 1);

      const line = new LineSegments2(geometry, material);
      if (isDashed) line.computeLineDistances();
      line.renderOrder = renderOrder;
      this.floatingRoutes.push(line);
      scene.add(line);
    };

    addPass(5.5, batch.opacity * 0.22, 1);
    addPass(1.4, Math.min(1, batch.opacity * 1.8), 2);
  }

  /**
   * Height at arbitrary map coordinates without raycasting the dense terrain mesh: bilinearly
   * interpolates the same per-vertex heights the mesh geometry was built from (getMeshHeight),
   * or samples the erosion bake's own analytic field when that is the active height source —
   * mirroring erosion-bake.ts's heightAt(), which exists precisely to avoid raycasting the mesh.
   */
  private sampleTerrainHeight(baseX: number, baseY: number): number {
    if (this.erosionBakeActive) return ErosionBake.heightAt(baseX, baseY, this.options.scale);

    const cellsX = worldContext.grid.cellsX;
    const cellsY = worldContext.grid.cellsY;
    const fx = Math.min(Math.max((baseX / worldContext.graphWidth) * (cellsX - 1), 0), cellsX - 1);
    const fy = Math.min(Math.max((baseY / worldContext.graphHeight) * (cellsY - 1), 0), cellsY - 1);
    const col0 = Math.floor(fx);
    const row0 = Math.floor(fy);
    const col1 = Math.min(col0 + 1, cellsX - 1);
    const row1 = Math.min(row0 + 1, cellsY - 1);
    const tx = fx - col0;
    const ty = fy - row0;

    const topLeft = this.getMeshHeight(row0 * cellsX + col0);
    const topRight = this.getMeshHeight(row0 * cellsX + col1);
    const bottomLeft = this.getMeshHeight(row1 * cellsX + col0);
    const bottomRight = this.getMeshHeight(row1 * cellsX + col1);

    const top = topLeft * (1 - tx) + topRight * tx;
    const bottom = bottomLeft * (1 - tx) + bottomRight * tx;
    return top * (1 - ty) + bottom * ty;
  }

  private createNightscapeBurgGlow(instances: NightscapeGlowInstance[]): void {
    if (!this.scene || !this.options.sceneOnly || !instances.length) return;

    const byLevel = new Map<number, NightscapeGlowInstance[]>();
    for (const instance of instances) {
      const group = byLevel.get(instance.level) ?? [];
      group.push(instance);
      byLevel.set(instance.level, group);
    }

    const texture = this.getNightscapeGlowTexture();
    for (const [level, group] of byLevel) {
      const positions = new Float32Array(group.length * 3);
      const colors = new Float32Array(group.length * 3);
      for (let index = 0; index < group.length; index++) {
        const instance = group[index];
        positions.set(instance.position.toArray(), index * 3);
        const color = new THREE.Color("#ffe4a8").multiplyScalar(0.35 + instance.intensity * 0.9);
        colors.set([color.r, color.g, color.b], index * 3);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        map: texture,
        size: 2.5 + level * 2.2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.35 + level * 0.12,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const points = new THREE.Points(geometry, material);
      points.renderOrder = 1;
      this.nightscapeGlowBatches.push(points);
      this.scene.add(points);
    }
  }

  private getNightscapeGlowTexture(): THREE.CanvasTexture {
    if (this.nightscapeGlowTexture) return this.nightscapeGlowTexture;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create Nightscape glow texture");

    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 250, 224, 1)");
    gradient.addColorStop(0.16, "rgba(255, 235, 172, 0.95)");
    gradient.addColorStop(0.48, "rgba(255, 204, 114, 0.32)");
    gradient.addColorStop(1, "rgba(255, 180, 80, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    this.nightscapeGlowTexture = new THREE.CanvasTexture(canvas);
    this.nightscapeGlowTexture.colorSpace = THREE.SRGBColorSpace;
    return this.nightscapeGlowTexture;
  }

  private createLowPolyIconGeometry(shape: LowPolyBurgShape): THREE.BufferGeometry {
    if (shape === "sphere") return new THREE.IcosahedronGeometry(1, 1);
    if (shape === "cube") return new THREE.BoxGeometry(1.6, 1.6, 1.6);

    const anchor = new THREE.Shape();
    anchor.moveTo(-0.12, 1.1);
    anchor.lineTo(0.12, 1.1);
    anchor.lineTo(0.12, 0.62);
    anchor.lineTo(0.38, 0.62);
    anchor.lineTo(0.38, 0.44);
    anchor.lineTo(0.16, 0.44);
    anchor.lineTo(0.16, -0.35);
    anchor.lineTo(0.55, -0.08);
    anchor.lineTo(0.72, -0.32);
    anchor.lineTo(0, -0.8);
    anchor.lineTo(-0.72, -0.32);
    anchor.lineTo(-0.55, -0.08);
    anchor.lineTo(-0.16, -0.35);
    anchor.lineTo(-0.16, 0.44);
    anchor.lineTo(-0.38, 0.44);
    anchor.lineTo(-0.38, 0.62);
    anchor.lineTo(-0.12, 0.62);
    anchor.closePath();
    const geometry = new THREE.ExtrudeGeometry(anchor, { depth: 0.35, bevelEnabled: false, curveSegments: 1 });
    geometry.center();
    return geometry;
  }

  private createLabels(): void {
    this.labelBuildToken += 1;
    const buildToken = this.labelBuildToken;
    if (this.labelsBuildFrame !== null) {
      cancelAnimationFrame(this.labelsBuildFrame);
      this.labelsBuildFrame = null;
    }

    this.raycaster = new THREE.Raycaster();
    this.raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));

    const states = viewContext.viewbox.select("#labels #states");

    const stateOptions = {
      font: states.attr("font-family"),
      size: +states.attr("data-size") / 2,
      color: states.attr("fill"),
      elevation: 20,
      quality: 80
    };

    const labelsLayerOn = layerIsOn("toggleLabels");

    const getBurgLabelOptions = (burg: {
      group?: string;
      name?: string;
    }): {
      font: string;
      size: number;
      color: string;
      elevation: number;
      quality: number;
    } | null => {
      if (!burg.group) return null;

      const labelGroup = viewContext.burgLabels.select(`#${burg.group}`);
      if (labelGroup.empty()) return null;

      const font = labelGroup.attr("font-family") || "Arial";
      const size = +labelGroup.attr("data-size") || 10;
      const color = labelGroup.attr("fill") || "#000";

      const elevation = Math.max(5, size * 0.5);
      return { font, size, color, elevation, quality: 40 };
    };

    let burgIndex = 1;
    let stateIndex = 1;
    const LABELS_FRAME_BUDGET_MS = 6;

    const flushFrame = (): void => {
      this.setLabelsVisibility(Boolean(this.options.labels3d));
      this.doWorkOnRender();
      this.render();
    };

    const processStatesChunk = (): void => {
      if (buildToken !== this.labelBuildToken || !this.options.labels3d || !this.scene) {
        this.labelsBuildFrame = null;
        return;
      }

      const deadline = performance.now() + LABELS_FRAME_BUDGET_MS;
      let processed = false;
      while (stateIndex < worldContext.pack.states.length && (!processed || performance.now() < deadline)) {
        const state = worldContext.pack.states[stateIndex++];
        if (state.removed) continue;

        const [x, y, z] = this.get3dCoords(state.pole![0], state.pole![1]);
        const text = states.select(`#stateLabel${state.i}`)?.text() || state.name;
        const stateSprite = this.createTextLabel({ text, ...stateOptions }) as LabelSprite;

        stateSprite.position.set(x, y + stateOptions.elevation, z);
        stateSprite.size = stateOptions.size;
        this.labels.push(stateSprite);
        this.scene.add(stateSprite);
        processed = true;
      }

      flushFrame();

      if (stateIndex < worldContext.pack.states.length) {
        this.labelsBuildFrame = requestAnimationFrame(processStatesChunk);
      } else {
        this.labelsBuildFrame = null;
      }
    };

    const processBurgsChunk = (): void => {
      if (buildToken !== this.labelBuildToken || !this.options.labels3d || !this.scene) {
        this.labelsBuildFrame = null;
        return;
      }

      const deadline = performance.now() + LABELS_FRAME_BUDGET_MS;
      let processed = false;
      while (burgIndex < worldContext.pack.burgs.length && (!processed || performance.now() < deadline)) {
        const burg = worldContext.pack.burgs[burgIndex++];
        if (burg.removed) continue;

        const burgOptions = getBurgLabelOptions(burg);
        if (!burgOptions) continue;

        const [x, y, z] = this.get3dCoords(burg.x, burg.y);

        if (labelsLayerOn) {
          const burgSprite = this.createTextLabel({ text: burg.name ?? "", ...burgOptions }) as LabelSprite;
          burgSprite.position.set(x, y + burgOptions.elevation, z);
          burgSprite.size = burgOptions.size;
          this.labels.push(burgSprite);
          this.scene.add(burgSprite);
        }

        processed = true;
      }

      flushFrame();

      if (burgIndex < worldContext.pack.burgs.length) {
        this.labelsBuildFrame = requestAnimationFrame(processBurgsChunk);
        return;
      }

      if (labelsLayerOn) {
        this.labelsBuildFrame = requestAnimationFrame(processStatesChunk);
      } else {
        this.labelsBuildFrame = null;
      }
    };

    flushFrame();
    this.labelsBuildFrame = requestAnimationFrame(processBurgsChunk);
  }

  private setLabelsVisibility(visible: boolean): void {
    for (const label of this.labels) label.visible = visible;
  }

  private invalidateLabelVisibilityCache(): void {
    this.lastLabelVisibilityCamera = {
      x: Number.NaN,
      y: Number.NaN,
      z: Number.NaN,
      qx: Number.NaN,
      qy: Number.NaN,
      qz: Number.NaN,
      qw: Number.NaN
    };
  }

  private deleteLabels(): void {
    this.labelBuildToken += 1;
    if (this.labelsBuildFrame !== null) {
      cancelAnimationFrame(this.labelsBuildFrame);
      this.labelsBuildFrame = null;
    }

    this.raycaster = undefined;

    const disposedMaterials = new Set<THREE.Material>();
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposeMaterial = (material: THREE.Material): void => {
      if (disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      material.dispose();
    };
    const disposeGeometry = (geometry: THREE.BufferGeometry): void => {
      if (disposedGeometries.has(geometry)) return;
      disposedGeometries.add(geometry);
      geometry.dispose();
    };

    for (const m of this.labels) {
      this.scene!.remove(m);
      (m.material as THREE.SpriteMaterial).map?.dispose();
      disposeMaterial(m.material as THREE.Material);
      disposeGeometry(m.geometry as THREE.BufferGeometry);
    }
    this.labels = [];

    this.deleteLowPolyBurgIcons(disposeMaterial, disposeGeometry);
  }

  private deleteLowPolyBurgIcons(
    disposeMaterial?: (material: THREE.Material) => void,
    disposeGeometry?: (geometry: THREE.BufferGeometry) => void
  ): void {
    const releaseMaterial = disposeMaterial ?? ((material: THREE.Material) => material.dispose());
    const releaseGeometry = disposeGeometry ?? ((geometry: THREE.BufferGeometry) => geometry.dispose());
    for (const m of this.iconBatches) {
      this.scene!.remove(m);
      releaseMaterial(m.material as THREE.Material);
      releaseGeometry(m.geometry as THREE.BufferGeometry);
    }
    this.iconBatches = [];

    for (const glow of this.nightscapeGlowBatches) {
      this.scene!.remove(glow);
      releaseMaterial(glow.material);
      releaseGeometry(glow.geometry);
    }
    this.nightscapeGlowBatches = [];
    this.nightscapeGlowTexture?.dispose();
    this.nightscapeGlowTexture = undefined;
  }

  private deleteFloatingRoutes(): void {
    for (const route of this.floatingRoutes) {
      this.scene?.remove(route);
      route.geometry.dispose();
      route.material.dispose();
    }
    this.floatingRoutes = [];
  }

  private async createMeshTexture(): Promise<THREE.CanvasTexture | null> {
    const canvas = await renderWebglMapTexture(worldContext, viewContext, appServices, {
      resolution: Math.min(this.options.resolutionScale, 8192),
      // Labels, burg/anchor symbols, and routes are separate scene objects (sprites, instanced
      // mesh, and floating lines respectively). Leaving any of them in the terrain bitmap would
      // duplicate them and make them appear painted on.
      includeLabels: false,
      includeBurgIcons: false,
      includeRoutes: false
    });
    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (this.Renderer) texture.anisotropy = this.Renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  private queueMeshBuild(options: MeshRebuildOptions): void {
    const requestId = ++this.meshBuildRequestId;
    const build = async (): Promise<void> => {
      if (!this.isMeshBuildCurrent(requestId)) return;
      try {
        // Let React paint the disabled erosion controls before a GPU readback / CPU terrain pass
        // can monopolize the main thread. The current request is checked again after that frame.
        if (options.erosionBuild) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (!this.isMeshBuildCurrent(requestId)) return;
        await this.createMesh(
          worldContext.graphWidth,
          worldContext.graphHeight,
          worldContext.grid.cellsX,
          worldContext.grid.cellsY,
          options,
          requestId
        );
      } finally {
        if (options.erosionBuild && requestId === this.meshBuildRequestId) this.setErosionBuildPending(false);
      }
    };

    this.meshBuildQueue = this.meshBuildQueue.then(build, build).catch(error => {
      console.error("3D mesh rebuild failed:", error);
    });
  }

  private isMeshBuildCurrent(requestId: number): boolean {
    return this.options.isOn === true && this.options.isGlobe !== true && requestId === this.meshBuildRequestId;
  }

  private async createMesh(
    width: number,
    height: number,
    segmentsX: number,
    segmentsY: number,
    { refreshTerrainTexture, preserveTerrainOverlays }: MeshRebuildOptions,
    requestId: number
  ): Promise<void> {
    this.stopWaterAnimation();
    this.gridToPackCellMap = new Map();
    if (worldContext.pack.cells?.g && worldContext.pack.cells?.i) {
      for (const packCellIndex of worldContext.pack.cells.i) {
        const gridCellIndex = worldContext.pack.cells.g[packCellIndex];
        if (!this.gridToPackCellMap.has(gridCellIndex)) {
          this.gridToPackCellMap.set(gridCellIndex, packCellIndex);
        }
      }
    }

    const sceneOnly = this.options.sceneOnly;
    const useSatellite = Boolean(
      this.options.satellite && !this.options.isGlobe && !this.options.wireframe && !sceneOnly
    );

    const usesTerrainTexture = !this.options.wireframe && !useSatellite && !sceneOnly;
    let nextTerrainTexture: THREE.CanvasTexture | undefined;
    if (usesTerrainTexture && (refreshTerrainTexture || !this.texture)) {
      nextTerrainTexture = (await this.createMeshTexture()) ?? undefined;
      if (!this.isMeshBuildCurrent(requestId)) {
        nextTerrainTexture?.dispose();
        return;
      }
    }

    if (!this.isMeshBuildCurrent(requestId)) return;

    const previousTexture = this.texture;
    const previousMaterial = this.material;
    if (nextTerrainTexture) this.texture = nextTerrainTexture;
    else if (useSatellite || sceneOnly) this.texture = undefined;

    // A terrain-only erosion rebuild keeps the previous mesh on-screen while the bake runs.
    // Its material and texture must stay alive until the replacement mesh is committed below.
    if (this.material && !preserveTerrainOverlays) this.material.dispose();
    // The map texture is already composited by deck.gl. Lighting it again makes overlapping,
    // semi-transparent layers clip to white, so preserve its 2D colours with an unlit material.
    // Satellite terrain remains lit because its procedural texture intentionally includes relief.
    this.material = useSatellite ? new THREE.MeshLambertMaterial() : new THREE.MeshBasicMaterial();

    if (this.options.wireframe) {
      this.material.wireframe = true;
    } else if (usesTerrainTexture) {
      this.material.map = this.texture ?? null;
      this.material.transparent = false;
      this.material.depthWrite = true;
    }
    if (previousTexture && previousTexture !== this.texture && !preserveTerrainOverlays) previousTexture.dispose();

    let bakeResult: ErosionBake.ErosionBakeResult | null = null;
    if ((this.options.erosion || useSatellite) && !this.options.isGlobe) {
      // The old mapping silently amplified the selected mesh detail (1024 -> 2048 bake,
      // 2048 -> 4096 bake). The bake has a synchronous CPU post-process, so that amplification
      // can monopolize the UI thread after entering viewMesh from the hybrid renderer.
      const baseBakeResolution = Math.max(512, Math.min(this.options.erosionDetail, 2048));
      const satelliteBakeResolution =
        this.options.resolutionScale >= 8192 ? 8192 : this.options.resolutionScale >= 4096 ? 2048 : 1024;
      const desiredBakeResolution = useSatellite
        ? Math.max(baseBakeResolution, satelliteBakeResolution)
        : baseBakeResolution;
      const maxBakeResolution = Math.min(this.Renderer!.capabilities.maxTextureSize, 8192);

      bakeResult = await ErosionBake.bake(this.Renderer!, {
        strength: this.options.erosion ? this.options.erosionStrength : 0,
        riverDepth: this.options.erosion ? this.options.erosionRiverDepth : 0,
        octaves: this.options.erosion ? this.options.erosionOctaves : 1,
        bakeResolution: Math.min(desiredBakeResolution, maxBakeResolution)
      });
      if (!this.isMeshBuildCurrent(requestId)) return;
      if (!bakeResult && this.options.erosion) {
        console.warn("3D erosion bake failed, falling back to standard mesh");
        tip("Eroded terrain is not supported on this device", false, "warn", 4000);
        this.options.erosion = false;
        document.dispatchEvent(new CustomEvent("fmg:sync-erosion-ui"));
      }
    }

    this.erosionBakeActive = Boolean(bakeResult) && Boolean(this.options.erosion);
    this.erosionBakeData = bakeResult;
    if (!useSatellite) {
      disposeSatelliteTexture();
      disposeRiverFlowTexture();
    }

    if (this.geometry) this.geometry.dispose();
    if (this.mesh) this.scene!.remove(this.mesh);
    if (preserveTerrainOverlays) {
      previousMaterial?.dispose();
      if (previousTexture && previousTexture !== this.texture) previousTexture.dispose();
    }

    if (this.erosionBakeActive) {
      const segLong = this.options.erosionDetail;
      const segX = width >= height ? segLong : Math.max(2, Math.round((segLong * width) / height));
      const segY = width >= height ? Math.max(2, Math.round((segLong * height) / width)) : segLong;
      this.geometry = new THREE.PlaneGeometry(width, height, segX - 1, segY - 1);

      const vertices = this.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const mapX = vertices.getX(i) + width / 2;
        const mapY = height / 2 - vertices.getY(i);
        vertices.setZ(i, ErosionBake.heightAt(mapX, mapY, this.options.scale));
      }
      this.geometry.computeVertexNormals();
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    } else {
      this.geometry = new THREE.PlaneGeometry(width, height, segmentsX - 1, segmentsY - 1);

      const vertices = this.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        vertices.setZ(i, this.getMeshHeight(i));
      }

      this.geometry.setAttribute("position", vertices);
      this.geometry.computeVertexNormals();
      if (this.options.subdivide) {
        const subdivideParams = {
          split: true,
          uvSmooth: false,
          preserveEdges: true,
          flatOnly: false,
          maxTriangles: Infinity
        };
        const smoothGeometry = LoopSubdivision.modify(this.geometry, 1, subdivideParams);
        this.mesh = new THREE.Mesh(smoothGeometry, this.material);
      } else {
        this.mesh = new THREE.Mesh(this.geometry, this.material);
      }
    }

    if (useSatellite) {
      const satelliteTexture =
        bakeResult &&
        generateSatelliteTexture(this.Renderer!, bakeResult, {
          scale: this.options.scale,
          maxOutput: Math.max(512, Math.min(this.options.resolutionScale, 8192))
        });
      if (satelliteTexture) {
        this.material.map = satelliteTexture;
        this.applyWaterAnimation(this.material as THREE.MeshLambertMaterial, generateRiverFlowTexture());
        this.startWaterAnimation();
      } else
        console.warn("Satellite terrain texture generation failed; rendering the height mesh without a map texture");
    }

    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = !sceneOnly;
    this.scene!.add(this.mesh);
    if (this.waterMesh) this.waterMesh.visible = !sceneOnly;
    this.mesh.updateMatrixWorld();
    if (!preserveTerrainOverlays) this.scheduleTerrainOverlays();
    this.render();

    // If the user changed a layer while `createMeshTexture()` awaited its first deck.gl frame,
    // the initial bitmap can reflect the old layer state. Immediately request one fresh bitmap
    // now that a material exists; update3dTexture coalesces further rapid toggles.
    if (this.textureRefreshPendingDuringMeshBuild) {
      this.textureRefreshPendingDuringMeshBuild = false;
      this.update3dTexture();
    }

    if (!preserveTerrainOverlays && this.options.labels3d && !useSatellite) {
      this.createLabels();
      this.render();
    }
  }

  private readonly LOWER_BY_WATER = 18;
  private readonly DIVIDER = 100 - 18;

  private getMeshHeight(i: number): number {
    const height = worldContext.grid.cells.h[i];

    let waterCellId: number | null = null;
    if (height < SEA_LEVEL) {
      waterCellId = i;
    } else if (worldContext.grid.cells.c![i]) {
      waterCellId = worldContext.grid.cells.c![i].find((c: number) => worldContext.grid.cells.h[c] < SEA_LEVEL) ?? null;
    }

    if (waterCellId !== null) {
      const waterHeight = getWaterSurfaceHeight(worldContext, waterCellId, this.gridToPackCellMap!);
      return ((waterHeight - this.LOWER_BY_WATER) / this.DIVIDER) * this.options.scale;
    }

    return ((height - this.LOWER_BY_WATER) / this.DIVIDER) * this.options.scale;
  }

  private extendWater(width: number, height: number): void {
    this.scene!.background = new THREE.Color(this.options.skyColor);

    this.waterPlane = new THREE.PlaneGeometry(width * 10, height * 10, 1);
    this.waterMaterial = new THREE.MeshBasicMaterial({ color: this.options.waterColor });
    this.scene!.fog = new THREE.Fog(this.scene!.background as THREE.Color, 500, 3000);

    this.waterMesh = new THREE.Mesh(this.waterPlane, this.waterMaterial);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y -= 3;
    this.scene!.add(this.waterMesh);
  }

  private update3dTexture(): void {
    if (!this.material || !this.Renderer) return;
    this.textureUpdateQueued = true;
    if (!this.textureUpdateInFlight) void this.flush3dTextureUpdates();
  }

  private async flush3dTextureUpdates(): Promise<void> {
    this.textureUpdateInFlight = true;
    try {
      while (this.textureUpdateQueued) {
        this.textureUpdateQueued = false;
        if (!this.material || !this.Renderer || !this.options.isOn || this.options.sceneOnly) continue;

        if (this.isSatelliteTerrainMode()) {
          if (this.erosionBakeData) {
            const satelliteTexture = generateSatelliteTexture(this.Renderer, this.erosionBakeData, {
              scale: this.options.scale,
              maxOutput: Math.max(512, Math.min(this.options.resolutionScale, 8192))
            });
            if (satelliteTexture) {
              this.material.map = satelliteTexture;
              this.render();
            }
          }
          // Satellite mode deliberately never falls back to a composited Deck bitmap.
          continue;
        }

        const material = this.material;
        const nextTexture = await this.createMeshTexture();
        // Keep the visible bitmap until the last requested deck.gl frame is ready. Any frame made
        // obsolete while it was rendering is discarded without touching the terrain material.
        if (this.material !== material || !this.options.isOn || this.options.sceneOnly || this.textureUpdateQueued) {
          nextTexture?.dispose();
          continue;
        }
        if (!nextTexture) {
          this.retryTextureUpdate(material);
          continue;
        }

        const previousTexture = this.texture;
        this.texture = nextTexture;
        // CanvasTexture normally marks itself dirty in its constructor, but this canvas is fed
        // by a separate WebGL renderer. Mark it explicitly so Three uploads the replacement
        // bitmap even when the preceding texture used the same dimensions.
        nextTexture.needsUpdate = true;
        this.material.map = nextTexture;
        this.material.transparent = false;
        this.material.depthWrite = true;
        this.material.needsUpdate = true;
        previousTexture?.dispose();
        this.textureRetryCount = 0;
        this.render();
      }
    } finally {
      this.textureUpdateInFlight = false;
      // A layer toggle may land after the `while` condition observed an empty queue but before
      // the in-flight flag is cleared. Start one more pass so that final request is never lost.
      if (this.textureUpdateQueued) void this.flush3dTextureUpdates();
    }
  }

  private retryTextureUpdate(material: THREE.Material): void {
    if (this.textureRetryTimer !== null || this.textureRetryCount >= 2) return;
    this.textureRetryCount++;
    this.textureRetryTimer = window.setTimeout(() => {
      this.textureRetryTimer = null;
      if (this.material !== material || !this.options.isOn || this.options.sceneOnly) return;
      this.update3dTexture();
    }, 180);
  }

  private async newGlobe(canvas: HTMLCanvasElement): Promise<boolean> {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.TextureLoader().load(
      "https://i0.wp.com/azgaar.files.wordpress.com/2019/10/stars-1.png",
      () => this.render()
    );

    this.Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.Renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.Renderer.setSize(canvas.width, canvas.height);

    if (this.material) this.material.dispose();
    this.material = new THREE.MeshBasicMaterial({ transparent: true });
    this.updateGlobeTexure(true);

    this.camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000).translateZ(5);

    this.controls = new OrbitControls(this.camera, this.Renderer.domElement);
    this.controls.zoomSpeed = 0.25;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 10;
    this.controls.autoRotate = Boolean(this.options.rotateGlobe);
    this.controls.autoRotateSpeed = this.options.rotateGlobe;

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    this.controls.screenSpacePanning = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;

    this.controls.addEventListener("change", () => this.render());

    return true;
  }

  private async updateGlobeTexure(addMesh?: boolean): Promise<void> {
    const world = (worldContext.mapCoordinates.latT || 0) > 179;

    const scale = this.options.resolution;
    const height = 512 * scale;
    const width = 1024 * scale;

    const mapHeight = rn(((worldContext.mapCoordinates.latT || 0) / 180) * height);
    const mapWidth = world ? mapHeight * 2 : rn((worldContext.graphWidth / worldContext.graphHeight) * mapHeight);
    const dy = world ? 0 : ((90 - (worldContext.mapCoordinates.latN || 0)) / 180) * height;
    const dx = world ? 0 : mapWidth / 4;

    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    ctx.canvas.width = width;
    ctx.canvas.height = height;

    if (!world) {
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          resolve();
        };
        img.src = cloudImage;
      });
    }

    const mapUrl = await getMapURL("mesh", { noScaleBar: true, fullMap: true, noVignette: true });
    await new Promise<void>(resolve => {
      const img2 = new Image();
      img2.onload = () => {
        if (!this.Renderer || !this.material) {
          resolve();
          return;
        }
        ctx.drawImage(img2, dx, dy, mapWidth, mapHeight);
        if (this.texture) this.texture.dispose();
        this.texture = new THREE.CanvasTexture(ctx.canvas);
        this.material.map = this.texture;
        if (addMesh) this.addGlobe3dMesh();
        else this.render();
        resolve();
      };
      img2.src = mapUrl;
    });
  }

  private addGlobe3dMesh(): void {
    this.geometry = new THREE.SphereGeometry(1, 64, 64);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene!.add(this.mesh!);
    if (this.controls!.autoRotate) this.animate();
    else this.render();
  }

  private render(): void {
    if (!this.Renderer) return;
    this.updateNightscapeBeam();
    this.Renderer.render(this.scene!, this.camera!);
    this.renderThrottled();
  }

  private updateNightscapeBeam(): void {
    if (
      !this.options.sceneOnly ||
      !this.options.nightscapeBeamEnabled ||
      !this.camera ||
      !this.nightscapeBeamLight ||
      !this.nightscapeBeamTarget
    ) {
      return;
    }

    this.camera.getWorldDirection(this.nightscapeBeamDirection);
    const pose = getNightscapeBeamPose(
      [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      [this.nightscapeBeamDirection.x, this.nightscapeBeamDirection.y, this.nightscapeBeamDirection.z],
      worldContext.graphWidth,
      worldContext.graphHeight,
      this.camera.fov,
      this.camera.aspect,
      this.options.nightscapeBeamReversed
    );
    this.nightscapeBeamLight.position.set(...pose.source);
    this.nightscapeBeamLight.angle = pose.angle;
    this.nightscapeBeamTarget.position.set(...pose.target);
    this.nightscapeBeamTarget.updateMatrixWorld();
  }

  private doWorkOnRender(): void {
    if (!this.options.labels3d) return;
    if (!this.camera) return;

    const cameraPos = this.camera.position;
    const cameraQuat = this.camera.quaternion;
    const prev = this.lastLabelVisibilityCamera;

    const dx = cameraPos.x - prev.x;
    const dy = cameraPos.y - prev.y;
    const dz = cameraPos.z - prev.z;
    const dPosSq = dx * dx + dy * dy + dz * dz;

    const dqx = cameraQuat.x - prev.qx;
    const dqy = cameraQuat.y - prev.qy;
    const dqz = cameraQuat.z - prev.qz;
    const dqw = cameraQuat.w - prev.qw;
    const dQuatSq = dqx * dqx + dqy * dqy + dqz * dqz + dqw * dqw;

    const firstRun = Number.isNaN(prev.x);
    const movedEnough = dPosSq > 4 || dQuatSq > 0.00001;
    if (!firstRun && !movedEnough) return;

    prev.x = cameraPos.x;
    prev.y = cameraPos.y;
    prev.z = cameraPos.z;
    prev.qx = cameraQuat.x;
    prev.qy = cameraQuat.y;
    prev.qz = cameraQuat.z;
    prev.qw = cameraQuat.w;

    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i];
      const distSq = label.position.distanceToSquared(cameraPos);
      const maxDist = 100 * label.size;
      const minDist = label.size * 6;
      const isVisible = distSq < maxDist * maxDist && distSq > minDist * minDist;
      label.visible = isVisible;
    }
  }

  private animate(): void {
    this.animationFrame = requestAnimationFrame(() => this.animate());
    if (this.controls?.update) this.controls.update();
  }

  private startWaterAnimation(): void {
    if (this.waterAnimationFrame) return;
    const tick = (time: number) => {
      this.waterAnimationFrame = requestAnimationFrame(tick);
      this.waterTime.value = time / 1000;
      this.render();
    };
    this.waterAnimationFrame = requestAnimationFrame(tick);
  }

  private stopWaterAnimation(): void {
    if (this.waterAnimationFrame) cancelAnimationFrame(this.waterAnimationFrame);
    this.waterAnimationFrame = null;
  }

  private applyWaterAnimation(mat: THREE.MeshLambertMaterial, flowTexture: THREE.Texture): void {
    mat.onBeforeCompile = (shader: { uniforms: Record<string, unknown>; fragmentShader: string }) => {
      shader.uniforms.uTime = this.waterTime;
      shader.uniforms.uFlow = { value: flowTexture };
      shader.fragmentShader =
        /* glsl */ `uniform float uTime;
        uniform sampler2D uFlow;
        float fmgWaterHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float fmgWaterNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = fmgWaterHash(i);
          float b = fmgWaterHash(i + vec2(1.0, 0.0));
          float c = fmgWaterHash(i + vec2(0.0, 1.0));
          float d = fmgWaterHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        ` +
        shader.fragmentShader.replace(
          "#include <map_fragment>",
          /* glsl */ `#include <map_fragment>
          float waterMask = 1.0 - smoothstep(0.30, 0.38, diffuseColor.a);
          if (waterMask > 0.001) {
            vec2 wp = vMapUv * vec2(140.0, 100.0);
            float n1 = fmgWaterNoise(wp + vec2(uTime * 0.6, uTime * 0.25));
            float n2 = fmgWaterNoise(wp * 2.3 - vec2(uTime * 0.45, -uTime * 0.7));
            float waves = n1 * 0.65 + n2 * 0.35;
            float crest = pow(waves, 4.0);
            float swell = sin(dot(vMapUv, vec2(36.0, 28.0)) + uTime * 0.6) * 0.025;
            diffuseColor.rgb *= 1.0 + waterMask * ((waves - 0.5) * 0.12 + swell);
            diffuseColor.rgb += waterMask * crest * vec3(0.04, 0.09, 0.09);
            float shoreGlow = smoothstep(0.02, 0.3, diffuseColor.a) * waterMask;
            float surf = shoreGlow * (0.5 + 0.5 * sin(uTime * 1.5 + (n1 - 0.5) * 9.0 + dot(vMapUv, vec2(420.0, 380.0))));
            diffuseColor.rgb += surf * 0.08 * vec3(0.9, 1.0, 1.0);
          }
          float lakeBand = smoothstep(0.64, 0.69, diffuseColor.a) * (1.0 - smoothstep(0.71, 0.78, diffuseColor.a));
          if (lakeBand > 0.001) {
            vec2 lp = vMapUv * vec2(160.0, 115.0);
            float l1 = fmgWaterNoise(lp + vec2(uTime * 0.18, uTime * 0.12));
            float l2 = fmgWaterNoise(lp * 2.1 - vec2(uTime * 0.14, -uTime * 0.21));
            diffuseColor.rgb *= 1.0 + lakeBand * (l1 * 0.6 + l2 * 0.4 - 0.5) * 0.05;
          }
          float riverBand = smoothstep(0.36, 0.42, diffuseColor.a) * (1.0 - smoothstep(0.50, 0.58, diffuseColor.a));
          if (riverBand > 0.001) {
            vec4 flow = texture2D(uFlow, vMapUv);
            if (flow.b > 0.1) {
              float steep = clamp(flow.b * 1.186 - 0.186, 0.0, 1.0);
              float flowPhase = atan(flow.r - 0.5, flow.g - 0.5);
              float speedMul = 1.0 + steep * 2.0;
              float texNoise = fmgWaterNoise(vMapUv * vec2(380.0, 280.0));
              float fineNoise = fmgWaterNoise(vMapUv * vec2(880.0, 640.0));
              float flowWave = sin(flowPhase - uTime * 2.2 * speedMul + texNoise * 2.5) * 0.6
                + sin(flowPhase * 2.0 - uTime * 3.4 * speedMul + 1.7 + texNoise * 3.5) * 0.4;
              diffuseColor.rgb *= 1.0 + riverBand * flowWave * (0.5 + texNoise) * mix(0.05, 0.11, steep);
              
              float fineRipple = sin(flowPhase * 30.0 - uTime * 24.0 * speedMul + fineNoise * 4.0);
              float aeration = pow(steep, 3.0) * smoothstep(0.2, 0.8, fineRipple) * fineNoise;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), riverBand * aeration * 0.85);
            }
          }
          diffuseColor.a = 1.0;
        `
        );
    };
  }
}

export type { ThreeDAPI, ThreeDModule, ThreeDOptions };

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
  toggleNightscape: () => void;
  setNightscapeBeamEnabled: (enabled: boolean) => void;
  setNightscapeBeamReversed: (reversed: boolean) => void;
  toggle3dSubdivision: () => void;
  toggleWireframe: () => void;
  toggleSky: () => void;
  setResolution: (resolution: number) => void;
  setColors: (sky: string, water: string) => void;
  setTimeOfDay: (presetName: string) => void;
  timeOfDayPresets: Record<string, TimeOfDayPreset>;
  saveScreenshot: () => Promise<void>;
  saveOBJ: () => void;
  toggleErosion: () => void;
  isErosionBuildPending: () => boolean;
  setErosionStrength: (value: number) => void;
  setErosionRiverDepth: (value: number) => void;
  setErosionDetail: (value: number) => void;
  setErosionOctaves: (value: number) => void;
  toggleSatellite: () => void;
}
export const ThreeDRenderer = new ThreeDModule();
