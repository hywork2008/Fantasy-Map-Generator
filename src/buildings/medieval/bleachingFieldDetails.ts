import * as THREE from "three";
import { ModelKit, type Position } from "./modelKit";

export type BleachingFieldPart = "ground-and-linen" | "drying-racks" | "washing-station";

function linen(k: ModelKit, x: number) {
  const vertices: number[] = [];
  const p = (i: number, j: number): Position => [
    x - 0.75 + (i * 1.5) / 12,
    0.054 + 0.003 * Math.sin((i * Math.PI) / 3) * Math.sin((j * Math.PI) / 4),
    -4.6 + (j * 9.2) / 36
  ];
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 36; j++) {
      const a = p(i, j),
        b = p(i + 1, j),
        c = p(i + 1, j + 1),
        d = p(i, j + 1);
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      const floor = (v: Position): Position => [v[0], 0.05, v[2]];
      const aa = floor(a),
        bb = floor(b),
        cc = floor(c),
        dd = floor(d);
      vertices.push(...aa, ...cc, ...bb, ...aa, ...dd, ...cc);
      if (i === 0) vertices.push(...a, ...d, ...dd, ...a, ...dd, ...aa);
      if (i === 11) vertices.push(...b, ...bb, ...cc, ...b, ...cc, ...c);
      if (j === 0) vertices.push(...a, ...aa, ...bb, ...a, ...bb, ...b);
      if (j === 35) vertices.push(...d, ...c, ...cc, ...d, ...cc, ...dd);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  k.add("linen-spread-on-grass", geometry, "white");
  for (const side of [-1, 1])
    k.beam("linen-selvedge", [x + side * 0.735, 0.0575, -4.6], [x + side * 0.735, 0.0575, 4.6], 0.007, "cloth");
  for (const z of [-4.65, 4.65])
    for (const side of [-1, 1]) {
      const xx = x + side * 0.64;
      k.beam("linen-ground-peg", [xx, 0.025, z], [xx, 0.14, z], 0.025, "oak", true);
      k.tube(
        "linen-peg-loop",
        [
          [xx, 0.055, z > 0 ? 4.57 : -4.57],
          [xx, 0.115, z],
          [xx + 0.025, 0.055, z > 0 ? 4.57 : -4.57]
        ],
        0.008,
        "cloth"
      );
    }
}

function rack(k: ModelKit, z: number) {
  const x = 7.05;
  for (const side of [-1, 1]) {
    const xx = x + side * 1.12;
    k.box("rack-ground-foot", [xx, 0.08, z], [0.3, 0.16, 0.85], "oak");
    k.box("drying-frame-post", [xx, 1.3, z], [0.13, 2.3, 0.13], "wood");
    for (const s of [-1, 1]) k.beam("drying-frame-foot-brace", [xx, 0.16, z + s * 0.36], [xx, 0.83, z], 0.07, "oak");
    k.beam("drying-frame-knee", [xx, 1.88, z], [xx - side * 0.34, 2.35, z], 0.075, "oak");
    k.beam("rail-wedged-peg", [xx, 2.35, z - 0.1], [xx, 2.35, z + 0.1], 0.025, "oak", true);
  }
  k.beam("drying-crossbar", [x - 1.2, 2.35, z], [x + 1.2, 2.35, z], 0.12, "wood", true);
  const path = [
    [0.16, 1.02],
    [0.12, 2.18],
    [0.06, 2.35],
    [0.043, 2.393],
    [0, 2.411],
    [-0.043, 2.393],
    [-0.06, 2.35],
    [-0.12, 2.18],
    [-0.16, 1.52]
  ];
  const vertices: number[] = [];
  const p = (i: number, j: number): Position => [
    x - 0.98 + (i * 1.96) / 20,
    path[j][1] + (j === 0 || j === 8 ? 0.025 * Math.sin(i * 0.7) : 0),
    z + path[j][0] + (j < 2 || j > 6 ? 0.012 * Math.sin(i * 0.8) : 0)
  ];
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < path.length - 1; j++) {
      const a = p(i, j),
        b = p(i + 1, j),
        c = p(i + 1, j + 1),
        d = p(i, j + 1);
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  k.add("linen-draped-over-crossbar", geometry, "white");
  for (const side of [-1, 1]) {
    const xx = x + side * 0.8;
    k.tube(
      "cloth-retaining-tie",
      [
        [xx, 2.32, z + 0.07],
        [xx, 2.42, z],
        [xx, 2.32, z - 0.07],
        [xx, 2.29, z],
        [xx, 2.32, z + 0.07]
      ],
      0.008,
      "cloth"
    );
  }
}

