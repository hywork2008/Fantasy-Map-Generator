import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Surface } from "./modelKit";

function trough(k: ModelKit, x: number, z: number, width: number, y = 0.55, surface: Surface = "wood") {
  k.box("manger-bottom", [x, y, z], [width, 0.1, 0.5], surface);
  for (const side of [-1, 1]) {
    k.box("manger-long-rim", [x, y + 0.2, z + side * 0.25], [width + 0.08, 0.4, 0.08], surface);
    k.box("manger-end", [x + (side * width) / 2, y + 0.2, z], [0.08, 0.4, 0.5], surface);
    k.box("manger-foot", [x + side * width * 0.36, y / 2, z], [0.12, y, 0.4], "oak");
  }
  for (let i = 0; i < 8; i++)
    k.beam(
      "manger-hay",
      [x - width * 0.4 + i * width * 0.1, y + 0.12, z - 0.12],
      [x - width * 0.4 + i * width * 0.1 + 0.1, y + 0.28, z + 0.12],
      0.045,
      "straw",
      true
    );
}

function boardedWall(k: ModelKit, x: number, z: number, length: number, base: number, top: number, side = false) {
  for (let u = -length / 2 + 0.11; u < length / 2; u += 0.23) {
    k.box(
      "weatherboard",
      [x + (side ? 0 : u), (top + base) / 2, z + (side ? u : 0)],
      side ? [0.075, top - base, 0.215] : [0.215, top - base, 0.075],
      "wood"
    );
    for (const y of [base + 0.15, top - 0.15])
      k.box("board-peg", [x + (side ? 0.045 : u), y, z + (side ? u : 0.045)], [0.025, 0.025, 0.025], "oak");
  }
}

/** Individual staggered stones leave shallow mortar joints, without closing specified doorways. */
function stoneWall(
  k: ModelKit,
  x: number,
  z: number,
  length: number,
  height: number,
  side = false,
  door = 0,
  doorHeight = 0
) {
  const rows = Math.ceil(height / 0.28),
    course = height / rows;
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * course;
    const segments = Math.ceil(length / 0.55);
    const joints = [-length / 2];
    for (let i = 1; i < segments; i++) joints.push(-length / 2 + ((i + (row % 2 ? 0.35 : -0.1)) * length) / segments);
    joints.push(length / 2);
    for (let i = 0; i < joints.length - 1; i++) {
      const intervals =
        y - course / 2 < doorHeight
          ? [
              [joints[i], Math.min(joints[i + 1], -door / 2)],
              [Math.max(joints[i], door / 2), joints[i + 1]]
            ]
          : [[joints[i], joints[i + 1]]];
      for (const [a, b] of intervals) {
        if (b - a < 0.025) continue;
        const u = (a + b) / 2,
          len = b - a - 0.012;
        k.box(
          "coursed-wall-stone",
          [x + (side ? 0 : u), y, z + (side ? u : 0)],
          side ? [0.3, course - 0.012, len] : [len, course - 0.012, 0.3],
          row % 4 === 0 ? "white" : "stone"
        );
      }
    }
  }
}

