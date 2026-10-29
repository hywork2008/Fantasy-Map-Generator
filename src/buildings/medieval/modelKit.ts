import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { ModelVariant } from "../modelVariants";

export interface MedievalModel {
  id: string;
  name: string;
  task: number;
  author?: Author;
  biomes?: readonly string[];
  /** Conservative width, depth and height envelopes in meters. */
  size: readonly [number, number, number];
  note: string;
  /** Quality levels, possibly several per level by different authors; CE adopts one per level. */
  variants?: readonly (ModelVariant & { label: string })[];
  /** Seasonal looks BV can preview on a quality variant; the default is the static model. */
  seasons?: {
    default: string;
    options: readonly { id: string; label: string }[];
    create(variantId: string, season: string): CityStructureMeshes;
  };
  create(): CityStructureMeshes;
}
export type Position = readonly [number, number, number];
export type Surface =
  | "oak"
  | "wood"
  | "dark"
  | "stone"
  | "plaster"
  | "tile"
  | "thatch"
  | "iron"
  | "cloth"
  | "straw"
  | "water"
  | "earth"
  | "leather"
  | "green"
  | "white";
const COLORS: Record<Surface, number> = {
  oak: 0x795036,
  wood: 0xa37c4e,
  dark: 0x352d26,
  stone: 0xaaa18e,
  plaster: 0xd3c4a5,
  tile: 0x835347,
  thatch: 0x9e8855,
  iron: 0x454640,
  cloth: 0xb79b76,
  straw: 0xc4a85d,
  water: 0x6c959a,
  earth: 0x726148,
  leather: 0x8d6749,
  green: 0x6f8050,
  white: 0xded8c2
};

