import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import { cutRoofRectangle } from "./roofCut";

export type SmithyKind = "open-smithy" | "farriers-workshop";

function forge(k: HouseDetailKit) {
  k.box("forge-foundation", [-2, 0.43, -1.8], [2.15, 0.86, 1.6], "stone");
  k.box("recessed-coal-bed", [-2, 0.92, -1.65], [1.55, 0.12, 1.05], "dark");
  for (const x of [-2.99, -1.01]) k.box("hearth-side-rim", [x, 1.01, -1.8], [0.17, 0.3, 1.6], "stone");
  k.box("hearth-front-lip", [-2, 0.98, -0.98], [2.15, 0.14, 0.16], "stone");
  k.box("forge-rear-wall", [-2, 1.35, -2.52], [2.15, 1.1, 0.18], "stone");
  for (let i = 0; i < 25; i++) {
    const x = -2.6 + (i % 5) * 0.28,
      z = -2.1 + Math.floor(i / 5) * 0.2;
    k.sphere("individual-forge-coal", [x, 1.01, z], [0.09, 0.045, 0.075], i % 4 ? "dark" : "tile");
  }
  for (const x of [-2.9, -1.1]) k.box("hood-support-pier", [x, 1.43, -1.04], [0.2, 0.82, 0.25], "stone");
  // Open lower mouth and four tapered side panels, rather than a solid pyramid above the hearth.
  const positions: number[] = [],
    indices: number[] = [];
  const lower = [
    [-3.05, 1.83, -2.62],
    [-0.95, 1.83, -2.62],
    [-0.95, 1.83, -0.95],
    [-3.05, 1.83, -0.95]
  ];
  const upper = [
    [-2.35, 2.65, -2.4],
    [-1.65, 2.65, -2.4],
    [-1.65, 2.65, -1.8],
    [-2.35, 2.65, -1.8]
  ];
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4,
      start = positions.length / 3;
    positions.push(...lower[side], ...lower[next], ...upper[next], ...upper[side]);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const hood = new THREE.BufferGeometry();
  hood.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  hood.setIndex(indices);
  hood.computeVertexNormals();
  k.add("hollow-smoke-hood", hood, "stone");
  // Four independent walls continue from the hood into an open flue.
  for (const side of [-1, 1]) {
    k.box("flue-long-wall", [-2, 4, -2.1 + side * 0.25], [0.7, 2.7, 0.12], "stone");
    k.box("flue-end-wall", [-2 + side * 0.29, 4, -2.1], [0.12, 2.7, 0.38], "stone");
    k.box("flue-cap-side", [-2, 5.4, -2.1 + side * 0.27], [0.82, 0.12, 0.16], "stone");
    k.box("flue-cap-end", [-2 + side * 0.33, 5.4, -2.1], [0.16, 0.12, 0.4], "stone");
  }
  for (let y = 2.85; y < 5.3; y += 0.3) {
    k.box("chimney-stone-course", [-2, y, -1.785], [0.7, 0.018, 0.018], "white");
    k.box("chimney-side-course", [-1.64, y, -2.1], [0.018, 0.018, 0.6], "white");
  }
}

function bellows(k: HouseDetailKit) {
  const contour = [
    [-0.9, 0],
    [-0.35, -0.32],
    [0.5, -0.43],
    [0.88, -0.25],
    [1, 0],
    [0.88, 0.25],
    [0.5, 0.43],
    [-0.35, 0.32]
  ];
  for (const y of [0.84, 1.34]) {
    const outline = new THREE.Shape(contour.map(([x, z]) => new THREE.Vector2(x, z)));
    const board = k.add(
      "bellows-teardrop-board",
      new THREE.ExtrudeGeometry(outline, { depth: 0.06, bevelEnabled: false }),
      "wood"
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0.1, y, -1.9);
  }
  const positions: number[] = [],
    indices: number[] = [];
  for (let row = 0; row < 7; row++)
    for (const [x, z] of contour) {
      const scale = row % 2 ? 1.025 : 0.96;
      positions.push(0.1 + x * scale, 0.9 + row * 0.073, -1.9 + z * scale);
    }
  for (let row = 0; row < 6; row++)
    for (let i = 0; i < contour.length; i++) {
      const a = row * contour.length + i,
        b = row * contour.length + ((i + 1) % contour.length),
        c = b + contour.length,
        d = a + contour.length;
      indices.push(a, b, c, a, c, d);
    }
  const leather = new THREE.BufferGeometry();
  leather.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  leather.setIndex(indices);
  leather.computeVertexNormals();
  k.add("pleated-leather-bellows", leather, "leather");
  for (const [x, z] of contour)
    for (const y of [0.91, 1.335]) k.sphere("bellows-edge-stud", [0.1 + x, y, -1.9 + z], [0.018, 0.018, 0.018], "iron");
  for (const x of [-0.35, 0.8])
    for (const z of [-2.16, -1.64]) k.box("bellows-frame-leg", [x, 0.4, z], [0.09, 0.8, 0.09]);
  k.box("bellows-frame-crossbar", [0.3, 0.8, -1.9], [2, 0.09, 0.7]);
  const nozzle = k.cylinder("bellows-tuyere", [-1.02, 1.1, -1.9], 0.09, 0.5, "iron", 0.045, 16);
  nozzle.rotation.z = Math.PI / 2;
  k.box("bellows-lever-fulcrum", [1.25, 1.14, -1.9], [0.12, 0.68, 0.12]);
  k.beam("bellows-operating-lever", [-0.55, 1.76, -1.9], [1.75, 1.4, -1.9], 0.075);
  k.beam("bellows-connecting-link", [-0.35, 1.73, -1.9], [-0.35, 1.4, -1.9], 0.035, "iron", true);
}

