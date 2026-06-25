import type { Good } from "./modules/goods-generator";
import type { Deal, Market } from "./modules/markets-generator";

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
    production?: import("./modules/production-generator").ProductionRecord[];
  }
}
