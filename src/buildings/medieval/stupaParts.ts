import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { ModelKit, type Surface } from "./modelKit";
import { addDressedStoneBlock } from "./preachingCrossParts";

export const STUPA_PROFILE = {
  throneTop: 1.19,
  terraceTop: 1.91,
  bumpaBottom: 1.88,
  bumpaTop: 3.6,
  harmikaBottom: 3.54,
  harmikaTop: 4.04,
  spireBottom: 3.98,
  spireTop: 6.38,
  rings: 13,
  crownTop: 7.45
};

function lathe(k: ModelKit, name: string, profile: number[][], surface: Surface) {
  return k.add(
    name,
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      48
    ),
    surface
  );
}
function throne() {
  const k = new ModelKit("chorten-grounded-throne");
  for (let i = 0; i < 3; i++) addDressedStoneBlock(k, "throne-ground-step", 6 - i * 0.4, 6 - i * 0.4, i * 0.18, 0.18);
  addDressedStoneBlock(k, "whitewashed-throne", 4.8, 4.8, 0.54, 0.55, "white");
  addDressedStoneBlock(k, "throne-lower-moulding", 4.92, 4.92, 0.54, 0.1);
  addDressedStoneBlock(k, "throne-upper-coping", 4.92, 4.92, 1.07, 0.12);
  return k.finish();
}
function terraces() {
  const k = new ModelKit("chorten-four-terraces");
  for (let i = 0; i < 4; i++)
    addDressedStoneBlock(k, "bumpa-terrace", 4.4 - i * 0.4, 4.4 - i * 0.4, 1.19 + i * 0.18, 0.18, "white");
  for (const side of [-1, 1]) {
    k.box("ochre-terrace-band", [0, 1.78, side * 1.616], [3.2, 0.07, 0.008], "tile");
    k.box("ochre-terrace-band", [side * 1.616, 1.78, 0], [0.008, 0.07, 3.2], "tile");
  }
  return k.finish();
}
function bumpa() {
  const k = new ModelKit("chorten-vase-body");
  lathe(
    k,
    "closed-vase-reliquary",
    [
      [0, 1.88],
      [1.04, 1.88],
      [1.12, 1.94],
      [1.17, 2.08],
      [1.4, 2.3],
      [1.48, 2.61],
      [1.43, 2.94],
      [1.3, 3.2],
      [1.1, 3.42],
      [1.02, 3.5],
      [1.02, 3.6],
      [0, 3.6]
    ],
    "white"
  );
  lathe(
    k,
    "bumpa-foot-moulding",
    [
      [1.03, 1.89],
      [1.15, 1.89],
      [1.2, 1.95],
      [1.19, 2.01],
      [1.13, 2.03],
      [1.09, 1.97],
      [1.03, 1.89]
    ],
    "white"
  );
  return k.finish();
}
function harmika() {
  const k = new ModelKit("chorten-square-harmika");
  addDressedStoneBlock(k, "harmika-foot", 1.44, 1.44, 3.54, 0.2, "white");
  addDressedStoneBlock(k, "harmika-square-body", 1.4, 1.4, 3.68, 0.28, "white");
  addDressedStoneBlock(k, "harmika-coping", 1.55, 1.55, 3.88, 0.16, "white");
  return k.finish();
}
function spire() {
  const k = new ModelKit("chorten-thirteen-ring-spire"),
    p = STUPA_PROFILE;
  k.cylinder(
    "continuous-spire-core",
    [0, (p.spireBottom + p.spireTop) / 2, 0],
    0.65,
    p.spireTop - p.spireBottom,
    "straw",
    0.12,
    48
  );
  for (let i = 0; i < p.rings; i++) {
    const radius = 0.78 - i * 0.048;
    k.cylinder(
      "tapering-spire-ring",
      [0, p.spireBottom + 0.08 + i * 0.18, 0],
      radius,
      0.09,
      "straw",
      radius - 0.02,
      48
    );
  }
  return k.finish();
}
function crown() {
  const k = new ModelKit("chorten-parasol-sun-moon-jewel");
  lathe(
    k,
    "parasol-canopy",
    [
      [0, 6.62],
      [0.12, 6.6],
      [0.28, 6.5],
      [0.52, 6.4],
      [0.56, 6.36],
      [0.56, 6.31],
      [0.5, 6.34],
      [0.25, 6.46],
      [0.08, 6.55],
      [0, 6.56],
      [0, 6.62]
    ],
    "straw"
  );
  k.beam("continuous-crown-axis", [0, 6.3, 0], [0, 7.24, 0], 0.045, "straw", true);
  const R = 0.25,
    r = 0.23,
    d = 0.07,
    cy = 6.91;
  const y = (R * R - r * r + d * d) / (2 * d),
    x = Math.sqrt(R * R - y * y),
    a = Math.atan2(y, x),
    b = Math.atan2(y - d, x);
  const moon = new THREE.Shape();
  moon.absarc(0, cy, R, Math.PI - a, Math.PI * 2 + a, false);
  moon.absarc(0, cy + d, r, b, Math.PI - b, true);
  moon.closePath();
  k.add(
    "open-crescent-moon",
    new THREE.ExtrudeGeometry(moon, { depth: 0.04, bevelEnabled: false, curveSegments: 24 }),
    "straw"
  ).position.z = -0.02;
  k.cylinder("sun-disc", [0, 7.04, 0], 0.1, 0.04, "straw", 0.1, 32).rotation.x = Math.PI / 2;
  lathe(
    k,
    "crown-jewel",
    [
      [0, 7.13],
      [0.065, 7.19],
      [0.1, 7.25],
      [0.075, 7.33],
      [0, 7.45]
    ],
    "straw"
  );
  return k.finish();
}
export function stupaPartFactories(): ModelPartFactory[] {
  return (
    [
      ["throne", throne],
      ["terraces", terraces],
      ["bumpa", bumpa],
      ["harmika", harmika],
      ["spire", spire],
      ["crown", crown]
    ] as const
  ).map(([role, create]) => ({ id: `stupa:${role}`, role, quality: "high", author: DEFAULT_AUTHOR, create }));
}