function anvil(k: HouseDetailKit) {
  k.cylinder("anvil-oak-stump", [0, 0.34, 0.9], 0.36, 0.68, "wood", 0.34, 24);
  for (const r of [0.12, 0.22, 0.3]) k.ring("stump-growth-ring", [0, 0.685, 0.9], r, 0.006, "oak");
  for (const y of [0.16, 0.55]) k.ring("stump-iron-hoop", [0, y, 0.9], 0.365, 0.016, "iron");
  k.box("anvil-foot", [0, 0.77, 0.9], [0.6, 0.18, 0.42], "iron");
  k.box("anvil-waist", [0, 0.95, 0.9], [0.25, 0.25, 0.28], "iron");
  const face = new THREE.Shape();
  face.moveTo(-0.36, -0.2);
  face.lineTo(0.34, -0.2);
  face.lineTo(0.34, 0.2);
  face.lineTo(-0.36, 0.2);
  face.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.27, -0.035);
  hole.lineTo(-0.27, 0.035);
  hole.lineTo(-0.2, 0.035);
  hole.lineTo(-0.2, -0.035);
  hole.closePath();
  face.holes.push(hole);
  const plate = k.add(
    "anvil-face-with-hardy-hole",
    new THREE.ExtrudeGeometry(face, { depth: 0.12, bevelEnabled: false }),
    "iron"
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 1.055, 0.9);
  const horn = k.cylinder("tapered-anvil-horn", [0.57, 1.105, 0.9], 0.095, 0.48, "iron", 0, 20);
  horn.rotation.z = -Math.PI / 2;
  k.box("anvil-holdfast", [-0.29, 0.75, 0.9], [0.065, 0.22, 0.52], "iron");
}

function tools(k: HouseDetailKit) {
  k.table(2, 0, 1.6, 0.8, 0.9);
  for (let i = 0; i < 4; i++) {
    const x = 1.45 + i * 0.33;
    for (const side of [-1, 1])
      k.beam("forging-tongs-arm", [x + side * 0.045, 1.01, -0.24], [x - side * 0.02, 1.01, 0.23], 0.022, "iron", true);
    k.sphere("tongs-pivot", [x, 1.03, 0.08], [0.035, 0.018, 0.035], "iron");
    k.beam("hammer-handle", [x, 1.02, -0.15], [x, 1.02, 0.28], 0.035, "wood", true);
    k.box("forging-hammer-head", [x, 1.05, 0.27], [0.17, 0.08, 0.09], "iron");
  }
  k.vessel("quenching-tub", [1.4, 0, 1.9], 0.34, 0.65, "wood", true);
  for (const y of [0.12, 0.5]) k.ring("tub-iron-hoop", [1.4, y, 1.9], 0.345, 0.018, "iron");
  for (let i = 0; i < 5; i++) k.box("iron-bar-stock", [-3.2, 0.12 + i * 0.045, 0.8], [0.1, 0.04, 1.35], "iron");
}

