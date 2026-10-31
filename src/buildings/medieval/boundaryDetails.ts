import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Position } from "./modelKit";

export function createHighTimberFence() {
  const k = new ModelKit("timber-fence-high");
  for (let i = 0; i < 4; i++) {
    const x = -2 + (i * 4) / 3;
    k.box("split-oak-post", [x, 0.66, 0], [0.18, 1.32, 0.18]);
    const cap = k.cylinder("weathered-post-cap", [x, 1.38, 0], 0.128, 0.12, "oak", 0, 4);
    cap.rotation.y = Math.PI / 4;
    for (const y of [0.53, 1.12]) {
      k.box("mortise-reveal", [x, y, 0.095], [0.125, 0.18, 0.012], "dark");
      k.cylinder("drawbore-peg", [x, y + 0.04, 0.11], 0.018, 0.045, "wood", 0.018, 8).rotation.x = Math.PI / 2;
    }
    for (const dx of [-0.055, 0.035])
      k.beam("post-check", [x + dx, 0.13, 0.092], [x + dx + 0.012, 0.98, 0.092], 0.008, "dark");
  }
  for (let bay = 0; bay < 3; bay++) {
    const a = -2 + (bay * 4) / 3,
      b = a + 4 / 3;
    for (const y of [0.53, 1.12]) {
      const section = new THREE.Shape();
      section.moveTo(-0.055, -0.075);
      section.lineTo(0.055, -0.065);
      section.lineTo(0.045, 0.08);
      section.lineTo(-0.05, 0.065);
      section.closePath();
      const rail = k.add(
        "cleft-rail",
        new THREE.ExtrudeGeometry(section, { depth: b - a + 0.12, bevelEnabled: false }),
        "wood"
      );
      rail.rotation.y = Math.PI / 2;
      rail.position.set(a - 0.06, y, 0);
      for (const offset of [-0.03, 0.03])
        k.beam("split-grain", [a + 0.12, y + offset, 0.057], [b - 0.12, y + offset + 0.012, 0.057], 0.006, "oak");
    }
  }
  return compactModel(k.finish());
}

/** Rods pass alternately in front of and behind each stake, with visible air between courses. */
export function createHighWattleFence() {
  const k = new ModelKit("wattle-fence-high");
  const pitch = 0.4;
  for (let i = 0; i <= 10; i++) {
    const x = -2 + i * pitch;
    k.cylinder("hazel-stake", [x, 0.69, 0], 0.032, 1.38, "oak", 0.021, 9);
    k.cylinder("stake-tip", [x, 1.405, 0], 0.021, 0.05, "wood", 0, 9);
    for (const y of [0.25, 1.16]) {
      const knot = k.ring("willow-binding", [x, y, 0], 0.038, 0.008, "wood");
      knot.scale.z = 2.1;
    }
  }
  for (let row = 0; row < 20; row++) {
    const y = 0.11 + row * 0.062;
    const points: Position[] = Array.from({ length: 81 }, (_, i) => {
      const x = -2.035 + (i * 4.07) / 80;
      return [
        x,
        y + 0.008 * Math.sin(i * 0.4 + row),
        0.063 * Math.cos(((x + 2) * Math.PI) / pitch) * (row % 2 ? -1 : 1)
      ];
    });
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    k.add(
      "woven-withy",
      new THREE.TubeGeometry(curve, 120, 0.018 + (row % 3) * 0.001, 6, false),
      row % 3 ? "wood" : "oak"
    );
  }
  return compactModel(k.finish());
}

export function createHighTimberGate() {
  const k = new ModelKit("simple-timber-gate-high");
  for (const x of [-1.1, 1.1]) {
    k.box("hewn-gate-post", [x, 0.81, 0], [0.19, 1.62, 0.19]);
    const cap = k.cylinder("post-cap", [x, 1.67, 0], 0.135, 0.1, "oak", 0, 4);
    cap.rotation.y = Math.PI / 4;
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.87 + i * 0.29;
    const board = new THREE.Shape();
    board.moveTo(-0.12, 0.16);
    board.lineTo(0.12, 0.16);
    board.lineTo(0.12, 1.38);
    board.lineTo(0.02, 1.48);
    board.lineTo(-0.12, 1.43);
    board.closePath();
    const mesh = k.add(
      "cleft-gate-pale",
      new THREE.ExtrudeGeometry(board, { depth: 0.065, bevelEnabled: false }),
      "wood"
    );
    mesh.position.set(x, 0, -0.0325);
    for (const y of [0.38, 1.16]) k.sphere("rosehead-nail", [x, y, 0.042], [0.022, 0.022, 0.01], "iron");
    k.beam("pale-grain", [x - 0.065, 0.2, 0.034], [x - 0.05, 1.3, 0.034], 0.006, "oak");
  }
  for (const y of [0.38, 1.16]) {
    k.box("tenoned-ledge", [0, y, -0.09], [2, 0.14, 0.1]);
    k.box("forged-strap", [-0.55, y, 0.065], [0.99, 0.065, 0.03], "iron");
    k.cylinder("hinge-pintle", [-1.02, y, 0.07], 0.037, 0.19, "iron", 0.037, 12);
    for (const x of [-0.91, -0.65, -0.3]) k.sphere("hinge-rivet", [x, y, 0.087], [0.018, 0.018, 0.012], "iron");
  }
  k.beam("compression-brace", [-0.94, 0.43, -0.11], [0.93, 1.12, -0.11], 0.12);
  for (const [x, y] of [
    [-0.87, 0.47],
    [0.86, 1.1]
  ])
    k.cylinder("brace-peg", [x, y, -0.18], 0.022, 0.025, "wood", 0.022, 8).rotation.x = Math.PI / 2;
  k.box("latch-bar", [0.92, 0.92, 0.1], [0.42, 0.065, 0.07], "oak");
  k.box("latch-keeper", [1.1, 0.92, 0.135], [0.065, 0.17, 0.06], "iron");
  k.ring("latch-pull", [0.79, 0.85, 0.13], 0.065, 0.012, "iron", true);
  return compactModel(k.finish());
}