export function createBleachingFieldPart(part: BleachingFieldPart) {
  const k = new ModelKit(`bleaching-${part}-high`);
  if (part === "ground-and-linen") {
    k.box("bleaching-meadow", [0, 0.025, 0], [18, 0.05, 14], "green");
    for (const z of [-7, 7]) k.fence([-9, z], [9, z], 1);
    k.fence([-9, -7], [-9, 7], 1);
    k.fence([9, -7], [9, 5.3], 1);
    for (let i = 0; i < 6; i++) linen(k, -7 + i * 2.1);
    k.box("bleaching-access-path", [0, 0.055, 6.2], [18, 0.01, 1.2], "earth");
    for (const z of [5.3, 7]) k.box("gate-post", [9, 0.6, z], [0.16, 1.2, 0.16], "oak");
    const a: Position = [9, 0.38, 5.3],
      b: Position = [7.5, 0.38, 4.88];
    for (const y of [0.38, 0.84]) k.beam("open-field-gate-rail", [a[0], y, a[2]], [b[0], y, b[2]], 0.075, "wood");
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      k.box("open-gate-pale", [9 - 1.5 * t, 0.58, 5.3 - 0.42 * t], [0.065, 0.9, 0.065], "oak");
    }
    k.beam("gate-diagonal", [9, 0.2, 5.3], [7.5, 0.99, 4.88], 0.06, "oak");
    for (const y of [0.38, 0.84]) k.ring("gate-hinge", [9, y, 5.3], 0.09, 0.015, "iron");
  } else if (part === "drying-racks") for (const z of [-3, 0, 3]) rack(k, z);
  else {
    for (const z of [-5.4, 4.25]) {
      k.vessel("linen-washing-tub", [7.05, 0.05, z], 0.65, 0.78, "wood");
      k.cylinder("recessed-wash-water", [7.05, 0.61, z], 0.565, 0.02, "water", 0.565, 32);
      for (const y of [0.2, 0.67]) k.ring("washing-tub-binding", [7.05, y, z], 0.66, 0.024, "iron");
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        k.beam(
          "washing-tub-stave-joint",
          [7.05 + Math.cos(a) * 0.652, 0.1, z + Math.sin(a) * 0.652],
          [7.05 + Math.cos(a) * 0.652, 0.8, z + Math.sin(a) * 0.652],
          0.006,
          "oak"
        );
      }
      k.beam("linen-washing-paddle", [6.8, 0.18, z], [7.5, 1.14, z + 0.12], 0.045, "wood", true);
      k.box("paddle-blade", [6.85, 0.3, z], [0.15, 0.28, 0.045], "wood");
    }
    k.box("clean-linen-bench", [5.6, 0.52, -5.4], [1.1, 0.12, 1.2], "wood");
    for (const x of [5.22, 5.98])
      for (const z of [-5.8, -5]) k.box("linen-bench-leg", [x, 0.255, z], [0.1, 0.51, 0.1], "oak");
    for (let i = 0; i < 4; i++)
      k.box("folded-clean-linen", [5.6, 0.62 + i * 0.08, -5.4], [0.9, 0.08, 1], i % 2 ? "cloth" : "white");
  }
  return k.finish();
}
