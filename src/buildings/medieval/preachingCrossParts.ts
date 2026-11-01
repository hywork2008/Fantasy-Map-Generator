import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { ModelKit } from "./modelKit";

export const PREACHING_CROSS_HEAD_BASE = 2.97;

/** Bevels stay inside the vertical support interval, including the ground contact. */
function dressedBlock(k: ModelKit, name: string, width: number, depth: number, bottom: number, height: number) {
  const bevel = 0.012;
  const shape = new THREE.Shape([
    new THREE.Vector2(-width / 2, -depth / 2),
    new THREE.Vector2(width / 2, -depth / 2),
    new THREE.Vector2(width / 2, depth / 2),
    new THREE.Vector2(-width / 2, depth / 2)
  ]);
  const mesh = k.add(
    name,
    new THREE.ExtrudeGeometry(shape, {
      depth: height - 2 * bevel,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2
    }),
    "stone"
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = bottom + bevel;
}

function base() {
  const k = new ModelKit("preaching-cross-stepped-base");
  for (let i = 0; i < 3; i++) dressedBlock(k, "dressed-platform-step", 2.6 - i * 0.38, 2.6 - i * 0.38, i * 0.18, 0.18);
  dressedBlock(k, "cross-socket-block", 0.85, 0.85, 0.54, 0.45);
  for (const side of [-1, 1]) {
    for (const x of [-0.76, 0.76])
      k.beam("platform-stone-joint", [x, 0.03, side * 1.307], [x, 0.15, side * 1.307], 0.007, "earth");
    k.beam("socket-dressing-line", [-0.3, 0.73, side * 0.432], [0.3, 0.73, side * 0.432], 0.006, "earth");
  }
  return k.finish();
}

function shaft() {
  const k = new ModelKit("preaching-cross-octagonal-shaft");
  k.cylinder("tapered-octagonal-shaft", [0, 1.95, 0], 0.18, 2.2, "stone", 0.14, 8);
  k.cylinder("shaft-foot-collar", [0, 1.03, 0], 0.235, 0.12, "white", 0.22, 8);
  k.cylinder("shaft-neck-collar", [0, 2.91, 0], 0.2, 0.1, "white", 0.2, 8);
  dressedBlock(k, "cross-capital", 0.5, 0.5, 2.94, 0.16);
  return k.finish();
}

/** A Latin cross outline; inset changes only the outer edge, not the component origin. */
function crossOutline(inset = 0) {
  const stem = 0.16 - inset,
    arm = 0.84 - inset,
    lo = 1.03 + inset,
    hi = 1.33 - inset,
    top = 1.95 - inset;
  const points = [
    [-stem, inset],
    [stem, inset],
    [stem, lo],
    [arm, lo],
    [arm, hi],
    [stem, hi],
    [stem, top],
    [-stem, top],
    [-stem, hi],
    [-arm, hi],
    [-arm, lo],
    [-stem, lo]
  ];
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  return shape;
}
function incisedCross() {
  const points = [
    [-0.055, 0.23],
    [0.055, 0.23],
    [0.055, 1.145],
    [0.61, 1.145],
    [0.61, 1.215],
    [0.055, 1.215],
    [0.055, 1.68],
    [-0.055, 1.68],
    [-0.055, 1.215],
    [-0.61, 1.215],
    [-0.61, 1.145],
    [-0.055, 1.145]
  ];
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  return shape;
}
function crossHead() {
  const k = new ModelKit("preaching-cross-carved-head"),
    y = PREACHING_CROSS_HEAD_BASE;
  const stone = k.add(
    "bevelled-stone-cross-head",
    new THREE.ExtrudeGeometry(crossOutline(), {
      depth: 0.24,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.015,
      bevelSegments: 2
    }),
    "stone"
  );
  stone.position.set(0, y, -0.12);
  const panel = crossOutline(0.02);
  panel.holes.push(new THREE.Path(incisedCross().getPoints().reverse()));
  const face = new THREE.ExtrudeGeometry(panel, { depth: 0.025, bevelEnabled: false });
  const floor = new THREE.ShapeGeometry(incisedCross());
  for (const side of [-1, 1]) {
    const skin = k.add("carved-cross-face", face, "white");
    skin.position.set(0, y, side * 0.135);
    skin.rotation.y = side > 0 ? 0 : Math.PI;
    const recess = k.add("incised-cross-floor", floor, "earth");
    recess.position.set(0, y, side * 0.1352);
    recess.rotation.y = skin.rotation.y;
  }
  return k.finish();
}

export function preachingCrossPartFactories(): ModelPartFactory[] {
  return (
    [
      ["stepped-base", base],
      ["shaft", shaft],
      ["cross-head", crossHead]
    ] as const
  ).map(([role, create]) => ({ id: `preaching-cross:${role}`, role, quality: "high", author: DEFAULT_AUTHOR, create }));
}
