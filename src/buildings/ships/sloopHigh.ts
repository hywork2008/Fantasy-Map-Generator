import * as THREE from "three";
import { ModelKit, type Position } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import {
  addSailBundle,
  assembleSailingParts,
  SailingKit,
  type SailingShipState,
  type ShipHullFrame
} from "./sailingAssembly";

import { SLOOP_STATIONS } from "./sloop";

// All parts use the authored hull origin; bows point +X and Y=0 is the waterline.
const PROFILE = new THREE.CatmullRomCurve3(SLOOP_STATIONS.map(p => new THREE.Vector3(...p)));
const SECTIONS = PROFILE.getPoints(64);
const v = (p: Position) => new THREE.Vector3(...p);
const tuple = (p: THREE.Vector3): Position => [p.x, p.y, p.z];
const BOOM: readonly [Position, Position] = [
  [0.7, 3.15, 0],
  [-5.3, 3.15, 0.55]
];
const GAFF_SET: readonly [Position, Position] = [
  [0.7, 10.4, 0],
  [-3.7, 12.25, 0.4]
];
const GAFF_FURLED: readonly [Position, Position] = [
  [0.7, 3.56, 0],
  [-3.7, 3.62, 0.4]
];

function surface(
  k: ModelKit,
  name: string,
  points: number[],
  indices: number[],
  material: "oak" | "dark" | "wood" | "white"
) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  k.add(name, g, material);
}

function hull() {
  const k = new SailingKit("sloop-hull");
  const rings = SECTIONS.map(p => [
    [p.x, p.z, -p.y * 0.9],
    ...Array.from({ length: 17 }, (_, j) => {
      const angle = (Math.PI * j) / 16;
      return [p.x, 0.25 - 1.8 * Math.sin(angle), -p.y * Math.cos(angle)];
    }),
    [p.x, p.z, p.y * 0.9]
  ]);
  const points = rings.flat(2),
    upper: number[] = [],
    lower: number[] = [];
  for (let i = 0; i < 64; i++)
    for (let j = 0; j < 18; j++) {
      const a = i * 19 + j,
        b = a + 19;
      (j === 0 || j === 17 ? upper : lower).push(a, b, a + 1, b, b + 1, a + 1);
    }
  surface(k, "hull-topsides", points, upper, "oak");
  surface(k, "hull-underwater", points, lower, "dark");
  for (const index of [0, 64]) {
    const cap = rings[index].flat();
    const indices: number[] = [];
    for (let j = 1; j < 18; j++) indices.push(0, j, j + 1);
    surface(k, index ? "stem" : "transom", cap, indices, "oak");
  }
  k.box("keel", [0, -1.61, 0], [7, 0.18, 0.16], "dark");
  k.box("rudder", [-6.15, -0.35, 0], [0.55, 2.4, 0.14], "oak");
  for (const y of [-0.4, 0.6, 1.4]) k.box("rudder-strap", [-6.15, y, 0], [0.58, 0.06, 0.17], "iron");
  const seams: [Position, Position][] = [];
  for (const j of [1, 2, 3, 4, 6, 12, 14, 15, 16, 17])
    for (let i = 0; i < 64; i++)
      seams.push([rings[i][j] as unknown as Position, rings[i + 1][j] as unknown as Position]);
  k.lines("hull-strakes", seams, 0x503b2b);
  return k.finish();
}

