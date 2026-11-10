import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Position } from "./modelKit";

/** Thick individual planks close the ends and preserve the open interior. */
export function createHighSmallBoat(fishing: boolean) {
  const k = new ModelKit(fishing ? "fishing-boat-high" : "rowing-boat-high");
  const length = fishing ? 5.5 : 3.8,
    half = fishing ? 0.94 : 0.72;
  const width = (t: number) => 0.035 + Math.sin(Math.PI * t) ** 0.7 * (half - 0.035);
  const point = (t: number, v: number, side: number, inner = false): Position => [
    (t - 0.5) * length,
    0.14 + 0.25 * (2 * t - 1) ** 2 + 0.77 * v ** 1.5 + 0.12 * Math.abs(2 * t - 1) * v + (inner ? 0.03 * (1 - v) : 0),
    side * (width(t) * v - (inner ? 0.032 * v : 0))
  ];
  for (const side of [-1, 1])
    for (let row = 0; row < 7; row++) {
      const lo = row / 7,
        hi = (row + 1) / 7,
        vertices: number[] = [];
      const quad = (a: Position, b: Position, c: Position, d: Position) =>
        vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 40; i++) {
        const a = i / 40,
          b = (i + 1) / 40;
        quad(point(a, lo, side), point(b, lo, side), point(b, hi, side), point(a, hi, side));
        quad(point(a, lo, side, true), point(a, hi, side, true), point(b, hi, side, true), point(b, lo, side, true));
        for (const v of [lo, hi])
          quad(point(a, v, side), point(a, v, side, true), point(b, v, side, true), point(b, v, side));
      }
      for (const t of [0, 1])
        quad(point(t, lo, side), point(t, hi, side), point(t, hi, side, true), point(t, lo, side, true));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      k.add("thick-clinker-strake", geometry, row % 2 ? "oak" : "wood").userData.modelPartId = "hull";
      k.tube(
        "overlapping-plank-land",
        Array.from({ length: 41 }, (_, i) => point(i / 40, hi, side)),
        0.018,
        "oak"
      );
      for (let i = 2; i < 39; i += 3) {
        const p = point(i / 40, hi, side);
        k.sphere("clench-nail-head", [p[0], p[1], p[2] + side * 0.016], [0.012, 0.012, 0.008], "iron");
      }
    }
  k.tube(
    "curved-keel",
    Array.from({ length: 41 }, (_, i): Position => [(i / 40 - 0.5) * length, 0.07 + 0.25 * ((2 * i) / 40 - 1) ** 2, 0]),
    0.07,
    "oak"
  );
  k.box("keel-grounding-shoe", [0, 0.035, 0], [0.65, 0.07, 0.11], "oak");
  for (const t of [0, 1]) {
    k.beam("stem-piece", [(t - 0.5) * length, 0.32, 0], [(t - 0.5) * length, 1.31, 0], 0.085, "oak");
    k.box("stem-cap", [(t - 0.5) * length, 1.325, 0], [0.14, 0.05, 0.13], "wood");
  }
  for (const side of [-1, 1])
    k.tube(
      "rounded-gunwale",
      Array.from({ length: 41 }, (_, i) => point(i / 40, 1, side)),
      0.042,
      "oak"
    );
  for (let i = 3; i <= 17; i += 2) {
    const t = i / 20,
      rib: Position[] = [];
    for (let j = 7; j >= 0; j--) {
      const p = point(t, j / 7, -1, true);
      rib.push([p[0], p[1] + 0.028, p[2] + 0.018]);
    }
    for (let j = 1; j <= 7; j++) {
      const p = point(t, j / 7, 1, true);
      rib.push([p[0], p[1] + 0.028, p[2] - 0.018]);
    }
    k.tube("bent-inner-frame", rib, 0.028, "oak");
  }
  for (let i = 0; i < 5; i++)
    k.box(
      "removable-floorboard",
      [0, 0.45, ((i - 2) * 0.13 * half) / 0.94],
      [length * (0.55 - Math.abs(i - 2) * 0.06), 0.055, (0.12 * half) / 0.94],
      "wood"
    );
  // Match the triangulated inner skin at the timber's underside, including its fore/aft extent.
  const innerWidthAt = (x: number, y: number) => {
    const station = (x / length + 0.5) * 40;
    const lo = Math.floor(station),
      fraction = station - lo;
    const section = (row: number) => {
      const a = point(lo / 40, row / 7, 1, true);
      const b = point((lo + 1) / 40, row / 7, 1, true);
      return [THREE.MathUtils.lerp(a[1], b[1], fraction), THREE.MathUtils.lerp(a[2], b[2], fraction)];
    };
    for (let row = 0; row < 7; row++) {
      const a = section(row),
        b = section(row + 1);
      if (y <= b[0]) return THREE.MathUtils.lerp(a[1], b[1], THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1));
    }
    return section(7)[1];
  };
  // Scribed ends follow the hull at every height; a small embed forms the timber joint.
  const fittedTimber = (x: number, bottom: number, top: number, side?: number) => {
    const vertices: number[] = [];
    const p = (i: number, j: number, edge: number): Position => {
      const xx = x - 0.14 + (i * 0.28) / 8;
      const y = bottom + (j * (top - bottom)) / 4;
      const end = innerWidthAt(xx, y) + 0.008;
      const z = side === undefined ? (edge ? end : -end) : side * (end - (edge ? 0 : 0.16));
      return [xx, y, z];
    };
    const quad = (a: Position, b: Position, c: Position, d: Position) =>
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        for (const edge of [0, 1]) quad(p(i, j, edge), p(i + 1, j, edge), p(i + 1, j + 1, edge), p(i, j + 1, edge));
      }
    for (let i = 0; i < 8; i++) for (const j of [0, 4]) quad(p(i, j, 0), p(i + 1, j, 0), p(i + 1, j, 1), p(i, j, 1));
    for (let j = 0; j < 4; j++) for (const i of [0, 8]) quad(p(i, j, 0), p(i, j + 1, 0), p(i, j + 1, 1), p(i, j, 1));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    k.add(
      side === undefined ? "hull-fitted-rowing-thwart" : "hull-fastened-thwart-cleat",
      geometry,
      side === undefined ? "wood" : "oak"
    ).userData.modelPartId = side === undefined ? "seating" : "seat-support";
  };
  for (const t of [0.28, 0.55, 0.77]) {
    const x = (t - 0.5) * length;
    fittedTimber(x, 0.775, 0.865);
    for (const side of [-1, 1]) {
      fittedTimber(x, 0.66, 0.78, side);
      for (const dx of [-0.09, 0.09]) {
        const y = 0.72,
          z = side * (innerWidthAt(x + dx, y) - 0.155);
        k.beam("cleat-fastening-peg", [x + dx, y, z], [x + dx, y, z + side * 0.15], 0.018, "wood", true);
      }
    }
  }
  for (const side of [-1, 1]) {
    const z = side * half;
    k.box("thole-pad", [0, 0.97, z], [0.34, 0.09, 0.14], "wood");
    for (const x of [-0.1, 0.1]) k.cylinder("thole-pin", [x, 1.1, z], 0.026, 0.25, "oak");
    k.beam("oar-leather-collar", [-0.06, 1.04, z - side * 0.06], [0.06, 1.04, z + side * 0.06], 0.073, "leather", true);
    k.beam("oar-shaft", [-0.6, 1.04, side * (half - 0.43)], [0.75, 1.04, side * (half + 0.55)], 0.05, "wood", true);
    k.beam("oar-handgrip", [-0.75, 1.04, side * (half - 0.54)], [-0.6, 1.04, side * (half - 0.43)], 0.044, "oak", true);
    const blade = k.box("flat-oar-blade", [0.92, 1.04, side * (half + 0.67)], [0.53, 0.035, 0.16], "wood");
    blade.rotation.y = (-side * Math.PI) / 4;
    k.tube(
      "oar-retaining-loop",
      [
        [-0.1, 1.05, z],
        [0, 1.12, z + side * 0.07],
        [0.1, 1.05, z],
        [0, 1.01, z - side * 0.07],
        [-0.1, 1.05, z]
      ],
      0.012,
      "cloth"
    );
  }
  // Low cargo stays on the floor and forward thwart, with no floating net sheet.
  if (fishing) {
    k.vessel("catch-basket", [-0.65, 0.4775, 0], 0.27, 0.34, "wood");
    for (let row = 0; row < 5; row++) k.ring("basket-weave", [-0.65, 0.5175 + row * 0.06, 0], 0.275, 0.012, "oak");
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      k.beam(
        "basket-upright",
        [-0.65 + Math.cos(a) * 0.274, 0.5075, Math.sin(a) * 0.274],
        [-0.65 + Math.cos(a) * 0.274, 0.7975, Math.sin(a) * 0.274],
        0.012,
        "wood",
        true
      );
    }
    for (let layer = 0; layer < 3; layer++) {
      const y = 0.49 + layer * 0.025;
      for (let i = 0; i < 15; i++)
        k.beam("folded-net-warp", [0.25 + i * 0.065, y, -0.22], [0.25 + i * 0.065, y, 0.22], 0.007, "cloth", true);
      for (let j = 0; j < 8; j++)
        k.beam("folded-net-weft", [0.25, y, -0.22 + j * 0.063], [1.16, y, -0.22 + j * 0.063], 0.007, "cloth", true);
    }
    for (let i = 0; i < 7; i++)
      k.sphere("wooden-net-float", [0.3 + i * 0.13, 0.58, 0.24], [0.048, 0.04, 0.033], "wood");
    for (let i = 0; i < 8; i++)
      k.sphere("net-stone-sinker", [0.3 + i * 0.11, 0.53, -0.25], [0.025, 0.025, 0.02], "stone");
  }
  for (let turn = 0; turn < 4; turn++)
    k.ring("mooring-rope-coil", [-length * 0.22, 0.875 + turn * 0.014, 0], 0.12 + turn * 0.016, 0.01, "cloth");
  return compactModel(k.finish());
}
