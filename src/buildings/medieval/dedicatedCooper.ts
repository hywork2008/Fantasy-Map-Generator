import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { DEDICATED_COOPER } from "./dedicatedCooperProfile";
import { ModelKit, type Position } from "./modelKit";
import { createCooperVessel } from "./woodworkingDetails";
import { addCraftBench } from "./workshopDetailKit";

function site() {
  const k = new ModelKit("cooper-operating-pad");
  k.box("level-work-pad", [0, 0.06, -0.5], [16, 0.12, 11], "stone");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-8, 0.12, 5, 8, 0, 7, 8, 0.12, 5, -8, 0.12, 5, -8, 0, 7, 8, 0, 7], 3)
  );
  geometry.computeVertexNormals();
  k.add("front-ground-ramp", geometry, "stone");
  return k.finish();
}
function frame(high: boolean) {
  const k = new ModelKit("cooper-open-work-shelter");
  for (const x of [-6.2, 0.7])
    for (const z of [-5.2, 1.3]) {
      k.box("shelter-post", [x, 1.67, z], [0.16, 3.1, 0.16]);
      k.beam("upper-knee-brace", [x, 2.6, z], [x + (x < 0 ? 0.55 : -0.55), 3.15, z], 0.1);
      if (high) for (const y of [0.5, 2.8]) k.cylinder("post-peg", [x, y, z + 0.09], 0.025, 0.04, "oak");
    }
  k.roof(-2.75, -1.95, 7.6, 7.2, 3.3, 1, "wood", false);
  return k.finish();
}
function shaping() {
  const k = new ModelKit("cooper-shaping-and-jointing");
  addCraftBench(k, -4.5, -2.7, 2.6, 1.2, 0.85);
  k.box("shaving-horse-clamp", [-4.5, 0.98, -2.5], [0.4, 0.14, 0.2], "oak");
  k.beam("clamp-treadle", [-4.5, 0.2, -2.3], [-4.5, 0.98, -2.5], 0.07);
  k.box("stave-being-shaped", [-4.5, 0.93, -2.65], [1.65, 0.09, 0.2], "oak");
  k.beam("drawknife-edge", [-4.85, 1.02, -2.6], [-4.15, 1.02, -2.6], 0.025, "iron");
  for (const x of [-4.9, -4.1]) k.beam("drawknife-grip", [x, 1.02, -2.6], [x, 1.02, -2.35], 0.055, "wood", true);
  k.beam("long-jointer-plane", [-5.5, 0.94, -3.12], [-3.5, 1.04, -3.12], 0.18, "oak");
  k.box("jointer-iron", [-4.5, 1.1, -3.12], [0.04, 0.12, 0.15], "iron");
  const m = k.finish();
  for (const child of m.group.children) child.position.y += 0.12;
  return m;
}
function assembly() {
  const k = new ModelKit("cooper-raising-stand");
  addCraftBench(k, -0.7, -2.6, 1.6, 1.6, 0.45);
  k.attach(createCooperVessel(true), [-0.7, 0.45, -2.6]);
  k.box("coopers-mallet-head", [-1.27, 0.58, -2.1], [0.24, 0.15, 0.15], "oak");
  k.beam("mallet-handle", [-1.27, 0.58, -2.2], [-1.27, 0.58, -2.85], 0.045, "wood", true);
  k.beam("hoop-driver", [-0.2, 0.51, -2.1], [-0.2, 0.9, -2.1], 0.05, "iron");
  const m = k.finish();
  for (const child of m.group.children) child.position.y += 0.12;
  return m;
}
function heading() {
  const k = new ModelKit("cooper-heading-and-grooving-bench");
  addCraftBench(k, -4.6, 1.5, 2.6, 1.2, 0.9);
  for (let i = 0; i < 5; i++) k.box("head-board", [-4.8 + i * 0.2, 0.94, 1.55], [0.19, 0.06, 0.85], "oak");
  k.box("croze-wooden-fence", [-3.65, 0.99, 1.3], [0.45, 0.14, 0.2], "wood");
  k.box("croze-blade", [-3.65, 1.02, 1.19], [0.08, 0.16, 0.03], "iron");
  k.beam("heading-knife", [-5.5, 0.96, 1.0], [-4.7, 0.96, 1.0], 0.035, "iron");
  k.beam("bung-auger", [-5.5, 0.98, 1.9], [-4.85, 0.98, 1.9], 0.035, "iron");
  k.beam("auger-cross-handle", [-5.5, 0.98, 1.75], [-5.5, 0.98, 2.05], 0.065, "wood");
  const m = k.finish();
  for (const child of m.group.children) child.position.y += 0.12;
  return m;
}
function hoops() {
  const k = new ModelKit("cooper-loose-hoops");
  k.box("hoop-rack-base", [0.7, 0.19, -4.2], [1.1, 0.14, 1.1]);
  for (let i = 0; i < 4; i++) k.ring("separate-fitting-hoop", [0.7, 0.3 + i * 0.09, -4.2], 0.43, 0.025, "iron");
  return k.finish();
}
function rawStock() {
  const k = new ModelKit("cooper-seasoned-stock-allocation");
  for (const [z, depth] of [
    [-3.3, 2.4],
    [-0.1, 2.4],
    [2.7, 1.4]
  ])
    k.box("stock-pallet", [-7.1, 0.19, z], [1.2, 0.14, depth]);
  for (let i = 0; i < 8; i++)
    for (const z of [-3.3, -0.1])
      k.box(
        "allocated-seasoned-stave",
        [-7.5 + (i % 4) * 0.25, 0.32 + Math.floor(i / 4) * 0.17, z],
        [0.2, 0.12, 2.2],
        "oak"
      );
  for (const z of [-3.3, -0.1])
    for (const end of [-0.7, 0.7]) k.box("stock-layer-spacer", [-7.1, 0.405, z + end], [1.18, 0.05, 0.08], "wood");
  for (let i = 0; i < 5; i++) k.box("seasoned-head-board", [-7.1, 0.295 + i * 0.07, 2.7], [1.2, 0.07, 1.3], "wood");
  return k.finish();
}
function finishedStock() {
  const k = new ModelKit("cooper-finished-cask-staging");
  k.box("finished-stock-pallet", [5.3, 0.16, 4.1], [3.2, 0.08, 1.6]);
  for (const x of [4.5, 6.1]) k.attach(createCooperVessel(false), [x, 0.2, 4.1]);
  return k.finish();
}
function heatBending() {
  const k = new ModelKit("cooper-outdoor-heat-bending");
  k.cylinder("cresset-stone-base", [5.5, 0.2, -3], 0.8, 0.16, "stone");
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    k.beam(
      "cresset-iron-upright",
      [5.5 + Math.cos(a) * 0.37, 0.28, -3 + Math.sin(a) * 0.37],
      [5.5 + Math.cos(a) * 0.42, 0.9, -3 + Math.sin(a) * 0.42],
      0.04,
      "iron"
    );
  }
  for (const y of [0.35, 0.8]) k.ring("cresset-band", [5.5, y, -3], 0.4, 0.035, "iron");
  k.cylinder("contained-bending-fuel", [5.5, 0.35, -3], 0.33, 0.15, "dark");
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI) / 9;
    const points: Position[] = [
      [5.5 + Math.cos(a) * 0.73, 0.3, -3 + Math.sin(a) * 0.73],
      [5.5 + Math.cos(a) * 0.85, 1, -3 + Math.sin(a) * 0.85],
      [5.5 + Math.cos(a) * 0.73, 1.7, -3 + Math.sin(a) * 0.73]
    ];
    for (let j = 1; j < points.length; j++) k.beam("open-bottom-bending-stave", points[j - 1], points[j], 0.08, "oak");
  }
  for (const y of [0.45, 1.55]) k.ring("temporary-bending-hoop", [5.5, y, -3], 0.79, 0.03, "iron");
  k.cylinder("wetting-water-vessel", [6.45, 0.4, -1.95], 0.24, 0.56, "wood");
  k.cylinder("wetting-water", [6.45, 0.685, -1.95], 0.21, 0.015, "water");
  return k.finish();
}
export function dedicatedCooperParts(quality: "low" | "high"): ModelPartFactory[] {
  const parts: { role: string; create: ModelPartFactory["create"] }[] = [
    { role: "site", create: site },
    { role: "frame", create: () => frame(quality === "high") },
    { role: "shaping", create: shaping },
    { role: "assembly", create: assembly },
    { role: "heading", create: heading },
    { role: "hoops", create: hoops },
    { role: "seasoned-stock", create: rawStock },
    { role: "finished-stock", create: finishedStock },
    { role: "heat-bending", create: heatBending }
  ];
  return parts.map(p => ({
    id: `dedicated-cooperage:${p.role}`,
    ...p,
    quality,
    author: DEFAULT_AUTHOR,
    ...(["assembly", "finished-stock"].includes(p.role)
      ? { basedOn: [variantId("medieval.coopers-workshop", "high", DEFAULT_AUTHOR)] }
      : {})
  }));
}
export function assembleDedicatedCooper(
  quality: "low" | "high",
  parts: readonly ModelPartFactory[] = dedicatedCooperParts(quality)
) {
  const model = compactModel(createModelAssembly(`dedicated-cooperage-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  model.group.userData.placementSpec = DEDICATED_COOPER;
  return model;
}
