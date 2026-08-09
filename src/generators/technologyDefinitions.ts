/**
 * Technology node definitions for roadmap eras 0–3 (mature medieval → maritime).
 * Eras 4+ (pre-industrial and later) are intentionally omitted.
 *
 * Thresholds are soft and demand-driven: high treasury/ports/knowledge stocks
 * advance stages; inland states can still progress era-1 mining nodes without
 * ever unlocking ocean-going hulls.
 */

import type { TechnologyDefinition } from "./technologyTypes";

/** Stage 0: mature medieval baseline — seeded adopted/diffused at map init. */
const START_PROFILE: readonly TechnologyDefinition[] = [
  {
    id: "threeFieldAgriculture",
    label: "Three-field agriculture",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "ironToolsAndDraftAnimals",
    label: "Iron tools and draft animals",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "waterAndWindMills",
    label: "Water and wind mills",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "basicMetallurgy",
    label: "Basic metallurgy",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "stoneBuildingAndRoads",
    label: "Stone building and roads",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "coastalNavigation",
    label: "Coastal navigation",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "knightlyWarfare",
    label: "Knightly warfare",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  },
  {
    id: "literacyAndMarkets",
    label: "Literacy and markets",
    era: 0,
    scope: "state",
    prerequisites: [],
    startStage: "diffused",
    known: {},
    demonstrated: {},
    adopted: {}
  }
];

/** Stage 1: late-medieval knowledge accumulation (no gunpowder unlock). */
const ERA_1: readonly TechnologyDefinition[] = [
  {
    id: "fourCourseRotation",
    label: "Four-course rotation",
    era: 1,
    scope: "state",
    prerequisites: ["threeFieldAgriculture", "ironToolsAndDraftAnimals"],
    known: { min: { urbanPopulation: 8, treasury: 15 } },
    demonstrated: { min: { urbanPopulation: 12, treasury: 30 } },
    adopted: { min: { urbanPopulation: 20, treasury: 60, administration: 0.15 } }
  },
  {
    id: "improvedMining",
    label: "Improved mining",
    era: 1,
    scope: "state",
    prerequisites: ["basicMetallurgy"],
    known: { min: { mineCount: 1 } },
    demonstrated: { min: { mineCount: 1, metallurgy: 0.15, treasury: 20 } },
    adopted: { min: { mineCount: 2, metallurgy: 0.35, smelterWorkers: 4, treasury: 40 } }
  },
  {
    id: "highTempFurnace",
    label: "High-temperature furnace",
    era: 1,
    scope: "state",
    prerequisites: ["basicMetallurgy", "improvedMining"],
    known: { min: { metallurgy: 0.2, smelterWorkers: 2 } },
    demonstrated: { min: { metallurgy: 0.4, smelterWorkers: 6, treasury: 30 } },
    adopted: { min: { metallurgy: 0.55, smelterWorkers: 10, treasury: 60 } }
  },
  {
    id: "mechanicalWorkshops",
    label: "Mechanical water-powered workshops",
    era: 1,
    scope: "state",
    prerequisites: ["waterAndWindMills"],
    known: { min: { woodworking: 0.15, urbanPopulation: 5 } },
    demonstrated: { min: { woodworking: 0.3, urbanPopulation: 12, treasury: 25 } },
    adopted: { min: { woodworking: 0.45, urbanPopulation: 20, treasury: 50 } }
  },
  {
    id: "urbanCoveredDrainage",
    label: "Urban covered drainage",
    era: 1,
    scope: "state",
    prerequisites: ["stoneBuildingAndRoads"],
    known: { min: { masonry: 0.1, urbanPopulation: 8 } },
    demonstrated: { min: { masonry: 0.25, urbanWaterMaxTier: 2, urbanPopulation: 15 } },
    adopted: { min: { masonry: 0.4, urbanWaterMaxTier: 3, urbanPopulation: 25, administration: 0.2 } }
  },
  {
    id: "recordReplication",
    label: "Expanded records and copying",
    era: 1,
    scope: "state",
    prerequisites: ["literacyAndMarkets"],
    known: { min: { printing: 0.05, administration: 0.1 } },
    demonstrated: { min: { printing: 0.2, administration: 0.25, urbanPopulation: 10 } },
    adopted: { min: { printing: 0.4, administration: 0.4, urbanPopulation: 18 } }
  },
  {
    id: "mathAstronomyGeography",
    label: "Mathematics, astronomy, geography",
    era: 1,
    scope: "state",
    prerequisites: ["recordReplication"],
    known: { min: { administration: 0.2, printing: 0.15 } },
    demonstrated: { min: { administration: 0.35, printing: 0.3, portCount: 1 } },
    adopted: { min: { administration: 0.5, printing: 0.45, portCount: 1, treasury: 40 } }
  },
  {
    id: "commercialFinance",
    label: "Mature commercial finance",
    era: 1,
    scope: "state",
    prerequisites: ["literacyAndMarkets"],
    known: { min: { treasury: 30, urbanPopulation: 8 } },
    demonstrated: { min: { treasury: 80, urbanPopulation: 15, administration: 0.2 } },
    adopted: { min: { treasury: 150, urbanPopulation: 25, administration: 0.35, portCount: 1 } }
  }
];

