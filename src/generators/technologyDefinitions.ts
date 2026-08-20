/**
 * Technology node definitions for roadmap eras 0–6 (mature medieval → industrial chemistry).
 * Eras 7+ (petroleum, space) remain omitted.
 *
 * Thresholds are soft and demand-driven: high treasury/ports/knowledge stocks
 * advance stages; inland states can still progress era-1 mining nodes without
 * ever unlocking ocean-going hulls. Era 4–5 is a first pass of
 * docs/plan/steam-engine-knowledge-accumulation.md on the existing annual
 * evaluator — ExperimentalWorkshop / SteamPumpTrial remain later refinements.
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
    adopted: { min: { mineCount: 2, metallurgy: 0.35, smelterWorkers: 3508, treasury: 40 } }
  },
  {
    id: "highTempFurnace",
    label: "High-temperature furnace",
    era: 1,
    scope: "state",
    prerequisites: ["basicMetallurgy", "improvedMining"],
    known: { min: { metallurgy: 0.2, smelterWorkers: 1508 } },
    demonstrated: { min: { metallurgy: 0.4, smelterWorkers: 5508, treasury: 30 } },
    adopted: { min: { metallurgy: 0.55, smelterWorkers: 9508, treasury: 60 } }
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
    id: "distillation",
    label: "Alembic distillation",
    era: 1,
    scope: "state",
    prerequisites: ["basicMetallurgy", "recordReplication"],
    known: { min: { metallurgy: 0.15, printing: 0.1 } },
    demonstrated: { min: { metallurgy: 0.25, printing: 0.2, treasury: 20 } },
    adopted: { min: { metallurgy: 0.35, printing: 0.3, treasury: 40, urbanPopulation: 10 } }
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
  },
  {
    id: "laboratoryGlassware",
    label: "Laboratory glassware",
    era: 1,
    scope: "state",
    prerequisites: ["distillation", "recordReplication"],
    known: { min: { glassware: 0.15, treasury: 20 } },
    demonstrated: { min: { glassware: 0.35, labVesselQuality: 0.45, labGlassPracticeYears: 2, treasury: 30 } },
    adopted: { min: { glassware: 0.45, labVesselQuality: 0.45, treasury: 40 } },
    minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
  },
  {
    id: "apothecaryCompounding",
    label: "Apothecary compounding",
    era: 1,
    scope: "state",
    prerequisites: ["distillation", "recordReplication"],
    known: { min: { medicineDemandPressure: 0.2, treasury: 20 } },
    demonstrated: { min: { medicineDemandPressure: 0.3, apothecaryTrialYears: 2, treasury: 30 } },
    adopted: { min: { medicineDemandPressure: 0.35, apothecaryTrialYears: 2, treasury: 40 } },
    minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
  },
  {
    id: "surgicalAnatomy",
    label: "Surgical anatomy",
    era: 1,
    scope: "state",
    prerequisites: ["apothecaryCompounding"],
    known: { min: { medicine: 0.1, treasury: 20 } },
    demonstrated: { min: { medicine: 0.25, apothecaryTrialYears: 2, treasury: 30 } },
    adopted: { min: { medicine: 0.35, treasury: 40 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 3 }
  },
  {
    id: "hospitalMedicine",
    label: "Hospital medicine",
    era: 1,
    scope: "state",
    prerequisites: ["apothecaryCompounding", "urbanCoveredDrainage"],
    known: { min: { medicineDemandPressure: 0.3, urbanWaterMaxTier: 2, treasury: 40 } },
    demonstrated: { min: { hospitalTrialYears: 2, urbanWaterMaxTier: 2, treasury: 60 } },
    adopted: { min: { hospitalInstallations: 1, treasury: 80 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
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
    known: { min: { metallurgy: 0.4, smelterWorkers: 5508, treasury: 50 } },
    demonstrated: { min: { metallurgy: 0.55, smelterWorkers: 9508, pyrotechnics: 0.25, treasury: 90 } },
    adopted: { min: { metallurgy: 0.65, smelterWorkers: 13508, pyrotechnics: 0.4, treasury: 120 } }
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

/** Stage 4: pre-industrial knowledge that makes steam pumping a rational investment. */
const ERA_4: readonly TechnologyDefinition[] = [
  {
    id: "experimentalNaturalPhilosophy",
    label: "Experimental natural philosophy",
    era: 4,
    scope: "state",
    prerequisites: ["recordReplication", "mathAstronomyGeography", "distillation"],
    known: { min: { administration: 0.25, printing: 0.25, treasury: 40, glassware: 0.1 } },
    demonstrated: { min: { administration: 0.4, printing: 0.4, treasury: 70, experimentRecord: 0.25 } },
    adopted: { min: { administration: 0.55, printing: 0.5, treasury: 110, experimentRecord: 0.4 } },
    minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
  },
  {
    id: "mineSurveyAndDrainage",
    label: "Mine survey and drainage",
    era: 4,
    scope: "state",
    prerequisites: ["improvedMining", "mechanicalWorkshops"],
    known: { min: { mineCount: 1, metallurgy: 0.25 } },
    demonstrated: { min: { deepMineCount: 1, mineDrainagePressure: 0.25, metallurgy: 0.4, woodworking: 0.25 } },
    adopted: { min: { deepMineCount: 1, mineDrainagePressure: 0.4, metallurgy: 0.5, treasury: 60 } }
  },
  {
    id: "precisionBoringAndMeasurement",
    label: "Precision boring and measurement",
    era: 4,
    scope: "state",
    prerequisites: ["highTempFurnace", "recordReplication"],
    known: { min: { metallurgy: 0.4, smelterWorkers: 5508 } },
    demonstrated: { min: { metallurgy: 0.55, smelterWorkers: 9508, printing: 0.25 } },
    adopted: { min: { metallurgy: 0.65, smelterWorkers: 13508, administration: 0.35 } }
  },
  {
    id: "coalFuelSupply",
    label: "Coal fuel supply",
    era: 4,
    scope: "state",
    prerequisites: ["improvedMining", "commercialFinance"],
    known: { min: { mineCount: 1, treasury: 30 } },
    demonstrated: { min: { mineCount: 1, treasury: 60, administration: 0.2 } },
    adopted: { min: { mineCount: 1, treasury: 100, administration: 0.3 } }
  },
  {
    id: "earlyPublicHealth",
    label: "Early public health",
    era: 4,
    scope: "state",
    prerequisites: ["hospitalMedicine", "urbanCoveredDrainage"],
    known: { min: { administration: 0.3, urbanWaterMaxMunicipalSanitation: 0.2, treasury: 50 } },
    demonstrated: { min: { hospitalInstallations: 1, urbanWaterMaxTier: 3, administration: 0.4, treasury: 80 } },
    adopted: { min: { hospitalInstallations: 2, urbanWaterMaxTier: 3, administration: 0.5, treasury: 120 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  {
    id: "analyticalChemistry",
    label: "Analytical chemistry",
    era: 4,
    scope: "state",
    prerequisites: ["laboratoryGlassware", "experimentalNaturalPhilosophy"],
    known: { min: { experimentRecord: 0.2, labVesselQuality: 0.45, treasury: 50 } },
    demonstrated: { min: { experimentRecord: 0.4, labVesselQuality: 0.45, treasury: 70 } },
    adopted: { min: { experimentRecord: 0.55, naturalPhilosophy: 0.4, treasury: 110 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
  }
];

/** Stage 5: first practical steam — atmospheric mine-drainage engines and early industrial power. */
const ERA_5: readonly TechnologyDefinition[] = [
  {
    id: "atmosphericSteamPumping",
    label: "Atmospheric steam pumping",
    era: 5,
    scope: "state",
    prerequisites: [
      "experimentalNaturalPhilosophy",
      "mineSurveyAndDrainage",
      "precisionBoringAndMeasurement",
      "coalFuelSupply"
    ],
    known: { min: { mineDrainagePressure: 0.2, deepMineCount: 1, treasury: 80 } },
    demonstrated: {
      min: { mineDrainagePressure: 0.35, deepMineCount: 1, metallurgy: 0.55, treasury: 120, steamTrialYears: 2 }
    },
    adopted: {
      min: {
        mineDrainagePressure: 0.45,
        deepMineCount: 1,
        metallurgy: 0.65,
        administration: 0.4,
        treasury: 160,
        steamInstallations: 1
      }
    },
    minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
  },
  {
    id: "condensateEfficiency",
    label: "Separate-condenser steam engine",
    era: 5,
    scope: "state",
    prerequisites: ["atmosphericSteamPumping"],
    known: { min: { steamInstallations: 1, metallurgy: 0.5, treasury: 80 } },
    demonstrated: { min: { steamInstallations: 1, metallurgy: 0.6, administration: 0.35, treasury: 120 } },
    adopted: { min: { steamInstallations: 1, metallurgy: 0.7, administration: 0.45, treasury: 160 } },
    minimumYearsAtPreviousStage: { demonstrated: 1, adopted: 2 }
  },
  {
    id: "rotarySteamPower",
    label: "Rotary steam power",
    era: 5,
    scope: "state",
    prerequisites: ["condensateEfficiency", "mechanicalWorkshops"],
    known: { min: { woodworking: 0.35, metallurgy: 0.5, treasury: 80 } },
    demonstrated: { min: { woodworking: 0.45, metallurgy: 0.6, urbanPopulation: 15, treasury: 120 } },
    adopted: { min: { woodworking: 0.55, metallurgy: 0.65, urbanPopulation: 20, treasury: 160 } }
  },
  {
    id: "coalCarbonization",
    label: "Coke-fuelled blast furnace",
    era: 5,
    scope: "state",
    prerequisites: ["improvedMining", "highTempFurnace"],
    known: { min: { mineCount: 1, metallurgy: 0.35, treasury: 40 } },
    demonstrated: { min: { coalMineCount: 1, metallurgy: 0.5, smelterWorkers: 7508, treasury: 70 } },
    adopted: { min: { coalMineCount: 1, metallurgy: 0.6, smelterWorkers: 11508, treasury: 100 } }
  },
  {
    id: "standardMachineWorks",
    label: "Standard machine works",
    era: 5,
    scope: "state",
    prerequisites: ["rotarySteamPower", "coalCarbonization"],
    known: { min: { metallurgy: 0.55, smelterWorkers: 7508, treasury: 80 } },
    demonstrated: { min: { metallurgy: 0.65, smelterWorkers: 11508, administration: 0.35, treasury: 120 } },
    adopted: { min: { metallurgy: 0.7, smelterWorkers: 13508, administration: 0.45, treasury: 160 } }
  },
  {
    id: "highEfficiencySteamEngine",
    label: "High-efficiency stationary steam engine",
    era: 5,
    scope: "state",
    prerequisites: ["condensateEfficiency", "standardMachineWorks"],
    known: { min: { metallurgy: 0.6, treasury: 100 } },
    demonstrated: { min: { metallurgy: 0.7, administration: 0.4, treasury: 140 } },
    adopted: { min: { metallurgy: 0.75, administration: 0.5, treasury: 180 } }
  },
  {
    id: "steamTransport",
    label: "Steam locomotive",
    era: 5,
    scope: "state",
    prerequisites: ["highEfficiencySteamEngine", "stoneBuildingAndRoads"],
    known: { min: { treasury: 120, administration: 0.35 } },
    demonstrated: { min: { treasury: 160, administration: 0.4, urbanPopulation: 18 } },
    adopted: { min: { treasury: 200, administration: 0.5, urbanPopulation: 25 } }
  },
  {
    id: "railEngineering",
    label: "Rail engineering",
    era: 5,
    scope: "state",
    prerequisites: ["steamTransport", "standardMachineWorks"],
    known: { min: { treasury: 140, masonry: 0.3 } },
    demonstrated: { min: { treasury: 180, masonry: 0.4, administration: 0.4 } },
    adopted: { min: { treasury: 220, masonry: 0.5, administration: 0.5 } }
  },
  {
    id: "railwayOperations",
    label: "Railway operations",
    era: 5,
    scope: "state",
    prerequisites: ["railEngineering", "commercialFinance"],
    known: { min: { treasury: 160, portCount: 0, administration: 0.4 } },
    demonstrated: { min: { treasury: 200, administration: 0.45 } },
    adopted: { min: { treasury: 260, administration: 0.55 } }
  },
  {
    id: "municipalSteamPumping",
    label: "Municipal steam pumping",
    era: 5,
    scope: "state",
    prerequisites: ["highEfficiencySteamEngine", "urbanCoveredDrainage"],
    known: { min: { urbanWaterMaxTier: 2, treasury: 80 } },
    demonstrated: { min: { urbanWaterMaxTier: 3, administration: 0.35, treasury: 120 } },
    adopted: { min: { urbanWaterMaxTier: 3, administration: 0.45, treasury: 160 } }
  },
  {
    id: "marineSteamEngineering",
    label: "Marine steam engineering",
    era: 5,
    scope: "state",
    prerequisites: ["highEfficiencySteamEngine", "oceanGoingHulls"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 1, treasury: 100 } },
    demonstrated: { min: { portCount: 1, shipTechPoints: 40, treasury: 140 } },
    adopted: { min: { portCount: 2, shipTechPoints: 80, treasury: 180 } }
  },
  {
    id: "coastalSteamNavigation",
    label: "Coastal steam navigation",
    era: 5,
    scope: "state",
    prerequisites: ["marineSteamEngineering", "fleetLogistics"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 1, completedHulls: 2, treasury: 120 } },
    demonstrated: { min: { portCount: 2, completedHulls: 4, treasury: 160 } },
    adopted: { min: { portCount: 2, completedHulls: 6, treasury: 200 } }
  },
  {
    id: "oceanSteamNavigation",
    label: "Ocean steam navigation",
    era: 5,
    scope: "state",
    prerequisites: ["coastalSteamNavigation", "oceanNavigation"],
    worldGates: ["shipbuildingWorld"],
    known: { min: { portCount: 2, completedHulls: 4, treasury: 160 } },
    demonstrated: { min: { portCount: 2, completedHulls: 6, shipTechPoints: 80, treasury: 200 } },
    adopted: { min: { portCount: 3, completedHulls: 8, shipTechPoints: 120, treasury: 260 } }
  }
];

/** Stage 6: industrial chemistry foundation, sulfuric acid, and phosphate fertilizer. */
const ERA_6: readonly TechnologyDefinition[] = [
  {
    id: "chemicalIndustryFoundation",
    label: "Chemical industry foundation",
    era: 6,
    scope: "state",
    prerequisites: ["analyticalChemistry"],
    known: { min: { experimentRecord: 0.4, sulfurAccess: 0.2, lateChemistryDemandPressure: 0.2, treasury: 80 } },
    demonstrated: { min: { experimentRecord: 0.5, sulfurAccess: 0.3, treasury: 110 } },
    adopted: { min: { experimentRecord: 0.55, sulfurAccess: 0.35, treasury: 140 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
  },
  {
    id: "industrialSulfuricAcid",
    label: "Industrial sulfuric acid",
    era: 6,
    scope: "state",
    prerequisites: ["chemicalIndustryFoundation"],
    known: { min: { sulfurAccess: 0.3, labVesselQuality: 0.45, treasury: 100 } },
    demonstrated: { min: { acidPlantTrialYears: 2, sulfurAccess: 0.35, treasury: 140 } },
    adopted: { min: { acidPlantInstallations: 1, sulfurAccess: 0.4, treasury: 180 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/phosphate-fertilizer-vertical-slice.md §3.5. demonstrated/adopted read
  // phosphateFertilizerTrialYears/phosphateFertilizerPlantCount, sourced from
  // PhosphateFertilizerPlants (§3.7) via technologyProgress.ts (§3.6).
  {
    id: "phosphateFertilizer",
    label: "Phosphate fertilizer",
    era: 6,
    scope: "state",
    prerequisites: ["industrialSulfuricAcid"],
    known: {
      min: {
        sulfurAccess: 0.35,
        phosphateRockAccess: 0.25,
        administration: 0.4,
        foodFertilizerPressure: 0.2,
        treasury: 130
      }
    },
    demonstrated: { min: { phosphateFertilizerTrialYears: 2, phosphateRockAccess: 0.3, treasury: 170 } },
    adopted: { min: { phosphateFertilizerPlantCount: 1, phosphateRockAccess: 0.35, treasury: 210 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.4. metallurgy: 0.75 is set
  // above standardMachineWorks's own adopted threshold (0.7) so it isn't automatically met the
  // moment the prerequisite is adopted. demonstrated/adopted read modernSteelmakingTrialYears/
  // modernSteelmakingInstallations, sourced from SteelConverterPlant (§3.2) via
  // technologyProgress.ts (§3.3).
  {
    id: "modernSteelmaking",
    label: "Modern steelmaking",
    era: 6,
    scope: "state",
    prerequisites: ["standardMachineWorks"],
    known: { min: { metallurgy: 0.75, steelAccess: 0.2, administration: 0.4, treasury: 150 } },
    demonstrated: { min: { modernSteelmakingTrialYears: 2, metallurgy: 0.8, treasury: 190 } },
    adopted: { min: { modernSteelmakingInstallations: 1, metallurgy: 0.85, treasury: 230 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.5. Requires both
  // modernSteelmaking and industrialSulfuricAcid adopted (prerequisitesMet()); by then
  // metallurgy already clears modernSteelmaking's adopted threshold (0.85), so it is not
  // re-listed here — same reasoning as industrialSulfuricAcid not re-listing
  // chemicalIndustryFoundation's experimentRecord threshold. No new Good or facility: "steel
  // quality"/"instrumentation"/"safety regulation" are represented by steelAccess (new)/
  // instruments (existing craft-knowledge signal)/administration (existing); "trial years" reuse
  // ExperimentalWorkshops' experimentRecord signal instead of a dedicated apparatus (§7 decision 5).
  {
    id: "highPressureChemicalApparatus",
    label: "High-pressure chemical apparatus",
    era: 6,
    scope: "state",
    prerequisites: ["modernSteelmaking", "industrialSulfuricAcid"],
    known: { min: { steelAccess: 0.3, instruments: 0.3, administration: 0.5, treasury: 190 } },
    demonstrated: { min: { experimentRecord: 0.6, steelAccess: 0.35, treasury: 240 } },
    adopted: { min: { experimentRecord: 0.65, steelAccess: 0.4, administration: 0.6, treasury: 290 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/catalytic-chemistry.md §3. No new Good/facility/signal: "研究所" (ExperimentalWorkshops,
  // already backing experimentRecord/naturalPhilosophy/instruments) and "長期投資"
  // (minimumYearsAtPreviousStage, the same mechanism every other era-6 node here uses) already
  // cover the roadmap's "research institute, rare materials, long-term investment" prerequisites
  // (technology-development-roadmap.md §9.1) except rare catalyst materials, deliberately deferred
  // to syntheticAmmonia per modern-steelmaking-and-high-pressure-apparatus.md §7 decision 4. Every
  // threshold below is set above what highPressureChemicalApparatus's own adopted stage already
  // guarantees (experimentRecord 0.65, instruments 0.3, administration 0.6, treasury 290), so this
  // node is not automatically satisfied the instant its prerequisite is adopted.
  {
    id: "catalyticChemistry",
    label: "Catalytic chemistry",
    era: 6,
    scope: "state",
    prerequisites: ["highPressureChemicalApparatus"],
    known: { min: { experimentRecord: 0.65, naturalPhilosophy: 0.5, instruments: 0.4, treasury: 320 } },
    demonstrated: { min: { experimentRecord: 0.7, naturalPhilosophy: 0.55, treasury: 380 } },
    adopted: { min: { experimentRecord: 0.75, naturalPhilosophy: 0.6, administration: 0.65, treasury: 450 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/synthetic-ammonia-vertical-slice.md §3.4. Sole prerequisite is catalyticChemistry:
  // prerequisitesMet() already requires every prerequisite adopted, so catalyticChemistry's own
  // ancestor chain (highPressureChemicalApparatus/modernSteelmaking/industrialSulfuricAcid/
  // chemicalIndustryFoundation) is transitively required without re-listing it here. known's
  // administration/instruments sit at or above catalyticChemistry's own adopted thresholds (the
  // gate this node's prerequisite already clears just before this node can progress at all);
  // fertilizerCoverageGap is the new "fertilizer coverage gap" demand signal (§3.5).
  {
    id: "syntheticAmmonia",
    label: "Synthetic ammonia",
    era: 6,
    scope: "state",
    prerequisites: ["catalyticChemistry"],
    known: {
      min: { fertilizerCoverageGap: 0.3, administration: 0.65, instruments: 0.45, treasury: 500 }
    },
    demonstrated: {
      min: { syntheticAmmoniaTrialYears: 2, experimentRecord: 0.75, treasury: 600 }
    },
    adopted: {
      min: { syntheticAmmoniaInstallations: 1, administration: 0.7, treasury: 700 }
    },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/electric-power-and-telegraph.md §3.4. An independent branch off era 4's
  // experimentalNaturalPhilosophy (same two-hop jump as chemicalIndustryFoundation ->
  // analyticalChemistry) rather than the chemicalIndustryFoundation chain above — the roadmap
  // treats electrification and modern chemistry as parallel fields, not one line. experimentRecord
  // thresholds sit above experimentalNaturalPhilosophy's own adopted (0.4); instruments is an
  // independent signal experimentalNaturalPhilosophy never touches.
  {
    id: "electricalExperiments",
    label: "Electrical and magnetic experiments",
    era: 6,
    scope: "state",
    prerequisites: ["experimentalNaturalPhilosophy"],
    known: { min: { naturalPhilosophy: 0.45, instruments: 0.3, experimentRecord: 0.45, treasury: 90 } },
    demonstrated: { min: { naturalPhilosophy: 0.5, experimentRecord: 0.5, treasury: 120 } },
    adopted: { min: { naturalPhilosophy: 0.55, instruments: 0.35, administration: 0.35, treasury: 150 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
  },
  // docs/plan/electric-power-and-telegraph.md §3.5. known deliberately omits naturalPhilosophy —
  // electricalExperiments' own adopted already requires naturalPhilosophy >= 0.55, so a known
  // threshold below that would be met the instant the prerequisite adopts (same reasoning
  // industrialSulfuricAcid uses for not re-listing chemicalIndustryFoundation's experimentRecord).
  // demonstrated/adopted reintroduce naturalPhilosophy above that 0.55 floor. No dedicated
  // "battery" Good or Precision Instruments Good — instruments stands in, per modern-steelmaking-
  // and-high-pressure-apparatus.md §7 decision 4.
  {
    id: "practicalElectrochemistry",
    label: "Practical batteries and electrical measurement",
    era: 6,
    scope: "state",
    prerequisites: ["electricalExperiments"],
    known: { min: { copperWireAccess: 0.15, instruments: 0.4, treasury: 130 } },
    demonstrated: { min: { naturalPhilosophy: 0.58, instruments: 0.45, treasury: 160 } },
    adopted: { min: { naturalPhilosophy: 0.62, instruments: 0.5, administration: 0.4, treasury: 200 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
  },
  // docs/plan/electric-power-and-telegraph.md §3.6. Sole prerequisite is practicalElectrochemistry
  // — deliberately does not route through generatorAndMotor/powerGrid. Historically the telegraph
  // (Morse, 1837) preceded practical generators and grids by decades and ran on batteries alone
  // (steam-industrial-technology-history.csv row 13).
  {
    id: "electricTelegraph",
    label: "Electric telegraph network",
    era: 6,
    scope: "state",
    prerequisites: ["practicalElectrochemistry"],
    known: { min: { copperWireAccess: 0.3, administration: 0.45, treasury: 160 } },
    demonstrated: { min: { telegraphLineTrialYears: 2, copperWireAccess: 0.35, treasury: 210 } },
    adopted: { min: { telegraphLineInstallations: 1, administration: 0.55, treasury: 260 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/electric-power-and-telegraph.md §3.7. Two prerequisites, same shape as
  // highPressureChemicalApparatus (modernSteelmaking + industrialSulfuricAcid): both
  // electricalExperiments and modernSteelmaking must be adopted. steelAccess (0.3) sits above
  // modernSteelmaking's own known threshold (0.2, never re-stated at its demonstrated/adopted), so
  // it remains a meaningful gate rather than an automatic pass-through.
  {
    id: "generatorAndMotor",
    label: "Generator and motor",
    era: 6,
    scope: "state",
    prerequisites: ["electricalExperiments", "modernSteelmaking"],
    known: { min: { copperWireAccess: 0.35, steelAccess: 0.3, instruments: 0.4, treasury: 260 } },
    demonstrated: { min: { powerStationTrialYears: 2, steelAccess: 0.35, treasury: 320 } },
    adopted: { min: { powerStationInstallations: 1, administration: 0.55, treasury: 380 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  },
  // docs/plan/electric-power-and-telegraph.md §3.8. administration sits above generatorAndMotor's
  // own adopted threshold (0.55) at every stage so it is never automatically satisfied the instant
  // the prerequisite adopts. electricityCoverage is the fresh demand-pull signal.
  {
    id: "powerGrid",
    label: "Power grid and electricity utilities",
    era: 6,
    scope: "state",
    prerequisites: ["generatorAndMotor"],
    known: { min: { electricityCoverage: 0.25, administration: 0.58, treasury: 350 } },
    demonstrated: { min: { electricityCoverage: 0.3, administration: 0.62, treasury: 420 } },
    adopted: { min: { electricityCoverage: 0.35, administration: 0.68, treasury: 500 } },
    minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
  }
];

export const TECHNOLOGY_DEFINITIONS: readonly TechnologyDefinition[] = [
  ...START_PROFILE,
  ...ERA_1,
  ...ERA_2,
  ...ERA_3,
  ...ERA_4,
  ...ERA_5,
  ...ERA_6
];

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
