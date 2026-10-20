import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

export const SIGN_SHAPES = ["rectangle", "round", "oval", "shield", "arch"] as const;
export const SIGN_MATERIALS = ["oak", "iron", "copper"] as const;
export const SIGN_SYMBOLS = ["blank", "inn", "blacksmith", "tavern", "bakery", "apothecary", "stable"] as const;
export type SignShape = (typeof SIGN_SHAPES)[number];
export type SignMaterial = (typeof SIGN_MATERIALS)[number];
export type SignSymbol = (typeof SIGN_SYMBOLS)[number];

export interface HangingSignOptions {
  shape?: SignShape;
  material?: SignMaterial;
  symbol?: SignSymbol;
}

export const HANGING_SIGN_TEMPLATES = [
  { id: "inn", shape: "arch", material: "oak", symbol: "inn" },
  { id: "blacksmith", shape: "shield", material: "iron", symbol: "blacksmith" },
  { id: "tavern", shape: "oval", material: "oak", symbol: "tavern" },
  { id: "bakery", shape: "rectangle", material: "oak", symbol: "bakery" },
  { id: "apothecary", shape: "round", material: "copper", symbol: "apothecary" },
  { id: "stable", shape: "shield", material: "oak", symbol: "stable" }
] as const satisfies readonly (HangingSignOptions & { id: string })[];

function polygon(points: readonly (readonly [number, number])[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  });
  shape.closePath();
  return shape;
}

function outline(kind: SignShape): THREE.Shape {
  if (kind === "round" || kind === "oval") {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, kind === "round" ? 0.43 : 0.6, 0.43, 0, Math.PI * 2, false, 0);
    return shape;
  }
  if (kind === "shield")
    return polygon([
      [-0.52, 0.43],
      [0.52, 0.43],
      [0.47, -0.12],
      [0, -0.48],
      [-0.47, -0.12]
    ]);
  if (kind === "arch") {
    const arch = new THREE.Shape();
    arch.moveTo(-0.54, -0.43);
    arch.lineTo(0.54, -0.43);
    arch.lineTo(0.54, 0.12);
    arch.quadraticCurveTo(0.54, 0.49, 0, 0.49);
    arch.quadraticCurveTo(-0.54, 0.49, -0.54, 0.12);
    arch.closePath();
    return arch;
  }
  return polygon([
    [-0.58, -0.4],
    [0.58, -0.4],
    [0.58, 0.4],
    [-0.58, 0.4]
  ]);
}

/**
 * Meter units, Y up. The wall attachment is at the origin; +X projects out from
 * the wall. The sign lies in XY and is readable from both +/-Z street directions.
 * Position the root at eaves height and rotate about Y to match the facade.
 * Pure geometry: no browser, font, external texture or building attribute required.
 */