function shoeingStock(k: HouseDetailKit) {
  for (const x of [2.5, 4.1])
    for (const z of [1.5, 3.1]) {
      k.box("stock-foot", [x, 0.1, z], [0.3, 0.2, 0.3], "stone");
      k.box("shoeing-stock-post", [x, 1.2, z], [0.16, 2.2, 0.16]);
      k.box("stock-rail-bolt", [x, 1.8, z + 0.09], [0.035, 0.035, 0.025], "iron");
    }
  for (const x of [2.5, 4.1])
    for (const y of [1, 2.15]) k.beam("shoeing-stock-long-rail", [x, y, 1.5], [x, y, 3.1], 0.12);
  for (const z of [1.8, 2.8]) {
    const points = Array.from({ length: 13 }, (_, i): readonly [number, number, number] => [
      2.5 + (i * 1.6) / 12,
      1.05 - 0.3 * Math.sin((i / 12) * Math.PI),
      z
    ]);
    k.tube("stock-leather-sling", points, 0.035, "leather");
  }
  for (const x of [1.5, 2.75]) k.box("horseshoe-rack-post", [x, 0.85, 0.8], [0.1, 1.7, 0.1]);
  k.box("horseshoe-rack-top", [2.125, 1.7, 0.8], [1.4, 0.1, 0.1]);
  for (let i = 0; i < 5; i++) {
    const x = 1.63 + i * 0.25;
    k.beam("shoe-hanging-peg", [x - 0.1, 1.47, 0.8], [x - 0.1, 1.47, 0.92], 0.025, "wood", true);
    const shoe = new THREE.Shape();
    shoe.absarc(0, 0, 0.12, 0, Math.PI, true);
    shoe.lineTo(-0.08, 0);
    shoe.absarc(0, 0, 0.08, Math.PI, Math.PI * 2, false);
    shoe.closePath();
    for (const a of [-Math.PI / 4, -Math.PI / 2, (-Math.PI * 3) / 4]) {
      const hole = new THREE.Path();
      hole.absarc(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.006, 0, Math.PI * 2, true);
      shoe.holes.push(hole);
    }
    k.add(
      "pierced-iron-horseshoe",
      new THREE.ExtrudeGeometry(shoe, { depth: 0.025, bevelEnabled: false, curveSegments: 12 }),
      "iron"
    ).position.set(x, 1.47, 0.89);
  }
}

/** Clip the new roof around the flue so the underlay and individual tiles cannot cap it. */
function roofWithFlue(k: HouseDetailKit) {
  const start = k.pickables.length;
  k.roofCover(-1, -1, 7, 5, 3.12, 1.4, "tile");
  cutRoofRectangle(
    k,
    k.pickables.slice(start).filter(mesh => ["roof-underlay", "overlapping-roof-tile"].includes(mesh.name)),
    {
      minX: -2.37,
      maxX: -1.63,
      minZ: -2.43,
      maxZ: -1.77
    }
  );
  const point = (x: number, z: number): [number, number, number] => [
    x,
    3.12 + 1.4 * (1 - Math.abs(z + 1) / 2.8) + 0.035,
    z
  ];
  for (const x of [-2.39, -1.61]) k.beam("flue-side-flashing", point(x, -2.45), point(x, -1.75), 0.1, "iron");
  for (const z of [-2.45, -1.75]) k.beam("flue-end-flashing", point(-2.39, z), point(-1.61, z), 0.1, "iron");
}

export function createHighSmithy(kind: SmithyKind) {
  const k = new HouseDetailKit(`${kind}-high`);
  k.box("smithy-work-floor", [-1, 0.045, -1], [7, 0.09, 5], "earth");
  for (const x of [-4.45, 2.45])
    for (const z of [-3.45, 1.45]) {
      k.box("smithy-stone-foot", [x, 0.1, z], [0.36, 0.2, 0.36], "stone");
      k.box("smithy-oak-post", [x, 1.6, z], [0.16, 3, 0.16]);
      k.beam("smithy-knee-brace", [x, 2.4, z], [x - Math.sign(x + 1) * 0.6, 3.05, z], 0.12);
    }
  for (const z of [-3.45, 1.45]) k.beam("smithy-wall-plate", [-4.6, 3.05, z], [2.6, 3.05, z], 0.18);
  roofWithFlue(k);
  forge(k);
  bellows(k);
  anvil(k);
  tools(k);
  if (kind === "farriers-workshop") shoeingStock(k);
  return compactModel(k.finish());
}

/** Assembly-origin components for new forms; original full-model factories remain unchanged. */
export type SmithyCorePart = "forge" | "bellows" | "anvil" | "tools" | "roof";
export function createSmithyCorePart(part: SmithyCorePart) {
  const k = new HouseDetailKit(`smithy-core-${part}`);
  ({ forge, bellows, anvil, tools, roof: roofWithFlue })[part](k);
  return k.finish();
}
