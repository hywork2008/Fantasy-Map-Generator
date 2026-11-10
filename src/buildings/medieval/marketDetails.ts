import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Surface } from "./modelKit";

/** A draped surface with smooth normals and real folds; the grid is stable across renders. */
function fabric(
  k: ModelKit,
  name: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  height: (u: number, v: number) => number,
  surface: Surface
) {
  const positions: number[] = [],
    indices: number[] = [];
  const nx = 8,
    nz = 14;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const u = i / nx,
        v = j / nz;
      positions.push(x0 + (x1 - x0) * u, height(u, v), z0 + (z1 - z0) * v);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        d = a + nx + 1,
        c = d + 1;
      indices.push(a, c, b, a, d, c);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return k.add(name, geometry, surface);
}

export function frame(k: ModelKit, pitched: boolean) {
  for (const x of [-1.85, 1.85])
    for (const z of [-1.3, 1.3]) {
      const h = pitched ? 2.55 : 2.95 - z * 0.1;
      k.box("post-foot", [x, 0.06, z], [0.22, 0.12, 0.22], "oak");
      k.box("demountable-post", [x, h / 2, z], [0.12, h, 0.12]);
      k.beam("tenoned-knee-brace", [x, h - 0.65, z], [x - Math.sign(x) * 0.55, h - 0.1, z], 0.09);
      for (const y of [0.25, h - 0.2]) k.box("post-peg", [x, y, z + 0.07], [0.026, 0.026, 0.025], "wood");
    }
  for (const z of [-1.3, 1.3])
    k.beam(
      "canopy-cross-rail",
      [-1.95, pitched ? 2.55 : 2.95 - z * 0.1, z],
      [1.95, pitched ? 2.55 : 2.95 - z * 0.1, z],
      0.12
    );
  for (const x of [-1.85, 1.85]) {
    if (pitched) {
      for (const side of [-1, 1]) k.beam("roof-rafter", [x, 2.55, side * 1.55], [x, 3.25, 0], 0.1);
    } else k.beam("side-support", [x, 3.1, -1.5], [x, 2.8, 1.5], 0.1);
    for (const z of [-1.3, 1.3]) {
      k.beam(
        "tension-rope",
        [x, pitched ? 2.5 : 2.95 - z * 0.1, z],
        [Math.sign(x) * 2.28, 0.1, z + Math.sign(z) * 0.3],
        0.018,
        "cloth",
        true
      );
      k.cylinder("ground-peg", [Math.sign(x) * 2.28, 0.07, z + Math.sign(z) * 0.3], 0.035, 0.14, "oak", 0.025, 8);
    }
  }
  if (pitched) k.beam("ridge-pole", [-2.05, 3.24, 0], [2.05, 3.24, 0], 0.1);
}

export function counter(k: ModelKit) {
  for (let x = -1.7; x < 1.8; x += 0.24) k.box("counter-top-plank", [x, 0.94, 1.02], [0.23, 0.09, 0.82], "wood");
  for (const x of [-1.5, 1.5]) {
    for (const z of [0.72, 1.32]) k.box("counter-leg", [x, 0.45, z], [0.1, 0.9, 0.1]);
    k.beam("counter-trestle-tie", [x, 0.24, 0.67], [x, 0.24, 1.37], 0.11);
  }
  k.beam("counter-stretcher", [-1.55, 0.3, 1.02], [1.55, 0.3, 1.02], 0.1);
}

export function awning(k: ModelKit, pitched: boolean) {
  const width = 4.2,
    count = 6;
  for (let stripe = 0; stripe < count; stripe++) {
    const x0 = -width / 2 + (stripe * width) / count,
      x1 = x0 + width / count;
    const height = (u: number, v: number) =>
      pitched
        ? 2.55 + 0.7 * (1 - Math.abs(2 * v - 1)) - 0.06 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
        : 3.13 - 0.36 * v - 0.1 * Math.sin(Math.PI * v) - 0.035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    fabric(k, "stitched-canvas-panel", x0, x1, -1.75, 1.75, height, stripe % 2 ? "white" : "cloth");
    for (const edge of [0, 1]) {
      const points = Array.from({ length: 17 }, (_, i): readonly [number, number, number] => [
        edge ? x1 : x0,
        height(edge, i / 16) + 0.006,
        -1.75 + (3.5 * i) / 16
      ]);
      k.tube("canvas-seam", points, 0.009, stripe % 2 ? "cloth" : "white");
    }
    const valance = new THREE.Shape();
    const top = height(0.5, 1);
    valance.moveTo(x0, top);
    valance.lineTo(x1, top);
    valance.lineTo(x1, top - 0.14);
    valance.quadraticCurveTo((x0 + x1) / 2, top - 0.34, x0, top - 0.14);
    valance.closePath();
    const mesh = k.add("scalloped-valance", new THREE.ShapeGeometry(valance, 10), stripe % 2 ? "white" : "cloth");
    mesh.position.z = 1.75;
    for (const x of [x0 + 0.04, x1 - 0.04]) k.ring("canvas-eyelet", [x, top - 0.045, 1.76], 0.019, 0.005, "iron", true);
  }
}

