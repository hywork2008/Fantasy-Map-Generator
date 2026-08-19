import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setConstructionNamedSeats,
  setConstructionOperations,
  setGoods
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { CONSTRUCTION_EMPLOYMENT_BASE_PEOPLE, getConstructionRequiredWorkers } from "./constructionEmployment";
import type { ConstructionOperation } from "./constructionEmploymentTypes";
import {
  CONSTRUCTION_RESERVED_FOR_HIRE,
  computeConstructionOpenSeats,
  getConstructionJobPosting,
  getConstructionMacroRequiredWorkers,
  getFullConstructionDemand
} from "./constructionJobPostings";

describe("getConstructionMacroRequiredWorkers", () => {
  it("is strictly below full demand by RESERVED_FOR_HIRE", () => {
    const op = { buildingStock: 0, hasQuarryAccess: true, dwellingStock: 0, requiredDwellings: 1000 };
    const full = getConstructionRequiredWorkers(op, 400, {
      cultureType: "Generic",
      brickAvailable: true,
      highFantasy: false
    });
    const macro = getConstructionMacroRequiredWorkers(op, 400, {
      cultureType: "Generic",
      brickAvailable: true,
      highFantasy: false
    });
    // Per-role rn(..., 2) can drift a few hundredths on the sum vs scaling the total.
    expect(macro.mason).toBeCloseTo(full.mason * (1 - CONSTRUCTION_RESERVED_FOR_HIRE), 2);
    expect(macro.carpenter).toBeCloseTo(full.carpenter * (1 - CONSTRUCTION_RESERVED_FOR_HIRE), 2);
    expect(macro.mason + macro.carpenter).toBeLessThan(full.mason + full.carpenter);
  });
});

describe("computeConstructionOpenSeats", () => {
  it("posts at least one seat when demand is real", () => {
    const seats = computeConstructionOpenSeats({
      demandTotal: 10,
      filledTotal: 8.5, // at ~macro target for 15% reserved
      masonDemand: 4,
      carpenterDemand: 6,
      masonFilled: 3.4,
      carpenterFilled: 5.1
    });
    expect(seats.openSeats).toBeGreaterThanOrEqual(1);
  });

  it("stays open even when filled equals macro band (not wiped to zero)", () => {
    const demand = 20;
    const filled = demand * (1 - CONSTRUCTION_RESERVED_FOR_HIRE);
    const seats = computeConstructionOpenSeats({
      demandTotal: demand,
      filledTotal: filled,
      masonDemand: 8,
      carpenterDemand: 12,
      masonFilled: 8 * (1 - CONSTRUCTION_RESERVED_FOR_HIRE),
      carpenterFilled: 12 * (1 - CONSTRUCTION_RESERVED_FOR_HIRE)
    });
    expect(seats.openSeats).toBeGreaterThanOrEqual(1);
  });

  it("is zero when demand is negligible", () => {
    const seats = computeConstructionOpenSeats({
      demandTotal: 1,
      filledTotal: 1,
      masonDemand: 0.4,
      carpenterDemand: 0.6,
      masonFilled: 0.4,
      carpenterFilled: 0.6
    });
    expect(seats.openSeats).toBe(0);
  });
});

describe("getConstructionJobPosting", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    useOptionsState.setState({ culturesSet: "world" });
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
      cultures: [null, { i: 1, type: "Generic" }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Wood", tags: ["construction"], value: 1, unit: "pile", icon: "good-wood", color: "#000" },
      { i: 2, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#000" },
      { i: 3, name: "Brick", tags: ["construction"], value: 2, unit: "wain", icon: "good-clay", color: "#000" }
    ]);
  });

  afterEach(() => {
    clearEconomyContext();
    useOptionsState.setState({ culturesSet: "world" });
  });

  it("returns null without a construction operation", () => {
    setConstructionOperations([]);
    expect(getConstructionJobPosting(1)).toBeNull();
  });

  it("shows open seats while anonymous workers sit at macro target", () => {
    const requiredDwellings = Math.ceil((5 * 1000) / 4.5);
    const demand = getFullConstructionDemand(
      {
        buildingStock: 0,
        dwellingStock: 0,
        requiredDwellings,
        hasQuarryAccess: true
      },
      400,
      1000,
      { cultureType: "Generic", brickAvailable: true, highFantasy: false }
    );
    const macro = getConstructionMacroRequiredWorkers(
      {
        buildingStock: 0,
        dwellingStock: 0,
        requiredDwellings,
        hasQuarryAccess: true
      },
      400,
      { cultureType: "Generic", brickAvailable: true, highFantasy: false }
    );

    setConstructionOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        masonWorkers: macro.mason,
        carpenterWorkers: macro.carpenter,
        buildingStock: 0,
        dwellingStock: 0,
        hasQuarryAccess: true,
        active: true
      } as ConstructionOperation
    ]);

    const posting = getConstructionJobPosting(1);
    expect(posting).not.toBeNull();
    expect(posting!.demand.total).toBeCloseTo(demand.total, 1);
    expect(posting!.macroTarget.total).toBeLessThan(posting!.demand.total);
    expect(posting!.openSeats).toBeGreaterThanOrEqual(1);
  });

  describe("applyCalibration real-people hire-board demand (docs/plan/craft-demand-calibration.md §2.2, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("expresses demand in real people (BASE ≈ 8) instead of population points", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      setConstructionOperations([
        {
          i: 1,
          burgId: 1,
          marketId: 1,
          masonWorkers: 0,
          carpenterWorkers: 0,
          buildingStock: 1,
          // Comfortably above requiredDwellings so normalizeConstructionOperation's write-through
          // clamps buildingStock to 1 (no backlog) — demand is BASE_PEOPLE only.
          dwellingStock: 1_000_000,
          hasQuarryAccess: true,
          active: true
        } as ConstructionOperation
      ]);

      const posting = getConstructionJobPosting(1);
      expect(posting).not.toBeNull();
      expect(posting!.demand.total).toBeCloseTo(CONSTRUCTION_EMPLOYMENT_BASE_PEOPLE, 0);
      expect(posting!.openSeats).toBeGreaterThanOrEqual(1);
    });

    it("does not let a single named seat (1 real person) fill the 8-person BASE requirement", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      setConstructionOperations([
        {
          i: 1,
          burgId: 1,
          marketId: 1,
          masonWorkers: 0,
          carpenterWorkers: 0,
          buildingStock: 1,
          dwellingStock: 1_000_000,
          hasQuarryAccess: true,
          active: true
        } as ConstructionOperation
      ]);
      setConstructionNamedSeats([{ burgId: 1, role: "carpenter", characterId: 1 }]);

      const posting = getConstructionJobPosting(1);
      expect(posting).not.toBeNull();
      expect(posting!.filled.total).toBeLessThan(posting!.demand.total);
      expect(posting!.openSeats).toBeGreaterThanOrEqual(1);
    });
  });
});
