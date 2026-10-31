import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";

export type FuelStorageKind = "covered-firewood-stack" | "brushwood-faggots" | "charcoal-bin";

function shelter(k: ModelKit, w: number, d: number, eave: number, rise: number, lean = false) {
  const half = (d + 0.6) / 2,
    length = w + 0.6;
  const height = (z: number) => (lean ? eave + rise * (0.5 - z / (2 * half)) : eave + rise * (1 - Math.abs(z) / half));
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15])
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) {
      const h = height(z);
      k.box("shelter-stone-foot", [x, 0.08, z], [0.28, 0.16, 0.28], "stone");
      k.box("shelter-post", [x, (h + 0.12) / 2, z], [0.12, h - 0.12, 0.12]);
      k.beam("pegged-knee-brace", [x, h - 0.5, z], [x - Math.sign(x) * 0.4, h, z], 0.085);
    }
  for (const z of [-d / 2 + 0.1, d / 2 - 0.1])
    k.beam("wall-plate", [-w / 2, height(z), z], [w / 2, height(z), z], 0.14);
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
    if (lean) k.beam("lean-roof-rafter", [x, height(-half), -half], [x, height(half), half], 0.12);
    else for (const side of [-1, 1]) k.beam("pitched-roof-rafter", [x, eave, side * half], [x, eave + rise, 0], 0.12);
  }
  for (let x = -length / 2 + 0.12; x < length / 2 - 0.1; x += 0.23) {
    if (lean) {
      const board = k.box(
        "overlapping-roof-board",
        [x, eave + rise / 2, 0],
        [0.24, 0.05, Math.hypot(2 * half, rise)],
        "wood"
      );
      board.rotation.x = Math.atan2(rise, 2 * half);
      k.beam(
        "roof-board-grain",
        [x - 0.055, height(-half) + 0.03, -half],
        [x - 0.045, height(half) + 0.03, half],
        0.006,
        "oak"
      );
    } else
      for (const side of [-1, 1]) {
        const board = k.box(
          "overlapping-roof-board",
          [x, eave + rise / 2, (side * half) / 2],
          [0.24, 0.05, Math.hypot(half, rise)],
          "wood"
        );
        board.rotation.x = side * Math.atan2(rise, half);
        k.beam(
          "roof-board-grain",
          [x - 0.055, eave + rise + 0.03, 0],
          [x - 0.045, eave + 0.03, side * half],
          0.006,
          "oak"
        );
      }
  }
  if (!lean)
    k.beam(
      "roof-ridge-cap",
      [-length / 2, eave + rise + 0.04, 0],
      [length / 2, eave + rise + 0.04, 0],
      0.13,
      "wood",
      true
    );
}

function firewood(k: ModelKit) {
  for (const x of [-1.5, 1.5]) k.box("raised-stack-sleeper", [x, 0.12, 0], [0.26, 0.24, 1.8]);
  const section = new THREE.Shape();
  section.moveTo(-0.12, -0.08);
  section.lineTo(0.12, -0.08);
  section.lineTo(0, 0.13);
  section.closePath();
  const logGeometry = new THREE.ExtrudeGeometry(section, {
    depth: 1.3,
    bevelEnabled: true,
    bevelSize: 0.002,
    bevelThickness: 0.002,
    bevelSegments: 1
  });
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 10; col++) {
      const x = -1.55 + col * 0.33 + (row % 2) * 0.1,
        y = 0.322 + row * 0.21;
      const log = k.add("triangular-split-log", logGeometry, "wood");
      log.position.set(x, y, -0.65);
      k.box("retained-bark-strip", [x, y - 0.083, 0], [0.215, 0.008, 1.3], "oak");
      for (const z of [-0.654, 0.654]) {
        const points = [
          [-0.075, -0.045],
          [0.075, -0.045],
          [0, 0.08],
          [-0.075, -0.045]
        ];
        for (let i = 0; i < 3; i++)
          k.beam(
            "split-end-grain",
            [x + points[i][0], y + points[i][1], z],
            [x + points[i + 1][0], y + points[i + 1][1], z],
            0.004,
            "oak"
          );
      }
    }
  for (const x of [-1.85, 1.85])
    for (const z of [-0.75, 0.75]) {
      k.box("stack-end-retainer", [x, 1, z], [0.1, 1.7, 0.1]);
      k.beam("retainer-brace", [x, 0.28, z], [x - Math.sign(x) * 0.32, 1.5, z], 0.065);
    }
  shelter(k, 4.2, 2.7, 2.5, 0.55);
}

