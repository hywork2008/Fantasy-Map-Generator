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
  getMaxShipClassTierForState,
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
    historicalPeriod?: "earlyMedieval" | "highMedieval" | "lateMedieval" | "ageOfExploration";
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
