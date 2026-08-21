import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { TECHNOLOGY_DEFINITIONS } from "./technologyDefinitions";
import {
  explainTechnologyGate,
  getAtmosphericSteamDrainageBonus,
  getAtmosphericSteamPumpingEffect,
  getFourCourseRotationEffect,
  getGunpowderDemandTechMultiplier,
  getInternalCombustionEngineEffect,
  getMaxShipClassTierForState,
  getMechanizedTextilesEffect,
  getMechanizedTextilesOutputMultiplier,
  getMilitarySignalRocketsEffect,
  getStagingAndOrbitalInsertionEffect,
  getStateMaritimeAptitude,
  getTechnologyProgressEntries,
  getTechnologyStage,
  HINTABLE_KNOWN_RATIO_KEYS,
  isDistillationKnown,
  isLaboratoryGlasswareKnown,
  resetTechnologyProgress,
  seedTechnologyStartProfile,
  setTechnologyProgressForTests,
  settleTechnologyAnnual
} from "./technologyProgress";
import { createEmptyTechnologySimulationState, type TechnologyProgress } from "./technologyTypes";

function installMinimalWorld(
  opts: {
    gunpowder?: boolean;
    historicalPeriod?:
      | "earlyMedieval"
      | "highMedieval"
      | "lateMedieval"
      | "ageOfExploration"
      | "maritimeEra"
      | "preIndustrialEra"
      | "steamEra"
      | "industrialChemistryEra"
      | "petroleumEra"
      | "rocketryEra";
  } = {}
): void {
  worldContext.options = {
    ...(worldContext.options ?? {}),
    gunpowderEraEnabled: opts.gunpowder ?? false,
    // Explicitly reset (not just spread from a possibly-stale previous test) so no test can leak
    // historicalPeriod into the next one that doesn't set it.
    historicalPeriod: opts.historicalPeriod,
    year: 1200
  } as typeof worldContext.options;
  // worldContext.populationRate defaults to the module placeholder 1 (worldContext.ts), not the
  // real default of 1000 (optionsState.ts). Harmless while smelterWorkers was a raw population-
  // point sum; docs/plan/craft-demand-calibration.md PR 4 restates it in real people
  // (`workers × populationRate`), so tests need a realistic rate for its higher thresholds to be
  // reachable at all.
  worldContext.populationRate = 1000;
  worldContext.pack = {
    ...(worldContext.pack ?? {}),
    states: [
      0,
      {
        i: 1,
        name: "Coast",
        removed: false,
        treasury: 200,
        diplomacy: ["Neutral", "Enemy"],
        military: []
      },
      {
        i: 2,
        name: "Inland",
        removed: false,
        treasury: 40,
        diplomacy: ["Neutral", "Neutral"],
        military: []
      }
    ],
    burgs: [
      0,
      {
        i: 1,
        state: 1,
        population: 30,
        port: 1,
        capital: 1,
        removed: false
      },
      {
        i: 2,
        state: 1,
        population: 12,
        port: 1,
        capital: 0,
        removed: false
      },
      {
        i: 3,
        state: 2,
        population: 18,
        port: 0,
        capital: 1,
        removed: false
      }
    ]
  } as typeof worldContext.pack;
  simulationContext.currentYear = 1200;
  simulationContext.extensions = {};
  simulationContext.technology = createEmptyTechnologySimulationState();
}