/** Stage 2: gunpowder and artillery revolution (world-gated). */
const ERA_2: readonly TechnologyDefinition[] = [
  {
    id: "blackPowder",
    label: "Black powder composition",
    era: 2,
    scope: "state",
    prerequisites: ["highTempFurnace", "recordReplication"],
    worldGates: ["gunpowderWorld"],
    known: { min: { metallurgy: 0.25, administration: 0.15, treasury: 25 } },
    demonstrated: { min: { metallurgy: 0.35, pyrotechnics: 0.1, treasury: 40 }, flags: { atWar: true } },
    adopted: { min: { metallurgy: 0.45, pyrotechnics: 0.35, treasury: 70, gunpowderDemand: 0.5 } }
  },
  {
    id: "cornedPowder",
    label: "Corned powder and quality control",
    era: 2,
    scope: "state",
    prerequisites: ["blackPowder", "recordReplication"],
    worldGates: ["gunpowderWorld"],
    known: { min: { pyrotechnics: 0.2, printing: 0.15 } },
    demonstrated: { min: { pyrotechnics: 0.4, administration: 0.3, gunpowderDemand: 1 } },
    adopted: { min: { pyrotechnics: 0.55, administration: 0.4, gunpowderDemand: 2, treasury: 80 } }
  },
  {
    id: "cannonFoundry",
    label: "Cannon founding",
    era: 2,
    scope: "state",
    prerequisites: ["blackPowder", "highTempFurnace"],
    worldGates: ["gunpowderWorld"],
    known: { min: { metallurgy: 0.4, smelterWorkers: 6, treasury: 50 } },
    demonstrated: { min: { metallurgy: 0.55, smelterWorkers: 10, pyrotechnics: 0.25, treasury: 90 } },
    adopted: { min: { metallurgy: 0.65, smelterWorkers: 14, pyrotechnics: 0.4, treasury: 120 } }
  },
  {
    id: "artilleryTactics",
    label: "Artillery tactics",
    era: 2,
    scope: "state",
    prerequisites: ["cannonFoundry", "mathAstronomyGeography"],
    worldGates: ["gunpowderWorld"],
    known: { min: { pyrotechnics: 0.3, administration: 0.3 } },
    demonstrated: { min: { pyrotechnics: 0.45, gunpowderDemand: 1.5 }, flags: { atWar: true } },
    adopted: { min: { pyrotechnics: 0.6, gunpowderDemand: 3, administration: 0.4 } }
  },
  {
    id: "massFirearms",
    label: "Mass firearm production",
    era: 2,
    scope: "state",
    prerequisites: ["cornedPowder", "cannonFoundry", "commercialFinance"],
    worldGates: ["gunpowderWorld"],
    known: { min: { metallurgy: 0.5, pyrotechnics: 0.4, treasury: 100 } },
    demonstrated: { min: { metallurgy: 0.6, pyrotechnics: 0.55, gunpowderDemand: 3, treasury: 140 } },
    adopted: { min: { metallurgy: 0.7, pyrotechnics: 0.7, gunpowderDemand: 5, treasury: 200, administration: 0.45 } }
  },
  {
    id: "gunpowderFortification",
    label: "Gunpowder fortification",
    era: 2,
    scope: "state",
    prerequisites: ["artilleryTactics", "urbanCoveredDrainage"],
    worldGates: ["gunpowderWorld"],
    known: { min: { masonry: 0.3, pyrotechnics: 0.35, treasury: 80 } },
    demonstrated: { min: { masonry: 0.45, pyrotechnics: 0.5, treasury: 120 }, flags: { atWar: true } },
    adopted: { min: { masonry: 0.55, pyrotechnics: 0.6, treasury: 180, administration: 0.4 } }
  }
];