function crate(k: ModelKit, x: number, z: number, w = 0.9) {
  for (let i = 0; i < 5; i++)
    k.box("crate-base-slat", [x - w / 2 + 0.08 + (i * (w - 0.16)) / 4, 0.08, z], [0.13, 0.1, 0.65], "wood");
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++)
      k.box("crate-long-slat", [x, 0.18 + row * 0.11, z + side * 0.33], [w, 0.085, 0.04], "wood");
    for (const zz of [-0.31, 0.31])
      k.box("crate-corner-batten", [x + side * (w / 2 - 0.04), 0.28, z + zz], [0.065, 0.5, 0.065]);
    for (let row = 0; row < 3; row++)
      k.box("crate-end-slat", [x + (side * w) / 2, 0.18 + row * 0.11, z], [0.045, 0.085, 0.63], "wood");
    for (const zz of [-0.24, 0.24])
      k.box("crate-handle-cheek", [x + (side * w) / 2, 0.49, z + zz], [0.045, 0.09, 0.17], "wood");
  }
}

export function createHighProduceStall() {
  const k = new ModelKit("market-produce-stall-high");
  frame(k, false);
  awning(k, false);
  counter(k);
  for (let bin = 0; bin < 3; bin++) {
    const x = -1.15 + bin * 1.12;
    k.box("display-bin-base", [x, 1.015, 1.02], [1.02, 0.055, 0.68], "wood");
    for (const side of [-1, 1]) {
      k.box("display-bin-rim", [x, 1.12, 1.02 + side * 0.34], [1.04, 0.18, 0.035], "wood");
      k.box("display-bin-end", [x + side * 0.51, 1.12, 1.02], [0.035, 0.18, 0.68], "wood");
    }
    for (let i = 0; i < 15; i++) {
      const xx = x - 0.37 + (i % 5) * 0.18,
        z = 0.8 + Math.floor(i / 5) * 0.19;
      if (bin === 0) {
        k.sphere("apple", [xx, 1.16, z], [0.09, 0.085, 0.085], i % 3 ? "green" : "tile");
        k.beam("fruit-stem", [xx, 1.23, z], [xx + 0.01, 1.27, z], 0.012, "wood", true);
      } else if (bin === 1) {
        const carrot = k.cylinder("root-vegetable", [xx, 1.13, z], 0.045, 0.25, "straw", 0.005, 8);
        carrot.rotation.x = 1.3;
        k.beam("root-leaf", [xx, 1.14, z - 0.12], [xx + 0.03, 1.24, z - 0.18], 0.018, "green", true);
      } else {
        k.sphere("cabbage-head", [xx, 1.16, z], [0.09, 0.08, 0.085], "green");
        const leaf = k.ring("cabbage-leaf-fold", [xx, 1.19, z], 0.065, 0.008, "green");
        leaf.rotation.z = 0.6;
      }
    }
  }
  crate(k, 1.15, -0.75);
  k.vessel("wicker-basket", [-1.18, 0, -0.7], 0.34, 0.52, "wood");
  for (let row = 0; row < 13; row++) k.ring("basket-weft", [-1.18, 0.05 + row * 0.036, -0.7], 0.343, 0.012, "oak");
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI) / 9;
    k.beam(
      "basket-stake",
      [-1.18 + Math.cos(a) * 0.35, 0.03, -0.7 + Math.sin(a) * 0.35],
      [-1.18 + Math.cos(a) * 0.35, 0.52, -0.7 + Math.sin(a) * 0.35],
      0.018,
      "wood",
      true
    );
  }
  // A small pan balance sits beside the goods, with suspended pans and fine chains.
  k.box("balance-foot", [1.9, 0.12, 0.1], [0.45, 0.24, 0.45], "oak");
  k.beam("balance-upright", [1.9, 0.24, 0.1], [1.9, 1.45, 0.1], 0.045, "iron", true);
  k.beam("balance-arm", [1.58, 1.4, 0.1], [2.22, 1.4, 0.1], 0.035, "iron", true);
  for (const x of [1.6, 2.2]) {
    k.vessel("weighing-pan", [x, 1.05, 0.1], 0.14, 0.04, "iron");
    for (const z of [-0.1, 0.1]) k.beam("pan-chain", [x, 1.4, 0.1], [x, 1.09, 0.1 + z], 0.008, "iron", true);
  }
  return compactModel(k.finish());
}

