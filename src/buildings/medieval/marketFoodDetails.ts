import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelPartTracker } from "../modelParts";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { MARKET_CLOTH_COLORS, type MarketPalette } from "./marketAppearance";
import { awning, counter, frame } from "./marketDetails";
import { ModelKit, type Position, type Surface } from "./modelKit";

export const MARKET_FOOD_IDS = [
  "market-fish-table",
  "market-fish-booth",
  "market-bread-stall",
  "market-grain-table"
] as const;
export type MarketFoodId = (typeof MARKET_FOOD_IDS)[number];

/** Shared shell, goods and stock; +Z is the customer side, the vendor stands behind the counter. */
export function createMarketFoodStall(
  id: MarketFoodId,
  quality: "low" | "high",
  palette: MarketPalette = "ochre",
  activity: "market-day" | "closed" = "market-day"
) {
  const high = quality === "high";
  const closed = activity === "closed";
  const k = new ModelKit(`${id}-${quality}-${palette}${closed ? "-closed" : ""}`, {
    cloth: MARKET_CLOTH_COLORS[palette]
  });
  const parts = new ModelPartTracker(k);
  const part = (role: string) => parts.begin({ id: role, role, quality, author: "Codex GPT-6.1 Sol" });
  const ellipsoid = (name: string, p: Position, size: Position, surface: Surface) => {
    const mesh = k.add(name, new THREE.SphereGeometry(1, high ? 12 : 8, high ? 8 : 5), surface);
    mesh.position.set(...p);
    mesh.scale.set(...size);
    return mesh;
  };
  part("stall-shell");
  counter(k);
  if (id === "market-bread-stall") {
    frame(k, false);
    awning(k, false);
  } else if (id === "market-fish-booth") {
    // A modest freestanding timber shelter, not a miniature masonry shop from the manuscript.
    for (const x of [-1.85, 1.85]) {
      for (const z of [-1.3, 1.3]) {
        k.box("hut-post", [x, 1.3, z], [0.14, 2.6, 0.14]);
        k.beam("hut-knee", [x, 1.9, z], [x - Math.sign(x) * 0.5, 2.5, z], 0.1);
      }
      k.beam("gable-rafter", [x, 2.6, -1.55], [x, 3.22, 0], 0.12);
      k.beam("gable-rafter", [x, 3.22, 0], [x, 2.6, 1.55], 0.12);
    }
    k.beam("hut-ridge", [-2, 3.22, 0], [2, 3.22, 0], 0.14);
    for (const z of [-1.3, 1.3]) k.beam("hut-wall-plate", [-1.92, 2.6, z], [1.92, 2.6, z], 0.14);
    for (let i = 0; i < 16; i++) {
      const x = -1.9 + i * 0.25;
      for (const side of [-1, 1]) k.beam("roof-board", [x, 2.6, side * 1.58], [x, 3.22, 0], 0.24, "wood");
    }
    for (let i = 0; i < 10; i++) k.box("rear-screen-board", [-1.72 + i * 0.25, 1, -1.3], [0.24, 2, 0.055], "wood");
    // A 1 m rear doorway and open sides give the seller an actual entrance.
    if (closed) {
      for (let i = 0; i < 14; i++)
        k.box("closed-front-shutter", [-1.625 + i * 0.25, 1.72, 1.31], [0.245, 1.48, 0.06], "wood");
      for (const x of [-1.85, 1.85]) k.box("closed-side-screen", [x, 1.3, 0], [0.06, 2.5, 2.6], "wood");
      k.box("closed-rear-door", [1.22, 1, -1.3], [1.05, 2, 0.06], "wood");
      for (const x of [-1.1, 1.1]) k.box("shutter-strap", [x, 1.72, 1.35], [0.045, 1.1, 0.035], "iron");
    } else {
      k.box("raised-front-shutter", [0, 2.18, 1.3], [3.4, 0.54, 0.05], "wood");
      for (const x of [-1.5, 1.5]) k.beam("shutter-prop", [x, 1.83, 1.1], [x, 2.18, 1.3], 0.055);
    }
  }
  if (closed) {
    parts.finish();
    return compactModel(k.finish(), { mergeEquivalentMaterials: true });
  }
  part("display-goods");
  const tray = (x: number, width: number) => {
    k.box("tray-bottom", [x, 1.006, 1.02], [width, 0.035, 0.7], "wood");
    for (const side of [-1, 1]) {
      k.box("tray-side", [x, 1.07, 1.02 + side * 0.35], [width, 0.1, 0.035], "wood");
      k.box("tray-end", [x + (side * width) / 2, 1.07, 1.02], [0.035, 0.1, 0.7], "wood");
    }
  };
  const fish = (x: number, y: number, z: number, small = false) => {
    const length = small ? 0.52 : 0.7;
    ellipsoid("fish-body", [x, y, z], [length / 2, 0.055, 0.105], "white");
    ellipsoid("fish-back", [x, y + 0.028, z - 0.035], [length * 0.4, 0.032, 0.052], "water");
    const tail = new THREE.Shape();
    tail.moveTo(-length / 2 + 0.03, 0);
    tail.lineTo(-length / 2 - 0.17, -0.13);
    tail.lineTo(-length / 2 - 0.12, 0);
    tail.lineTo(-length / 2 - 0.17, 0.13);
    tail.closePath();
    const fin = k.add(
      "forked-fish-tail",
      new THREE.ExtrudeGeometry(tail, { depth: 0.025, bevelEnabled: false }),
      "water"
    );
    fin.rotation.x = Math.PI / 2;
    fin.position.set(x, y + 0.015, z);
    if (high) {
      ellipsoid("fish-eye", [x + length * 0.3, y + 0.052, z + 0.02], [0.018, 0.009, 0.018], "dark");
      k.beam(
        "fish-gill",
        [x + length * 0.22, y + 0.048, z - 0.04],
        [x + length * 0.2, y + 0.048, z + 0.06],
        0.009,
        "oak"
      );
    }
  };
  if (id === "market-fish-table" || id === "market-fish-booth") {
    for (const x of [-1.16, 0, 1.16]) tray(x, 1.05);
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 2; row++) fish(-1.05 + col * 1.16, 1.1, 0.84 + row * 0.34, col === 1);
  } else if (id === "market-bread-stall") {
    k.box("bread-display-linen", [0, 0.994, 1.02], [3.2, 0.014, 0.73], "white");
    for (let col = 0; col < 6; col++)
      for (let row = 0; row < 2; row++) {
        const x = -1.35 + col * 0.53,
          z = 0.82 + row * 0.39;
        ellipsoid("round-loaf", [x, 1.085, z], [0.235, 0.09, 0.17], col % 2 ? "straw" : "leather");
        if (high)
          for (const offset of [-0.06, 0.06])
            k.beam("loaf-score", [x - 0.12, 1.16, z + offset], [x + 0.12, 1.16, z + offset], 0.012, "white");
      }
  } else {
    for (const [x, surface] of [
      [-1.1, "straw"],
      [0, "earth"]
    ] as const) {
      tray(x, 0.95);
      ellipsoid("grain-measure-mound", [x, 1.08, 1.02], [0.41, 0.075, 0.28], surface);
      if (high)
        for (let i = 0; i < 28; i++)
          ellipsoid(
            "grain-kernel",
            [x - 0.32 + (i % 7) * 0.105, 1.15, 0.83 + Math.floor(i / 7) * 0.12],
            [0.026, 0.018, 0.012],
            surface
          );
    }
    for (const x of [0.88, 1.45]) {
      k.cylinder("cheese-wheel", [x, 1.08, 1.02], 0.235, 0.18, "straw", 0.235, high ? 24 : 12);
      if (high) k.ring("cheese-rind", [x, 1.16, 1.02], 0.23, 0.012, "leather");
    }
    k.cylinder("wooden-dry-measure", [-0.7, 0.23, -0.75], 0.22, 0.46, "wood", 0.22);
    k.cylinder("measure-grain", [-0.7, 0.44, -0.75], 0.2, 0.02, "straw");
  }
  part("stock-and-storage");
  if (id.startsWith("market-fish")) {
    k.attach(createMedievalContainerModel("barrel", "empty"), [-1.15, 0, -0.7], 0.85);
    // An open barrel of preserved fish; no grain load or modern crushed ice.
    for (const z of [-0.82, -0.62]) fish(-1.08, 0.875, z, true);
    k.vessel("wash-tub", [1.2, 0, -0.65], 0.35, 0.35, "wood", true);
  } else {
    k.attach(createMedievalContainerModel("sack", "closed"), [-1.25, 0, -0.65]);
    if (id === "market-bread-stall") {
      k.box("bread-stock-board", [0.8, 0.28, -0.8], [1.1, 0.08, 0.6], "wood");
      for (const x of [0.5, 1.1]) ellipsoid("stock-loaf", [x, 0.41, -0.8], [0.24, 0.09, 0.19], "straw");
      for (const x of [0.35, 1.25]) k.box("stock-board-foot", [x, 0.12, -0.8], [0.12, 0.24, 0.45]);
    }
  }
  // The colour belongs to a cloth, not to the fish, bread, or wood species.
  if (id !== "market-bread-stall") k.box("counter-linen-edge", [0, 0.82, 1.45], [3.25, 0.24, 0.025], "cloth");
  parts.finish();
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}
