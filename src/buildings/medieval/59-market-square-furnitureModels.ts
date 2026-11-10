import {
  createCanopiedMarketCross,
  createPilloryAndStocks,
  createSteppedMarketCross
} from "../props/marketSquareProps";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

/**
 * Furniture for the town square sized by population (`civicSizeForPopulation`, docs/plan/bv-town-church-tiers.md):
 * a village green gets the stocks, a market town a stone cross, a city the canopied cross. BV only until CE (B6).
 */
export const models: MedievalModel[] = [
  {
    author: "Claude Sonnet 5.5",
    id: "pillory-and-stocks",
    name: "Pillory and stocks",
    task: 59,
    cePlacementStatus: "preview-only",
    size: [4.6, 2.8, 2.7],
    note: "A hinged three-hole pillory post and a two-leg stocks with a bench, on a low paved platform. Village-green scale (18 m square).",
    create: () => createPilloryAndStocks("low")
  },
  {
    author: "Claude Sonnet 5.5",
    id: "market-cross-stepped",
    name: "Stepped market cross",
    task: 59,
    cePlacementStatus: "preview-only",
    size: [3.6, 3.6, 5.5],
    note: "A stone cross on a socket stone and three octagonal steps. Market-town scale (30 m square).",
    create: () => createSteppedMarketCross("low")
  },
  {
    author: "Claude Sonnet 5.5",
    id: "market-cross-canopied",
    name: "Canopied market cross",
    task: 59,
    cePlacementStatus: "preview-only",
    size: [5.8, 5.8, 7.9],
    note: "An open eight-pier pavilion on three octagonal steps, with a vault rib ring, central column and tiled roof under an iron cross. Town and city scale (48 m square and up).",
    create: () => createCanopiedMarketCross("low")
  }
];

registerHighVariants(models, {
  "pillory-and-stocks": () => createPilloryAndStocks("high"),
  "market-cross-stepped": () => createSteppedMarketCross("high"),
  "market-cross-canopied": () => createCanopiedMarketCross("high")
});
