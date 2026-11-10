import * as THREE from "three";
import { ModelKit } from "./modelKit";
import { addCraftBench } from "./workshopDetailKit";

/** A reusable wooden screw press, with an open platen and supported sliding bed. */
export function createHighPrintingPress() {
  const k = new ModelKit("wooden-printing-press-high");
  for (const side of [-1, 1]) {
    k.box("press-runner", [side * 0.75, 0.09, 0.3], [0.32, 0.18, 2.1], "oak");
    k.box("press-upright", [side * 0.75, 1.5, 0], [0.25, 2.76, 0.3], "oak");
    k.beam("press-foot-brace", [side * 0.75, 0.19, 1.15], [side * 0.75, 0.85, 0], 0.12, "wood");
    for (const y of [0.3, 2.7]) {
      k.box("upright-strap", [side * 0.75, y, 0], [0.27, 0.1, 0.32], "iron");
      k.beam("head-tenon-pin", [side * 0.75, y, -0.19], [side * 0.75, y, 0.19], 0.045, "wood", true);
    }
  }
  k.box("press-head", [0, 2.7, 0], [2, 0.3, 0.48], "oak");
  k.box("press-cap", [0, 2.9, 0], [1.9, 0.1, 0.4], "wood");
  k.cylinder("wooden-press-screw", [0, 2.21, 0], 0.13, 0.92, "wood");
  const points = Array.from({ length: 57 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return new THREE.Vector3(Math.cos(a) * 0.14, 1.77 + i * 0.015, Math.sin(a) * 0.14);
  });
  k.add("screw-thread", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 112, 0.022, 4, false), "oak");
  k.box("platen-swivel-block", [0, 1.68, 0], [0.35, 0.24, 0.35], "oak");
  k.box("press-platen", [0, 1.5, 0], [1.32, 0.16, 0.85], "wood");
  for (const x of [-0.52, 0.52]) k.box("platen-cross-batten", [x, 1.6, 0], [0.12, 0.08, 0.85], "oak");
  k.beam("press-lever", [0, 2.1, 0], [0.9, 2.1, 0.9], 0.075, "oak", true);
  k.beam("lever-grip", [0.9, 1.99, 0.9], [0.9, 2.21, 0.9], 0.1, "wood", true);
  addCraftBench(k, 0, 0.45, 1.7, 2, 0.87);
  for (const x of [-0.62, 0.62]) k.box("bed-bearing-rail", [x, 0.94, 0.45], [0.12, 0.14, 2], "oak");
  k.box("sliding-type-bed", [0, 1.045, 0.5], [1.32, 0.07, 1.65], "wood");
  k.box("type-forme", [0, 1.095, 0.07], [1.12, 0.03, 0.65], "iron");
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 12; col++)
      k.box("set-metal-type", [-0.46 + col * 0.083, 1.116, -0.18 + row * 0.08], [0.056, 0.012, 0.045], "dark");
  k.box("printed-proof", [0, 1.086, 0.92], [1.05, 0.012, 0.68], "white");
  for (let row = 0; row < 9; row++)
    k.box(
      "proof-ink-line",
      [row % 3 === 0 ? -0.04 : 0, 1.093, 0.66 + row * 0.06],
      [row % 3 === 0 ? 0.72 : 0.8, 0.002, 0.008],
      "dark"
    );
  const tympan = new ModelKit("raised-tympan");
  for (const x of [-0.6, 0.6]) tympan.box("tympan-side", [x, 0.55, 0], [0.055, 1.1, 0.05], "oak");
  for (const y of [0.025, 1.075]) tympan.box("tympan-end", [0, y, 0], [1.25, 0.05, 0.05], "oak");
  tympan.box("tympan-cloth", [0, 0.55, 0], [1.15, 1, 0.012], "cloth");
  const frame = tympan.finish();
  frame.group.rotation.x = 0.65;
  k.attach(frame, [0, 1.12, 1.3]);
  return k.finish();
}

export function fittedPrintingPress(x: number, z: number) {
  const k = new ModelKit("fitted-printing-press");
  k.attach(createHighPrintingPress(), [x, 0, z]);
  return k.finish();
}

export function addPaperStack(k: ModelKit, x: number, bottom: number, z: number, width = 1.2, depth = 0.7) {
  for (let i = 0; i < 6; i++)
    k.box(
      "paper-quire",
      [x + (i % 2) * 0.012, bottom + 0.015 + i * 0.03, z],
      [width, 0.03, depth],
      i % 2 ? "white" : "cloth"
    );
}

export function createPrintingGuildDressing() {
  const k = new ModelKit("printing-guild-trade-dressing");
  k.box("guild-trade-plaque", [0, 6.12, 3.64], [1.4, 0.65, 0.12], "oak");
  for (const side of [-1, 1]) {
    k.box("book-emblem-page", [side * 0.28, 6.12, 3.72], [0.52, 0.46, 0.035], "white");
    for (let row = 0; row < 5; row++)
      k.box("book-emblem-line", [side * 0.28, 5.98 + row * 0.07, 3.741], [0.37, 0.012, 0.008], "wood");
  }
  k.box("book-emblem-spine", [0, 6.12, 3.75], [0.045, 0.5, 0.045], "wood");
  addCraftBench(k, 3, -0.65, 2.5, 1.1, 0.95);
  addPaperStack(k, 2.65, 0.95, -0.65, 1.35);
  k.box("inspection-rule", [3.83, 0.97, -0.65], [0.07, 0.04, 0.85], "oak");
  return k.finish();
}
