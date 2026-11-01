import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { HouseDetailKit } from "./houseDetailKit";
import { addMasonryArchPassage } from "./masonryArchPassage";
import { ModelKit } from "./modelKit";
import { addCraftBench, addCraftShed } from "./workshopDetailKit";

function pot(k: ModelKit, x: number, y: number, z: number, r = 0.21, h = 0.36) {
  const profile = [
    [0, 0],
    [r * 0.65, 0],
    [r, 0.12 * h],
    [r * 1.08, h * 0.55],
    [r * 0.72, h * 0.9],
    [r * 0.7, h],
    [r * 0.56, h],
    [r * 0.58, h * 0.89],
    [r * 0.94, h * 0.55],
    [r * 0.84, h * 0.2],
    [r * 0.5, 0.045],
    [0, 0.045]
  ];
  k.add(
    "hollow-wheel-thrown-pot",
    new THREE.LatheGeometry(
      profile.map(([a, b]) => new THREE.Vector2(a, b)),
      32
    ),
    "tile"
  ).position.set(x, y, z);
  k.ring("pot-rim", [x, y + h, z], r * 0.63, r * 0.07, "tile");
}
function kiln() {
  const k = new ModelKit("pottery-updraught-kiln");
  k.box("pottery-kiln-foundation", [4, 0.125, 0], [3.2, 0.25, 3.3], "stone");
  const profile = [
    [1.3, 0.25],
    [1.3, 1.2],
    [1.3, 1.32],
    [1.3, 2.25],
    [1.19, 2.5],
    [0.95, 2.75],
    [0.55, 3],
    [0.22, 3.1]
  ];
  for (let row = 0; row < profile.length - 1; row++)
    for (let i = 0; i < 48; i++) {
      if (row < 4 && (i < 4 || i >= 44) && row !== 1) continue;
      const [r0, y0] = profile[row],
        [r1, y1] = profile[row + 1],
        a = (i * Math.PI * 2) / 48,
        span = (Math.PI * 2) / 48;
      const geometry = new THREE.LatheGeometry(
        [
          new THREE.Vector2(r0, y0),
          new THREE.Vector2(r1, y1),
          new THREE.Vector2(r1 - 0.14, y1),
          new THREE.Vector2(r0 - 0.14, y0),
          new THREE.Vector2(r0, y0)
        ],
        3,
        a,
        span
      );
      k.add("thick-pottery-kiln-shell", geometry, "tile").position.x = 4;
    }
  addMasonryArchPassage(k, {
    name: "pottery-firemouth",
    x: 4,
    z: 0.2,
    bottom: 0.25,
    spring: 0.72,
    rise: 0.32,
    opening: 0.7,
    outerWidth: 1.7,
    top: 1.2,
    depth: 1.45,
    surface: "tile"
  });
  addMasonryArchPassage(k, {
    name: "ware-loading-mouth",
    x: 4,
    z: 0.2,
    bottom: 1.32,
    spring: 2.1,
    rise: 0.3,
    opening: 0.8,
    outerWidth: 1.7,
    top: 2.5,
    depth: 1.45,
    surface: "tile"
  });
  k.box("kiln-hearth", [4, 0.29, 0], [1.8, 0.08, 1.8], "dark");
  for (const x of [3.35, 4.65]) k.box("firing-floor-bearer", [x, 0.78, 0], [0.2, 0.9, 1.65], "tile");
  const ledge = [
    [0.99, 1.14],
    [1.25, 1.14],
    [1.25, 1.24],
    [0.99, 1.24],
    [0.99, 1.14]
  ];
  k.add(
    "kiln-floor-bearing-ledge",
    new THREE.LatheGeometry(
      ledge.map(([r, y]) => new THREE.Vector2(r, y)),
      48
    ),
    "tile"
  ).position.x = 4;
  // Each firebar is cut to the chamber circle and seats into its bearing ledge.
  for (let i = 0; i < 7; i++) {
    const z = -0.9 + i * 0.3;
    const half = Math.sqrt(1.2 ** 2 - (Math.abs(z) + 0.085) ** 2);
    k.box("perforated-kiln-floor-bar", [4, 1.25, z], [half * 2, 0.14, 0.17], "tile");
  }
  for (const [x, z] of [
    [3.5, -0.5],
    [4, -0.5],
    [4.5, -0.5]
  ])
    pot(k, x, 1.32, z, 0.18, 0.3);
  k.ring("open-kiln-top-vent", [4, 3.1, 0], 0.22, 0.065, "tile");
  for (let row = 0; row < 8; row++) {
    const y = 0.42 + row * 0.24;
    for (const side of [-1, 1])
      k.beam("kiln-portal-mortar-joint", [4 + side * 0.45, y, 1.655], [4 + side * 0.82, y, 1.655], 0.008, "earth");
  }
  return k.finish();
}
function equipment() {
  const k = new ModelKit("pottery-workshop-equipment");
  k.box("wheel-bearing-base", [-2, 0.18, 0], [1.6, 0.12, 1.5], "oak");
  k.cylinder("kick-wheel-spindle", [-2, 0.69, 0], 0.055, 1.02, "iron");
  k.cylinder("lower-kick-flywheel", [-2, 0.35, 0], 0.64, 0.13, "wood", 0.64, 40);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    k.beam(
      "kick-wheel-board-joint",
      [-2 + Math.cos(a) * 0.08, 0.417, Math.sin(a) * 0.08],
      [-2 + Math.cos(a) * 0.59, 0.417, Math.sin(a) * 0.59],
      0.007,
      "oak"
    );
  }
  k.cylinder("potters-wheel-head", [-2, 1.12, 0], 0.36, 0.09, "wood", 0.36, 40);
  for (const x of [-2.7, -1.3]) {
    k.box("wheel-upper-bearing-post", [x, 0.66, -0.45], [0.13, 1.08, 0.13], "oak");
  }
  k.box("wheel-spindle-bearing-beam", [-2, 1.01, -0.02], [1.5, 0.12, 0.16], "oak");
  pot(k, -2, 1.165, 0, 0.22, 0.42);
  addCraftBench(k, -2, 1.25, 1.15, 0.4, 0.5);
  for (const x of [-4.6, -0.6]) k.box("drying-shelf-post", [x, 1.45, -2.7], [0.13, 2.66, 0.13], "oak");
  for (const y of [0.55, 1.3, 2.05]) {
    k.box("vessel-drying-shelf", [-2.6, y, -2.7], [4.2, 0.1, 0.85], "wood");
    for (let i = 0; i < 6; i++) pot(k, -4.3 + i * 0.68, y + 0.05, -2.7, 0.18 + (i % 2) * 0.025, 0.31 + (i % 3) * 0.03);
  }
  k.beam("drying-shelf-back-brace", [-4.6, 0.2, -2.75], [-0.6, 2.7, -2.75], 0.07, "oak");
  addCraftBench(k, -4.2, 0.1, 1.5, 1, 0.85);
  k.box("clay-wedging-board", [-4.2, 0.89, 0.1], [1.3, 0.08, 0.85], "wood");
  k.sphere("wedged-clay-lump", [-4.2, 1.05, 0.1], [0.32, 0.12, 0.23], "earth");
  k.beam("clay-cutting-wire", [-4.7, 0.94, -0.15], [-3.7, 0.94, -0.15], 0.006, "iron", true);
  for (const x of [-4.7, -3.7]) k.box("wire-wooden-grip", [x, 0.955, -0.15], [0.04, 0.05, 0.15], "oak");
  k.vessel("wheel-water-bowl", [-3.1, 0.12, 0.55], 0.23, 0.24, "wood", true);
  k.box("clay-storage-pallet", [-4, 0.12, 2.65], [1.8, 0.24, 1.1], "wood");
  k.sphere("covered-clay-stock", [-4, 0.46, 2.65], [0.8, 0.22, 0.45], "earth");
  for (let i = 0; i < 10; i++)
    k.beam(
      "kiln-fuel-log",
      [2.8 + (i % 5) * 0.22, 0.1 + Math.floor(i / 5) * 0.19, 2.65],
      [2.8 + (i % 5) * 0.22, 0.1 + Math.floor(i / 5) * 0.19, 3.55],
      0.2,
      "wood",
      true
    );
  return k.finish();
}
export function potteryPartFactories(): ModelPartFactory[] {
  return [
    {
      id: "pottery:shelter",
      role: "shelter",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => {
        const k = new HouseDetailKit("shared-pottery-work-shed");
        addCraftShed(k, -2, -1, 7, 5);
        return k.finish();
      }
    },
    { id: "pottery:equipment", role: "equipment", quality: "high", author: DEFAULT_AUTHOR, create: equipment },
    { id: "pottery:kiln", role: "kiln", quality: "high", author: DEFAULT_AUTHOR, create: kiln }
  ];
}
export const assemblePotteryParts = (name: string, parts: readonly ModelPartFactory[]) =>
  compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });
export const createHighPottery = () => assemblePotteryParts("potters-workshop-high", potteryPartFactories());
