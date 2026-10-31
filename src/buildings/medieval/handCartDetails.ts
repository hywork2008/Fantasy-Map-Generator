import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";

export type HandCartKind = "two-wheel-farm-cart" | "wooden-wheelbarrow" | "two-person-handbarrow";

/** Separate felloes, dished spokes, bored hub and tyre; the wheel turns about world Z. */
function wheel(k: ModelKit, x: number, y: number, z: number, r: number, side: number) {
  const felloeR = r - 0.025,
    inner = r - 0.105;
  for (let segment = 0; segment < 8; segment++) {
    const start = (segment * Math.PI) / 4 + 0.008,
      end = ((segment + 1) * Math.PI) / 4 - 0.008;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, felloeR, start, end, false);
    shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
    shape.absarc(0, 0, inner, end, start, true);
    shape.closePath();
    const mesh = k.add(
      "segmented-wheel-felloe",
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.095,
        bevelEnabled: true,
        bevelSize: 0.004,
        bevelThickness: 0.004,
        bevelSegments: 1,
        curveSegments: 4
      }),
      "wood"
    );
    mesh.position.set(x, y, z - 0.0475);
    const a = (start + end) / 2;
    k.sphere(
      "felloe-rivet",
      [x + Math.cos(a) * (r - 0.065), y + Math.sin(a) * (r - 0.065), z + side * 0.058],
      [0.017, 0.017, 0.012],
      "iron"
    );
  }
  const tyre = k.add("continuous-iron-tyre", new THREE.TorusGeometry(r - 0.018, 0.018, 8, 64), "iron");
  tyre.position.set(x, y, z);
  for (let spoke = 0; spoke < 12; spoke++) {
    const a = (spoke * Math.PI) / 6;
    const start: [number, number, number] = [x + Math.cos(a) * 0.09, y + Math.sin(a) * 0.09, z + side * 0.045];
    const end: [number, number, number] = [x + Math.cos(a) * inner, y + Math.sin(a) * inner, z];
    k.beam("dished-wheel-spoke", start, end, 0.048, "oak");
    k.cylinder("spoke-peg", [end[0], end[1], z + side * 0.054], 0.012, 0.022, "wood", 0.012, 8).rotation.x =
      Math.PI / 2;
  }
  const hub = new THREE.Shape();
  hub.absarc(0, 0, 0.12, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.043, 0, Math.PI * 2, true);
  hub.holes.push(bore);
  k.add(
    "bored-wheel-hub",
    new THREE.ExtrudeGeometry(hub, { depth: 0.25, bevelEnabled: false, curveSegments: 16 }),
    "oak"
  ).position.set(x, y, z - 0.125);
  for (const zz of [z - 0.09, z + 0.09]) k.ring("hub-iron-band", [x, y, zz], 0.123, 0.012, "iron", true);
  k.beam("axle-end", [x, y, z - side * 0.1], [x, y, z + side * 0.19], 0.065, "iron", true);
  k.beam("lynchpin", [x, y - 0.075, z + side * 0.17], [x, y + 0.075, z + side * 0.17], 0.025, "iron", true);
}

