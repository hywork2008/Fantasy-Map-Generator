import {
  COLLEGIATE_CHURCH,
  createTownChurch,
  LARGE_TOWN_PARISH_CHURCH,
  MARKET_TOWN_PARISH_CHURCH
} from "../churches/townChurch";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

/**
 * Churches sized for the population tiers of the town's civic centre
 * (`civicSizeForPopulation`, docs/plan/bv-town-church-tiers.md). The civic centre places them by tier.
 */
export const models: MedievalModel[] = [
  {
    author: "Claude Sonnet 5.5",
    id: "town-church-parish",
    name: "Market-town parish church",
    task: 14,
    size: [22, 10.6, 14],
    note: "Principal church of a market town (T2): four-bay nave, lower chancel, west tower with a pyramidal roof, south porch and stepped buttresses. Tower, chancel and porch overlap the nave rather than fit into cut openings. Plan frame: west front at -X, south porch at +Z.",
    create: () => createTownChurch(MARKET_TOWN_PARISH_CHURCH, "low")
  },
  {
    author: "Claude Sonnet 5.5",
    id: "town-church-large",
    name: "Large town parish church",
    task: 14,
    size: [36, 20, 28],
    note: "Principal church of a town (T3): six-bay aisled nave with a clerestory, lean-to aisles, lower chancel, west tower with a timber spire and corner pinnacles, south porch and buttresses. Plan frame: west front at -X, south porch at +Z.",
    create: () => createTownChurch(LARGE_TOWN_PARISH_CHURCH, "low")
  },
  {
    author: "Claude Sonnet 5.5",
    id: "town-church-collegiate",
    name: "Collegiate church",
    task: 14,
    size: [52, 28.1, 36],
    note: "Great church of a city (T4): seven-bay aisled nave with a clerestory, transepts, a crossing tower, a chancel closed by a five-sided apse, and a lower west tower. Plan frame: west front at -X, south porch at +Z. Chantry chapels are not modelled.",
    create: () => createTownChurch(COLLEGIATE_CHURCH, "low")
  }
];

registerHighVariants(models, {
  "town-church-parish": () => createTownChurch(MARKET_TOWN_PARISH_CHURCH, "high"),
  "town-church-large": () => createTownChurch(LARGE_TOWN_PARISH_CHURCH, "high"),
  "town-church-collegiate": () => createTownChurch(COLLEGIATE_CHURCH, "high")
});
