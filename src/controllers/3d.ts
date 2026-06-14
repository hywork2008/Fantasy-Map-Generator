import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { LoopSubdivision } from "three-subdivide";

THREE.ColorManagement.enabled = false;

import { cloudImage } from "../assets/cloud-image";
import { rn, throttle } from "../utils";

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

declare global {
  var ThreeD: ThreeDModule;
}

type LabelSprite = THREE.Sprite & { size: number };

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
    subdivide: 0
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
  private icons: THREE.Mesh[] = [];
  private lines: THREE.Line[] = [];
  private gridToPackCellMap: Map<number, number> | null = null;
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
    else this.createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);
    this.render();
  }

  update(): void {
    if (this.options.isGlobe) this.updateGlobeTexure();
    else this.update3dTexture();
  }

  stop(): void {
    if (this.controls) this.controls.dispose();
    cancelAnimationFrame(this.animationFrame);
    if (this.texture) this.texture.dispose();
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.waterPlane) this.waterPlane.dispose();
    if (this.waterMaterial) this.waterMaterial.dispose();
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
    } else this.extendWater(graphWidth, graphHeight);

    this.options.extendedWater = this.options.extendedWater ? 0 : 1;
    this.redraw();
  }

  toggleLabels(): void {
    this.options.labels3d = this.options.labels3d ? 0 : 1;

    if (this.options.labels3d) {
      this.createLabels().then(() => this.update());
    } else {
      this.deleteLabels();
      this.update();
    }
  }

  toggle3dSubdivision(): void {
    this.options.subdivide = this.options.subdivide ? 0 : 1;
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
    window.setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
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
    if (this.options.extendedWater) this.extendWater(graphWidth, graphHeight);
    this.createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);

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

  private textureToSprite(textureUrl: string, width: number, height: number): THREE.Sprite {
    const map = new THREE.TextureLoader().load(textureUrl);
    map.anisotropy = this.Renderer!.capabilities.getMaxAnisotropy();
    const mat = new THREE.SpriteMaterial({ map });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(width, height, 1);
    sprite.renderOrder = 1;
    return sprite;
  }

  private async createTextLabel({
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
    this.context2d.font = `${size * quality}px ${font}`;
    this.context2d.canvas.width = this.context2d.measureText(text).width;
    this.context2d.canvas.height = size * quality * 1.25;
    this.context2d.clearRect(0, 0, this.context2d.canvas.width, this.context2d.canvas.height);

    this.context2d.font = `${size * quality}px ${font}`;
    this.context2d.fillStyle = color;
    this.context2d.fillText(text, 0, size * quality);

    return this.textureToSprite(
      this.context2d.canvas.toDataURL(),
      this.context2d.canvas.width / quality,
      this.context2d.canvas.height / quality
    );
  }

  private get3dCoords(baseX: number, baseY: number): [number, number, number] {
    const x = baseX - graphWidth / 2;
    const z = baseY - graphHeight / 2;

    this.raycaster!.ray.origin.x = x;
    this.raycaster!.ray.origin.z = z;
    const y = this.raycaster!.intersectObject(this.mesh!)[0].point.y;
    return [x, y, z];
  }

  private async createLabels(): Promise<void> {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));

    const states = viewbox.select("#labels #states");

    const stateOptions = {
      font: states.attr("font-family"),
      size: +states.attr("data-size") / 2,
      color: states.attr("fill"),
      elevation: 20,
      quality: 80
    };

    const iconMaterials: Record<string, THREE.Material> = {};
    const iconGeometries: Record<string, THREE.BufferGeometry> = {};
    const lineMaterials: Record<string, THREE.Material> = {};

    const getBurgLabelOptions = (burg: {
      group?: string;
      name?: string;
    }): {
      font: string;
      size: number;
      color: string;
      elevation: number;
      quality: number;
      iconSize: number;
      iconColor: string;
    } | null => {
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
    };

    const getIconMaterial = (groupName: string, iconColor: string): THREE.Material => {
      if (!iconMaterials[groupName]) {
        const mat = new THREE.MeshPhongMaterial({ color: iconColor });
        mat.wireframe = Boolean(this.options.wireframe);
        iconMaterials[groupName] = mat;
      }
      return iconMaterials[groupName];
    };

    const getIconGeometry = (groupName: string, iconSize: number): THREE.BufferGeometry => {
      const key = `${groupName}_${iconSize.toFixed(2)}`;
      if (!iconGeometries[key]) {
        iconGeometries[key] = new THREE.CylinderGeometry(iconSize * 2, iconSize * 2, iconSize, 16, 1);
      }
      return iconGeometries[key];
    };

    const getLineMaterial = (groupName: string, iconColor: string): THREE.Material => {
      if (!lineMaterials[groupName]) {
        lineMaterials[groupName] = new THREE.LineBasicMaterial({ color: iconColor });
      }
      return lineMaterials[groupName];
    };

    for (let i = 1; i < pack.burgs.length; i++) {
      const burg = pack.burgs[i];
      if (burg.removed) continue;

      const burgOptions = getBurgLabelOptions(burg);
      if (!burgOptions) continue;

      const [x, y, z] = this.get3dCoords(burg.x, burg.y);

      if (layerIsOn("toggleLabels")) {
        const burgSprite = (await this.createTextLabel({ text: burg.name ?? "", ...burgOptions })) as LabelSprite;
        burgSprite.position.set(x, y + burgOptions.elevation, z);
        burgSprite.size = burgOptions.size;
        this.labels.push(burgSprite);
        this.scene!.add(burgSprite);
      }

      if (layerIsOn("toggleBurgIcons")) {
        const geo = getIconGeometry(burg.group ?? "", burgOptions.iconSize);
        const mat = getIconMaterial(burg.group ?? "", burgOptions.iconColor);
        const iconMesh = new THREE.Mesh(geo, mat);
        iconMesh.position.set(x, y, z);
        this.icons.push(iconMesh);
        this.scene!.add(iconMesh);

        const lineMat = getLineMaterial(burg.group ?? "", burgOptions.iconColor);
        const lineStart = y + burgOptions.iconSize / 2;
        const lineEnd = y + burgOptions.elevation - burgOptions.size * 0.5;
        const points = [new THREE.Vector3(x, lineStart, z), new THREE.Vector3(x, lineEnd, z)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, lineMat);
        this.lines.push(line);
        this.scene!.add(line);
      }
    }

    if (layerIsOn("toggleLabels")) {
      for (let i = 1; i < pack.states.length; i++) {
        const state = pack.states[i];
        if (state.removed) continue;

        const [x, y, z] = this.get3dCoords(state.pole![0], state.pole![1]);
        const text = states.select(`#stateLabel${state.i}`)?.text() || state.name;
        const stateSprite = (await this.createTextLabel({ text, ...stateOptions })) as LabelSprite;

        stateSprite.position.set(x, y + stateOptions.elevation, z);
        stateSprite.size = stateOptions.size;
        this.labels.push(stateSprite);
        this.scene!.add(stateSprite);
      }
    }

    this.doWorkOnRender();
  }

  private deleteLabels(): void {
    this.raycaster = undefined;

    for (const m of this.labels) {
      this.scene!.remove(m);
      (m.material as THREE.SpriteMaterial).map?.dispose();
      m.material.dispose();
      m.geometry.dispose();
    }
    this.labels = [];

    for (const m of this.icons) {
      this.scene!.remove(m);
      (m.material as THREE.Material).dispose();
      m.geometry.dispose();
    }
    this.icons = [];

    for (const line of this.lines) {
      this.scene!.remove(line);
      (line.material as THREE.Material).dispose();
      line.geometry.dispose();
    }
    this.lines = [];
  }

  private async createMeshTextureUrl(): Promise<string> {
    const url = await getMapURL("mesh", {
      noLabels: Boolean(this.options.labels3d),
      noWater: Boolean(this.options.extendedWater),
      noViewbox: true,
      fullMap: true
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    canvas.width = this.options.resolutionScale;
    canvas.height = this.options.resolutionScale;
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

  private async createMesh(width: number, height: number, segmentsX: number, segmentsY: number): Promise<void> {
    this.gridToPackCellMap = new Map();
    if (pack.cells?.g && pack.cells?.i) {
      for (const packCellIndex of pack.cells.i) {
        const gridCellIndex = pack.cells.g[packCellIndex];
        if (!this.gridToPackCellMap.has(gridCellIndex)) {
          this.gridToPackCellMap.set(gridCellIndex, packCellIndex);
        }
      }
    }

    if (this.texture) this.texture.dispose();
    if (!this.options.wireframe) {
      const url = await this.createMeshTextureUrl();
      await new Promise<void>(resolve => {
        this.texture = new THREE.TextureLoader().load(
          url,
          () => resolve(),
          undefined,
          () => resolve()
        );
      });
      if (this.texture && this.Renderer) {
        this.texture.anisotropy = this.Renderer.capabilities.getMaxAnisotropy();
      }
    }

    if (this.material) this.material.dispose();
    this.material = new THREE.MeshLambertMaterial();

    if (this.options.wireframe) {
      this.material.wireframe = true;
    } else {
      this.material.map = this.texture ?? null;
      this.material.transparent = true;
    }

    if (this.geometry) this.geometry.dispose();
    this.geometry = new THREE.PlaneGeometry(width, height, segmentsX - 1, segmentsY - 1);

    const vertices = this.geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      vertices.setZ(i, this.getMeshHeight(i));
    }

    this.geometry.setAttribute("position", vertices);
    this.geometry.computeVertexNormals();
    if (this.mesh) this.scene!.remove(this.mesh);
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
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene!.add(this.mesh);
    this.render();

    if (this.options.labels3d) {
      await this.createLabels();
      this.render();
    }
  }

  private readonly LOWER_BY_WATER = 18;
  private readonly DIVIDER = 100 - 18;

  private getMeshHeight(i: number): number {
    const height = grid.cells.h[i];

    let waterCellId: number | null = null;
    if (height < 20) {
      waterCellId = i;
    } else if (grid.cells.c![i]) {
      waterCellId = grid.cells.c![i].find((c: number) => grid.cells.h[c] < 20) ?? null;
    }

    if (waterCellId !== null) {
      const packCellIndex = this.gridToPackCellMap!.get(waterCellId);
      const featureId = pack.cells.f![packCellIndex!];
      if (featureId === undefined) return 0;

      const feature = pack.features![featureId];
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
    if (this.texture) this.texture.dispose();
    const url = await this.createMeshTextureUrl();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
    this.texture = new THREE.TextureLoader().load(url, () => this.render());
    this.material!.map = this.texture ?? null;
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
    const world = (mapCoordinates.latT || 0) > 179;

    const scale = this.options.resolution;
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
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i];
      const dist = label.position.distanceTo(this.camera!.position);
      const isVisible = dist < 100 * label.size && dist > label.size * 6;
      label.visible = isVisible;
      if (this.lines[i]) this.lines[i].visible = isVisible;
    }
  }

  private animate(): void {
    this.animationFrame = requestAnimationFrame(() => this.animate());
    if (this.controls?.update) this.controls.update();
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

window.ThreeD = new ThreeDModule();
