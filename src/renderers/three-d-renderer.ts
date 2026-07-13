import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
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
import { worldContext } from "../context/worldContext";
import { getMapURL } from "../io/export";
import { tip } from "../services/tooltipService";
import { revokeObjectURL, rn, throttle } from "../utils";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { buildLowPolyBurgSymbols, type LowPolyBurgShape } from "./webgl/adapters/deckDataAdapters";
import { renderWebglMapTexture } from "./webgl/webglMapTexture";
import { getBurgIconStyle } from "./webgl/webglStyleExtractors";

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
    erosionDetail: 1024,
    erosionStrength: 30,
    erosionRiverDepth: 10,
    erosionOctaves: 2,
    satellite: false,
    sceneOnly: false
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
  private waterPlane: THREE.PlaneGeometry | undefined;
  private waterMaterial: THREE.MeshBasicMaterial | undefined;
  private waterMesh: THREE.Mesh | undefined;
  private raycaster: THREE.Raycaster | undefined;
  private labels: LabelSprite[] = [];
  private iconBatches: IconBatch[] = [];
  private gridToPackCellMap: Map<number, number> | null = null;
  private erosionBakeActive: boolean = false;
  private erosionBakeData: ErosionBake.ErosionBakeResult | null = null;
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
  private readonly context2d = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  private renderThrottled: () => void;

  constructor() {
    this.renderThrottled = throttle(() => this.doWorkOnRender(), 200);
  }

  async create(canvas: HTMLCanvasElement, type = "viewMesh"): Promise<boolean> {
    this.options.isOn = true;
    this.options.isGlobe = type === "viewGlobe";
    return this.options.isGlobe ? this.newGlobe(canvas) : this.newMesh(canvas);
  }

  redraw(): void {
    this.deleteLabels();
    this.scene!.remove(this.mesh!);
    this.Renderer!.setSize(this.Renderer!.domElement.width, this.Renderer!.domElement.height);
    if (this.options.isGlobe) this.updateGlobeTexure();
    else
      this.createMesh(
        worldContext.graphWidth,
        worldContext.graphHeight,
        worldContext.grid.cellsX,
        worldContext.grid.cellsY
      );
    this.render();
  }

  update(): void {
    if (this.options.isGlobe) this.updateGlobeTexure();
    else {
      this.deleteLowPolyBurgIcons();
      this.createLowPolyBurgIcons();
      if (this.options.sceneOnly) this.render();
      else this.update3dTexture();
    }
  }

  stop(): void {
    if (this.controls) this.controls.dispose();
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

    this.Renderer!.renderLists.dispose();
    this.Renderer!.dispose();
    this.scene!.remove(this.mesh!);
    this.scene!.remove(this.spotLight!);
    this.scene!.remove(this.ambientLight!);
    this.scene!.remove(this.waterMesh!);

    this.Renderer = undefined;
    this.scene = undefined;
    this.controls = undefined;
    this.camera = undefined;
    this.material = undefined;
    this.texture = undefined;
    this.geometry = undefined;
    this.mesh = undefined;

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
    this.ambientLight!.intensity = intensity * Math.PI;
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

    if (this.options.labels3d) {
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
    if (this.options.sceneOnly) {
      if (this.texture) this.texture.dispose();
      this.texture = undefined;
      if (this.material) this.material.map = null;
      if (this.mesh) this.mesh.visible = false;
      if (this.waterMesh) this.waterMesh.visible = false;
      if (this.scene) this.scene.background = new THREE.Color("#03050b");
      this.render();
      return;
    }

    if (this.mesh) this.mesh.visible = true;
    if (this.waterMesh) this.waterMesh.visible = Boolean(this.options.extendedWater);
    if (this.scene) this.scene.background = this.options.extendedWater ? new THREE.Color(this.options.skyColor) : null;
    this.redraw();
  }

  private shouldRefreshTextureAfterLabelsToggle(): boolean {
    // Mesh labels are sprites and never baked into the WebGL terrain texture.
    return false;
  }

  toggle3dSubdivision(): void {
    this.options.subdivide = this.options.subdivide ? 0 : 1;
    this.redraw();
  }

  toggleErosion(): void {
    this.options.erosion = !this.options.erosion;
    this.redraw();
  }

  setErosionStrength(value: number): void {
    this.options.erosionStrength = value;
    this.redraw();
  }

  setErosionRiverDepth(value: number): void {
    this.options.erosionRiverDepth = value;
    this.redraw();
  }

  setErosionDetail(value: number): void {
    this.options.erosionDetail = value;
    this.redraw();
  }

  setErosionOctaves(value: number): void {
    this.options.erosionOctaves = value;
    this.redraw();
  }

  toggleSatellite(): void {
    this.options.satellite = !this.options.satellite;
    this.redraw();
  }

  toggleWireframe(): void {
    this.options.wireframe = this.options.wireframe ? 0 : 1;
    this.redraw();
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
    this.Renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.Renderer.setSize(canvas.width, canvas.height);
    this.Renderer.shadowMap.enabled = true;
    this.Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.options.extendedWater) this.extendWater(worldContext.graphWidth, worldContext.graphHeight);
    this.createMesh(
      worldContext.graphWidth,
      worldContext.graphHeight,
      worldContext.grid.cellsX,
      worldContext.grid.cellsY
    );

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
    this.animate();

    this.controls.addEventListener("change", () => this.render());
    return true;
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
    this.context2d.font = `${size * quality}px ${font}`;
    this.context2d.canvas.width = this.context2d.measureText(text).width;
    this.context2d.canvas.height = size * quality * 1.25;
    this.context2d.clearRect(0, 0, this.context2d.canvas.width, this.context2d.canvas.height);

    this.context2d.font = `${size * quality}px ${font}`;
    this.context2d.fillStyle = color;
    this.context2d.fillText(text, 0, size * quality);

    return this.textureToSprite(
      this.context2d.canvas,
      this.context2d.canvas.width / quality,
      this.context2d.canvas.height / quality
    );
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

  private createLowPolyBurgIcons(): void {
    if (!this.scene || !layerIsOn("toggleBurgIcons")) return;

    const symbols = buildLowPolyBurgSymbols(
      worldContext,
      viewContext.focusScope,
      getBurgIconStyle(worldContext, viewContext)
    );
    const batches = new Map<
      string,
      { shape: LowPolyBurgShape; color: string; opacity: number; symbols: typeof symbols }
    >();
    for (const symbol of symbols) {
      const key = `${symbol.shape}|${symbol.color}|${symbol.opacity}`;
      const batch = batches.get(key) ?? {
        shape: symbol.shape,
        color: symbol.color,
        opacity: symbol.opacity,
        symbols: []
      };
      batch.symbols.push(symbol);
      batches.set(key, batch);
    }

    const up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (const batch of batches.values()) {
      const material = new THREE.MeshPhongMaterial({
        color: batch.color,
        opacity: batch.opacity,
        transparent: batch.opacity < 1,
        wireframe: Boolean(this.options.wireframe)
      });
      const mesh = new THREE.InstancedMesh(this.createLowPolyIconGeometry(batch.shape), material, batch.symbols.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.burgIds = batch.symbols.map(symbol => symbol.burgId);

      for (let index = 0; index < batch.symbols.length; index++) {
        const symbol = batch.symbols[index];
        const surface = this.get3dSurface(symbol.position[0], symbol.position[1]);
        // Lift from the sampled terrain along its normal. The half-size term keeps the centre of
        // each sphere/cube/anchor above the surface instead of leaving its lower half embedded.
        const clearance = Math.max(1.2, symbol.size * 0.35) + symbol.size;
        const position = surface.position.addScaledVector(surface.normal, clearance);
        quaternion.setFromUnitVectors(up, surface.normal);
        matrix.compose(position, quaternion, new THREE.Vector3(symbol.size, symbol.size, symbol.size));
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.iconBatches.push(mesh);
      this.scene.add(mesh);
    }
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
  }

  private async createMeshTexture(): Promise<THREE.CanvasTexture | null> {
    const canvas = await renderWebglMapTexture(worldContext, viewContext, appServices, {
      resolution: Math.min(this.options.resolutionScale, 8192),
      // Labels are separate scene sprites, and burg/anchor symbols are instanced low-poly mesh.
      // Leaving either in the terrain bitmap would duplicate them and make them appear painted on.
      includeLabels: false,
      includeBurgIcons: false
    });
    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (this.Renderer) texture.anisotropy = this.Renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  private async createMesh(width: number, height: number, segmentsX: number, segmentsY: number): Promise<void> {
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

    if (this.texture && !this.options.wireframe && !useSatellite) {
      this.texture.dispose();
      this.texture = undefined;
    }
    if (!this.options.wireframe && !useSatellite && !sceneOnly) {
      this.texture = (await this.createMeshTexture()) ?? undefined;
    }

    if (this.material) this.material.dispose();
    this.material = new THREE.MeshLambertMaterial();

    if (this.options.wireframe) {
      this.material.wireframe = true;
    } else if (!useSatellite && !sceneOnly) {
      this.material.map = this.texture ?? null;
      this.material.transparent = true;
    }

    let bakeResult: ErosionBake.ErosionBakeResult | null = null;
    if ((this.options.erosion || useSatellite) && !this.options.isGlobe) {
      const baseBakeResolution =
        this.options.erosionDetail >= 2048 ? 4096 : this.options.erosionDetail > 512 ? 2048 : 1024;
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
      } else {
        this.texture = (await this.createMeshTexture()) ?? undefined;
        this.material.map = this.texture ?? null;
        this.material.transparent = true;
      }
    }

    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = !sceneOnly;
    this.scene!.add(this.mesh);
    if (this.waterMesh) this.waterMesh.visible = !sceneOnly;
    this.mesh.updateMatrixWorld();
    this.createLowPolyBurgIcons();
    this.render();

    if (this.options.labels3d) {
      this.createLabels();
      this.render();
    }
  }

  private readonly LOWER_BY_WATER = 18;
  private readonly DIVIDER = 100 - 18;

  private getMeshHeight(i: number): number {
    const height = worldContext.grid.cells.h[i];

    let waterCellId: number | null = null;
    if (height < 20) {
      waterCellId = i;
    } else if (worldContext.grid.cells.c![i]) {
      waterCellId = worldContext.grid.cells.c![i].find((c: number) => worldContext.grid.cells.h[c] < 20) ?? null;
    }

    if (waterCellId !== null) {
      const packCellIndex = this.gridToPackCellMap!.get(waterCellId);
      const featureId = worldContext.pack.cells.f![packCellIndex!];
      if (featureId === undefined) return 0;

      const feature = worldContext.pack.features![featureId];
      const waterHeight = feature.type === "lake" && feature.height ? feature.height : 20;
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

  private async update3dTexture(): Promise<void> {
    if (!this.material || !this.Renderer) return;

    if (this.options.satellite && this.erosionBakeData && !this.options.isGlobe && !this.options.wireframe) {
      const satelliteTexture = generateSatelliteTexture(this.Renderer, this.erosionBakeData, {
        scale: this.options.scale,
        maxOutput: Math.max(512, Math.min(this.options.resolutionScale, 8192))
      });
      if (satelliteTexture) {
        this.material.map = satelliteTexture;
        this.render();
        return;
      }
    }

    if (this.texture) this.texture.dispose();
    this.texture = (await this.createMeshTexture()) ?? undefined;
    this.material.map = this.texture ?? null;
    this.render();
  }

  private async newGlobe(canvas: HTMLCanvasElement): Promise<boolean> {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.TextureLoader().load(
      "https://i0.wp.com/azgaar.files.wordpress.com/2019/10/stars-1.png",
      () => this.render()
    );

    this.Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.Renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
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
    this.Renderer.render(this.scene!, this.camera!);
    this.renderThrottled();
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
  setErosionStrength: (value: number) => void;
  setErosionRiverDepth: (value: number) => void;
  setErosionDetail: (value: number) => void;
  setErosionOctaves: (value: number) => void;
  toggleSatellite: () => void;
}
export const ThreeDRenderer = new ThreeDModule();
