import type { Surface } from "./modelKit";
import type { TradeKit } from "./opusTradeKit";
import type { WorkhomeRole } from "./workhomeTradeProfiles";

/**
 * Wares of a trade's open shop (docs/plan/bv-workhome-facade-variation.md §4.4): what a passer-by saw on the stall
 * board, on the shelves of the shop and hung inside the opening. The trade shows by its goods, not by its sign.
 * `counter` items stand on a board top at y, `shelf` items on a shelf, `rail` items hang from a rail at y.
 */
export type GoodsPlace = "counter" | "shelf" | "rail";

const CLOTHS: readonly Surface[] = ["cloth", "azure", "ruby", "green", "white"];
const BINDINGS: readonly Surface[] = ["ruby", "leather", "azure", "dark", "green"];

/** Cheap round segments: Low keeps every item but fewer facets. */
const seg = (k: TradeKit) => (k.high ? 10 : 6);

export function tradeGoods(
  k: TradeKit,
  role: WorkhomeRole,
  place: GoodsPlace,
  x: number,
  y: number,
  z: number,
  i: number
) {
  const pick = <T>(list: readonly T[]) => list[i % list.length];
  switch (role) {
    case "tailoring":
      if (place === "rail") k.box("hung-garment", [x, y - 0.45, z], [0.42, 0.8, 0.06], pick(CLOTHS));
      else {
        k.box("folded-cloth", [x, y + 0.05, z], [0.38, 0.1, 0.28], pick(CLOTHS));
        if (k.high) k.box("folded-cloth", [x, y + 0.14, z], [0.34, 0.08, 0.26], pick(CLOTHS.slice(2)));
      }
      return;
    case "weaving":
      if (place === "rail") k.box("hung-cloth-length", [x, y - 0.6, z], [0.5, 1.1, 0.03], pick(CLOTHS));
      else k.cylinder("cloth-bolt", [x, y + 0.11, z], 0.11, 0.5, pick(CLOTHS), 0.11, seg(k)).rotation.z = Math.PI / 2;
      return;
    case "shoemaking":
      if (place === "rail") {
        k.box("hung-boot", [x, y - 0.25, z], [0.12, 0.38, 0.24], "leather");
        return;
      }
      for (const dx of [-0.07, 0.07])
        k.box("shoe", [x + dx, y + 0.05, z], [0.1, 0.1, 0.26], i % 2 ? "dark" : "leather");
      return;
    case "furriery":
      if (place === "rail")
        k.box("hung-pelt", [x, y - 0.4, z], [0.32, 0.7, 0.04], pick(["wood", "dark", "fat"] as const));
      else k.blob("fur-bundle", [x, y + 0.08, z], [0.22, 0.09, 0.18], pick(["wood", "dark", "fat"] as const));
      return;
    case "leatherGoods":
      if (place === "rail") k.box("hung-bag", [x, y - 0.25, z], [0.26, 0.3, 0.08], "leather");
      else {
        k.blob("purse", [x, y + 0.06, z], [0.1, 0.07, 0.08], i % 2 ? "leather" : "dark");
        if (k.high) k.box("coiled-belt", [x + 0.15, y + 0.02, z], [0.14, 0.04, 0.14], "leather");
      }
      return;
    case "saddlery":
      if (place === "rail") k.beam("hung-harness", [x, y, z], [x, y - 0.7, z], 0.05, "leather");
      else if (place === "counter") {
        k.box("saddle-tree", [x, y + 0.1, z], [0.3, 0.2, 0.45], "oak");
        k.blob("saddle-seat", [x, y + 0.22, z], [0.2, 0.08, 0.26], "leather");
      } else k.box("bridle", [x, y + 0.06, z], [0.3, 0.12, 0.08], "leather");
      return;
    case "goldsmithing":
      // Plate on show; nothing hung within reach of the street.
      if (place === "rail") return;
      k.cylinder("cup", [x, y + 0.09, z], 0.05, 0.18, i % 2 ? "pewter" : "brass", 0.07, seg(k));
      if (k.high) k.cylinder("charger", [x + 0.14, y + 0.01, z], 0.12, 0.02, "pewter", 0.12, seg(k));
      return;
    case "joinery":
      if (place === "rail") k.box("hung-stool", [x, y - 0.3, z], [0.3, 0.45, 0.06], "wood");
      else if (place === "counter") k.box("small-chest", [x, y + 0.12, z], [0.4, 0.24, 0.26], i % 2 ? "oak" : "wood");
      else k.cylinder("turned-bowl", [x, y + 0.05, z], 0.08, 0.1, "wood", 0.12, seg(k));
      return;
    case "bowyery":
      if (place === "rail") k.beam("hung-bow", [x, y - 0.05, z], [x, y - 1.25, z], 0.04, "wood");
      else {
        k.cylinder("arrow-sheaf", [x, y + 0.36, z], 0.06, 0.72, "wood", 0.06, seg(k));
        if (k.high) k.cylinder("arrow-fletching", [x, y + 0.66, z], 0.075, 0.12, "white", 0.075, seg(k));
      }
      return;
    case "bookTrades":
      if (place === "rail") return;
      for (let b = 0; b < (k.high ? 3 : 2); b++)
        k.box("book", [x + (b - 0.5) * 0.11, y + 0.13, z], [0.08, 0.26, 0.2], BINDINGS[(i + b) % BINDINGS.length]);
      return;
  }
}