/** Meter-scale construction parts; factories own their resources and never share mutable meshes. */
export class ModelKit {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Mesh[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Map<Surface, THREE.MeshLambertMaterial>();
  private readonly children: CityStructureMeshes[] = [];
  private readonly cube = new THREE.BoxGeometry(1, 1, 1);
  constructor(name: string) {
    this.group.name = name;
    this.geometries.add(this.cube);
  }
  add(name: string, geometry: THREE.BufferGeometry, surface: Surface) {
    this.geometries.add(geometry);
    let material = this.materials.get(surface);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: COLORS[surface], side: THREE.DoubleSide });
      this.materials.set(surface, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    this.group.add(mesh);
    this.pickables.push(mesh);
    return mesh;
  }
  box(name: string, p: Position, size: Position, surface: Surface = "oak") {
    const mesh = this.add(name, this.cube, surface);
    mesh.position.set(...p);
    mesh.scale.set(...size);
    return mesh;
  }
  beam(name: string, a: Position, b: Position, width = 0.12, surface: Surface = "oak", round = false) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const mesh = this.add(name, round ? new THREE.CylinderGeometry(width / 2, width / 2, 1, 10) : this.cube, surface);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(round ? 1 : width, start.distanceTo(end), round ? 1 : width);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return mesh;
  }
  cylinder(
    name: string,
    p: Position,
    radius: number,
    height: number,
    surface: Surface = "wood",
    top = radius,
    segments = 16
  ) {
    const mesh = this.add(name, new THREE.CylinderGeometry(top, radius, height, segments), surface);
    mesh.position.set(...p);
    return mesh;
  }
  sphere(name: string, p: Position, scale: Position, surface: Surface) {
    const mesh = this.add(name, new THREE.SphereGeometry(1, 12, 8), surface);
    mesh.position.set(...p);
    mesh.scale.set(...scale);
    return mesh;
  }
  /** Thick-walled open vat with a watertight floor, for brewing, tanning and storage. */
  vessel(name: string, p: Position, radius: number, height: number, surface: Surface = "wood", liquid = false) {
    const profile = [
      [0, 0],
      [radius, 0],
      [radius, height],
      [radius - 0.08, height],
      [radius - 0.08, 0.08],
      [0, 0.08]
    ];
    const mesh = this.add(
      name,
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        24
      ),
      surface
    );
    mesh.position.set(...p);
    if (liquid) this.cylinder("vat-liquid", [p[0], p[1] + height * 0.72, p[2]], radius - 0.085, 0.02, "water");
    return mesh;
  }
  ring(name: string, p: Position, radius: number, thickness: number, surface: Surface = "iron", vertical = false) {
    const mesh = this.add(name, new THREE.TorusGeometry(radius, thickness, 6, 24), surface);
    mesh.position.set(...p);
    if (!vertical) mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  tube(name: string, points: Position[], radius: number, surface: Surface) {
    return this.add(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
        points.length * 4,
        radius,
        6,
        false
      ),
      surface
    );
  }
  attach(model: CityStructureMeshes, p: Position, scale = 1) {
    model.group.position.set(...p);
    model.group.scale.setScalar(scale);
    this.group.add(model.group);
    this.pickables.push(...model.pickables);
    this.children.push(model);
  }
  /** An open timber truss roof, ridge along X; optional solid gable infill. */
  roof(
    x: number,
    z: number,
    w: number,
    d: number,
    eave: number,
    rise: number,
    surface: Surface = "tile",
    gables = false
  ) {
    const geometry = new THREE.BufferGeometry();
    const x0 = x - w / 2,
      x1 = x + w / 2,
      z0 = z - d / 2,
      z1 = z + d / 2,
      top = eave + rise;
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          x0,
          eave,
          z0,
          x1,
          eave,
          z0,
          x1,
          top,
          z,
          x0,
          eave,
          z0,
          x1,
          top,
          z,
          x0,
          top,
          z,
          x0,
          top,
          z,
          x1,
          top,
          z,
          x1,
          eave,
          z1,
          x0,
          top,
          z,
          x1,
          eave,
          z1,
          x0,
          eave,
          z1
        ],
        3
      )
    );
    geometry.computeVertexNormals();
    this.add("pitched-roof", geometry, surface);
    this.beam("ridge-cap", [x0, top, z], [x1, top, z], 0.12, surface);
    for (const xx of [x0 + 0.15, x1 - 0.15]) {
      for (const zz of [z0, z1]) this.beam("roof-rafter", [xx, eave, zz], [xx, top, z], 0.12);
      this.beam("truss-tie", [xx, eave, z0], [xx, eave, z1], 0.15);
      if (gables) {
        const triangle = new THREE.BufferGeometry();
        triangle.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([xx, eave, z0, xx, top, z, xx, eave, z1], 3)
        );
        triangle.computeVertexNormals();
        this.add("gable-infill", triangle, "plaster");
      }
    }
  }
  /** Closed hall with a real doorway, timber frame, shutters and a pitched roof. */
  hall(
    x: number,
    z: number,
    w: number,
    d: number,
    eave: number,
    rise: number,
    options: {
      wall?: Surface;
      roof?: Surface;
      open?: boolean;
      door?: number;
      doorOffset?: number;
      rotation?: number;
      storeys?: number;
      windows?: boolean;
    } = {}
  ) {
    const start = this.pickables.length;
    const wall = options.wall ?? "plaster",
      door = Math.min(options.door ?? 1.1, w - 0.8),
      doorH = Math.min(2.2, eave - 0.3),
      doorOffset = THREE.MathUtils.clamp(options.doorOffset ?? 0, -(w - door) / 2 + 0.2, (w - door) / 2 - 0.2),
      doorX = x + doorOffset;
    this.box("stone-sill", [x, 0.12, z], [w, 0.24, d], "stone");
    if (!options.open) {
      this.box("rear-wall", [x, eave / 2, z - d / 2 + 0.1], [w, eave, 0.2], wall);
      for (const side of [-1, 1]) {
        this.box("end-wall", [x + side * (w / 2 - 0.1), eave / 2, z], [0.2, eave, d], wall);
        this.box(
          "door-flanking-wall",
          [x + (side * (w + door)) / 4 + doorOffset / 2, eave / 2, z + d / 2 - 0.1],
          [(w - door) / 2 + side * -doorOffset, eave, 0.2],
          wall
        );
      }
      this.box("door-lintel-wall", [doorX, (doorH + eave) / 2, z + d / 2 - 0.1], [door, eave - doorH, 0.2], wall);
      for (const side of [-1, 1]) {
        this.box(
          "door-leaf",
          [doorX + (side * door) / 4, doorH / 2, z + d / 2 + 0.02],
          [door / 2 - 0.025, doorH, 0.07],
          "wood"
        );
        for (const y of [0.5, doorH - 0.4])
          if (y < doorH - 0.1)
            this.box(
              "door-strap",
              [doorX + (side * door) / 4, y, z + d / 2 + 0.065],
              [door / 2 - 0.1, 0.055, 0.025],
              "iron"
            );
      }
    }
    for (const xx of [x - w / 2 + 0.12, x, x + w / 2 - 0.12])
      for (const zz of [z - d / 2, z + d / 2]) {
        if (zz > z && (options.open ? xx === x : Math.abs(xx - doorX) < door / 2 + 0.09)) continue;
        this.box("frame-post", [xx, eave / 2, zz], [0.18, eave, 0.18]);
      }
    for (const zz of [z - d / 2, z + d / 2]) {
      this.box("wall-plate", [x, eave, zz], [w, 0.18, 0.18]);
      this.beam("knee-brace", [x - w / 2 + 0.12, eave - 0.8, zz], [x - w / 2 + 0.92, eave, zz], 0.12);
    }
    if (!options.open && options.windows !== false && w > 3) {
      for (let floor = 0; floor < (options.storeys ?? 1); floor++)
        for (const side of [-1, 1]) {
          const windowX = x + side * w * 0.3,
            windowY = Math.min(1.7 + floor * 2.6, eave - 0.55);
          if (windowY < 0.75) continue;
          if (windowY - 0.45 < doorH && Math.abs(windowX - doorX) < door / 2 + 0.6) continue;
          this.window(windowX, z + d / 2 + 0.12, windowY, 0.65, 0.9);
        }
    }
    this.roof(x, z, w + 0.6, d + 0.7, eave + 0.12, rise, options.roof ?? "tile", !options.open);
    if (options.rotation) {
      const transform = new THREE.Matrix4()
        .makeTranslation(x, 0, z)
        .multiply(new THREE.Matrix4().makeRotationY(options.rotation))
        .multiply(new THREE.Matrix4().makeTranslation(-x, 0, -z));
      for (const mesh of this.pickables.slice(start)) mesh.applyMatrix4(transform);
    }
  }
  window(x: number, z: number, y: number, w = 0.7, h = 0.9) {
    this.box("window-recess", [x, y, z], [w, h, 0.045], "dark");
    this.box("window-sill", [x, y - h / 2, z + 0.04], [w + 0.15, 0.09, 0.15], "wood");
    this.box("window-mullion", [x, y, z + 0.03], [0.05, h, 0.05], "wood");
    for (const s of [-1, 1]) {
      const shutter = this.box("window-shutter", [x + s * w * 0.68, y, z + 0.05], [w * 0.35, h, 0.045], "wood");
      shutter.rotation.y = s * 0.3;
    }
  }
  table(x: number, z: number, w = 1.8, d = 0.8, y = 0.85) {
    this.box("worktop", [x, y, z], [w, 0.12, d], "wood");
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        this.box("table-leg", [x + sx * (w / 2 - 0.12), y / 2, z + sz * (d / 2 - 0.1)], [0.1, y, 0.1]);
  }
  chimney(x: number, z: number, h: number) {
    this.box("masonry-chimney", [x, h / 2, z], [0.7, h, 0.65], "stone");
    this.box("chimney-cap", [x, h, z], [0.85, 0.18, 0.8], "stone");
    this.box("chimney-flue", [x, h + 0.1, z], [0.43, 0.025, 0.4], "dark");
  }
  fence(a: readonly [number, number], b: readonly [number, number], h = 1.3, woven = false) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      count = Math.max(1, Math.ceil(length / (woven ? 0.35 : 1.5)));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      this.cylinder(
        "fence-post",
        [a[0] + (b[0] - a[0]) * t, h / 2, a[1] + (b[1] - a[1]) * t],
        woven ? 0.035 : 0.08,
        h,
        "oak"
      );
    }
    if (!woven)
      for (const y of [h * 0.38, h * 0.8]) this.beam("fence-rail", [a[0], y, a[1]], [b[0], y, b[1]], 0.1, "wood");
    else
      for (let row = 0; row < 10; row++) {
        const dx = (b[0] - a[0]) / length,
          dz = (b[1] - a[1]) / length;
        const points = Array.from({ length: count * 4 + 1 }, (_, i): Position => {
          const t = i / (count * 4),
            weave = Math.cos(t * count * Math.PI) * 0.045 * (row % 2 ? -1 : 1);
          return [a[0] + dx * length * t - dz * weave, 0.12 + row * 0.11, a[1] + dz * length * t + dx * weave];
        });
        this.tube("wattle-weaver", points, 0.025, "wood");
      }
  }
  finish(): CityStructureMeshes {
    return {
      group: this.group,
      pickables: this.pickables,
      dispose: () => {
        for (const geometry of this.geometries) geometry.dispose();
        for (const surface of this.materials.values()) surface.dispose();
        for (const child of this.children) child.dispose();
      }
    };
  }
}