function deck() {
  const k = new SailingKit("sloop-deck");
  const points = SECTIONS.flatMap(p => [p.x, p.z, -p.y * 0.9, p.x, p.z, p.y * 0.9]);
  const indices: number[] = [];
  for (let i = 0; i < 64; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface(k, "main-deck", points, indices, "wood");
  for (let i = 0; i < 64; i++) {
    const a = SECTIONS[i],
      b = SECTIONS[i + 1];
    for (const side of [-1, 1]) {
      k.beam("cap-rail", [a.x, a.z + 0.1, side * a.y * 0.9], [b.x, b.z + 0.1, side * b.y * 0.9], 0.12, "oak");
    }
  }
  const seams: [Position, Position][] = [];
  for (let fraction = -0.8; fraction <= 0.81; fraction += 0.1)
    for (let i = 0; i < 64; i++) {
      const a = SECTIONS[i],
        b = SECTIONS[i + 1];
      seams.push([
        [a.x, a.z + 0.004, a.y * fraction],
        [b.x, b.z + 0.004, b.y * fraction]
      ]);
    }
  k.lines("deck-plank-seams", seams, 0x6d5138);
  return k.finish();
}

function cabin() {
  const k = new ModelKit("sloop-cabin");
  for (const side of [-1, 1]) {
    const z = side * 0.95;
    k.box("wall-sill", [-1.9, 1.55, z], [2.9, 0.5, 0.12], "oak");
    k.box("wall-head", [-1.9, 2.22, z], [2.9, 0.2, 0.12], "oak");
    for (const [x, width] of [
      [-3.135, 0.43],
      [-2, 0.98],
      [-0.765, 0.63]
    ])
      k.box("window-pier", [x, 1.96, z], [width, 0.34, 0.12], "oak");
    for (const x of [-2.7, -1.3]) {
      k.box("recessed-window", [x, 1.96, z - side * 0.045], [0.42, 0.32, 0.025], "dark");
      for (const dx of [-0.24, 0.24]) k.box("window-jamb", [x + dx, 1.96, z + side * 0.07], [0.05, 0.4, 0.035], "wood");
      for (const y of [1.765, 2.155]) k.box("window-frame", [x, y, z + side * 0.07], [0.53, 0.045, 0.035], "wood");
      k.box("window-mullion", [x, 1.96, z + side * 0.075], [0.025, 0.32, 0.03], "iron");
    }
  }
  k.box("cabin-front", [-0.45, 1.8, 0], [0.12, 1, 1.9], "oak");
  for (const z of [-0.66, 0.66]) k.box("companion-jamb", [-3.35, 1.8, z], [0.12, 1, 0.58], "oak");
  k.box("companion-lintel", [-3.35, 2.2, 0], [0.12, 0.2, 0.74], "oak");
  for (let i = 0; i < 5; i++)
    k.box("companion-door-board", [-3.38, 1.73, -0.29 + i * 0.145], [0.055, 0.78, 0.14], "wood");
  for (const y of [1.45, 2.0]) k.box("door-strap", [-3.42, y, 0], [0.025, 0.04, 0.64], "iron");
  k.ring("door-handle", [-3.445, 1.75, 0.2], 0.045, 0.01, "iron", true).rotation.y = Math.PI / 2;
  k.box("cabin-roof", [-1.9, 2.37, 0], [3.12, 0.14, 2.16], "wood");
  for (const side of [-1, 1]) k.box("roof-fascia", [-1.9, 2.34, side * 1.08], [3.18, 0.18, 0.06], "oak");
  for (let x = -3.4; x < -0.4; x += 0.18) k.box("roof-seam", [x, 2.443, 0], [0.008, 0.006, 2.1], "oak");
  return k.finish();
}

function fittings() {
  const k = new ModelKit("sloop-deck-fittings");
  k.beam("rudder-stock", [-6.1, -0.9, 0], [-6.1, 2.05, 0], 0.16, "oak", true);
  k.beam("tiller", [-6.1, 2.05, 0], [-4.2, 2.05, 0], 0.12, "wood", true);
  k.box("hatch-coaming", [3.1, 1.59, 0], [1.05, 0.2, 1.03], "oak");
  for (let i = 0; i < 5; i++) k.box("hatch-plank", [2.68 + i * 0.21, 1.704, 0], [0.2, 0.035, 0.92], "wood");
  for (const x of [2.77, 3.43]) k.box("hatch-strap", [x, 1.73, 0], [0.05, 0.025, 0.94], "iron");
  for (const side of [-1, 1]) {
    for (const x of [-4.5, 3.9]) {
      const y = x < 0 ? 1.57 : 1.77;
      for (const dx of [-0.12, 0.12]) k.box("cleat-foot", [x + dx, y, side * 0.9], [0.08, 0.18, 0.08], "iron");
      k.beam("cleat-horns", [x - 0.28, y + 0.08, side * 0.9], [x + 0.28, y + 0.08, side * 0.9], 0.075, "iron", true);
    }
    k.box("windlass-pedestal", [4.5, 1.91, side * 0.4], [0.25, 0.45, 0.18], "oak");
  }
  k.beam("windlass-drum", [4.5, 2.06, -0.6], [4.5, 2.06, 0.6], 0.22, "wood", true);
  for (const z of [-0.65, 0.65]) k.beam("windlass-handle", [4.5, 1.83, z], [4.5, 2.33, z], 0.05, "iron", true);
  k.box("mainsheet-anchor", [-4.4, 1.56, 0.55], [0.12, 0.18, 0.12], "oak");
  k.ring("mainsheet-block", [-4.4, 1.65, 0.55], 0.055, 0.015, "iron", true);
  k.box("backstay-chainplate", [-5.5, 1.78, 0], [0.07, 0.28, 0.07], "iron");
  for (const side of [-1, 1]) {
    k.box("jib-sheet-anchor", [-0.3, 1.43, side * 1.7], [0.07, 0.32, 0.07], "iron");
    k.ring("jib-sheet-block", [-0.3, 1.6, side * 1.7], 0.045, 0.013, "iron", true);
  }
  return k.finish();
}

function spars() {
  const k = new ModelKit("sloop-fixed-spars");
  k.cylinder("mast", [0.8, 7.55, 0], 0.17, 12.5, "oak", 0.085, 16);
  k.beam("bowsprit", [4, 1.8, 0], [8.4, 3.3, 0], 0.22, "oak", true);
  k.beam("boom", ...BOOM, 0.18, "wood", true);
  for (const y of [1.4, 3.15, 10.4]) k.ring("mast-collar", [0.8, y, 0], 0.172, 0.025, "iron");
  return k.finish();
}

function standingRig() {
  const k = new SailingKit("sloop-standing-rigging");
  const segments: [Position, Position][] = [
    [
      [0.8, 13.7, 0],
      [8.4, 3.3, 0]
    ],
    [
      [8.4, 3.3, 0],
      [5.5, 0, 0]
    ],
    [
      [0.8, 13.7, 0],
      [-5.5, 1.9, 0]
    ]
  ];
  for (const side of [-1, 1]) {
    for (const x of [-0.6, 0.2]) {
      const foot: Position = [x, 1.54, side * 1.8];
      segments.push([[0.8, 10.5, 0], foot]);
      k.ring("deadeye", foot, 0.07, 0.022, "dark", true);
      k.box("chainplate", [x, 1.34, side * 1.8], [0.06, 0.3, 0.04], "iron");
    }
    for (let t = 0.1; t < 0.9; t += 0.055)
      segments.push([
        tuple(v([0.8, 10.5, 0]).lerp(v([-0.6, 1.54, side * 1.8]), t)),
        tuple(v([0.8, 10.5, 0]).lerp(v([0.2, 1.54, side * 1.8]), t))
      ]);
  }
  k.lines("standing-rigging", segments, 0x453c30);
  return k.finish();
}

function cloth(k: SailingKit, name: string, a: Position, b: Position, c: Position, d: Position) {
  const cols = 24,
    rows = 18,
    points: number[] = [],
    indices: number[] = [];
  const vertex = (u: number, t: number): Position => {
    const p = v(a)
      .lerp(v(b), u)
      .lerp(v(d).lerp(v(c), u), t);
    p.z += 0.48 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t);
    return tuple(p);
  };
  for (let row = 0; row <= rows; row++)
    for (let col = 0; col <= cols; col++) points.push(...vertex(col / cols, row / rows));
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const i = row * (cols + 1) + col;
      if (row || !v(a).equals(v(b))) indices.push(i, i + 1, i + cols + 1);
      indices.push(i + 1, i + cols + 2, i + cols + 1);
    }
  surface(k, name, points, indices, "white");
  const seams: [Position, Position][] = [];
  for (let col = 0; col <= cols; col += 2)
    for (let row = 0; row < rows; row++)
      seams.push([vertex(col / cols, row / rows), vertex(col / cols, (row + 1) / rows)]);
  for (const u of [0, 1])
    for (let row = 0; row < rows; row++) seams.push([vertex(u, row / rows), vertex(u, (row + 1) / rows)]);
  for (let col = 0; col < cols; col++) seams.push([vertex(col / cols, 1), vertex((col + 1) / cols, 1)]);
  k.lines(`${name}-seams-and-boltropes`, seams, 0xb3a38a);
}