function roof(k: ModelKit, w: number, d: number, cz: number, eave: number, rise: number, thatch = false, vent = false) {
  const half = d / 2 + 0.3,
    length = w + 0.6;
  for (const side of [-1, 1]) {
    const gap = vent ? 0.16 : 0;
    const positions = [
      -length / 2,
      eave + rise - (rise * gap) / half,
      cz + side * gap,
      length / 2,
      eave + rise - (rise * gap) / half,
      cz + side * gap,
      length / 2,
      eave,
      cz + side * half,
      -length / 2,
      eave,
      cz + side * half
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    k.add("pitched-roof-skin", geo, thatch ? "thatch" : "wood");
    for (let row = 0; row < 12; row++) {
      const t = 0.06 + row * 0.078,
        y = eave + rise * (1 - t) + 0.035,
        z = cz + side * half * t;
      if (thatch) {
        k.beam("thatch-ligger", [-length / 2, y, z], [length / 2, y, z], 0.045, "oak", true);
        for (let x = -w / 2; x < w / 2; x += 0.45)
          k.beam(
            "thatch-fibre",
            [x, y + 0.025, z],
            [x + 0.035, y - rise * 0.06, z + side * half * 0.06],
            0.012,
            "straw",
            true
          );
      } else {
        for (let x = -length / 2 + 0.16 + (row % 2) * 0.15; x < length / 2 - 0.05; x += 0.32) {
          const shingle = k.box("overlapping-shingle", [x, y, z], [0.3, 0.045, half * 0.095], "wood");
          shingle.rotation.x = side * Math.atan2(rise, half);
        }
      }
    }
    for (const x of [-length / 2, length / 2])
      k.beam("gable-bargeboard", [x, eave, cz + side * half], [x, eave + rise, cz], 0.13, "oak");
  }
  k.beam(
    vent ? "raised-vent-ridge" : "ridge-cap",
    [-length / 2, eave + rise + 0.15, cz],
    [length / 2, eave + rise + 0.15, cz],
    0.15,
    thatch ? "thatch" : "oak",
    true
  );
  for (const x of [-w / 2, 0, w / 2]) {
    for (const side of [-1, 1])
      k.beam("roof-rafter", [x, eave - 0.07, cz + (side * d) / 2], [x, eave + rise - 0.07, cz], 0.13);
    k.beam("roof-tie", [x, eave - 0.1, cz - d / 2], [x, eave - 0.1, cz + d / 2], 0.17);
  }
}

function pen(k: ModelKit, a: readonly [number, number], b: readonly [number, number], h: number) {
  const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.7);
  for (let i = 0; i <= count; i++) {
    const t = i / count,
      x = a[0] + (b[0] - a[0]) * t,
      z = a[1] + (b[1] - a[1]) * t;
    k.box("pen-post", [x, h / 2, z], [0.1, h, 0.1]);
    for (const y of [h * 0.35, h * 0.8]) k.box("rail-peg", [x, y, z + 0.06], [0.025, 0.025, 0.025], "wood");
  }
  for (const y of [h * 0.35, h * 0.8]) k.beam("pen-rail", [a[0], y, a[1]], [b[0], y, b[1]], 0.09, "wood");
}

export function createHighStable() {
  const k = new ModelKit("village-stable-high");
  k.box("compacted-floor", [0, 0.05, -1], [10, 0.1, 6], "earth");
  boardedWall(k, 0, -3.95, 10, 0.14, 3);
  for (const x of [-4.95, 4.95]) boardedWall(k, x, -1, 6, 0.14, 3, true);
  for (const x of [-5, -2.5, 0, 2.5, 5]) {
    for (const z of [-4, 2]) {
      k.box("stone-foot", [x, 0.12, z], [0.38, 0.24, 0.38], "stone");
      k.box("stall-post", [x, 1.58, z], [0.2, 2.92, 0.2]);
      for (const dx of [-0.55, 0.55])
        if (Math.abs(x + dx) < 5.1) k.beam("knee-brace", [x, 2.4, z], [x + dx, 2.95, z], 0.13);
    }
    if (Math.abs(x) === 5) continue;
    for (let z = -3.8; z < 1.4; z += 0.25) k.box("stall-partition-board", [x, 0.7, z], [0.07, 1.15, 0.235], "wood");
    for (const y of [0.25, 1.3]) k.beam("partition-rail", [x, y, -3.8], [x, y, 1.6], 0.11);
    for (let z = -3.7; z < 1.5; z += 0.3) k.cylinder("upper-stall-bar", [x, 1.65, z], 0.025, 0.65, "oak", 0.025, 8);
  }
  for (const x of [-3.75, -1.25, 1.25, 3.75]) {
    trough(k, x, -3.2, 1.65);
    for (let i = 0; i < 8; i++)
      k.beam(
        "sloped-hayrack-bar",
        [x - 0.72 + i * 0.2, 1.1, -3.6],
        [x - 0.72 + i * 0.2, 2, -3.35],
        0.045,
        "wood",
        true
      );
    k.beam("hayrack-top", [x - 0.8, 2, -3.35], [x + 0.8, 2, -3.35], 0.08);
    k.ring("tether-ring", [x, 1.45, -2.94], 0.085, 0.016, "iron", true);
    k.beam("tack-peg", [x + 0.85, 1.8, -3.85], [x + 0.85, 1.8, -3.55], 0.055, "wood", true);
    k.ring("hanging-halter", [x + 0.85, 1.6, -3.55], 0.16, 0.018, "leather", true);
  }
  for (const z of [-4, 2]) k.beam("wall-plate", [-5.15, 3, z], [5.15, 3, z], 0.22);
  roof(k, 10, 6, -1, 3.1, 1.65);
  pen(k, [-5, 3], [-1, 3], 1.15);
  pen(k, [1, 3], [5, 3], 1.15);
  return compactModel(k.finish());
}

