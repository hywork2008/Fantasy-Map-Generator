import { createTownChurch, MARKET_TOWN_PARISH_CHURCH } from "../churches/townChurch";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

/**
 * Churches sized for the population tiers of the town's civic centre
 * (`civicSizeForPopulation`, docs/plan/bv-town-church-tiers.md). Registered for BV only until the CE side (B6).
 */
export const models: MedievalModel[] = [
  {
    author: "Claude Sonnet 5.5",
    id: "town-church-parish",
    name: "Market-town parish church",
    task: 14,
    cePlacementStatus: "preview-only",
    size: [22, 10.6, 14],
    note: "Principal church of a market town (T2): four-bay nave, lower chancel, west tower with a pyramidal roof, south porch and stepped buttresses. Tower, chancel and porch overlap the nave rather than fit into cut openings. Plan frame: west front at -X, south porch at +Z.",
    create: () => createTownChurch(MARKET_TOWN_PARISH_CHURCH, "low")
  }
];

registerHighVariants(models, {
  "town-church-parish": () => createTownChurch(MARKET_TOWN_PARISH_CHURCH, "high")
});
