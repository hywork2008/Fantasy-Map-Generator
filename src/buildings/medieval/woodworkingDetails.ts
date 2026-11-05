import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import type { ModelKit, Position } from "./modelKit";
import { addCraftBench, addCraftShed } from "./workshopDetailKit";

function barrelRadius(t: number) {
  return 0.46 + Math.sin(Math.PI * t) * 0.13;
}

/** Curved, thick staves with closed end faces; omitted staves expose the assembly interior. */
function barrel(k: ModelKit, x: number, z: number, base: number, unfinished: boolean) {
  const height = 1.35,
    count = 20;
  for (let stave = 0; stave < (unfinished ? count - 5 : count); stave++) {
    const angle = (stave * Math.PI * 2) / count + Math.PI / 2,
      span = (Math.PI * 2) / count - 0.006;
    const vertices: number[] = [];
    const point = (t: number, a: number, inner: boolean): Position => {
      const radius = barrelRadius(t) - (inner ? 0.045 : 0);
      return [x + Math.cos(a) * radius, base + t * height, z + Math.sin(a) * radius];
    };
    const quad = (a: Position, b: Position, c: Position, d: Position) =>
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let row = 0; row < 8; row++) {
      const lo = row / 8,
        hi = (row + 1) / 8;
      quad(
        point(lo, angle, false),
        point(hi, angle, false),
        point(hi, angle + span, false),
        point(lo, angle + span, false)
      );
      quad(
        point(lo, angle, true),
        point(lo, angle + span, true),
        point(hi, angle + span, true),
        point(hi, angle, true)
      );
      for (const a of [angle, angle + span])
        quad(point(lo, a, true), point(hi, a, true), point(hi, a, false), point(lo, a, false));
    }
    for (const t of [0, 1])
      quad(point(t, angle, true), point(t, angle, false), point(t, angle + span, false), point(t, angle + span, true));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    k.add("shaped-barrel-stave", geo, stave % 3 === 0 ? "oak" : "wood");
  }
  for (const t of unfinished ? [0.14, 0.68] : [0.1, 0.32, 0.7, 0.9]) {
    const radius = barrelRadius(t) + 0.012;
    // A broad, flat band rather than a round wire hoop.
    const band = k.add("flat-iron-barrel-hoop", new THREE.CylinderGeometry(radius, radius, 0.065, 64, 1, true), "iron");
    band.position.set(x, base + t * height, z);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      k.sphere(
        "hoop-rivet",
        [x + Math.cos(a) * (radius + 0.008), base + t * height, z + Math.sin(a) * (radius + 0.008)],
        [0.014, 0.014, 0.014],
        "iron"
      );
    }
  }
  for (const t of unfinished ? [0.045] : [0.045, 0.955]) {
    const radius = 0.435;
    for (let i = 0; i < 7; i++) {
      const lo = -radius + (i * radius * 2) / 7 + 0.001;
      const hi = -radius + ((i + 1) * radius * 2) / 7 - 0.001;
      const outline: THREE.Vector2[] = [];
      for (const side of [-1, 1])
        for (let j = 0; j <= 12; j++) {
          const z = side < 0 ? lo + ((hi - lo) * j) / 12 : hi - ((hi - lo) * j) / 12;
          outline.push(new THREE.Vector2(side * Math.sqrt(Math.max(0, radius * radius - z * z)), z));
        }
      const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
        depth: 0.035,
        bevelEnabled: false,
        steps: 1
      });
      geometry.rotateX(Math.PI / 2);
      k.add("fitted-barrel-head-board", geometry, "wood").position.set(x, base + t * height + 0.0175, z);
    }
  }
  if (!unfinished) {
    k.cylinder("barrel-head-bung", [x + 0.14, base + height * 0.955 + 0.026, z], 0.045, 0.025, "oak");
  }
}