function mainsail(furled: boolean) {
  const k = new SailingKit("sloop-mainsail");
  const gaff = furled ? GAFF_FURLED : GAFF_SET;
  k.beam("gaff", ...gaff, 0.15, "wood", true);
  k.lines("gaff-halyard", [[[0.8, 13.5, 0], gaff[1]]]);
  if (furled) addSailBundle(k, "furled-mainsail", [0.5, 3.38, 0.02], [-5.15, 3.38, 0.54], 0.22);
  else cloth(k, "gaff-mainsail", [0.65, 10.35, 0], [-3.65, 12.15, 0.4], [-5.15, 3.25, 0.55], [0.65, 3.25, 0]);
  k.lines("mainsheet", [
    [
      [-5.2, 3.15, 0.55],
      [-4.4, 1.65, 0.55]
    ]
  ]);
  return k.finish();
}

function jib(furled: boolean) {
  const k = new SailingKit("sloop-jib");
  if (furled) {
    addSailBundle(k, "furled-jib", [2.5, 1.65, 0.8], [4.1, 1.87, 0.8], 0.18);
    k.lines("jib-halyard", [
      [
        [0.9, 12.8, 0],
        [0.9, 1.5, 0.25]
      ]
    ]);
  } else {
    cloth(k, "jib", [0.9, 12.8, 0], [0.9, 12.8, 0], [2.2, 3.1, 0.35], [8.05, 3.25, 0]);
    k.lines(
      "jib-sheets",
      [-1, 1].map(
        side =>
          [
            [2.2, 3.1, 0.35],
            [-0.3, 1.6, side * 1.7]
          ] as [Position, Position]
      )
    );
  }
  return k.finish();
}

export function sloopHighParts({ sails = "set" }: SailingShipState = {}): readonly ModelPartFactory[] {
  const furled = sails === "furled";
  const definitions: readonly (readonly [string, string, ModelPartFactory["create"]])[] = [
    ["hull", "Hull and rudder", hull],
    ["deck", "Deck and cap rails", deck],
    ["cabin", "Cabin and joinery", cabin],
    ["fittings", "Deck equipment", fittings],
    ["spars", "Fixed spars", spars],
    ["standing-rigging", "Standing rigging and deadeyes", standingRig],
    ["mainsail", "Mainsail and movable gaff", () => mainsail(furled)],
    ["jib", "Jib and sheets", () => jib(furled)]
  ];
  return definitions.map(([id, role, create]) => ({
    id,
    role,
    create,
    quality: "high",
    author: "Codex GPT-6.1 Sol"
  }));
}

export function createSloopHigh(state: SailingShipState = {}) {
  const model = assembleSailingParts("sloop-high", sloopHighParts(state));
  model.group.userData.shipHull = {
    minX: -5.8,
    maxX: 6,
    beam: Math.max(...SECTIONS.map(p => p.y)) * 2,
    waterline: 0,
    draft: 1.7
  } satisfies ShipHullFrame;
  return model;
}
