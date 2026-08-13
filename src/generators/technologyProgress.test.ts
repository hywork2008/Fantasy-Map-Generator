import { beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { TECHNOLOGY_DEFINITIONS } from "./technologyDefinitions";
import {
  getFourCourseRotationEffect,
  getGunpowderDemandTechMultiplier,
  getMaxShipClassTierForState,
  getTechnologyStage,
  isDistillationKnown,
  resetTechnologyProgress,
  seedTechnologyStartProfile,
  setTechnologyProgressForTests,
  settleTechnologyAnnual
} from "./technologyProgress";
import { createEmptyTechnologySimulationState } from "./technologyTypes";

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
    installMinimalWorld({ gunpowder: false });
    resetTechnologyProgress();
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
});