export function createHighGoodsBooth() {
  const k = new ModelKit("market-goods-booth-high");
  frame(k, true);
  awning(k, true);
  counter(k);
  for (let stack = 0; stack < 4; stack++)
    for (let layer = 0; layer < 4; layer++) {
      const x = -1.27 + stack * 0.66,
        y = 1.015 + layer * 0.075;
      const surface = stack % 2 ? "cloth" : "white";
      k.box("folded-textile", [x, y, 1.02], [0.57, 0.07, 0.58], surface);
      k.beam(
        "folded-selvedge",
        [x - 0.26, y + 0.02, 1.32],
        [x + 0.26, y + 0.02, 1.32],
        0.012,
        stack % 2 ? "white" : "cloth"
      );
      for (let fringe = 0; fringe < 12; fringe++)
        k.beam(
          "cloth-fringe",
          [x - 0.24 + fringe * 0.043, y, 1.31],
          [x - 0.24 + fringe * 0.043, y - 0.025, 1.37],
          0.006,
          surface,
          true
        );
    }
  for (const x of [-0.9, 0.2]) {
    const cloth = new THREE.BufferGeometry();
    const positions: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= 12; row++)
      for (let col = 0; col <= 16; col++) {
        const u = col / 16,
          v = row / 12;
        positions.push(
          x + (u - 0.5) * 0.9,
          2.35 - v * 1.15,
          -1.29 + 0.06 * Math.sin(u * Math.PI * 8) * (0.2 + v * 0.8)
        );
      }
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 16; col++) {
        const a = row * 17 + col;
        indices.push(a, a + 1, a + 18, a, a + 18, a + 17);
      }
    cloth.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    cloth.setIndex(indices);
    cloth.computeVertexNormals();
    k.add("hanging-draped-textile", cloth, x < 0 ? "cloth" : "white");
    for (let i = 0; i < 20; i++)
      k.beam(
        "hanging-textile-fringe",
        [x - 0.44 + i * 0.046, 1.2, -1.29],
        [x - 0.44 + i * 0.046, 1.1, -1.29],
        0.008,
        "cloth",
        true
      );
  }
  k.beam("textile-hanging-rail", [-1.55, 2.42, -1.3], [0.85, 2.42, -1.3], 0.055, "wood", true);
  for (const x of [-1.2, -0.6, 0, 0.6]) k.ring("cloth-suspension-loop", [x, 2.4, -1.3], 0.045, 0.008, "cloth", true);
  k.box("bolt-rack-base", [1.2, 0.09, -0.75], [1.2, 0.18, 0.48], "oak");
  for (const x of [0.65, 1.75]) k.box("bolt-rack-upright", [x, 0.4, -0.75], [0.08, 0.8, 0.16], "oak");
  for (let i = 0; i < 3; i++) {
    const roll = k.cylinder(
      "fabric-bolt",
      [1.2, 0.3 + i * 0.19, -0.75],
      0.12,
      0.9,
      i % 2 ? "cloth" : "white",
      0.12,
      24
    );
    roll.rotation.z = Math.PI / 2;
    for (const x of [0.9, 1.5]) {
      const tie = k.ring("bolt-binding", [x, 0.3 + i * 0.19, -0.75], 0.124, 0.009, "cloth", true);
      tie.rotation.y = Math.PI / 2;
    }
  }
  crate(k, -1.15, -0.55);
  for (let i = 0; i < 5; i++) k.box("stock-crate-lid", [-1.5 + i * 0.17, 0.56, -0.55], [0.16, 0.055, 0.7], "wood");
  for (const z of [-0.76, -0.34]) k.box("lid-batten", [-1.15, 0.6, z], [0.9, 0.045, 0.07], "oak");
  return compactModel(k.finish());
}
