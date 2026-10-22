/** Supported household fiber/weaving/tailoring routes; specialist and gated recipes stay in workshops. */
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import type { Good } from "./goodsGeneratorTypes";

export interface RuralTextileChain {
  fiber: Good;
  cloth: Good;
  product: Good;
  fiberPerCloth: number;
  clothPerProduct: number;
  laborPerProduct: number;
}

function singleInputAmounts(good: Good, inputId: number): number[] {
  if (good.requiredTechnology || good.byproducts?.some(row => row && Object.keys(row).length)) return [];
  return (good.recipes ?? []).flatMap((recipe, index) => {
    if (good.recipeTechnologies?.[index]) return [];
    const entries = Object.entries(recipe);
    if (entries.length !== 1 || +entries[0][0] !== inputId) return [];
    const amount = entries[0][1];
    return Number.isFinite(amount) && amount > 0 ? [amount] : [];
  });
}

/** Callers supply enabled goods. Only plain single-fiber recipes are eligible for home processing. */
export function getRuralTextileChains(goods: readonly Good[]): RuralTextileChain[] {
  const labor = (good: Good) => (getGoodDemandCalibration(good.name)?.laborPointsPerLotAtDefaultRate ?? 0) * 1000;
  const routes = [
    ["Wool", "Wool Cloth", "Wool Garments"],
    ["Wool", "Cloth", "Garments"],
    ["Hemp", "Cloth", "Garments"],
    ["Cotton", "Cloth", "Garments"],
    ["Flax", "Linen", "Linen Garments"],
    ["Wool", "Wool Cloth", "Wool Blankets"]
  ];
  const chains: RuralTextileChain[] = [];
  for (const [fiberName, clothName, productName] of routes) {
    const fiber = goods.find(good => good.name === fiberName);
    const cloth = goods.find(good => good.name === clothName);
    const product = goods.find(good => good.name === productName);
    if (!fiber || !cloth || !product || !(labor(cloth) > 0) || !(labor(product) > 0)) continue;
    for (const fiberPerCloth of singleInputAmounts(cloth, fiber.i)) {
      for (const clothPerProduct of singleInputAmounts(product, cloth.i)) {
        chains.push({
          fiber,
          cloth,
          product,
          fiberPerCloth,
          clothPerProduct,
          laborPerProduct: labor(product) + clothPerProduct * labor(cloth)
        });
      }
    }
  }
  return chains;
}
