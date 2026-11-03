import * as THREE from "three";
import { compactModel } from "../compactModel";
import type { FootprintBox } from "../placementContract";
import { MARKET_CLOTH_COLORS, type MarketPalette } from "./marketAppearance";
import { createMarketFoodStall } from "./marketFoodDetails";
import { ModelKit } from "./modelKit";

export type MarketActivity = "market-day" | "closed";
export type MarketDetail = "near" | "distant";
export const MARKET_MODEL_IDS = [
  "market-produce-stall",
  "market-goods-booth",
  "market-fish-table",
  "market-fish-booth",
  "market-bread-stall",
  "market-grain-table"
];
export const isMarketModel = (id: string) => MARKET_MODEL_IDS.includes(id);

/** Temporary pitches disappear at closing; only the semi-permanent timber booth remains. */
export function packedMarketPitch(id: string, activity: MarketActivity | undefined): boolean {
  return activity === "closed" && isMarketModel(id) && id !== "market-fish-booth";
}

export function createClosedMarketBooth(quality: "low" | "high", palette: MarketPalette) {
  return createMarketFoodStall("market-fish-booth", quality, palette, "closed");
}

/** A separate distance representation, in the original model-local envelope. Never replaces its saved quality. */
export function createDistantMarket(
  id: string,
  box: FootprintBox,
  palette: MarketPalette = "ochre",
  activity: MarketActivity = "market-day"
) {
  const k = new ModelKit(`${id}-distant-${palette}-${activity}`, { cloth: MARKET_CLOTH_COLORS[palette] });
  const x = box.centerX,
    z = box.centerZ,
    y = box.groundY;
  const w = Math.min(3.4, box.halfX * 1.8),
    d = Math.min(2.5, box.halfZ * 1.7);
  const fixed = id === "market-fish-booth";
  const roof = fixed || id === "market-bread-stall" || id === "market-produce-stall" || id === "market-goods-booth";
  for (const side of [-1, 1]) k.box("trestle", [x + side * w * 0.4, y + 0.45, z + d * 0.28], [0.1, 0.9, 0.55]);
  k.box("counter", [x, y + 0.93, z + d * 0.28], [w, 0.1, 0.72], "wood");
  if (roof) {
    for (const side of [-1, 1])
      for (const edge of [-1, 1]) k.box("post", [x + (side * w) / 2, y + 1.25, z + (edge * d) / 2], [0.12, 2.5, 0.12]);
    if (fixed || id === "market-goods-booth") {
      const geometry = new THREE.BufferGeometry();
      const left = x - (w + 0.1) / 2,
        right = x + (w + 0.1) / 2,
        back = z - (d + 0.1) / 2,
        front = z + (d + 0.1) / 2,
        eave = y + 2.5,
        ridge = y + 2.95;
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [left, eave, back, right, eave, back, right, ridge, z, left, ridge, z, left, eave, front, right, eave, front],
          3
        )
      );
      geometry.setIndex([0, 3, 1, 1, 3, 2, 3, 4, 2, 2, 4, 5]);
      geometry.computeVertexNormals();
      k.add("distant-pitched-roof", geometry, fixed ? "wood" : "cloth");
      k.beam("ridge", [left, ridge, z], [right, ridge, z], 0.1, fixed ? "wood" : "cloth");
    } else k.box("canvas", [x, y + 2.75, z], [w + 0.1, 0.05, d + 0.1], "cloth");
  }
  if (activity === "closed") {
    k.box("closed-booth-front", [x, y + 1.65, z + d / 2], [w, 1.6, 0.06], "wood");
    for (const side of [-1, 1]) k.box("side-screen", [x + (side * w) / 2, y + 1.2, z], [0.06, 2.4, d], "wood");
    k.box("closed-rear", [x, y + 1.2, z - d / 2], [w, 2.4, 0.06], "wood");
  } else {
    const surface = id.includes("fish")
      ? "water"
      : id.includes("bread") || id.includes("grain")
        ? "straw"
        : id.includes("goods")
          ? "cloth"
          : "green";
    for (const offset of [-1, 0, 1])
      k.box("goods-silhouette", [x + offset * w * 0.28, y + 1.05, z + d * 0.28], [w * 0.24, 0.14, 0.48], surface);
  }
  return compactModel(k.finish());
}