/** Stage 3: age of discovery / maritime commerce. */
const ERA_3: readonly TechnologyDefinition[] = [
  {
    id: "oceanNavigation",
    label: "Ocean navigation",
    era: 3,
    scope: "state",
    prerequisites: ["coastalNavigation", "mathAstronomyGeography"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 1, administration: 0.25, printing: 0.2 } },
    demonstrated: { min: { portCount: 1, shipTechPoints: 20, completedHulls: 1, printing: 0.3 } },
    adopted: { min: { portCount: 2, shipTechPoints: 50, completedHulls: 3, administration: 0.4 } }
  },
  {
    id: "oceanGoingHulls",
    label: "Ocean-going sailing hulls",
    era: 3,
    scope: "state",
    prerequisites: ["coastalNavigation", "mechanicalWorkshops"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 1, woodworking: 0.25, shipTechPoints: 10 } },
    demonstrated: { min: { portCount: 1, woodworking: 0.4, shipTechPoints: 40, completedHulls: 2 } },
    adopted: { min: { portCount: 2, woodworking: 0.55, shipTechPoints: 100, completedHulls: 5, treasury: 80 } }
  },
  {
    id: "standardCharts",
    label: "Standard charts and maritime records",
    era: 3,
    scope: "state",
    prerequisites: ["oceanNavigation", "recordReplication"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { printing: 0.25, administration: 0.3, portCount: 1 } },
    demonstrated: { min: { printing: 0.4, administration: 0.4, shipTechPoints: 40 } },
    adopted: { min: { printing: 0.55, administration: 0.5, portCount: 2, shipTechPoints: 80 } }
  },
  {
    id: "fleetLogistics",
    label: "Fleet provisioning and logistics",
    era: 3,
    scope: "state",
    prerequisites: ["oceanGoingHulls", "commercialFinance"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 1, treasury: 60, administration: 0.25 } },
    demonstrated: { min: { portCount: 2, treasury: 100, completedHulls: 3, administration: 0.35 } },
    adopted: { min: { portCount: 2, treasury: 160, completedHulls: 6, administration: 0.5 } }
  },
  {
    id: "navalGunnery",
    label: "Naval gunnery",
    era: 3,
    scope: "state",
    prerequisites: ["oceanGoingHulls", "artilleryTactics"],
    worldGates: ["gunpowderWorld", "shipbuildingWorld"],
    known: { min: { pyrotechnics: 0.35, shipTechPoints: 40, portCount: 1 } },
    demonstrated: { min: { pyrotechnics: 0.5, completedHulls: 3, gunpowderDemand: 1 } },
    adopted: { min: { pyrotechnics: 0.65, completedHulls: 5, gunpowderDemand: 2, shipTechPoints: 100 } }
  },
  {
    id: "overseasTradingPosts",
    label: "Overseas trading posts",
    era: 3,
    scope: "state",
    prerequisites: ["fleetLogistics", "standardCharts", "commercialFinance"],
    worldGates: ["shipbuildingWorld"],
    known: {
      min: { portCount: 2, treasury: 120, shipTechPoints: 80, completedHulls: 4 },
      flags: { capitalPort: true }
    },
    demonstrated: { min: { portCount: 2, treasury: 200, shipTechPoints: 120, completedHulls: 8 } },
    adopted: { min: { portCount: 3, treasury: 300, shipTechPoints: 150, completedHulls: 12, administration: 0.5 } }
  }
];

export const TECHNOLOGY_DEFINITIONS: readonly TechnologyDefinition[] = [...START_PROFILE, ...ERA_1, ...ERA_2, ...ERA_3];

export const TECHNOLOGY_DEFINITION_BY_ID: ReadonlyMap<string, TechnologyDefinition> = new Map(
  TECHNOLOGY_DEFINITIONS.map(def => [def.id, def])
);

export function getTechnologyDefinition(id: string): TechnologyDefinition | undefined {
  return TECHNOLOGY_DEFINITION_BY_ID.get(id);
}

/** Definitions active under the current world gates. */
export function getActiveTechnologyDefinitions(args: {
  gunpowderWorld: boolean;
  shipbuildingWorld: boolean;
}): readonly TechnologyDefinition[] {
  return TECHNOLOGY_DEFINITIONS.filter(def => {
    for (const gate of def.worldGates ?? []) {
      if (gate === "gunpowderWorld" && !args.gunpowderWorld) return false;
      if (gate === "shipbuildingWorld" && !args.shipbuildingWorld) return false;
    }
    return true;
  });
}
