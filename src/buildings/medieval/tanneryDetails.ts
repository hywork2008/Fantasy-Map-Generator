import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import type { ModelKit, Position } from "./modelKit";
import { addCraftBench, addCraftShed } from "./workshopDetailKit";

function vat(k: ModelKit, x: number, timber: boolean) {
  k.vessel("thick-tanning-vat", [x, 0, 0], 0.95, 1.02, timber ? "wood" : "stone");
  k.cylinder("recessed-treatment-liquid", [x, 0.735, 0], 0.855, 0.02, timber ? "earth" : "white", 0.855, 48);
  for (let i = 0; i < (timber ? 24 : 16); i++) {
    const a = (i * Math.PI * 2) / (timber ? 24 : 16);
    if (timber) {
      k.beam(
        "vat-stave-seam",
        [x + Math.cos(a) * 0.953, 0.08, Math.sin(a) * 0.953],
        [x + Math.cos(a) * 0.953, 0.98, Math.sin(a) * 0.953],
        0.009,
        "oak"
      );
    } else {
      for (let row = 0; row < 3; row++) {
        const angle = a + ((row % 2) * Math.PI) / 16;
        k.beam(
          "masonry-joint",
          [x + Math.cos(angle) * 0.953, 0.05 + row * 0.32, Math.sin(angle) * 0.953],
          [x + Math.cos(angle) * 0.953, 0.33 + row * 0.32, Math.sin(angle) * 0.953],
          0.012,
          "earth"
        );
      }
    }
  }
  for (const y of [0.16, 0.48, 0.85]) {
    if (timber) {
      const hoop = k.add("vat-flat-binding", new THREE.CylinderGeometry(0.968, 0.968, 0.065, 48, 1, true), "iron");
      hoop.position.set(x, y, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        k.sphere("binding-rivet", [x + Math.cos(a) * 0.975, y, Math.sin(a) * 0.975], [0.015, 0.015, 0.015], "iron");
      }
    } else k.ring("stone-course-joint", [x, y, 0], 0.95, 0.01, "earth");
  }
  k.beam("stirring-pole", [x + 0.5, 0.22, 0.1], [x + 0.12, 1.6, 0.45], 0.055, "wood", true);
  k.box("paddle-blade", [x + 0.48, 0.32, 0.13], [0.15, 0.3, 0.045], "wood");
}

function dryingFrame(k: ModelKit, x: number, z: number, index: number) {
  for (const side of [-1, 1]) {
    const xx = x + side * 0.92;
    k.box("drying-frame-foot", [xx, 0.07, z], [0.3, 0.14, 0.95], "oak");
    k.box("drying-frame-post", [xx, 1.65, z], [0.12, 3.2, 0.12], "wood");
    k.beam("drying-frame-prop", [xx, 0.12, z - 0.42], [xx, 0.8, z], 0.075);
    for (const y of [0.4, 3.05]) k.beam("drying-frame-peg", [xx, y, z - 0.09], [xx, y, z + 0.09], 0.025, "oak", true);
  }
  for (const y of [0.4, 3.05]) k.beam("drying-frame-rail", [x - 1, y, z], [x + 1, y, z], 0.12, "wood");
  const outline: Position[] = [
    [-0.23, 2.77, 0],
    [0.23, 2.77, 0],
    [0.35, 2.49, 0],
    [0.66, 2.56, 0],
    [0.73, 2.26, 0],
    [0.49, 2.03, 0],
    [0.46, 1.54, 0],
    [0.7, 0.92, 0],
    [0.42, 0.77, 0],
    [0.22, 1.04, 0],
    [-0.22, 1.04, 0],
    [-0.42, 0.77, 0],
    [-0.7, 0.92, 0],
    [-0.46, 1.54, 0],
    [-0.49, 2.03, 0],
    [-0.73, 2.26, 0],
    [-0.66, 2.56, 0],
    [-0.35, 2.49, 0]
  ];
  const shape = new THREE.Shape(outline.map(([xx, y]) => new THREE.Vector2(xx, y)));
  const hide = k.add(
    "thick-stretched-hide",
    new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false, steps: 1 }),
    index % 2 ? "cloth" : "leather"
  );
  hide.position.set(x, 0, z - 0.009);
  outline.forEach(([xx, y], i) => {
    let anchor: Position;
    if (i < 2) anchor = [x + xx, 3.02, z];
    else if (y < 1.15) anchor = [x + xx, 0.43, z];
    else anchor = [x + Math.sign(xx) * 0.88, y, z];
    const edge: Position = [x + xx * 0.97, y + (1.7 - y) * 0.015, z + 0.02];
    k.tube(
      "hide-lacing",
      [anchor, [anchor[0], anchor[1], z + 0.05], edge, [edge[0] - 0.025, edge[1] - 0.025, z - 0.025], anchor],
      0.01,
      "cloth"
    );
    k.sphere("lacing-knot", anchor, [0.025, 0.022, 0.025], "cloth");
  });
}

