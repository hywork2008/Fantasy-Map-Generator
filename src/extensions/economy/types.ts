import type { Good } from "./generators/goods-generator";
import type { Deal, Market } from "./generators/markets-generator";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    goods: Good[];
    markets: Market[];
    deals: Deal[];
  }

  interface PackedGraphCells {
    good: Uint16Array; // cell good id
    market: Uint16Array; // cell market id
  }
}

declare module "../../types/models" {
  interface Burg {
    production?: import("./generators/production-generator").ProductionRecord[];
  }
}