export function createHighHandCart(kind: HandCartKind) {
  const k = new ModelKit(`${kind}-high`);
  if (kind === "two-wheel-farm-cart") {
    for (const side of [-1, 1]) wheel(k, 0, 0.69, side * 0.94, 0.69, side);
    k.beam("forged-axle", [0, 0.69, -1.1], [0, 0.69, 1.1], 0.08, "iron", true);
    for (const z of [-0.54, 0.54]) k.box("cart-underframe", [0, 0.84, z], [2.55, 0.18, 0.15]);
    for (const x of [-0.95, 0, 0.95]) k.box("bed-cross-bearer", [x, 0.9, 0], [0.14, 0.14, 1.52]);
    for (let x = -1.15; x < 1.25; x += 0.2) k.box("cargo-bed-plank", [x, 1, 0], [0.19, 0.085, 1.4], "wood");
    for (const side of [-1, 1]) {
      const z = side * 0.74;
      for (let row = 0; row < 4; row++) {
        const y = 1.13 + row * 0.17;
        k.box("removable-side-board", [0, y, z], [2.5, 0.155, 0.055], "wood");
        for (const x of [-1.1, 0, 1.1])
          k.sphere("board-rosehead-nail", [x, y, z + side * 0.034], [0.016, 0.016, 0.012], "iron");
      }
      for (const x of [-1.1, 0, 1.1]) {
        k.box("side-stake", [x, 1.33, z + side * 0.06], [0.1, 0.85, 0.1]);
        k.box("stake-socket", [x, 0.99, z + side * 0.06], [0.14, 0.17, 0.13], "iron");
      }
      k.beam("draught-shaft", [0.1, 0.83, side * 0.58], [3.3, 0.88, side * 0.7], 0.1);
      k.beam(
        "rounded-shaft-grip",
        [3.15, 0.878, side * 0.695],
        [3.48, 0.884, side * (0.7 + (0.18 * 0.12) / 3.2)],
        0.09,
        "wood",
        true
      );
      k.beam("shaft-brace", [0.1, 0.82, side * 0.58], [1.2, 0.87, side * 0.05], 0.075);
      k.ring("harness-ring", [2.4, 0.91, side * 0.67], 0.065, 0.012, "iron", true);
    }
    for (const x of [-1.27, 1.27])
      for (let row = 0; row < 4; row++)
        k.box("tail-and-head-board", [x, 1.13 + row * 0.17, 0], [0.06, 0.155, 1.42], "wood");
    for (const z of [-0.5, 0.5]) {
      k.box("tailboard-hinge", [-1.31, 1.07, z], [0.025, 0.14, 0.08], "iron");
      k.ring("tailboard-latch", [-1.31, 1.62, z], 0.045, 0.009, "iron", true).rotation.y = Math.PI / 2;
    }
  } else if (kind === "wooden-wheelbarrow") {
    wheel(k, 1, 0.365, 0, 0.365, 1);
    k.beam("barrow-axle", [1, 0.365, -0.48], [1, 0.365, 0.48], 0.065, "iron", true);
    for (const side of [-1, 1]) {
      k.beam("barrow-shaft", [-1.85, 0.87, side * 0.4], [1.28, 0.45, side * 0.35], 0.095);
      k.beam("rounded-barrow-grip", [-1.92, 0.88, side * 0.402], [-1.5, 0.824, side * 0.395], 0.1, "wood", true);
      k.box("parking-foot", [-0.63, 0.045, side * 0.4], [0.19, 0.09, 0.18]);
      k.box("parking-leg", [-0.63, 0.36, side * 0.4], [0.1, 0.63, 0.1]);
      k.beam("parking-leg-brace", [-0.63, 0.18, side * 0.4], [-0.1, 0.65, side * 0.4], 0.07);
      k.box("axle-bearing-cheek", [1, 0.43, side * 0.35], [0.27, 0.22, 0.11]);
      for (let row = 0; row < 3; row++) {
        const board = k.box(
          "splayed-tray-side",
          [0, 0.8 + row * 0.145, side * (0.39 + row * 0.045)],
          [1.65, 0.17, 0.055],
          "wood"
        );
        board.rotation.x = side * 0.3;
        for (const x of [-0.66, 0.66])
          k.sphere("tray-nail", [x, 0.8 + row * 0.145, side * (0.43 + row * 0.045)], [0.012, 0.012, 0.012], "iron");
      }
    }
    for (let x = -0.73; x < 0.82; x += 0.2) k.box("tray-floorboard", [x, 0.71, 0], [0.19, 0.08, 0.75], "wood");
    for (const x of [-0.83, 0.83]) {
      const end = new THREE.Shape();
      end.moveTo(-0.37, 0.67);
      end.lineTo(0.37, 0.67);
      end.lineTo(0.55, 1.18);
      end.lineTo(-0.55, 1.18);
      end.closePath();
      const mesh = k.add(
        "trapezoid-tray-end",
        new THREE.ExtrudeGeometry(end, { depth: 0.06, bevelEnabled: false }),
        "wood"
      );
      mesh.rotation.y = Math.PI / 2;
      mesh.position.x = x - 0.03;
    }
  } else {
    for (const side of [-1, 1]) {
      k.box("carrying-pole", [0, 0.65, side * 0.45], [2.55, 0.11, 0.11]);
      for (const end of [-1, 1]) {
        k.beam(
          "rounded-carrying-grip",
          [end * 1.2, 0.65, side * 0.45],
          [end * 1.8, 0.65, side * 0.45],
          0.1,
          "wood",
          true
        );
        for (let turn = 0; turn < 8; turn++) {
          const binding = k.ring(
            "grip-whipping",
            [end * (1.48 + turn * 0.033), 0.65, side * 0.45],
            0.053,
            0.006,
            "cloth",
            true
          );
          binding.rotation.y = Math.PI / 2;
        }
        k.box("barrow-foot", [end * 0.7, 0.3, side * 0.45], [0.12, 0.6, 0.12]);
        k.box("foot-pad", [end * 0.7, 0.035, side * 0.45], [0.18, 0.07, 0.18]);
        k.beam("foot-knee-brace", [end * 0.7, 0.32, side * 0.45], [end * 0.98, 0.61, side * 0.45], 0.065);
      }
    }
    for (let i = 0; i < 10; i++) {
      const x = -0.9 + i * 0.2;
      k.box("carrying-deck-slat", [x, 0.75, 0], [0.18, 0.08, 1.07], "wood");
      for (const z of [-0.45, 0.45]) k.cylinder("deck-peg", [x, 0.799, z], 0.015, 0.018, "oak", 0.015, 8);
      k.beam("slat-grain", [x - 0.035, 0.792, -0.38], [x - 0.02, 0.792, 0.36], 0.005, "oak");
    }
  }
  return compactModel(k.finish());
}