function drawknife(k: ModelKit, x: number, y: number, z: number) {
  k.beam("drawknife-edge", [x - 0.3, y, z], [x + 0.3, y, z], 0.035, "iron");
  for (const s of [-1, 1]) {
    k.beam("drawknife-tang", [x + s * 0.3, y, z], [x + s * 0.37, y, z + 0.11], 0.022, "iron", true);
    k.beam("drawknife-grip", [x + s * 0.37, y, z + 0.06], [x + s * 0.37, y, z + 0.24], 0.065, "wood", true);
  }
}

function cooper(k: ModelKit) {
  addCraftBench(k, -0.9, 0, 1.6, 1.4, 0.72);
  barrel(k, -0.9, 0, 0.72, true);
  barrel(k, 2.25, 0.3, 0.12, false);
  addCraftBench(k, -2.1, -1.95, 2, 0.7, 0.92);
  drawknife(k, -2.1, 0.952, -1.95);
  k.box("coopers-mallet-head", [-1.55, 0.99, -1.8], [0.28, 0.12, 0.14], "oak");
  k.beam("mallet-handle", [-1.55, 0.97, -1.75], [-1.55, 0.97, -1.4], 0.05, "wood", true);
  for (let i = 0; i < 7; i++) {
    const x = -2.9 + i * 0.17;
    k.tube(
      "loose-shaped-stave",
      [
        [x, 0.17, 0.7],
        [x, 0.24, 1.1],
        [x, 0.27, 1.5],
        [x, 0.24, 1.9],
        [x, 0.17, 2.3]
      ],
      0.045,
      i % 2 ? "oak" : "wood"
    );
  }
  for (let i = 0; i < 3; i++) k.ring("loose-hoop", [0.9, 0.05 + i * 0.07, 1.9], 0.48, 0.025, "iron");
  addCraftBench(k, -1.6, 1.7, 0.38, 1.45, 0.47);
  k.beam("shaving-horse-body", [-1.6, 0.47, 1.15], [-1.6, 0.68, 2.1], 0.18, "wood");
  k.box("shaving-horse-clamp", [-1.6, 0.85, 1.4], [0.35, 0.13, 0.18], "oak");
  k.beam("clamp-treadle", [-1.6, 0.18, 1.85], [-1.6, 0.89, 1.4], 0.08);
  for (let i = 0; i < 9; i++)
    k.tube(
      "curled-shaving",
      [
        [0.1 + i * 0.13, 0.13, -1.4],
        [0.16 + i * 0.13, 0.17, -1.3],
        [0.2 + i * 0.13, 0.15, -1.4],
        [0.15 + i * 0.13, 0.13, -1.45]
      ],
      0.009,
      "wood"
    );
}

