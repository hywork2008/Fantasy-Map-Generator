/**
 * Display-only interpretations of selected default Economy units.
 *
 * Do not import this module from production, market, or trade code: these
 * references explain the catalogue to people and do not affect simulation values.
 */
export type GoodsUnitItemNoun = "pairs" | "loaves";

export interface GoodsUnitFlavor {
  readonly itemsPerUnit?: number;
  readonly itemNoun?: GoodsUnitItemNoun;
  readonly retailReference?: {
    readonly label: string;
    readonly copperPrice: number;
  };
}

const DEFAULT_GOODS_UNIT_FLAVORS: Readonly<Record<string, GoodsUnitFlavor>> = {
  Boots: { itemsPerUnit: 20, itemNoun: "pairs" },
  Bread: { itemsPerUnit: 20, itemNoun: "loaves" },
  Wine: { retailReference: { label: "cup", copperPrice: 1 } },
  Beer: { retailReference: { label: "cup", copperPrice: 1 } }
};

/** Returns flavour only for the named shipped catalogue good. */
export function getDefaultGoodsUnitFlavor(goodName: string): GoodsUnitFlavor | undefined {
  return DEFAULT_GOODS_UNIT_FLAVORS[goodName];
}
