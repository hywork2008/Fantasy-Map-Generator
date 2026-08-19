import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getConstructionHireApplications,
  getConstructionNamedSeats,
  getConstructionOperations,
  initEconomyContext,
  setConstructionOperations,
  setGoods
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import type { ConstructionOperation } from "./constructionEmploymentTypes";
import {
  ANON_HIRE_LAG_DAYS,
  applyCharacterToConstructionJob,
  cancelConstructionApplication,
  clearConstructionHireState,
  HIRE_ROUND_DAYS,
  PLAYER_HIRE_LAG_DAYS,
  purgeInvalidConstructionHireState,
  resignConstructionJob,
  tickConstructionHiring
} from "./constructionHire";

function setupBurgWithConstruction(): void {
  worldContext.populationRate = 1000;
  worldContext.pack = {
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        removed: 0,
        population: 5,
        group: "town",
        type: "Generic",
        demographics: {
          capacity: 1000,
          maleAdults: 200,
          femaleAdults: 200,
          children: 0,
          elders: 0
        }
      }
    ],
    cultures: [null, { i: 1, type: "Generic" }],
    characters: [
      {
        i: 10,
        name: "Bob",
        location: 1,
        dead: false,
        roles: [],
        titles: [],
        wealth: 0
      }
    ]
  } as unknown as PackedGraph;
  setGoods([
    { i: 1, name: "Wood", tags: ["construction"], value: 1, unit: "pile", icon: "good-wood", color: "#000" },
    { i: 2, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#000" },
    { i: 3, name: "Brick", tags: ["construction"], value: 2, unit: "wain", icon: "good-clay", color: "#000" }
  ]);
  setConstructionOperations([
    {
      i: 1,
      burgId: 1,
      marketId: 1,
      masonWorkers: 0,
      carpenterWorkers: 0,
      buildingStock: 0,
      dwellingStock: 0,
      hasQuarryAccess: true,
      active: true
    } as ConstructionOperation
  ]);
}

describe("constructionHire Phase 2–3", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    useOptionsState.setState({ culturesSet: "world" });
    clearConstructionHireState();
    setupBurgWithConstruction();
  });

  afterEach(() => {
    clearConstructionHireState();
    clearEconomyContext();
  });

  it("lets a character apply and reserves a pending seat for PLAYER_HIRE_LAG_DAYS", () => {
    const result = applyCharacterToConstructionJob({ characterId: 10, burgId: 1 });
    expect(result.ok).toBe(true);
    expect(result.daysRemaining).toBe(PLAYER_HIRE_LAG_DAYS);
    expect(getConstructionHireApplications()).toHaveLength(1);
    expect(getConstructionNamedSeats()).toHaveLength(0);
  });

  it("rejects apply when character is not in the burg", () => {
    (worldContext.pack.characters![0] as { location: number }).location = 99;
    const result = applyCharacterToConstructionJob({ characterId: 10, burgId: 1 });
    expect(result.ok).toBe(false);
  });

  it("resolves player application into a named seat after lag", () => {
    applyCharacterToConstructionJob({ characterId: 10, burgId: 1, role: "carpenter" });
    tickConstructionHiring(PLAYER_HIRE_LAG_DAYS);
    // Hire rounds may also spawn anonymous apps in the same multi-day tick — player app is gone.
    expect(getConstructionHireApplications().every(app => app.characterId !== 10)).toBe(true);
    expect(getConstructionNamedSeats()).toEqual([{ burgId: 1, role: "carpenter", characterId: 10 }]);
    const character = worldContext.pack.characters![0];
    expect(character.roles?.some(r => r.kind === "constructionWorker")).toBe(true);
  });

  it("starts anonymous applications on hire rounds and fills workers after lag", () => {
    const before = getConstructionOperations()[0].carpenterWorkers + getConstructionOperations()[0].masonWorkers;
    tickConstructionHiring(HIRE_ROUND_DAYS);
    expect(getConstructionHireApplications().some(a => a.characterId === null)).toBe(true);
    tickConstructionHiring(ANON_HIRE_LAG_DAYS);
    const after = getConstructionOperations()[0].carpenterWorkers + getConstructionOperations()[0].masonWorkers;
    expect(after).toBeGreaterThan(before);
  });

  it("resign removes named seat and role", () => {
    applyCharacterToConstructionJob({ characterId: 10, burgId: 1, role: "mason" });
    tickConstructionHiring(PLAYER_HIRE_LAG_DAYS);
    const resign = resignConstructionJob(10);
    expect(resign.ok).toBe(true);
    expect(getConstructionNamedSeats()).toHaveLength(0);
    expect(worldContext.pack.characters![0].roles ?? []).toHaveLength(0);
  });

  it("cancel withdraws a pending application", () => {
    applyCharacterToConstructionJob({ characterId: 10, burgId: 1 });
    expect(getConstructionHireApplications().some(a => a.characterId === 10)).toBe(true);
    const cancel = cancelConstructionApplication(10);
    expect(cancel.ok).toBe(true);
    expect(getConstructionHireApplications().some(a => a.characterId === 10)).toBe(false);
  });

  it("purges named seats when the character leaves the burg", () => {
    applyCharacterToConstructionJob({ characterId: 10, burgId: 1, role: "mason" });
    tickConstructionHiring(PLAYER_HIRE_LAG_DAYS);
    expect(getConstructionNamedSeats()).toHaveLength(1);
    (worldContext.pack.characters![0] as { location: number }).location = 2;
    purgeInvalidConstructionHireState();
    expect(getConstructionNamedSeats()).toHaveLength(0);
  });

  describe("applyCalibration named-seat increment (docs/plan/craft-demand-calibration.md §2.0 P10, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("adds peopleToPoints(1) instead of a full population point for an accepted anonymous hire", () => {
      setEconomyCalibrationState({ applyCalibration: true });

      tickConstructionHiring(HIRE_ROUND_DAYS);
      tickConstructionHiring(ANON_HIRE_LAG_DAYS);

      const total = getConstructionOperations()[0].carpenterWorkers + getConstructionOperations()[0].masonWorkers;
      // 1 real person at the default rate 1000 is 0.001 points — nowhere near the legacy +1 point
      // (which represented 1000 people for a single accepted hire).
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(0.01);
    });
  });
});
