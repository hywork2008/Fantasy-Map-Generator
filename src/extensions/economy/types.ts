import type { BurgMarketLedger } from "./generators/burgMarketLedgers";
import type { Good } from "./generators/goods-generator";
import type { Caravan, Deal, Market } from "./generators/marketTypes";
import type { MerchantOrganization } from "./generators/merchantOrganizations";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    goods: Good[];
    markets: Market[];
    deals: Deal[];
    caravans: Caravan[];
    burgMarketLedgers: BurgMarketLedger[];
    merchantOrganizations: MerchantOrganization[];
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