export function createHighByre() {
  const k = new ModelKit("cattle-byre-high");
  k.box("byre-floor", [0, 0.05, -1], [9.8, 0.1, 5.3], "earth");
  stoneWall(k, 0, -3.7, 10, 2.7);
  stoneWall(k, 0, 1.7, 10, 2.7, false, 2.5, 2.25);
  for (const x of [-4.85, 4.85]) stoneWall(k, x, -1, 5.4, 2.7, true);
  k.box("door-oak-lintel", [0, 2.38, 1.7], [2.95, 0.25, 0.4]);
  for (const x of [-1.32, 1.32]) k.box("door-jamb", [x, 1.13, 1.72], [0.16, 2.26, 0.35]);
  for (const x of [-3.3, -1.1, 1.1, 3.3]) {
    trough(k, x, -2.9, 1.7, 0.65);
    for (let i = 0; i < 7; i++)
      k.beam("fodder-rack-bar", [x - 0.7 + i * 0.22, 1, -3.3], [x - 0.7 + i * 0.22, 1.9, -3.05], 0.045, "wood", true);
    k.ring("tether-ring", [x, 1.4, -2.55], 0.08, 0.015, "iron", true);
  }
  // Side-open gutter: two lips and a depressed bed, not a solid dark strip.
  k.box("gutter-bed", [2.9, 0.025, 2.55], [3.7, 0.05, 0.44], "earth");
  for (const z of [2.28, 2.82]) k.box("gutter-stone-lip", [2.9, 0.13, z], [3.7, 0.26, 0.12], "stone");
  roof(k, 10, 5.5, -1, 2.85, 1.65, true, true);
  return compactModel(k.finish());
}

export function createHighPigsty() {
  const k = new ModelKit("pigsty-high");
  k.box("sty-floor", [0, 0.04, -1.5], [4.5, 0.08, 3], "earth");
  stoneWall(k, 0, -2.9, 4.5, 1.45);
  stoneWall(k, 0, -0.1, 4.5, 1.45, false, 0.9, 1.02);
  for (const x of [-2.1, 2.1]) stoneWall(k, x, -1.5, 2.8, 1.45, true);
  k.box("animal-opening-lintel", [0, 1.12, -0.1], [1.22, 0.2, 0.36], "stone");
  roof(k, 4.5, 3, -1.5, 1.52, 0.82);
  for (let i = 0; i < 25; i++)
    k.beam(
      "straw-bedding",
      [-1.5 + (i % 5) * 0.23, 0.15, -2.3 + Math.floor(i / 5) * 0.28],
      [-1.25 + (i % 5) * 0.23, 0.15, -2.2 + Math.floor(i / 5) * 0.28],
      0.018,
      "straw",
      true
    );
  pen(k, [-2.2, 0], [-2.2, 3], 0.95);
  pen(k, [2.2, 0], [2.2, 3], 0.95);
  pen(k, [-2.2, 3], [1.2, 3], 0.95);
  // Service wicket leaves a distinct human entrance to the pen.
  for (let i = 0; i < 4; i++) k.box("pen-gate-pale", [1.35 + i * 0.23, 0.5, 3], [0.13, 0.78, 0.07], "wood");
  k.beam("pen-gate-brace", [1.27, 0.2, 2.93], [2.12, 0.8, 2.93], 0.07);
  for (const y of [0.25, 0.75]) k.box("pen-gate-hinge", [1.3, y, 3.05], [0.3, 0.04, 0.025], "iron");
  trough(k, 0, 2.15, 1.45, 0.16);
  return compactModel(k.finish());
}

