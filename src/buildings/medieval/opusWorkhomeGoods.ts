import type { Surface } from "./modelKit";
import type { TradeKit } from "./opusTradeKit";
import type { OpusShopRole } from "./opusWorkhomeProfiles";

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
  role: OpusShopRole,
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
    // The shop-houses before rear works (docs/plan/ce-town-trade-rear-works.md): what the works behind made.
    case "baking":
      // Loaves on the board and shelves; bread was not hung.
      if (place === "rail") return;
      k.blob("loaf", [x, y + 0.07, z], [0.14, 0.07, 0.1], i % 2 ? "straw" : "earth");
      if (k.high) k.blob("roll", [x + 0.17, y + 0.04, z], [0.06, 0.04, 0.06], "straw");
      return;
    case "cutlery":
      if (place === "rail") {
        k.box("hung-knife", [x, y - 0.2, z], [0.03, 0.3, 0.05], "iron");
        k.box("knife-haft", [x, y - 0.02, z], [0.035, 0.1, 0.05], i % 2 ? "wood" : "white");
        return;
      }
      for (const dx of k.high ? [-0.08, 0, 0.08] : [-0.05, 0.05]) {
        k.box("knife-blade", [x + dx, y + 0.01, z - 0.04], [0.04, 0.015, 0.2], "iron");
        k.box("knife-haft", [x + dx, y + 0.015, z + 0.1], [0.035, 0.025, 0.1], place === "shelf" ? "leather" : "wood");
      }
      return;
    case "metalwares":
      if (place === "rail") {
        k.cylinder("hung-skillet", [x, y - 0.2, z], 0.1, 0.05, "brass", 0.1, seg(k)).rotation.x = Math.PI / 2;
        return;
      }
      k.cylinder("flagon", [x, y + 0.13, z], 0.06, 0.26, "pewter", 0.045, seg(k));
      if (k.high) k.cylinder("charger", [x + 0.15, y + 0.01, z], 0.12, 0.02, "pewter", 0.12, seg(k));
      return;
    case "glazing":
      // Leaded panels and roundels set up against the back of the board.
      if (place === "rail") return;
      k.box("leaded-panel", [x, y + 0.2, z - 0.05], [0.3, 0.4, 0.02], "water");
      if (k.high)
        k.cylinder("roundel", [x + 0.18, y + 0.12, z], 0.08, 0.015, "water", 0.08, seg(k)).rotation.x = Math.PI / 2;
      return;
    case "chandlery":
      if (place === "rail") {
        for (const dx of [-0.03, 0.03]) k.cylinder("hung-candle", [x + dx, y - 0.18, z], 0.014, 0.3, "fat", 0.014, 5);
        return;
      }
      k.box("soap-cake", [x, y + 0.04, z], [0.18, 0.08, 0.12], i % 2 ? "fat" : "white");
      if (k.high)
        k.cylinder("candle-bundle", [x + 0.15, y + 0.03, z], 0.05, 0.3, "fat", 0.05, 6).rotation.z = Math.PI / 2;
      return;
  }
}
