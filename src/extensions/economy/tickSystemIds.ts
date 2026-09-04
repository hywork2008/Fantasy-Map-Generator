/**
 * Execution order of the economy tick chain.
 *
 * The tick used to be a single `economy.tick` system whose ~50 steps were sequenced only by
 * where they happened to sit in one 370-line `run()`, with the real constraints written as prose
 * ("Must run before updateAnnualAgriculture()"). Each step is now its own simulation system, and
 * `registerEconomyTickSystem` in index.tsx walks this list to wire `after: [previous]` — so the
 * order lives in one readable place instead of being implied by call-site order, and the host
 * registry enforces it. index.tsx asserts its registrations against this list.
 *
 * Kept in its own module so tests can read the order without importing the extension entry point
 * and its whole renderer/UI graph.
 *
 * docs/plan/economy-coupling-audit.md T1 step 1.
 */
import type { DataTopic } from "../../runtime/worldRuntime";

export const ECONOMY_TICK_SYSTEM_IDS = [
  /** Incorporates last tick's political claims before this cycle's rural production. */
  "economy.marketTerritorySync",
  /** Annual farm/industrial investment, climate disasters, then the agriculture recompute. */
  "economy.annualAgTech",
  /** Caravan movement, retail restocking, strategic-procurement reconciliation. */
  "economy.caravans",
  /** Per-burg war intensity and the state-level supply-strain rollup. */
  "economy.warIntensity",
  /** Daily hire boards: pregnancy, construction, research, cull, escort. */
  "economy.dailyHiring",
  /** Annual urban labour intake, employment reconciliation, inns, cold-climate knowledge. */
  "economy.annualUrbanLabor",
  /** The annual chemistry / medicine / era-6 plant block. */
  "economy.annualPlants",
  /** Urban water and railway settlement — the two annual steps that publish host topics. */
  "economy.annualInfrastructure",
  /** Guild, academy, library, state-secret and martial technique settlement. */
  "economy.annualKnowledge",
  /** Annual burg group reclassification. */
  "economy.annualBurgGroups",
  /** Forest regrowth and the annual state prospecting survey. */
  "economy.forestProspect",
  /** Monthly/quarterly food calendar and the production-settlement scheduling it owes. */
  "economy.foodCalendar"
] as const;

export type EconomyTickSystemId = (typeof ECONOMY_TICK_SYSTEM_IDS)[number];

/**
 * Topic contracts for the extracted Economy tick steps.
 *
 * These are deliberately a step-level upper bound, rather than the union formerly declared by
 * `economy.tick`: a calendar-gated step may not mutate on every invocation, but it may only
 * read/write topics listed here when it does. The declaration is kept beside the ordering list
 * so both aspects of the scheduler contract can be reviewed without loading the extension entry.
 *
 * docs/plan/economy-coupling-audit.md T1 step 2.
 */
export type EconomyTickTopicContract = Readonly<{
  reads: readonly DataTopic[];
  writes: readonly DataTopic[];
}>;

export const ECONOMY_TICK_TOPIC_CONTRACTS: Readonly<Record<EconomyTickSystemId, EconomyTickTopicContract>> = {
  "economy.marketTerritorySync": {
    reads: ["map.politics", "simulation.cells", "extension.economy"],
    writes: ["extension.economy", "simulation.burgs"]
  },
  "economy.annualAgTech": {
    reads: ["map.politics", "extension.economy", "simulation.states", "simulation.cells"],
    writes: ["extension.economy", "simulation.states", "simulation.cells"]
  },
  "economy.caravans": {
    reads: [
      "map.politics",
      "map.networks",
      "extension.economy",
      "simulation.burgs",
      "simulation.states",
      "simulation.cells"
    ],
    writes: ["extension.economy", "simulation.states"]
  },
  "economy.warIntensity": {
    reads: ["map.politics", "extension.economy"],
    writes: ["extension.economy", "simulation.states"]
  },
  "economy.dailyHiring": {
    reads: ["map.annotations", "extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"],
    writes: ["map.annotations", "extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"]
  },
  "economy.annualUrbanLabor": {
    reads: ["extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"],
    writes: ["map.settlements", "extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"]
  },
  "economy.annualPlants": {
    reads: ["extension.economy", "simulation.burgs", "simulation.states"],
    writes: ["extension.economy", "simulation.burgs", "simulation.states"]
  },
  "economy.annualInfrastructure": {
    reads: ["map.networks", "extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"],
    writes: ["map.settlements", "map.networks", "extension.economy", "simulation.burgs"]
  },
  "economy.annualKnowledge": {
    reads: ["map.politics", "extension.economy", "simulation.burgs", "simulation.states", "simulation.military"],
    writes: ["extension.economy", "simulation.burgs", "simulation.states"]
  },
  "economy.annualBurgGroups": {
    reads: ["map.settlements", "simulation.burgs"],
    writes: ["map.settlements", "simulation.burgs"]
  },
  "economy.forestProspect": {
    reads: ["map.physical", "map.politics", "map.networks", "extension.economy", "simulation.cells"],
    writes: ["extension.economy", "simulation.cells"]
  },
  "economy.foodCalendar": {
    reads: ["extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"],
    writes: ["extension.economy", "simulation.burgs", "simulation.states", "simulation.cells"]
  }
};