describe("technologyProgress", () => {
  beforeEach(() => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 1, technologyRequirementEase: 1 });
    installMinimalWorld({ gunpowder: false });
    resetTechnologyProgress();
  });

  afterEach(() => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 1, technologyRequirementEase: 1 });
  });

  it("seeds mature-medieval start profile as diffused for every live state", () => {
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("threeFieldAgriculture", 1)).toBe("diffused");
    expect(getTechnologyStage("coastalNavigation", 2)).toBe("diffused");
    expect(getTechnologyStage("basicMetallurgy", 1)).toBe("diffused");
    // Gunpowder nodes are world-gated off.
    expect(getTechnologyStage("blackPowder", 1)).toBe("locked");
  });

  it("does not instantiate gunpowder nodes when the world gate is off", () => {
    seedTechnologyStartProfile(1200);
    settleTechnologyAnnual(1200);
    const gunpowderIds = TECHNOLOGY_DEFINITIONS.filter(d => d.era === 2).map(d => d.id);
    for (const id of gunpowderIds) {
      expect(simulationContext.technology.progress.some(p => p.technologyId === id && p.ownerId === 1)).toBe(false);
    }
  });

  it("seeds gunpowder-chain technologies at a period-appropriate starting stage instead of always locked", () => {
    // earlyMedieval/highMedieval: unchanged, still locked even with the world gate on.
    installMinimalWorld({ gunpowder: true, historicalPeriod: "earlyMedieval" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("blackPowder", 1)).toBe("locked");
    expect(getTechnologyStage("massFirearms", 1)).toBe("locked");

    // lateMedieval: known — the recipe exists and is documented, but still rare/unrefined.
    resetTechnologyProgress();
    installMinimalWorld({ gunpowder: true, historicalPeriod: "lateMedieval" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("blackPowder", 1)).toBe("known");
    // Later-chain nodes (cornedPowder, massFirearms) get the same period floor.
    expect(getTechnologyStage("massFirearms", 1)).toBe("known");

    // ageOfExploration (default period): demonstrated — established, widely circulated knowledge;
    // a state still has to invest to reach "adopted" mass production.
    resetTechnologyProgress();
    installMinimalWorld({ gunpowder: true, historicalPeriod: "ageOfExploration" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("blackPowder", 1)).toBe("demonstrated");
    expect(getTechnologyStage("massFirearms", 1)).toBe("demonstrated");

    // A non-gunpowder technology is unaffected by historicalPeriod either way.
    expect(getTechnologyStage("threeFieldAgriculture", 1)).toBe("diffused");
  });

  it("seeds Age of Exploration and later historical periods as diffused below, demonstrated at, and untouched above their frontier era", () => {
    installMinimalWorld({ gunpowder: true, historicalPeriod: "ageOfExploration" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("improvedMining", 1)).toBe("diffused"); // era 1
    expect(getTechnologyStage("oceanNavigation", 1)).toBe("demonstrated"); // era 3
    expect(getTechnologyStage("overseasTradingPosts", 1)).toBe("demonstrated"); // era 3

    resetTechnologyProgress();
    // steamEra corresponds to Technology Overview's Era 5 (docs/plan/technology-development-
    // roadmap.md §3): era 0-4 nodes (including the era-2 gunpowder chain) are fully diffused, era
    // 5 itself is demonstrated, and era 6+ is left alone (still locked).
    installMinimalWorld({ gunpowder: true, historicalPeriod: "steamEra" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("threeFieldAgriculture", 1)).toBe("diffused"); // era 0
    expect(getTechnologyStage("improvedMining", 1)).toBe("diffused"); // era 1
    expect(getTechnologyStage("blackPowder", 1)).toBe("diffused"); // era 2 — strictly below the frontier
    expect(getTechnologyStage("atmosphericSteamPumping", 1)).toBe("demonstrated"); // era 5, at the frontier
    expect(getTechnologyStage("chemicalIndustryFoundation", 1)).toBe("locked"); // era 6, above the frontier

    // rocketryEra corresponds to Era 8, the highest defined — everything below is diffused and
    // era 8 itself is demonstrated (there is no era above it to leave locked).
    resetTechnologyProgress();
    installMinimalWorld({ gunpowder: false, historicalPeriod: "rocketryEra" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("modernDrillingAndFieldOperations", 1)).toBe("diffused"); // era 7
    expect(getTechnologyStage("rocketDynamicsAndHighTemperatureCombustionResearch", 1)).toBe("demonstrated"); // era 8

    // The pre-Exploration periods retain their original technology profile.
    resetTechnologyProgress();
    installMinimalWorld({ gunpowder: true, historicalPeriod: "lateMedieval" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("improvedMining", 1)).toBe("locked");
  });

  it("gives naval states priority, then compact states, in the seeded maritime profile", () => {
    installMinimalWorld({ historicalPeriod: "ageOfExploration" });
    worldContext.seed = "maritime-profile-test";
    worldContext.pack.states[1].type = "Naval";
    worldContext.pack.states[1].area = 120;
    worldContext.pack.states[2].type = "Generic";
    worldContext.pack.states[2].area = 10;
    worldContext.pack.states.push({ i: 3, name: "Large", type: "Generic", area: 120, treasury: 20 } as never);

    expect(getStateMaritimeAptitude(1)).toBe(2);
    expect(getStateMaritimeAptitude(2)).toBeGreaterThanOrEqual(1);
    expect(getStateMaritimeAptitude(2)).toBeGreaterThanOrEqual(getStateMaritimeAptitude(3));

    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("oceanNavigation", 1)).toBe("adopted");
  });

  it("keeps a period-seeded gunpowder stage after annual evaluation instead of resetting it", () => {
    // A "known"-seeded stage (rank 1) is below advanceStage()'s "does not re-evaluate downward"
    // cutoff (startStage >= "adopted", rank 3), so settleTechnologyAnnual() still evaluates it
    // every year and could advance it further given the right signals — the period seed only
    // raises the floor, it never hard-locks a state at that stage the way an "adopted"/"diffused"
    // startStage would (see the early-return this test's minimal fixture doesn't attempt to clear
    // blackPowder's own prerequisite chain — highTempFurnace/recordReplication — so the concrete
    // behavior verified here is simpler: the seed isn't wiped back to "locked" by the settle pass).
    installMinimalWorld({ gunpowder: true, historicalPeriod: "lateMedieval" });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("blackPowder", 1)).toBe("known");

    settleTechnologyAnnual(1200);
    expect(getTechnologyStage("blackPowder", 1)).toBe("known");
  });

  it("self-gates annual evaluation to once per year", () => {
    seedTechnologyStartProfile(1200);
    expect(settleTechnologyAnnual(1200)).toBe(true);
    expect(settleTechnologyAnnual(1200)).toBe(false);
    expect(settleTechnologyAnnual(1201)).toBe(true);
  });

  it("defines four-course rotation as a late agricultural technology and exposes staged uptake", () => {
    const definition = TECHNOLOGY_DEFINITIONS.find(def => def.id === "fourCourseRotation");
    expect(definition).toMatchObject({ era: 1, prerequisites: ["threeFieldAgriculture", "ironToolsAndDraftAnimals"] });

    setTechnologyProgressForTests([
      { technologyId: "fourCourseRotation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "fourCourseRotation", scope: "state", ownerId: 2, stage: "diffused", diffusion: 1 }
    ]);
    expect(getFourCourseRotationEffect(1)).toBeCloseTo(0.35);
    expect(getFourCourseRotationEffect(2)).toBe(1);
    expect(getFourCourseRotationEffect(3)).toBe(0);
  });

  it("unlocks distillation only once a state reaches the known stage", () => {
    const definition = TECHNOLOGY_DEFINITIONS.find(def => def.id === "distillation");
    expect(definition).toMatchObject({
      era: 1,
      prerequisites: ["basicMetallurgy", "recordReplication"]
    });
    expect(isDistillationKnown(1)).toBe(false);

    setTechnologyProgressForTests([
      { technologyId: "distillation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(isDistillationKnown(1)).toBe(true);
    expect(isDistillationKnown(2)).toBe(false);
  });

  it("advances improvedMining when mine and metallurgy signals are present", () => {
    installMinimalWorld({ gunpowder: false });
    simulationContext.extensions = {
      economy: {
        guildKnowledgeStocks: [
          { burgId: 3, domain: "metallurgy", stock: 0.5 },
          { burgId: 3, domain: "printing", stock: 0.1 }
        ],
        mineOperations: [
          { burgId: 3, active: true, workers: 4 },
          { burgId: 3, active: true, workers: 4 }
        ],
        smelterOperations: [{ burgId: 3, active: true, workers: 8 }]
      }
    };
    seedTechnologyStartProfile(1200);
    // Force a few years so known→demonstrated→adopted can climb with strong signals.
    for (let year = 1200; year <= 1205; year++) {
      simulationContext.currentYear = year;
      settleTechnologyAnnual(year);
    }
    const stage = getTechnologyStage("improvedMining", 2);
    expect(["demonstrated", "adopted", "diffused"]).toContain(stage);
  });

  describe("smelterWorkers restated in real people (docs/plan/craft-demand-calibration.md PR 4)", () => {
    // getSmelterRequiredWorkers({annualCapacityTons}) = 0.5 + tons × 0.0025 (smelterOperations.ts) —
    // a fully-staffed smelter's reconciled points figure for a furnace of that annual capacity.
    function settleHighTempFurnace(smelterWorkersPoints: number): void {
      installMinimalWorld({ gunpowder: false });
      worldContext.pack.states[2].treasury = 200;
      simulationContext.extensions = {
        economy: {
          guildKnowledgeStocks: [{ burgId: 3, domain: "metallurgy", stock: 0.6 }],
          mineOperations: [
            { burgId: 3, active: true, workers: 4 },
            { burgId: 3, active: true, workers: 4 }
          ],
          smelterOperations: [{ burgId: 3, active: true, workers: smelterWorkersPoints }]
        }
      };
      seedTechnologyStartProfile(1200);
      for (let year = 1200; year <= 1205; year++) {
        simulationContext.currentYear = year;
        settleTechnologyAnnual(year);
      }
    }

    it("does not adopt highTempFurnace for an under-threshold furnace (~3000 tons ≈ 8000 people, under the 9508-person gate)", () => {
      // 8 points = getSmelterRequiredWorkers({annualCapacityTons: 3000}) — clears improvedMining's
      // adopted gate (3508) and highTempFurnace's own known/demonstrated gates (1508/5508), but
      // 8 × populationRate(1000) = 8000 falls short of highTempFurnace.adopted's 9508.
      settleHighTempFurnace(8);
      expect(getTechnologyStage("highTempFurnace", 2)).not.toBe("adopted");
    });

    it("adopts highTempFurnace for the old 10-point-equivalent furnace (3800 tons, docs/plan/craft-demand-calibration.md §5 worked example)", () => {
      // 10 points × 1000 = 10,000 people clears the 9508-person adopted gate — restating the gate
      // preserves reachability for a furnace that met the pre-PR-4 10-point threshold, without
      // loosening it into a steam-patch (the BASE_PEOPLE-derived headroom is only 492 people).
      settleHighTempFurnace(10);
      expect(["adopted", "diffused"]).toContain(getTechnologyStage("highTempFurnace", 2));
    });
  });

  it("gates caravel/galleon ship tiers behind ocean-going tech stages", () => {
    setTechnologyProgressForTests([
      {
        technologyId: "oceanGoingHulls",
        scope: "state",
        ownerId: 1,
        stage: "locked",
        diffusion: 0
      }
    ]);
    expect(getMaxShipClassTierForState(1)).toBe(0);

    setTechnologyProgressForTests([
      {
        technologyId: "oceanGoingHulls",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);
    expect(getMaxShipClassTierForState(1)).toBe(1);

    setTechnologyProgressForTests([
      {
        technologyId: "oceanGoingHulls",
        scope: "state",
        ownerId: 1,
        stage: "adopted",
        diffusion: 0.2
      },
      {
        technologyId: "oceanNavigation",
        scope: "state",
        ownerId: 1,
        stage: "known",
        diffusion: 0
      }
    ]);
    expect(getMaxShipClassTierForState(1)).toBe(2);
  });

  it("scales gunpowder demand by adoption stage when the world gate is on", () => {
    installMinimalWorld({ gunpowder: true });
    setTechnologyProgressForTests([]);
    expect(getGunpowderDemandTechMultiplier(1)).toBe(1.4);

    setTechnologyProgressForTests([
      {
        technologyId: "blackPowder",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);
    expect(getGunpowderDemandTechMultiplier(1)).toBe(1.1);

    setTechnologyProgressForTests([
      {
        technologyId: "massFirearms",
        scope: "state",
        ownerId: 1,
        stage: "adopted",
        diffusion: 0
      }
    ]);
    expect(getGunpowderDemandTechMultiplier(1)).toBe(0.85);
  });

  it("keeps gunpowder demand multiplier at 0 when the world gate is off", () => {
    installMinimalWorld({ gunpowder: false });
    expect(getGunpowderDemandTechMultiplier(1)).toBe(0);
  });

  it("defines atmospheric steam pumping behind the pre-industrial knowledge chain", () => {
    const definition = TECHNOLOGY_DEFINITIONS.find(def => def.id === "atmosphericSteamPumping");
    expect(definition).toMatchObject({
      era: 5,
      prerequisites: [
        "experimentalNaturalPhilosophy",
        "mineSurveyAndDrainage",
        "precisionBoringAndMeasurement",
        "coalFuelSupply"
      ]
    });
    expect(getAtmosphericSteamPumpingEffect(1)).toBe(0);
    expect(getAtmosphericSteamDrainageBonus(1)).toBe(0);

    setTechnologyProgressForTests([
      { technologyId: "atmosphericSteamPumping", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(getAtmosphericSteamPumpingEffect(1)).toBeCloseTo(0.35);
    expect(getAtmosphericSteamDrainageBonus(1)).toBeCloseTo(0.175);
  });

  it("advances steam pumping when pre-industrial prerequisites and mine pressure are present", () => {
    installMinimalWorld({ gunpowder: false });
    simulationContext.extensions = {
      economy: {
        guildKnowledgeStocks: [
          { burgId: 3, domain: "metallurgy", stock: 0.7 },
          { burgId: 3, domain: "woodworking", stock: 0.4 },
          { burgId: 3, domain: "printing", stock: 0.55 }
        ],
        academyKnowledgeStocks: [{ burgId: 3, domain: "administration", stock: 0.6 }],
        experimentalWorkshops: [
          {
            burgId: 3,
            sponsorStateId: 2,
            active: true,
            researchers: 2,
            annualBudget: 16,
            experimentRecord: 0.5,
            lastFundedYear: 1200
          }
        ],
        mineOperations: [{ i: 1, burgId: 3, depositId: 1, active: true, drainage: 0.3, workers: 8 }],
        mineralDeposits: [{ i: 1, depth: "deep", primaryCommodity: "coal", commodities: ["coal"] }],
        smelterOperations: [{ burgId: 3, active: true, workers: 16 }],
        steamPumpTrials: [{ stateId: 2, mineOperationId: 1, documentedRuns: 3, status: "running" }],
        steamInstallations: [{ mineOperationId: 1 }]
      }
    };
    setTechnologyProgressForTests([
      { technologyId: "recordReplication", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "mathAstronomyGeography", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "distillation", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "improvedMining", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "mechanicalWorkshops", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "highTempFurnace", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "commercialFinance", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "experimentalNaturalPhilosophy", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 }
    ]);
    worldContext.pack.states[2].treasury = 200;

    for (let year = 1200; year <= 1204; year++) {
      simulationContext.currentYear = year;
      settleTechnologyAnnual(year);
    }

    expect(["demonstrated", "adopted", "diffused"]).toContain(getTechnologyStage("atmosphericSteamPumping", 2));
  });

  it("climbs atmospheric steam pumping in one year at 100× requirement ease without mines or trials", () => {
    useOptionsState.setState({ technologyRequirementEase: 100 });
    seedTechnologyStartProfile(1200);
    expect(getTechnologyStage("atmosphericSteamPumping", 1)).toBe("locked");

    settleTechnologyAnnual(1200);

    expect(["adopted", "diffused"]).toContain(getTechnologyStage("atmosphericSteamPumping", 1));
    expect(["adopted", "diffused"]).toContain(getTechnologyStage("condensateEfficiency", 1));
    expect(["adopted", "diffused"]).toContain(getTechnologyStage("highEfficiencySteamEngine", 1));
  });

  it("keeps steam pumping locked without mines at historical requirement ease", () => {
    seedTechnologyStartProfile(1200);
    settleTechnologyAnnual(1200);
    expect(getTechnologyStage("improvedMining", 1)).toBe("locked");
    expect(getTechnologyStage("atmosphericSteamPumping", 1)).toBe("locked");
  });

  it("defines factory organization and mechanized textiles behind the textiles guild chain", () => {
    const factoryOrganization = TECHNOLOGY_DEFINITIONS.find(def => def.id === "factoryOrganization");
    expect(factoryOrganization).toMatchObject({
      era: 4,
      prerequisites: ["mechanicalWorkshops", "commercialFinance"]
    });
    const mechanizedTextiles = TECHNOLOGY_DEFINITIONS.find(def => def.id === "mechanizedTextiles");
    expect(mechanizedTextiles).toMatchObject({
      era: 5,
      prerequisites: ["factoryOrganization", "rotarySteamPower"]
    });

    expect(getMechanizedTextilesEffect(1)).toBe(0);
    expect(getMechanizedTextilesOutputMultiplier(1)).toBe(1);

    setTechnologyProgressForTests([
      { technologyId: "mechanizedTextiles", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "mechanizedTextiles", scope: "state", ownerId: 2, stage: "diffused", diffusion: 1 }
    ]);
    expect(getMechanizedTextilesEffect(1)).toBeCloseTo(0.35);
    expect(getMechanizedTextilesOutputMultiplier(1)).toBeCloseTo(1 + 0.35 * 0.35);
    expect(getMechanizedTextilesEffect(2)).toBe(1);
    expect(getMechanizedTextilesOutputMultiplier(2)).toBeCloseTo(1.35);
  });

  it("advances factory organization and mechanized textiles once textiles/metalworking guild stock, capital, and steam power are present", () => {
    installMinimalWorld({ gunpowder: false });
    worldContext.pack.states[1].treasury = 400;
    simulationContext.extensions = {
      economy: {
        guildKnowledgeStocks: [
          { burgId: 1, domain: "textiles", stock: 0.8 },
          { burgId: 1, domain: "metallurgy", stock: 0.7 }
        ],
        academyKnowledgeStocks: [{ burgId: 1, domain: "administration", stock: 0.6 }]
      }
    };
    setTechnologyProgressForTests([
      { technologyId: "mechanicalWorkshops", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 },
      { technologyId: "commercialFinance", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 },
      { technologyId: "rotarySteamPower", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }
    ]);

    settleTechnologyAnnual(1200);

    // Burgs 1+2 (state 1) hold 42 population points, above both nodes' urbanPopulation floors.
    expect(["demonstrated", "adopted", "diffused"]).toContain(getTechnologyStage("factoryOrganization", 1));
    expect(["demonstrated", "adopted", "diffused"]).toContain(getTechnologyStage("mechanizedTextiles", 1));
  });

  it("keeps mechanized textiles locked without factory organization or rotary steam power", () => {
    installMinimalWorld({ gunpowder: false });
    worldContext.pack.states[1].treasury = 400;
    simulationContext.extensions = {
      economy: {
        guildKnowledgeStocks: [{ burgId: 1, domain: "textiles", stock: 0.9 }]
      }
    };
    settleTechnologyAnnual(1200);
    expect(getTechnologyStage("factoryOrganization", 1)).toBe("locked");
    expect(getTechnologyStage("mechanizedTextiles", 1)).toBe("locked");
  });

  it("diffuses an adopted technology in one year at 100× development speed", () => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 100 });
    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    // improvedMining has no startStage >= adopted, so settle still evaluates it.
    settleTechnologyAnnual(1200);
    const entry = getTechnologyProgressEntries().find(p => p.technologyId === "improvedMining" && p.ownerId === 1);
    expect(entry?.stage).toBe("diffused");
    expect(entry?.diffusion).toBe(1);
  });

  it("defines laboratory glassware without requiring Pumice and keeps chemistry off the medicine path", () => {
    const lab = TECHNOLOGY_DEFINITIONS.find(def => def.id === "laboratoryGlassware");
    expect(lab?.era).toBe(1);
    expect(lab?.demonstrated.min?.labVesselQuality).toBe(0.45);
    expect(lab?.prerequisites).toEqual(["distillation", "recordReplication"]);

    const hospital = TECHNOLOGY_DEFINITIONS.find(def => def.id === "hospitalMedicine");
    expect(hospital?.prerequisites).toEqual(["apothecaryCompounding", "urbanCoveredDrainage"]);

    const acid = TECHNOLOGY_DEFINITIONS.find(def => def.id === "industrialSulfuricAcid");
    expect(acid?.era).toBe(6);
    expect(acid?.prerequisites).toEqual(["chemicalIndustryFoundation"]);

    // docs/plan/phosphate-fertilizer-vertical-slice.md §3.5.
    const phosphate = TECHNOLOGY_DEFINITIONS.find(def => def.id === "phosphateFertilizer");
    expect(phosphate?.era).toBe(6);
    expect(phosphate?.prerequisites).toEqual(["industrialSulfuricAcid"]);
    expect(phosphate?.demonstrated.min?.phosphateFertilizerTrialYears).toBe(2);
    expect(phosphate?.adopted.min?.phosphateFertilizerPlantCount).toBe(1);

    const enp = TECHNOLOGY_DEFINITIONS.find(def => def.id === "experimentalNaturalPhilosophy");
    expect(enp?.prerequisites).toEqual(["recordReplication", "mathAstronomyGeography", "distillation"]);
    expect(enp?.known.min?.glassware).toBe(0.1);
  });

  it("zeros new chemistry signals when Economy is off and computes labVesselQuality without Pumice", () => {
    installMinimalWorld();
    simulationContext.extensions = undefined;
    setTechnologyProgressForTests([]);
    expect(isLaboratoryGlasswareKnown(1)).toBe(false);

    simulationContext.extensions = {
      economy: {
        guildKnowledgeStocks: [{ burgId: 1, domain: "glassware", stock: 0.65 }],
        goods: [
          { i: 10, name: "Soap" },
          { i: 11, name: "Glass" },
          { i: 12, name: "Pumice" },
          { i: 13, name: "Sulfur" }
        ],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: { 11: { stock: 4 }, 10: { stock: 2 }, 13: { stock: 3 } }
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    worldContext.pack.states[1].treasury = 80;
    setTechnologyProgressForTests([
      { technologyId: "distillation", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 },
      { technologyId: "recordReplication", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }
    ]);
    settleTechnologyAnnual(1200);
    expect(["known", "demonstrated", "adopted", "diffused"]).toContain(getTechnologyStage("laboratoryGlassware", 1));
  });

  it("computes phosphateRockAccess/phosphateFertilizerTrialYears/phosphateFertilizerPlantCount from market stock, ChemistryTrial, and PhosphateFertilizerPlant rows (docs/plan/phosphate-fertilizer-vertical-slice.md §3.6)", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        goods: [{ i: 20, name: "Phosphate Rock" }],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: { 20: { stock: 10 } } // clamp01(10 / 2) = 1, well past the 0.25/0.3/0.35 thresholds
          }
        ],
        chemistryTrials: [
          {
            kind: "phosphateFertilizerPlant",
            burgId: 1,
            stateId: 1,
            status: "running",
            operatingYears: 5,
            documentedRuns: 5,
            failureCount: 0,
            inputsConsumed: 0,
            outputsDelivered: 0
          }
        ],
        phosphateFertilizerPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    setTechnologyProgressForTests([
      { technologyId: "industrialSulfuricAcid", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 1 }
    ]);
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "phosphateFertilizer");
    // phosphateFertilizerTrialYears(5)>=2, phosphateRockAccess(1)>=0.3, treasury(200)>=170: all met.
    expect(lines.some(line => line.includes("unmet demonstrated"))).toBe(false);
    // phosphateFertilizerPlantCount(1)>=1 and phosphateRockAccess(1)>=0.35 are met; only the
    // adopted treasury threshold (210, installMinimalWorld sets 200) is expected to be unmet.
    expect(lines.filter(line => line.includes("unmet adopted"))).toEqual(["unmet adopted min treasury: 200 < 210"]);
  });

  // docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.4-3.5.
  it("defines modernSteelmaking and highPressureChemicalApparatus with the expected era, prerequisites, and threshold keys", () => {
    const modernSteelmaking = TECHNOLOGY_DEFINITIONS.find(def => def.id === "modernSteelmaking");
    expect(modernSteelmaking?.era).toBe(6);
    expect(modernSteelmaking?.prerequisites).toEqual(["standardMachineWorks"]);
    expect(modernSteelmaking?.known.min?.steelAccess).toBe(0.2);
    expect(modernSteelmaking?.demonstrated.min?.modernSteelmakingTrialYears).toBe(2);
    expect(modernSteelmaking?.adopted.min?.modernSteelmakingInstallations).toBe(1);

    const highPressureChemicalApparatus = TECHNOLOGY_DEFINITIONS.find(
      def => def.id === "highPressureChemicalApparatus"
    );
    expect(highPressureChemicalApparatus?.era).toBe(6);
    // Requires both era-6 metallurgy and chemistry lineages adopted before it can even reach known.
    expect(highPressureChemicalApparatus?.prerequisites).toEqual(["modernSteelmaking", "industrialSulfuricAcid"]);
    expect(highPressureChemicalApparatus?.known.min?.steelAccess).toBe(0.3);
    expect(highPressureChemicalApparatus?.known.min?.instruments).toBe(0.3);
    // No new Good/facility: the "trial years" stand-in reuses ExperimentalWorkshops'
    // experimentRecord signal instead of a dedicated apparatus (§7 decision 5).
    expect(highPressureChemicalApparatus?.demonstrated.min?.experimentRecord).toBe(0.6);
    expect(highPressureChemicalApparatus?.adopted.min?.experimentRecord).toBe(0.65);
  });

  it("computes steelAccess/modernSteelmakingTrialYears/modernSteelmakingInstallations from market stock, guild metallurgy knowledge, and SteelConverterPlant rows (docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.3)", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        goods: [{ i: 30, name: "Steel" }],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: { 30: { stock: 10 } } // clamp01(10 / 2) = 1, well past the 0.2/0.35/0.4 thresholds
          }
        ],
        // modernSteelmaking re-checks metallurgy at every stage (§3.4), unlike phosphateFertilizer's
        // sulfurAccess pattern, so the fixture needs a guild metallurgy stock past 0.85 too.
        guildKnowledgeStocks: [{ burgId: 1, domain: "metallurgy", stock: 0.9 }],
        steelConverterPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "modernSteelmaking");
    // modernSteelmakingTrialYears(5)>=2, metallurgy(0.9)>=0.8, treasury(200)>=190: all met.
    expect(lines.some(line => line.includes("unmet demonstrated"))).toBe(false);
    // modernSteelmakingInstallations(1)>=1 and metallurgy(0.9)>=0.85 are met; only the adopted
    // treasury threshold (230, installMinimalWorld sets 200) is expected to be unmet.
    expect(lines.filter(line => line.includes("unmet adopted"))).toEqual(["unmet adopted min treasury: 200 < 230"]);
  });

  // docs/plan/catalytic-chemistry.md §3.
  it("defines catalyticChemistry as an era-6 node gated behind highPressureChemicalApparatus with no new signals", () => {
    const catalyticChemistry = TECHNOLOGY_DEFINITIONS.find(def => def.id === "catalyticChemistry");
    expect(catalyticChemistry?.era).toBe(6);
    expect(catalyticChemistry?.prerequisites).toEqual(["highPressureChemicalApparatus"]);
    // Every threshold sits above what highPressureChemicalApparatus's own adopted stage already
    // guarantees (experimentRecord 0.65, instruments 0.3, administration 0.6), so reaching the
    // prerequisite does not automatically satisfy this node too.
    expect(catalyticChemistry?.known.min?.experimentRecord).toBe(0.65);
    expect(catalyticChemistry?.known.min?.instruments).toBe(0.4);
    expect(catalyticChemistry?.demonstrated.min?.naturalPhilosophy).toBe(0.55);
    expect(catalyticChemistry?.adopted.min?.administration).toBe(0.65);
    expect(catalyticChemistry?.minimumYearsAtPreviousStage).toEqual({ demonstrated: 3, adopted: 5 });
  });

  it("computes catalyticChemistry's gate from ExperimentalWorkshops' experimentRecord and Academy/Guild naturalPhilosophy/instruments stocks (docs/plan/catalytic-chemistry.md §4)", () => {
    installMinimalWorld();
    // Between the demonstrated (380) and adopted (450) treasury bars, so only the adopted
    // threshold is expected to be unmet on treasury — same isolation style as the
    // modernSteelmaking gate test above.
    (worldContext.pack.states[1] as { treasury: number }).treasury = 400;
    simulationContext.extensions = {
      economy: {
        experimentalWorkshops: [{ burgId: 1, sponsorStateId: 1, active: true, experimentRecord: 0.8 }],
        academyKnowledgeStocks: [
          { burgId: 1, domain: "naturalPhilosophy", stock: 0.7 },
          { burgId: 1, domain: "administration", stock: 0.7 }
        ],
        guildKnowledgeStocks: [{ burgId: 1, domain: "instruments", stock: 0.5 }]
      }
    };
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "catalyticChemistry");
    expect(lines.some(line => line.includes("unmet known"))).toBe(false);
    expect(lines.some(line => line.includes("unmet demonstrated"))).toBe(false);
    expect(lines.filter(line => line.includes("unmet adopted"))).toEqual(["unmet adopted min treasury: 400 < 450"]);
  });

  // docs/plan/synthetic-ammonia-vertical-slice.md §3.4.
  it("defines syntheticAmmonia as an era-6 node gated behind catalyticChemistry alone", () => {
    const syntheticAmmonia = TECHNOLOGY_DEFINITIONS.find(def => def.id === "syntheticAmmonia");
    expect(syntheticAmmonia?.era).toBe(6);
    // prerequisitesMet() already requires catalyticChemistry adopted, which transitively requires
    // its own ancestor chain adopted — no need to re-list highPressureChemicalApparatus etc.
    expect(syntheticAmmonia?.prerequisites).toEqual(["catalyticChemistry"]);
    expect(syntheticAmmonia?.known.min?.fertilizerCoverageGap).toBe(0.3);
    expect(syntheticAmmonia?.known.min?.administration).toBe(0.65);
    expect(syntheticAmmonia?.known.min?.instruments).toBe(0.45);
    expect(syntheticAmmonia?.demonstrated.min?.syntheticAmmoniaTrialYears).toBe(2);
    expect(syntheticAmmonia?.adopted.min?.syntheticAmmoniaInstallations).toBe(1);
    expect(syntheticAmmonia?.minimumYearsAtPreviousStage).toEqual({ demonstrated: 3, adopted: 5 });
  });

  it("computes fertilizerCoverageGap/syntheticAmmoniaTrialYears/syntheticAmmoniaInstallations without disturbing foodFertilizerPressure's existing calibration (docs/plan/synthetic-ammonia-vertical-slice.md §3.5)", () => {
    installMinimalWorld();
    // Between the demonstrated (600) and adopted (700) treasury bars, so only the adopted
    // threshold is expected to be unmet on treasury — same isolation style as the
    // catalyticChemistry/modernSteelmaking gate tests above.
    (worldContext.pack.states[1] as { treasury: number }).treasury = 650;
    simulationContext.extensions = {
      economy: {
        goods: [{ i: 40, name: "Nitrogen Fertilizer" }],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: {},
            // fertilizerCoverageGap = 1 - fertilizerStock = 0.5, past the known threshold (0.3).
            fertilizerStock: 0.5,
            // foodFertilizerPressure = (importNeed - satisfiedImport) / urbanNeed = 5/10 = 0.5,
            // computed by the same untouched ratio logic — proves gapSum's addition to this loop
            // does not disturb it.
            foodLedger: { urbanNeed: 10, importNeed: 6, satisfiedImport: 1 }
          }
        ],
        experimentalWorkshops: [{ burgId: 1, sponsorStateId: 1, active: true, experimentRecord: 0.8 }],
        academyKnowledgeStocks: [{ burgId: 1, domain: "administration", stock: 0.75 }],
        guildKnowledgeStocks: [{ burgId: 1, domain: "instruments", stock: 0.5 }],
        chemistryTrials: [
          {
            kind: "syntheticAmmoniaPlant",
            burgId: 1,
            stateId: 1,
            status: "running",
            operatingYears: 5,
            documentedRuns: 5,
            failureCount: 0,
            inputsConsumed: 0,
            outputsDelivered: 0
          }
        ],
        syntheticAmmoniaPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }
    ]);
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "syntheticAmmonia");
    expect(lines.some(line => line.includes("unmet known"))).toBe(false);
    expect(lines.some(line => line.includes("unmet demonstrated"))).toBe(false);
    expect(lines.filter(line => line.includes("unmet adopted"))).toEqual(["unmet adopted min treasury: 650 < 700"]);

    // foodFertilizerPressure (urban food import gap, 0.5 from the ledger above) clears
    // phosphateFertilizer's known threshold (0.2) exactly as before — its existing ratio
    // computation is untouched by the new gapSum accumulation added to the same loop.
    const phosphateLines = explainTechnologyGate(1, "phosphateFertilizer");
    expect(phosphateLines.some(line => line.includes("unmet known min foodFertilizerPressure"))).toBe(false);
  });

  // docs/plan/electric-power-and-telegraph.md §3.4-3.8.
  it("defines the electric-power-and-telegraph node chain with the expected era, prerequisites, and threshold keys", () => {
    const electricalExperiments = TECHNOLOGY_DEFINITIONS.find(def => def.id === "electricalExperiments");
    expect(electricalExperiments?.era).toBe(6);
    expect(electricalExperiments?.prerequisites).toEqual(["experimentalNaturalPhilosophy"]);
    expect(electricalExperiments?.known.min?.naturalPhilosophy).toBe(0.45);
    expect(electricalExperiments?.adopted.min?.naturalPhilosophy).toBe(0.55);

    const practicalElectrochemistry = TECHNOLOGY_DEFINITIONS.find(def => def.id === "practicalElectrochemistry");
    expect(practicalElectrochemistry?.era).toBe(6);
    expect(practicalElectrochemistry?.prerequisites).toEqual(["electricalExperiments"]);
    // known deliberately omits naturalPhilosophy — electricalExperiments' own adopted already
    // requires it >= 0.55, so a lower known threshold would be met the instant the prerequisite
    // adopts (§3.5).
    expect(practicalElectrochemistry?.known.min?.naturalPhilosophy).toBeUndefined();
    expect(practicalElectrochemistry?.demonstrated.min?.naturalPhilosophy).toBe(0.58);

    const electricTelegraph = TECHNOLOGY_DEFINITIONS.find(def => def.id === "electricTelegraph");
    expect(electricTelegraph?.era).toBe(6);
    // Does not route through generatorAndMotor/powerGrid — battery-only, per the CSV row-13
    // historical anchor (Morse, 1837).
    expect(electricTelegraph?.prerequisites).toEqual(["practicalElectrochemistry"]);
    expect(electricTelegraph?.demonstrated.min?.telegraphLineTrialYears).toBe(2);
    expect(electricTelegraph?.adopted.min?.telegraphLineInstallations).toBe(1);

    const generatorAndMotor = TECHNOLOGY_DEFINITIONS.find(def => def.id === "generatorAndMotor");
    expect(generatorAndMotor?.era).toBe(6);
    expect(generatorAndMotor?.prerequisites).toEqual(["electricalExperiments", "modernSteelmaking"]);
    expect(generatorAndMotor?.demonstrated.min?.powerStationTrialYears).toBe(2);
    expect(generatorAndMotor?.adopted.min?.powerStationInstallations).toBe(1);

    const powerGrid = TECHNOLOGY_DEFINITIONS.find(def => def.id === "powerGrid");
    expect(powerGrid?.era).toBe(6);
    expect(powerGrid?.prerequisites).toEqual(["generatorAndMotor"]);
    expect(powerGrid?.known.min?.electricityCoverage).toBe(0.25);
    expect(powerGrid?.adopted.min?.electricityCoverage).toBe(0.35);
  });

  // docs/plan/electrolytic-industry-vertical-slice.md §3.6.
  it("defines electrolyticIndustry converging on all three of practicalElectrochemistry/highPressureChemicalApparatus/powerGrid", () => {
    const electrolyticIndustry = TECHNOLOGY_DEFINITIONS.find(def => def.id === "electrolyticIndustry");
    expect(electrolyticIndustry?.era).toBe(6);
    expect(electrolyticIndustry?.prerequisites).toEqual([
      "practicalElectrochemistry",
      "highPressureChemicalApparatus",
      "powerGrid"
    ]);
    expect(electrolyticIndustry?.demonstrated.min?.electrolysisPlantTrialYears).toBe(2);
    expect(electrolyticIndustry?.adopted.min?.electrolysisPlantInstallations).toBe(1);
  });

  it("never lets electrolyticIndustry progress unless all three prerequisites have reached adopted", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        markets: [{ i: 1, centerBurgId: 1, goods: {}, electricityStock: 1 }]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    // Only two of the three prerequisites adopted for state 1 — the third (powerGrid) is absent,
    // so prerequisitesMet() must keep electrolyticIndustry locked regardless of how far the
    // known/demonstrated/adopted signal thresholds above (electricityCoverage=1, well past 0.4)
    // are individually satisfied.
    setTechnologyProgressForTests([
      { technologyId: "practicalElectrochemistry", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "highPressureChemicalApparatus", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);

    expect(getTechnologyStage("electrolyticIndustry", 1)).toBe("locked");
  });

  // docs/plan/electrolytic-industry-vertical-slice.md §3.5 — same shape as the powerStations
  // signal test above.
  it("computes electrolysisPlantTrialYears/electrolysisPlantInstallations from ElectrolysisPlant rows", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        electrolysisPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "electrolyticIndustry");
    expect(lines.some(line => line.includes("electrolysisPlantTrialYears"))).toBe(false);
    expect(lines.some(line => line.includes("electrolysisPlantInstallations"))).toBe(false);
  });

  // docs/plan/cinnabar-mercury-vertical-slice.md §3.5.
  it("defines cinnabarRoastingAndMercuryRecovery on chemicalIndustryFoundation, using mining/smelting signals directly rather than dedicated prerequisite nodes", () => {
    const mercury = TECHNOLOGY_DEFINITIONS.find(def => def.id === "cinnabarRoastingAndMercuryRecovery");
    expect(mercury?.era).toBe(6);
    expect(mercury?.prerequisites).toEqual(["chemicalIndustryFoundation"]);
    expect(mercury?.known.min?.mineCount).toBe(1);
    expect(mercury?.known.min?.metallurgy).toBe(0.3);
    expect(mercury?.demonstrated.min?.mercuryPlantTrialYears).toBe(2);
    expect(mercury?.adopted.min?.mercuryPlantInstallations).toBe(1);
  });

  it("never lets cinnabarRoastingAndMercuryRecovery progress unless chemicalIndustryFoundation has reached adopted", () => {
    installMinimalWorld();
    setTechnologyProgressForTests([
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);

    expect(getTechnologyStage("cinnabarRoastingAndMercuryRecovery", 1)).toBe("locked");
  });

  // docs/plan/cinnabar-mercury-vertical-slice.md §3.4 — same shape as the electrolysisPlantTrial-
  // Years/electrolysisPlantInstallations test above, plus cinnabarAccess (market-stock coverage,
  // same shape as copperWireAccess) and mercuryPlantTrialYears (read from a running
  // ChemistryTrial(kind="mercuryPlant") row, same shape as acidPlantTrialYears).
  it("computes cinnabarAccess/mercuryPlantTrialYears/mercuryPlantInstallations from market stock, a ChemistryTrial row, and MercuryPlant rows", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        goods: [{ i: 60, name: "Cinnabar" }],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: { 60: { stock: 10 } } // clamp01(10 / 2) = 1, past every cinnabarAccess threshold
          }
        ],
        chemistryTrials: [
          {
            kind: "mercuryPlant",
            burgId: 1,
            stateId: 1,
            status: "running",
            operatingYears: 5,
            documentedRuns: 5,
            failureCount: 0,
            inputsConsumed: 0,
            outputsDelivered: 0
          }
        ],
        mercuryPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200,
            contamination: 0.1
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    setTechnologyProgressForTests([
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "cinnabarRoastingAndMercuryRecovery");
    // cinnabarAccess(1) clears known/demonstrated/adopted; mercuryPlantTrialYears(5)>=2 clears
    // demonstrated; mercuryPlantInstallations(1)>=1 clears adopted — none ever appear as unmet.
    expect(lines.some(line => line.includes("cinnabarAccess"))).toBe(false);
    expect(lines.some(line => line.includes("mercuryPlantTrialYears"))).toBe(false);
    expect(lines.some(line => line.includes("mercuryPlantInstallations"))).toBe(false);
  });

  // docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.5.
  it("defines the era-7 petroleum chain (geology -> drilling -> refining -> internal combustion) with prerequisites gated above each other's own adopted floor", () => {
    const geology = TECHNOLOGY_DEFINITIONS.find(def => def.id === "petroleumGeologyAndExploration");
    expect(geology?.era).toBe(7);
    expect(geology?.prerequisites).toEqual(["mineSurveyAndDrainage", "precisionBoringAndMeasurement"]);

    const drilling = TECHNOLOGY_DEFINITIONS.find(def => def.id === "modernDrillingAndFieldOperations");
    expect(drilling?.era).toBe(7);
    expect(drilling?.prerequisites).toEqual(["petroleumGeologyAndExploration"]);
    expect(drilling?.known.min?.petroleumAccess).toBe(0.15);
    expect(drilling?.adopted.min?.petroleumAccess).toBe(0.35);

    const refining = TECHNOLOGY_DEFINITIONS.find(def => def.id === "oilRefiningAndFractionation");
    expect(refining?.era).toBe(7);
    expect(refining?.prerequisites).toEqual(["modernDrillingAndFieldOperations", "highPressureChemicalApparatus"]);
    expect(refining?.demonstrated.min?.oilRefineryTrialYears).toBe(2);
    expect(refining?.adopted.min?.oilRefineryInstallations).toBe(1);

    const ice = TECHNOLOGY_DEFINITIONS.find(def => def.id === "internalCombustionEngine");
    expect(ice?.era).toBe(7);
    expect(ice?.prerequisites).toEqual(["oilRefiningAndFractionation", "standardMachineWorks"]);
    expect(ice?.known.min?.refinedFuelAccess).toBe(0.15);

    expect(getInternalCombustionEngineEffect(1)).toBe(0);
    setTechnologyProgressForTests([
      { technologyId: "internalCombustionEngine", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(getInternalCombustionEngineEffect(1)).toBeCloseTo(0.35);
  });

  it("never lets modernDrillingAndFieldOperations progress unless petroleumGeologyAndExploration has reached adopted", () => {
    installMinimalWorld();
    setTechnologyProgressForTests([
      {
        technologyId: "petroleumGeologyAndExploration",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);
    settleTechnologyAnnual(1200);

    expect(getTechnologyStage("modernDrillingAndFieldOperations", 1)).toBe("locked");
  });

  // docs/plan/rocket-and-space-development-vertical-slice.md §3.3.
  it("defines the era-8 rocketry/space chain with militarySignalRockets as an independent leaf, not a prerequisite of any other node", () => {
    const era8 = TECHNOLOGY_DEFINITIONS.filter(def => def.era === 8);
    expect(era8.map(def => def.id).sort()).toEqual(
      [
        "guidanceAndAttitudeControl",
        "liquidPropulsionAndTestFacilities",
        "militarySignalRockets",
        "rocketDynamicsAndHighTemperatureCombustionResearch",
        "stagingAndOrbitalInsertion"
      ].sort()
    );

    const rockets = TECHNOLOGY_DEFINITIONS.find(def => def.id === "militarySignalRockets");
    expect(rockets?.worldGates).toEqual(["gunpowderWorld"]);
    expect(rockets?.prerequisites).toEqual(["artilleryTactics", "mechanicalWorkshops"]);
    // roadmap decision 13: rockets/space must not unlock directly from powder rockets — verify no
    // other era-8 node (including the chain's terminal node) lists it as a prerequisite.
    for (const def of era8) {
      if (def.id === "militarySignalRockets") continue;
      expect(def.prerequisites).not.toContain("militarySignalRockets");
    }

    const dynamics = TECHNOLOGY_DEFINITIONS.find(
      def => def.id === "rocketDynamicsAndHighTemperatureCombustionResearch"
    );
    expect(dynamics?.era).toBe(8);
    expect(dynamics?.prerequisites).toEqual([
      "mathAstronomyGeography",
      "electricalExperiments",
      "highPressureChemicalApparatus"
    ]);

    const liquid = TECHNOLOGY_DEFINITIONS.find(def => def.id === "liquidPropulsionAndTestFacilities");
    expect(liquid?.prerequisites).toEqual([
      "rocketDynamicsAndHighTemperatureCombustionResearch",
      "oilRefiningAndFractionation",
      "powerGrid"
    ]);
    expect(liquid?.known.min?.refinedFuelAccess).toBe(0.35);

    const guidance = TECHNOLOGY_DEFINITIONS.find(def => def.id === "guidanceAndAttitudeControl");
    expect(guidance?.prerequisites).toEqual(["liquidPropulsionAndTestFacilities", "electricTelegraph"]);

    const staging = TECHNOLOGY_DEFINITIONS.find(def => def.id === "stagingAndOrbitalInsertion");
    expect(staging?.prerequisites).toEqual(["guidanceAndAttitudeControl", "electrolyticIndustry"]);
    expect(staging?.adopted.min?.treasury).toBe(1600);

    expect(getMilitarySignalRocketsEffect(1)).toBe(0);
    expect(getStagingAndOrbitalInsertionEffect(1)).toBe(0);
    setTechnologyProgressForTests([
      { technologyId: "militarySignalRockets", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "stagingAndOrbitalInsertion", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(getMilitarySignalRocketsEffect(1)).toBeCloseTo(0.75);
    expect(getStagingAndOrbitalInsertionEffect(1)).toBeCloseTo(0.35);
  });

  it("never lets rocketDynamicsAndHighTemperatureCombustionResearch progress unless mathAstronomyGeography, electricalExperiments, and highPressureChemicalApparatus have all reached adopted", () => {
    installMinimalWorld();
    setTechnologyProgressForTests([
      { technologyId: "mathAstronomyGeography", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "electricalExperiments", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      // highPressureChemicalApparatus intentionally left short of adopted.
      { technologyId: "highPressureChemicalApparatus", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);

    expect(getTechnologyStage("rocketDynamicsAndHighTemperatureCombustionResearch", 1)).toBe("locked");
  });

  // docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.4 — same shape as the
  // cinnabarAccess/mercuryPlantTrialYears/mercuryPlantInstallations test above, plus
  // refinedFuelAccess (reads Kerosene instead of Crude Oil).
  it("computes petroleumAccess/refinedFuelAccess/oilRefineryTrialYears/oilRefineryInstallations from market stock, a ChemistryTrial row, and OilRefineryPlant rows", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        goods: [
          { i: 70, name: "Crude Oil" },
          { i: 71, name: "Kerosene" }
        ],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: {
              70: { stock: 10 }, // clamp01(10 / 2) = 1, past every petroleumAccess threshold
              71: { stock: 10 } // clamp01(10 / 2) = 1, past every refinedFuelAccess threshold
            }
          }
        ],
        chemistryTrials: [
          {
            kind: "oilRefineryPlant",
            burgId: 1,
            stateId: 1,
            status: "running",
            operatingYears: 5,
            documentedRuns: 5,
            failureCount: 0,
            inputsConsumed: 0,
            outputsDelivered: 0
          }
        ],
        oilRefineryPlants: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    setTechnologyProgressForTests([
      { technologyId: "modernDrillingAndFieldOperations", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "oilRefiningAndFractionation");
    // petroleumAccess(1) clears known/demonstrated; oilRefineryTrialYears(5)>=2 clears
    // demonstrated; oilRefineryInstallations(1)>=1 clears adopted — none ever appear as unmet.
    expect(lines.some(line => line.includes("petroleumAccess"))).toBe(false);
    expect(lines.some(line => line.includes("oilRefineryTrialYears"))).toBe(false);
    expect(lines.some(line => line.includes("oilRefineryInstallations"))).toBe(false);
  });

  it("computes copperWireAccess/powerStationTrialYears/powerStationInstallations from market stock and PowerStation rows (docs/plan/electric-power-and-telegraph.md §3.3)", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        goods: [{ i: 50, name: "Copper Wire" }],
        markets: [
          {
            i: 1,
            centerBurgId: 1,
            goods: { 50: { stock: 10 } } // clamp01(10 / 2) = 1, past every copperWireAccess threshold
          }
        ],
        powerStations: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200,
            generationCapacity: 2
          }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "generatorAndMotor");
    // copperWireAccess(1) clears known(0.35); powerStationTrialYears(5)>=2 and
    // powerStationInstallations(1)>=1 clear demonstrated/adopted — none ever appear as unmet.
    expect(lines.some(line => line.includes("copperWireAccess"))).toBe(false);
    expect(lines.some(line => line.includes("powerStationTrialYears"))).toBe(false);
    expect(lines.some(line => line.includes("powerStationInstallations"))).toBe(false);
  });

  it("computes telegraphLineTrialYears/telegraphLineInstallations from TelegraphLine rows (docs/plan/electric-power-and-telegraph.md §3.3)", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        telegraphLines: [
          {
            burgId: 1,
            stateId: 1,
            role: "service",
            active: true,
            utilization: 1,
            documentedRuns: 5,
            lastFundedYear: 1200
          }
        ]
      }
    };
    settleTechnologyAnnual(1200);

    const lines = explainTechnologyGate(1, "electricTelegraph");
    expect(lines.some(line => line.includes("telegraphLineTrialYears"))).toBe(false);
    expect(lines.some(line => line.includes("telegraphLineInstallations"))).toBe(false);
  });

  it("computes electricityCoverage from Market.electricityStock across markets with population (docs/plan/electric-power-and-telegraph.md §3.3)", () => {
    installMinimalWorld();
    simulationContext.extensions = {
      economy: {
        markets: [
          // Burg 1 (state 1, population 30 from installMinimalWorld) — well past every threshold.
          { i: 1, centerBurgId: 1, goods: {}, electricityStock: 0.4 },
          // Burg 3 (state 2, population 18) — below the known threshold (0.25).
          { i: 2, centerBurgId: 3, goods: {}, electricityStock: 0.2 }
        ]
      }
    };
    worldContext.pack.burgs[1].market = 1;
    worldContext.pack.burgs[3].market = 2;
    settleTechnologyAnnual(1200);

    expect(explainTechnologyGate(1, "powerGrid").some(line => line.includes("electricityCoverage"))).toBe(false);
    // explainThresholds checks known/demonstrated/adopted independently, so 0.2 falls short of all
    // three thresholds (0.25/0.3/0.35) at once.
    expect(explainTechnologyGate(2, "powerGrid").filter(line => line.includes("electricityCoverage"))).toEqual([
      "unmet known min electricityCoverage: 0.2 < 0.25",
      "unmet demonstrated min electricityCoverage: 0.2 < 0.3",
      "unmet adopted min electricityCoverage: 0.2 < 0.35"
    ]);
  });

  it("diffuses every technology faster for an owner whose electricTelegraph has reached adopted (docs/plan/electric-power-and-telegraph.md §3.12)", () => {
    installMinimalWorld();
    // improvedMining's sole prerequisite (basicMetallurgy) auto-seeds to "diffused" for every live
    // state; setting improvedMining itself directly to "adopted" skips known/demonstrated/adopted
    // threshold evaluation entirely (all three rank checks in advanceStage() require the entry to
    // currently sit at a lower rank), isolating just the diffusion-growth line under test.
    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);
    const baseline = getTechnologyProgressEntries().find(
      p => p.technologyId === "improvedMining" && p.ownerId === 1
    )?.diffusion;
    expect(baseline).toBeCloseTo(0.15, 5); // DIFFUSION_ANNUAL_GAIN(0.15) * speed(1) * (1 + 0)

    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }
    ]);
    settleTechnologyAnnual(1200);
    const boosted = getTechnologyProgressEntries().find(
      p => p.technologyId === "improvedMining" && p.ownerId === 1
    )?.diffusion;
    expect(boosted).toBeCloseTo(0.225, 5); // 0.15 * (1 + TELEGRAPH_DIFFUSION_BONUS_MAX(0.5))

    // A state without electricTelegraph adopted is unaffected.
    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 2, stage: "adopted", diffusion: 0 }
    ]);
    settleTechnologyAnnual(1200);
    const unaffected = getTechnologyProgressEntries().find(
      p => p.technologyId === "improvedMining" && p.ownerId === 2
    )?.diffusion;
    expect(unaffected).toBeCloseTo(0.15, 5);
  });

  describe("known-stage technology hints", () => {
    const ENP_PREREQS: TechnologyProgress[] = [
      { technologyId: "recordReplication", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "mathAstronomyGeography", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "distillation", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 }
    ];

    const ASP_PREREQS: TechnologyProgress[] = [
      ...ENP_PREREQS,
      { technologyId: "experimentalNaturalPhilosophy", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "mineSurveyAndDrainage", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "precisionBoringAndMeasurement", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 },
      { technologyId: "coalFuelSupply", scope: "state", ownerId: 2, stage: "adopted", diffusion: 1 }
    ];

    function hintRow(
      technologyId: string,
      years: { firstEligibleYear?: number; expiresAfterYear?: number } = {}
    ): Record<string, unknown> {
      return {
        stateId: 2,
        technologyId,
        burgId: 3,
        sourceCharacterId: 1,
        firstEligibleYear: years.firstEligibleYear ?? 1200,
        expiresAfterYear: years.expiresAfterYear ?? 1202
      };
    }

    it("allowlists only knowledge-ratio keys", () => {
      expect(HINTABLE_KNOWN_RATIO_KEYS).toEqual([
        "experimentRecord",
        "administration",
        "printing",
        "naturalPhilosophy",
        "metallurgy",
        "woodworking",
        "masonry",
        "textiles",
        "instruments",
        "glassware",
        "medicine",
        "pyrotechnics"
      ]);
      expect(HINTABLE_KNOWN_RATIO_KEYS).not.toContain("mineDrainagePressure");
      expect(HINTABLE_KNOWN_RATIO_KEYS).not.toContain("urbanSanitationPressure");
      expect(HINTABLE_KNOWN_RATIO_KEYS).not.toContain("deepMineCount");
      expect(HINTABLE_KNOWN_RATIO_KEYS).not.toContain("treasury");
    });

    it("treats ENP known knowledge ratios as met but still requires treasury", () => {
      worldContext.pack.states[2].treasury = 0;
      const hints = [hintRow("experimentalNaturalPhilosophy")];
      simulationContext.extensions = { economy: { technologyHints: hints } };
      setTechnologyProgressForTests(ENP_PREREQS);

      const before = structuredClone(hints);
      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("experimentalNaturalPhilosophy", 2)).toBe("locked");
      expect(simulationContext.extensions.economy.technologyHints).toEqual(before);

      const lines = explainTechnologyGate(2, "experimentalNaturalPhilosophy");
      expect(lines).toContain("hint is live");
      expect(lines).toContain("unmet known min treasury: 0 < 40");
      expect(lines.some(line => line.startsWith("unmet known min administration"))).toBe(false);
      expect(lines.some(line => line.startsWith("unmet known min printing"))).toBe(false);
      expect(lines.some(line => line.startsWith("unmet known min glassware"))).toBe(false);
    });

    it("lets an ENP hint unlock known when treasury is present and stocks are not", () => {
      worldContext.pack.states[2].treasury = 40;
      simulationContext.extensions = {
        economy: { technologyHints: [hintRow("experimentalNaturalPhilosophy")] }
      };
      setTechnologyProgressForTests(ENP_PREREQS);

      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("experimentalNaturalPhilosophy", 2)).toBe("known");
      expect(getTechnologyStage("experimentalNaturalPhilosophy", 2)).not.toBe("demonstrated");

      const lines = explainTechnologyGate(2, "experimentalNaturalPhilosophy");
      expect(lines).toContain("hint is live");
      expect(lines.some(line => line.startsWith("unmet known min"))).toBe(false);
      expect(lines).toContain("unmet demonstrated min experimentRecord: 0 < 0.25");
    });

    it("does not apply a hint to ENP demonstrated even when wait years have elapsed", () => {
      worldContext.pack.states[2].treasury = 200;
      simulationContext.extensions = {
        economy: { technologyHints: [hintRow("experimentalNaturalPhilosophy")] }
      };
      setTechnologyProgressForTests([
        ...ENP_PREREQS,
        {
          technologyId: "experimentalNaturalPhilosophy",
          scope: "state",
          ownerId: 2,
          stage: "known",
          discoveredYear: 1190,
          diffusion: 0
        }
      ]);

      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("experimentalNaturalPhilosophy", 2)).toBe("known");
    });

    it("does not set ASP known from a hint without deepMineCount", () => {
      worldContext.pack.states[2].treasury = 200;
      simulationContext.extensions = {
        economy: { technologyHints: [hintRow("atmosphericSteamPumping")] }
      };
      setTechnologyProgressForTests(ASP_PREREQS);

      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("atmosphericSteamPumping", 2)).toBe("locked");
      const lines = explainTechnologyGate(2, "atmosphericSteamPumping");
      expect(lines).toContain("hint is live");
      expect(lines).toContain("unmet known min deepMineCount: 0 < 1");
      expect(lines).toContain("unmet known min mineDrainagePressure: 0 < 0.2");
    });

    it("does not waive mineDrainagePressure even when a hint and a deep mine are present", () => {
      worldContext.pack.states[2].treasury = 200;
      simulationContext.extensions = {
        economy: {
          technologyHints: [hintRow("atmosphericSteamPumping")],
          // One fully-drained deep mine plus four shallow ones keeps pressure below 0.2
          // while still satisfying deepMineCount.
          mineOperations: [
            { i: 1, burgId: 3, depositId: 1, active: true, drainage: 1, workers: 8 },
            { i: 2, burgId: 3, depositId: 2, active: true, drainage: 1, workers: 4 },
            { i: 3, burgId: 3, depositId: 3, active: true, drainage: 1, workers: 4 },
            { i: 4, burgId: 3, depositId: 4, active: true, drainage: 1, workers: 4 },
            { i: 5, burgId: 3, depositId: 5, active: true, drainage: 1, workers: 4 }
          ],
          mineralDeposits: [
            { i: 1, depth: "deep", primaryCommodity: "iron", commodities: ["iron"] },
            { i: 2, depth: "shallow", primaryCommodity: "iron", commodities: ["iron"] },
            { i: 3, depth: "shallow", primaryCommodity: "iron", commodities: ["iron"] },
            { i: 4, depth: "shallow", primaryCommodity: "iron", commodities: ["iron"] },
            { i: 5, depth: "shallow", primaryCommodity: "iron", commodities: ["iron"] }
          ]
        }
      };
      setTechnologyProgressForTests(ASP_PREREQS);

      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("atmosphericSteamPumping", 2)).toBe("locked");
      const lines = explainTechnologyGate(2, "atmosphericSteamPumping");
      expect(lines).toContain("hint is live");
      expect(lines.some(line => line.startsWith("unmet known min deepMineCount"))).toBe(false);
      expect(lines).toContain("unmet known min mineDrainagePressure: 0.06 < 0.2");
    });

    it("ignores expired or not-yet-eligible hints", () => {
      worldContext.pack.states[2].treasury = 40;
      simulationContext.extensions = {
        economy: {
          technologyHints: [
            hintRow("experimentalNaturalPhilosophy", { firstEligibleYear: 1190, expiresAfterYear: 1199 }),
            hintRow("experimentalNaturalPhilosophy", { firstEligibleYear: 1201, expiresAfterYear: 1203 })
          ]
        }
      };
      setTechnologyProgressForTests(ENP_PREREQS);

      settleTechnologyAnnual(1200);

      expect(getTechnologyStage("experimentalNaturalPhilosophy", 2)).toBe("locked");
      expect(explainTechnologyGate(2, "experimentalNaturalPhilosophy")).toContain("hint is not live");
    });
  });
});
