import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";

export function createHighFodderTrough(options: { filled?: boolean } = {}) {
  const k = new ModelKit("fodder-trough-high");
  for (const x of [-1, 1]) {
    for (const side of [-1, 1]) {
      k.box("trestle-foot", [x, 0.035, side * 0.43], [0.2, 0.07, 0.2]);
      k.beam("splayed-trestle-leg", [x, 0.07, side * 0.43], [x, 0.64, -side * 0.12], 0.115);
      k.cylinder("trestle-cross-peg", [x + 0.07, 0.4, 0], 0.025, 0.17, "wood", 0.025, 8).rotation.z = Math.PI / 2;
    }
    k.box("saddle-beam", [x, 0.53, 0], [0.16, 0.13, 0.49]);
  }
  k.beam("longitudinal-stretcher", [-1.12, 0.26, 0], [1.12, 0.26, 0], 0.1);
  for (const z of [-0.09, 0.09]) k.box("bottom-plank", [0, 0.59, z], [2.62, 0.09, 0.175], "wood");
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const y = 0.68 + row * 0.145;
      const z = side * (0.225 + row * 0.082);
      const plank = k.box("sloping-side-plank", [0, y, z], [2.64, 0.17, 0.06], "wood");
      plank.rotation.x = side * 0.51;
      for (const x of [-1.03, 1.03])
        k.sphere("forged-board-nail", [x, y, z + side * 0.037], [0.014, 0.014, 0.009], "iron");
    }
    k.beam("manger-rim", [-1.35, 1.05, side * 0.43], [1.35, 1.05, side * 0.43], 0.065);
  }
  for (const x of [-1.29, 1.29]) {
    const end = new THREE.Shape();
    end.moveTo(-0.18, 0.55);
    end.lineTo(0.18, 0.55);
    end.lineTo(0.46, 1.07);
    end.lineTo(-0.46, 1.07);
    end.closePath();
    const mesh = k.add(
      "trapezoid-end-board",
      new THREE.ExtrudeGeometry(end, { depth: 0.07, bevelEnabled: false }),
      "wood"
    );
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = x - 0.035;
    for (const z of [-0.3, 0.3]) k.box("end-board-strap", [x + 0.04, 0.88, z], [0.02, 0.29, 0.04], "iron");
  }
  for (let i = 0; i < 12; i++) {
    const x = -1.2 + (i * 2.4) / 11;
    k.beam("hayrack-spindle", [x, 0.91, -0.36], [x, 1.29, -0.49], 0.035, "wood", true);
  }
  k.beam("hayrack-top-rail", [-1.32, 1.3, -0.49], [1.32, 1.3, -0.49], 0.055);
  // Separate stems leave the feeding cavity visible between the fodder and side planks.
  for (let i = 0; i < (options.filled === false ? 0 : 315); i++) {
    const layer = Math.floor(i / 45),
      cell = i % 45;
    const x = -1.14 + (cell % 15) * 0.155;
    const z = -0.14 + Math.floor(cell / 15) * 0.11;
    const y = 0.65 + layer * 0.045 + Math.sin(i * 2.3) * 0.012;
    const angle = i * 2.4;
    k.beam(
      "loose-hay-stem",
      [x, y, z],
      [x + Math.cos(angle) * 0.18, y + 0.025, z + Math.sin(angle) * 0.1],
      0.014,
      "straw",
      true
    );
  }
  return compactModel(k.finish());
}

export function createHighStoneWaterTrough() {
  const k = new ModelKit("stone-water-trough-high");
  for (const x of [-0.95, 0.95]) k.box("stone-sleeper", [x, 0.1, 0], [0.38, 0.2, 1.14], "stone");
  k.box("basin-floor", [0, 0.27, 0], [2.8, 0.16, 1.04], "stone");
  const ring = new THREE.Shape();
  ring.moveTo(-1.4, -0.52);
  ring.lineTo(1.4, -0.52);
  ring.lineTo(1.4, 0.52);
  ring.lineTo(-1.4, 0.52);
  ring.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-1.22, -0.34);
  hole.lineTo(-1.22, 0.34);
  hole.lineTo(1.22, 0.34);
  hole.lineTo(1.22, -0.34);
  hole.closePath();
  ring.holes.push(hole);
  const wall = k.add(
    "hollow-carved-basin",
    new THREE.ExtrudeGeometry(ring, {
      depth: 0.31,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2
    }),
    "stone"
  );
  wall.rotation.x = -Math.PI / 2;
  wall.position.y = 0.34;
  for (const side of [-1, 1]) {
    k.box("long-rim", [0, 0.72, side * 0.43], [2.8, 0.14, 0.18], "stone");
    k.box("overflow-flanking-rim", [1.31, 0.72, side * 0.255], [0.18, 0.14, 0.17], "stone");
  }
  k.box("closed-end-rim", [-1.31, 0.72, 0], [0.18, 0.14, 0.68], "stone");
  k.box("overflow-spout-bed", [1.41, 0.64, 0], [0.25, 0.045, 0.18], "stone");
  for (const z of [-0.12, 0.12]) k.box("overflow-spout-lip", [1.41, 0.69, z], [0.25, 0.1, 0.06], "stone");
  const water = k.add("water-surface", new THREE.PlaneGeometry(2.41, 0.67), "water");
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.575;
  for (const radius of [0.08, 0.16, 0.25]) {
    const ripple = k.ring("water-ripple", [-0.65, 0.577, 0], radius, 0.003, "water");
    ripple.scale.z = 0.72;
  }
  for (let i = 0; i < 28; i++) {
    const x = -1.27 + i * 0.095;
    k.beam(
      "stone-chisel-mark",
      [x, 0.42 + (i % 3) * 0.04, 0.534],
      [x + 0.025, 0.48 + (i % 3) * 0.04, 0.534],
      0.008,
      "white"
    );
  }
  return compactModel(k.finish());
}