export function createHighTannery() {
  const k = new HouseDetailKit("tanners-yard-high");
  k.box("tannery-yard", [0, 0.025, 0], [13.4, 0.05, 10.7], "earth");
  addCraftShed(k, -3.1, -3.35, 6.2, 3);
  for (let i = 0; i < 4; i++) vat(k, -4.7 + i * 2.9, i % 2 === 1);
  // A real open basin, with the water below its coping and no solid block across its cavity.
  k.box("wash-basin-floor", [-4.55, 0.16, 3.3], [3.05, 0.22, 1.4], "stone");
  for (const z of [2.65, 3.95]) k.box("wash-basin-side", [-4.55, 0.55, z], [3.05, 0.8, 0.16], "stone");
  for (const x of [-6, -3.1]) k.box("wash-basin-end", [x, 0.55, 3.3], [0.15, 0.8, 1.15], "stone");
  k.box("recessed-wash-water", [-4.55, 0.68, 3.3], [2.74, 0.02, 1.12], "water");
  for (let i = 0; i < 3; i++) dryingFrame(k, -0.3 + i * 2.4, 3.6, i);
  addCraftBench(k, -3.15, -3.2, 2.1, 0.75, 0.82);
  k.box("folded-hide-stock", [-3.4, 0.88, -3.2], [1.1, 0.1, 0.6], "leather");
  // The fleshing beam and knife are under the open shed, supported at both ends.
  k.beam("rounded-fleshing-beam", [-5.3, 0.5, -2.35], [-3.8, 1.1, -2.35], 0.3, "wood", true);
  for (const [x, y] of [
    [-5.15, 0.56],
    [-3.95, 1.04]
  ])
    for (const side of [-1, 1]) k.beam("fleshing-trestle", [x, 0.12, -2.35 + side * 0.32], [x, y, -2.35], 0.08);
  k.beam("fleshing-knife-edge", [-4.6, 0.94, -2.55], [-4.6, 0.94, -2.15], 0.035, "iron");
  for (const z of [-2.62, -2.08])
    k.beam("fleshing-knife-grip", [-4.72, 0.94, z], [-4.48, 0.94, z], 0.055, "wood", true);
  for (const z of [-2.55, -2.15])
    k.beam("knife-tang", [-4.6, 0.94, z], [-4.6, 0.94, z + (z < -2.35 ? -0.07 : 0.07)], 0.02, "iron");
  k.vessel("bark-basket", [-0.9, 0.12, -3.1], 0.4, 0.55, "wood");
  for (let i = 0; i < 12; i++)
    k.box(
      "tannin-bark",
      [-1.13 + (i % 4) * 0.14, 0.4 + Math.floor(i / 4) * 0.08, -3.2 + (i % 3) * 0.09],
      [0.1, 0.05, 0.22],
      "oak"
    ).rotation.y = i * 0.45;
  k.beam("hide-lifting-pole", [1.2, 0.14, -2.5], [3.4, 0.14, -2.5], 0.065, "wood", true);
  k.tube(
    "pole-hook",
    [
      [3.35, 0.14, -2.5],
      [3.55, 0.14, -2.5],
      [3.58, 0.14, -2.35],
      [3.45, 0.14, -2.3]
    ],
    0.023,
    "iron"
  );
  return compactModel(k.finish());
}

// Shared full-size equipment; callers own the resulting ModelKit resources.
export { dryingFrame as addTanneryDryingFrame, vat as addTanneryVat };