function faggots(k: ModelKit) {
  for (const z of [-0.55, 0.55]) k.box("brushwood-rack-sleeper", [0, 0.1, z], [3.4, 0.2, 0.2]);
  for (const x of [-1.45, 0, 1.45]) k.box("rack-crosspiece", [x, 0.22, 0], [0.12, 0.08, 1.55]);
  for (let row = 0; row < 2; row++)
    for (let bundle = 0; bundle < (row ? 4 : 5); bundle++) {
      const x = (row ? -0.9 : -1.2) + bundle * 0.6,
        y = 0.46 + row * 0.36;
      for (let branch = 0; branch < 37; branch++) {
        const a = branch * 2.4,
          r = branch === 0 ? 0 : 0.17 * Math.sqrt(branch / 36);
        const xx = x + Math.cos(a) * r,
          yy = y + Math.sin(a) * r;
        const kink = 0.018 * Math.sin(branch * 1.7 + bundle);
        k.beam("crooked-bundle-branch", [xx - kink, yy, -0.88], [xx + kink, yy + 0.025, 0], 0.04, "oak", true);
        k.beam(
          "tapered-bundle-tip",
          [xx + kink, yy + 0.025, 0],
          [xx, yy + 0.01, 0.9 + (branch % 3) * 0.025],
          0.03,
          "wood",
          true
        );
        if (branch % 3 === 0)
          k.beam(
            "branch-fork",
            [xx + kink, yy + 0.02, 0.58],
            [xx + 0.08 * Math.cos(a), yy + 0.07, 0.88],
            0.018,
            "wood",
            true
          );
        k.add("fresh-branch-cut", new THREE.CircleGeometry(0.019, 8), "wood").position.set(xx - kink, yy, -0.884);
      }
      for (const z of [-0.48, 0.48]) {
        const tie = k.ring("withy-binding", [x, y, z], 0.205, 0.013, "wood", true);
        tie.scale.y = 0.95;
        k.beam("binding-knot-tail", [x + 0.17, y + 0.12, z], [x + 0.25, y + 0.18, z + 0.05], 0.018, "oak", true);
        k.ring("withy-knot", [x + 0.17, y + 0.12, z], 0.028, 0.009, "oak", true);
      }
    }
  for (const x of [-1.65, 1.65])
    for (const z of [-0.55, 0.55]) k.box("rack-retainer", [x, 0.68, z], [0.08, 1.16, 0.08]);
}

function charcoal(k: ModelKit) {
  shelter(k, 3.8, 2.5, 2.6, 0.8, true);
  for (const x of [-1.7, 1.7])
    for (let row = 0; row < 5; row++) {
      k.box("charcoal-bay-side-board", [x, 0.17 + row * 0.25, 0], [0.075, 0.23, 2.2], "wood");
      for (const z of [-0.9, 0.9])
        k.box("side-board-nail", [x + Math.sign(x) * 0.045, 0.17 + row * 0.25, z], [0.025, 0.025, 0.025], "iron");
    }
  for (let row = 0; row < 5; row++)
    k.box("charcoal-bay-back-board", [0, 0.17 + row * 0.25, -1.1], [3.45, 0.23, 0.075], "wood");
  k.box("charcoal-base", [0, 0.16, 0], [3.2, 0.32, 1.95], "dark");
  const heap = k.add("charcoal-heap-core", new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), "dark");
  heap.scale.set(1.45, 0.52, 0.85);
  heap.position.set(0, 0.3, -0.1);
  const lumpGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 9; col++) {
      const x = -1.35 + col * 0.33,
        z = -0.8 + row * 0.29,
        v = (x / 1.45) ** 2 + ((z + 0.1) / 0.85) ** 2;
      if (v > 1) continue;
      const y = 0.3 + 0.52 * Math.sqrt(1 - v) - 0.04;
      const lump = k.add("angular-charcoal-piece", lumpGeometry, "dark");
      lump.position.set(x, y, z);
      lump.scale.set(0.14 + (col % 3) * 0.025, 0.12 + (row % 3) * 0.025, 0.16);
      lump.rotation.set(col * 0.7, row * 0.9, (col + row) * 0.4);
    }
  const blade = new THREE.Shape();
  blade.moveTo(-0.17, 0);
  blade.lineTo(0.17, 0);
  blade.lineTo(0.16, 0.25);
  blade.lineTo(0, 0.33);
  blade.lineTo(-0.16, 0.25);
  blade.closePath();
  k.add(
    "loading-shovel-blade",
    new THREE.ExtrudeGeometry(blade, { depth: 0.035, bevelEnabled: false }),
    "iron"
  ).position.set(2.1, 0, 0.85);
  k.beam("shovel-handle", [2.1, 0.25, 0.87], [1.65, 1.6, 0.25], 0.05, "wood", true);
  k.beam("shovel-cross-grip", [1.5, 1.6, 0.25], [1.8, 1.6, 0.25], 0.055, "wood", true);
}

export function createHighFuelStorage(kind: FuelStorageKind) {
  const k = new ModelKit(`${kind}-high`);
  if (kind === "covered-firewood-stack") firewood(k);
  else if (kind === "brushwood-faggots") faggots(k);
  else charcoal(k);
  return compactModel(k.finish());
}