export function createHighChickenCoop() {
  const k = new ModelKit("chicken-coop-high");
  for (const x of [-0.95, 0.95])
    for (const z of [-0.8, 0.8]) {
      k.box("stone-pad", [x, 0.08, z], [0.28, 0.16, 0.28], "stone");
      k.box("raised-coop-post", [x, 0.62, z], [0.13, 1.08, 0.13]);
      k.beam("underfloor-brace", [x, 0.3, z], [x * 0.4, 1, z], 0.08);
    }
  for (let x = -1.02; x < 1.1; x += 0.18) k.box("coop-floorboard", [x, 1.08, 0], [0.17, 0.1, 1.9], "wood");
  boardedWall(k, 0, -0.92, 2.2, 1.15, 2.25);
  boardedWall(k, -1.05, 0, 1.9, 1.15, 2.25, true);
  for (const z of [-0.77, 0.77]) boardedWall(k, 1.05, z, 0.36, 1.15, 2.25, true);
  boardedWall(k, 1.05, 0, 1.18, 1.7, 2.25, true);
  boardedWall(k, 1.05, 0, 1.18, 1.15, 1.2, true);
  for (const side of [-1, 1]) boardedWall(k, side * 0.7, 0.93, 0.8, 1.15, 2.25);
  boardedWall(k, 0, 0.93, 0.6, 1.78, 2.25);
  for (let x = -0.9; x <= 0.9; x += 0.18) k.box("ventilation-slat", [x, 2.32, 0.93], [0.1, 0.13, 0.06], "wood");
  k.box("pop-hole-threshold", [0, 1.13, 0.96], [0.64, 0.1, 0.18]);
  k.box("sliding-pop-hole-door", [0.62, 1.48, 1.01], [0.55, 0.66, 0.05], "wood");
  for (const y of [1.13, 1.85]) k.box("door-runner", [0.3, y, 1.04], [1.25, 0.045, 0.09]);
  k.beam("roosting-perch", [-0.9, 1.5, -0.3], [0.9, 1.5, -0.3], 0.065, "wood", true);
  // External nesting boxes have hollow compartments and a weather-shedding lid.
  k.box("nest-box-floor", [1.35, 1.17, 0], [0.65, 0.08, 1.14], "wood");
  for (const z of [-0.56, 0, 0.56]) k.box("nest-box-divider", [1.35, 1.4, z], [0.65, 0.46, 0.06], "wood");
  k.box("nest-box-outer-wall", [1.65, 1.4, 0], [0.06, 0.46, 1.14], "wood");
  const lid = k.box("nest-box-lid", [1.35, 1.69, 0], [0.8, 0.07, 1.28], "wood");
  lid.rotation.z = -0.15;
  for (const z of [-0.3, 0.3]) k.box("nest-lid-hinge", [1.03, 1.74, z], [0.08, 0.025, 0.12], "iron");
  roof(k, 2.2, 1.9, 0, 2.42, 0.65);
  const ramp = k.box("access-ramp", [0, 0.62, 1.78], [0.48, 0.07, 1.95], "wood");
  ramp.rotation.x = Math.atan2(1, 1.67);
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const cleat = k.box("ramp-cleat", [0, 0.18 + t, 2.6 - t * 1.67], [0.5, 0.055, 0.07], "oak");
    cleat.rotation.x = ramp.rotation.x;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = 0.1 + i * 0.45;
      k.cylinder("run-stake", [side * 1.7, 0.39, z], 0.025, 0.78, "oak", 0.018, 8);
    }
    for (let row = 0; row < 9; row++) {
      const points = Array.from({ length: 29 }, (_, i): readonly [number, number, number] => [
        side * 1.7 + 0.045 * Math.cos((i * Math.PI) / 4) * (row % 2 ? -1 : 1),
        0.1 + row * 0.07,
        0.1 + (i * 2.7) / 28
      ]);
      k.tube("run-wattle", points, 0.012, "wood");
    }
  }
  pen(k, [-1.7, 2.9], [1.7, 2.9], 0.7);
  return compactModel(k.finish());
}