export function createHangingSignModel(options: HangingSignOptions = {}): CityStructureMeshes {
  const { shape = "rectangle", material = "oak", symbol = "blank" } = options;
  const group = new THREE.Group();
  group.name = "hanging-shop-sign";
  group.userData.sign = { shape, material, symbol };
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const palette = {
    oak: [0x785032, 0x322c28, 0xf4dca1],
    iron: [0x303e41, 0x73796f, 0xf3db9c],
    copper: [0x47786e, 0xb07742, 0xffe3a2]
  }[material];
  const board = new THREE.MeshStandardMaterial({
    color: palette[0],
    roughness: 0.85,
    metalness: material === "oak" ? 0 : 0.65
  });
  const metal = new THREE.MeshStandardMaterial({ color: palette[1], roughness: 0.65, metalness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: palette[2], roughness: 0.9 });
  const grain = new THREE.MeshStandardMaterial({ color: 0x493522, roughness: 1 });
  function add(name: string, geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, surface = metal) {
    return add(name, new THREE.BoxGeometry(w, h, d), surface, x, y, z);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const mesh = add(name, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6), metal, 0, 0, 0);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  const cx = 0.87,
    cy = -0.84;
  box("wall-plate", 0.025, -0.15, 0, 0.05, 0.55, 0.19);
  box("bracket-arm", 0.76, 0, 0, 1.52, 0.055, 0.055);
  beam("bracket-brace", new THREE.Vector3(0.05, -0.36, 0), new THREE.Vector3(0.58, -0.02, 0), 0.022);
  for (const x of [cx - 0.25, cx + 0.25]) {
    for (let i = 0; i < 5; i++) {
      const link = add("chain-link", new THREE.TorusGeometry(0.035, 0.008, 4, 8), metal, x, -0.047 - i * 0.059, 0);
      link.rotation.y = ((i % 2) * Math.PI) / 2;
    }
  }
  function extrude(profile: THREE.Shape, depth: number) {
    const geometry = new THREE.ExtrudeGeometry(profile, { depth, bevelEnabled: false, curveSegments: 20 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  add("sign-rim", extrude(outline(shape), 0.075), metal, cx, cy, 0);
  const panelGeometry = extrude(outline(shape), 0.084);
  panelGeometry.scale(0.91, 0.91, 1);
  add("sign-panel", panelGeometry, board, cx, cy, 0);
  for (const side of [-1, 1]) {
    // Both faces carry the same readable symbol; reverse X on the back face.
    const z = side * 0.05;
    if (material === "oak") {
      for (const y of [-0.19, 0, 0.19]) box("plank-seam", cx, cy + y, side * 0.043, 0.62, 0.007, 0.002, grain);
    }
    for (const x of [-0.25, 0.25]) {
      const pin = add("hanger-pin", new THREE.SphereGeometry(0.022, 6, 4), metal, cx + x, -0.53, z);
      // A strap joins the chain to every profile, including a round panel.
      if (side === 1) box("hanger-strap", pin.position.x, -0.43, 0, 0.035, 0.26, 0.1);
    }
    const iconBox = (x: number, y: number, w: number, h: number) =>
      box(`symbol-${symbol}`, cx + side * x, cy + y, z, w, h, 0.012, paint);
    const iconShape = (points: readonly (readonly [number, number])[]) => {
      const geometry = extrude(polygon(points.map(([x, y]) => [side * x, y])), 0.012);
      add(`symbol-${symbol}`, geometry, paint, cx, cy, z);
    };
    if (symbol === "inn") {
      iconBox(-0.24, -0.01, 0.045, 0.35);
      iconBox(0.24, -0.09, 0.045, 0.19);
      iconBox(0, -0.055, 0.49, 0.13);
      iconBox(-0.125, 0.04, 0.14, 0.06);
    } else if (symbol === "blacksmith") {
      iconShape([
        [-0.32, 0.16],
        [0.31, 0.16],
        [0.24, 0.05],
        [0.1, 0.01],
        [0.08, -0.14],
        [0.23, -0.19],
        [-0.21, -0.19],
        [-0.08, -0.12],
        [-0.1, 0.02],
        [-0.25, 0.04]
      ]);
    } else if (symbol === "tavern") {
      const handle = add("symbol-tavern", new THREE.TorusGeometry(0.105, 0.027, 6, 14), paint, cx + side * 0.18, cy, z);
      handle.scale.y = 1.15;
      iconBox(-0.035, -0.025, 0.31, 0.34);
      iconBox(-0.035, 0.16, 0.35, 0.065);
    } else if (symbol === "bakery") {
      const loaf = new THREE.Shape();
      loaf.absellipse(0, 0, 0.3, 0.16, 0, Math.PI * 2, false, 0);
      add("symbol-bakery", extrude(loaf, 0.012), paint, cx, cy, z);
      for (const x of [-0.14, 0, 0.14]) {
        const slash = box("bread-score", cx + x, cy + 0.02, z + side * 0.009, 0.02, 0.17, 0.005, board);
        slash.rotation.z = -0.3;
      }
    } else if (symbol === "apothecary") {
      iconShape([
        [-0.09, 0.25],
        [0.09, 0.25],
        [0.09, 0.05],
        [0.24, -0.19],
        [0.2, -0.24],
        [-0.2, -0.24],
        [-0.24, -0.19],
        [-0.09, 0.05]
      ]);
      iconBox(0, 0.25, 0.23, 0.045);
    } else if (symbol === "stable") {
      const shoe = add(
        "symbol-stable",
        new THREE.TorusGeometry(0.2, 0.047, 6, 20, Math.PI * 1.55),
        paint,
        cx,
        cy + 0.03,
        z
      );
      shoe.rotation.z = Math.PI * 0.725;
    }
  }
  let disposed = false;
  return {
    group,
    pickables,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const surface of [board, metal, paint, grain]) surface.dispose();
    }
  };
}

export function createHangingSign(options: HangingSignOptions = {}) {
  const model = createHangingSignModel(options);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