function joiner(k: ModelKit) {
  addCraftBench(k, 0, 0.1, 3.4, 1.15, 0.94);
  k.box("vice-fixed-cheek", [-1.15, 0.74, 0.73], [0.52, 0.4, 0.14], "oak");
  k.box("vice-moving-jaw", [-1.15, 0.74, 1.02], [0.52, 0.4, 0.14], "wood");
  k.beam("vice-screw-core", [-1.15, 0.75, 0.67], [-1.15, 0.75, 1.2], 0.09, "oak", true);
  const thread: Position[] = [];
  for (let i = 0; i <= 140; i++) {
    const a = (i * Math.PI) / 7;
    thread.push([-1.15 + Math.cos(a) * 0.051, 0.75 + Math.sin(a) * 0.051, 0.76 + i * 0.003]);
  }
  k.tube("wooden-screw-thread", thread, 0.012, "wood");
  k.beam("vice-hub", [-1.15, 0.75, 1.18], [-1.15, 0.75, 1.28], 0.15, "wood", true);
  k.beam("vice-cross-handle", [-1.15, 0.48, 1.24], [-1.15, 1.02, 1.24], 0.045, "oak", true);
  for (const y of [0.48, 1.02]) k.sphere("handle-knob", [-1.15, y, 1.24], [0.04, 0.04, 0.04], "wood");
  k.box("planing-board", [0.15, 0.971, 0.08], [2.3, 0.06, 0.32], "wood");
  for (const x of [-0.98, 1.28]) k.box("bench-stop", [x, 0.99, 0.08], [0.045, 0.1, 0.28], "oak");
  k.box("wooden-plane-body", [0.35, 1.05, 0.08], [0.48, 0.1, 0.17], "oak");
  const iron = k.box("plane-iron", [0.36, 1.13, 0.08], [0.04, 0.16, 0.12], "iron");
  iron.rotation.z = -0.5;
  const wedge = k.box("plane-wedge", [0.4, 1.135, 0.08], [0.045, 0.12, 0.1], "wood");
  wedge.rotation.z = -0.5;
  k.sphere("plane-front-grip", [0.18, 1.14, 0.08], [0.04, 0.07, 0.05], "wood");
  for (let i = 0; i < 4; i++) {
    const x = -0.55 + i * 0.25;
    k.beam("chisel-steel", [x, 0.968, -0.35], [x, 0.968, -0.1], 0.025, "iron");
    k.beam("chisel-handle", [x, 0.985, -0.58], [x, 0.985, -0.35], 0.055, "wood", true);
    k.ring("chisel-ferrule", [x, 0.985, -0.35], 0.027, 0.007, "iron", true).rotation.x = Math.PI / 2;
  }
  for (const x of [-1.15, 1.15]) {
    k.beam("saw-side", [x, 1.24, -2.6], [x, 2.48, -2.6], 0.08, "wood");
    k.tube(
      "saw-leather-hanger",
      [
        [x - 0.05, 2.48, -2.6],
        [x, 2.76, -2.77],
        [x + 0.05, 2.48, -2.6]
      ],
      0.018,
      "leather"
    );
  }
  k.beam("saw-stretcher", [-1.15, 1.85, -2.6], [1.15, 1.85, -2.6], 0.09);
  k.beam("saw-tension-cord", [-1.15, 2.4, -2.6], [1.15, 2.4, -2.6], 0.015, "cloth", true);
  k.beam("saw-toggle", [0, 2.15, -2.6], [0, 2.6, -2.6], 0.035, "wood");
  k.box("saw-blade", [0, 1.34, -2.6], [2.3, 0.05, 0.014], "iron");
  for (let i = 0; i < 56; i++) {
    const tooth = k.box("saw-tooth", [-1.12 + i * 0.04, 1.307, -2.6], [0.023, 0.023, 0.014], "iron");
    tooth.rotation.z = Math.PI / 4;
  }
  k.box("saw-hanging-rail", [0, 2.73, -2.85], [3, 0.12, 0.14], "oak");
  for (let i = 0; i < 5; i++) {
    k.box("dressed-plank-stack", [2.45, 0.2 + i * 0.17, -0.1], [0.72, 0.12, 2.8], "wood");
    for (const z of [-1.1, 0.9]) k.box("stack-spacer", [2.45, 0.12 + i * 0.17, z], [0.82, 0.05, 0.1], "oak");
  }
  for (let i = 0; i < 12; i++)
    k.tube(
      "plane-shaving",
      [
        [-0.1 + i * 0.09, 0.13, 1.55],
        [-0.05 + i * 0.09, 0.2, 1.62],
        [i * 0.09, 0.17, 1.55],
        [-0.03 + i * 0.09, 0.13, 1.5]
      ],
      0.008,
      "wood"
    );
}

export function createHighWoodworkingWorkshop(kind: "cooper" | "joiner") {
  const k = new HouseDetailKit(`${kind}-workshop-high`);
  addCraftShed(k);
  if (kind === "cooper") cooper(k);
  else joiner(k);
  return compactModel(k.finish());
}

/** Full-size existing vessel geometry for separate, placement-rated workshop studies. */
export function createCooperVessel(unfinished: boolean) {
  const k = new HouseDetailKit(unfinished ? "cooper-assembly-vessel" : "cooper-finished-vessel");
  barrel(k, 0, 0, 0, unfinished);
  return k.finish();
}
