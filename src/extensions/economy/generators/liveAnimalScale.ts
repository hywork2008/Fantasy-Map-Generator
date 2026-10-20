/**
 * Animals one market head of a live-animal good stands for. Herds (faunaPopulation.ts) count single
 * animals, as cavalry counts riders and a convoy counts its beasts (tradeCargo.ts). A head of
 * Horses in the market is some twenty-five animals: a horse cost a labourer half a year's to a
 * year's wage against the good's value of 10, and half a head is tanned into a roll of leather
 * (port-freight-queue-and-warehouses.md §10.17, §10.21). Other species are still one animal a head.
 */
const ANIMALS_PER_MARKET_HEAD: Readonly<Record<string, number>> = { Horses: 25 };

export const HORSES_PER_MARKET_HEAD = ANIMALS_PER_MARKET_HEAD.Horses;

export function animalsPerMarketHead(goodName: string): number {
  return ANIMALS_PER_MARKET_HEAD[goodName] ?? 1;
}
