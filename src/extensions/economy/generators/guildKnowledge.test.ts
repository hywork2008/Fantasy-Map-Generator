import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setCraftDomainEmploymentRecords,
  setGuildKnowledgeStocks,
  setInstructionResidues,
  setResearchNamedSeats,
  setSmelterOperations
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { guildSaturationPoints, peopleToPoints } from "./craftScale";
import {
  applyConquestDisruptionToGuilds,
  applyMasterlessGuildPenalty,
  collectGuildPractitioners,
  GUILD_CONQUEST_DISRUPTION_PENALTY,
  GUILD_MASTERLESS_DEATH_PENALTY,
  GUILD_SATURATION_WORKERS,
  GuildKnowledge,
  getGuildBonus
} from "./guildKnowledge";
import { GUILD_SITE_KNOWLEDGE_CAP_PEOPLE } from "./smelterOperationsTypes";

describe("GuildKnowledgeModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
    // These tests (outside the "applyCalibration closed inventory" block below) exercise the
    // pre-PR-3 legacy path deliberately — raw smelter.workers/GUILD_SATURATION_WORKERS fixtures —
    // which PR 4 no longer runs by default. The calibrated path has its own dedicated tests.
    setEconomyCalibrationState({ applyCalibration: false });
  });

  afterEach(() => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 1 });
    clearEconomyContext();
  });

  function smelter(overrides: Partial<Parameters<typeof setSmelterOperations>[0][number]> = {}) {
    return {
      i: 1,
      depositId: 1,
      cell: 0,
      burgId: 1,
      marketId: 1,
      waterPower: 1,
      fuelAccess: 1,
      technology: 1,
      smeltingYield: 0.8,
      annualCapacityTons: 120,
      workers: GUILD_SATURATION_WORKERS,
      securityInvestment: 0,
      lastSecurityUpkeep: 0,
      lastTheftLoss: 0,
      lastTheftRisk: 0,
      active: true,
      ...overrides
    };
  }

  it("raises the Metallurgy stock for a fully-staffed smelter's Burg", () => {
    setSmelterOperations([smelter()]);

    GuildKnowledge.settleAnnual();

    const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy");
    expect(stock?.stock).toBeGreaterThan(0);
    expect(getGuildBonus(1, "metallurgy")).toBeGreaterThan(1);
  });

  it("matures a small chapter's stock by raw headcount, not gated by a population/burg.group threshold", () => {
    // §8.1 decision 2: there is no minimum settlement-size gate. A half-staffed chapter (relative
    // to the saturation constant) still accumulates real technique over time — it is simply
    // capped below stock=1 by its own headcount, exactly like a fully-staffed chapter is capped
    // at 1, not blocked outright the way a burg.group-tier gate would block it.
    setSmelterOperations([smelter({ workers: GUILD_SATURATION_WORKERS / 2 })]);

    let stock = 0;
    for (let i = 0; i < 200; i++) {
      worldContext.options = { year: 500 + i };
      GuildKnowledge.settleAnnual();
      stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    }

    expect(stock).toBeGreaterThan(0.45);
    expect(stock).toBeLessThan(0.55);
  });

  it("matures a fully-staffed chapter in one year at 100× development speed", () => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 100 });
    setSmelterOperations([smelter()]);

    GuildKnowledge.settleAnnual();

    const stock =
      getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy")?.stock ?? 0;
    expect(stock).toBeGreaterThan(0.99);
  });

  it("decays the stock for an inactive smelter instead of growing it", () => {
    setSmelterOperations([smelter({ active: false })]);
    // Seed an existing stock by settling once while active, then deactivate and settle again.
    setSmelterOperations([smelter()]);
    GuildKnowledge.settleAnnual();
    const stockAfterFirstYear = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterFirstYear).toBeGreaterThan(0);

    setSmelterOperations([smelter({ active: false })]);
    worldContext.options = { year: 501 };
    GuildKnowledge.settleAnnual();

    const stockAfterDecay = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterDecay).toBeLessThan(stockAfterFirstYear);
  });

  it("keeps decaying an orphaned Burg's stock after its smelter operation disappears", () => {
    setSmelterOperations([smelter()]);
    GuildKnowledge.settleAnnual();
    const stockWithSmelter = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockWithSmelter).toBeGreaterThan(0);

    setSmelterOperations([]);
    worldContext.options = { year: 501 };
    GuildKnowledge.settleAnnual();

    const orphanStock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(orphanStock).toBeGreaterThan(0);
    expect(orphanStock).toBeLessThan(stockWithSmelter);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setSmelterOperations([smelter()]);

    GuildKnowledge.settleAnnual();
    const stockAfterFirstCall = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock;
    GuildKnowledge.settleAnnual();

    expect(getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock).toBe(stockAfterFirstCall);
  });

  it("returns bonus 1 (no bonus) for a Burg with no tracked stock", () => {
    expect(getGuildBonus(999, "metallurgy")).toBe(1);
  });

  it("collects woodworking headcount from craft-domain employment and metallurgy from smelter plus smithing", () => {
    setSmelterOperations([smelter({ workers: 2 })]);
    setCraftDomainEmploymentRecords([
      { burgId: 1, domain: "woodworking", workers: 1 },
      { burgId: 1, domain: "metallurgy", workers: 3 }
    ]);

    const practitioners = [...collectGuildPractitioners().values()];
    expect(practitioners).toEqual(
      expect.arrayContaining([
        { burgId: 1, domain: "woodworking", workers: 1 },
        { burgId: 1, domain: "metallurgy", workers: 5 }
      ])
    );
  });

  it("grows a non-metallurgy domain's stock from CraftDomainEmploymentRecord alone", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "textiles", workers: GUILD_SATURATION_WORKERS }]);

    GuildKnowledge.settleAnnual();

    const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "textiles");
    expect(stock?.stock).toBeGreaterThan(0);
    expect(getGuildBonus(1, "textiles")).toBeGreaterThan(1);
    // Unrelated domains stay untouched by this Burg's textiles headcount.
    expect(getGuildBonus(1, "leather")).toBe(1);
  });

  it("combines SmelterOperation.workers and metallurgy-domain CraftDomainEmploymentRecord into one stock", () => {
    setSmelterOperations([smelter({ workers: GUILD_SATURATION_WORKERS })]);
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "metallurgy", workers: GUILD_SATURATION_WORKERS }]);

    GuildKnowledge.settleAnnual();
    const combinedStock = getGuildKnowledgeStocks().find(
      entry => entry.burgId === 1 && entry.domain === "metallurgy"
    )?.stock;

    clearEconomyContext();
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
    setSmelterOperations([smelter({ workers: GUILD_SATURATION_WORKERS })]);
    GuildKnowledge.settleAnnual();
    const smelterOnlyStock = getGuildKnowledgeStocks().find(
      entry => entry.burgId === 1 && entry.domain === "metallurgy"
    )?.stock;

    // Combined double headcount saturates coverage (capped at 1) at least as fast as smelter workers alone.
    expect(combinedStock).toBeGreaterThanOrEqual(smelterOnlyStock ?? 0);
  });

  describe("applyMasterlessGuildPenalty()", () => {
    it("cuts a Burg's tracked stock by GUILD_MASTERLESS_DEATH_PENALTY", () => {
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);

      applyMasterlessGuildPenalty(1, "metallurgy");

      const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy")?.stock;
      expect(stock).toBeCloseTo(0.8 * (1 - GUILD_MASTERLESS_DEATH_PENALTY), 4);
    });

    it("is a no-op for a Burg with no tracked stock", () => {
      applyMasterlessGuildPenalty(999, "metallurgy");

      expect(getGuildKnowledgeStocks()).toEqual([]);
    });
  });

  describe("applyConquestDisruptionToGuilds()", () => {
    it("cuts every domain a Burg has a tracked stock in by GUILD_CONQUEST_DISRUPTION_PENALTY", () => {
      setGuildKnowledgeStocks([
        { burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 },
        { burgId: 1, domain: "textiles", stock: 0.5, treasury: 0 },
        { burgId: 2, domain: "metallurgy", stock: 0.9, treasury: 0 }
      ]);

      applyConquestDisruptionToGuilds(1);

      const stocks = getGuildKnowledgeStocks();
      expect(stocks.find(e => e.burgId === 1 && e.domain === "metallurgy")?.stock).toBeCloseTo(
        0.8 * (1 - GUILD_CONQUEST_DISRUPTION_PENALTY),
        4
      );
      expect(stocks.find(e => e.burgId === 1 && e.domain === "textiles")?.stock).toBeCloseTo(
        0.5 * (1 - GUILD_CONQUEST_DISRUPTION_PENALTY),
        4
      );
      // A different Burg's stock is untouched.
      expect(stocks.find(e => e.burgId === 2)?.stock).toBe(0.9);
    });

    it("is a no-op for a Burg with no tracked stock", () => {
      applyConquestDisruptionToGuilds(999);

      expect(getGuildKnowledgeStocks()).toEqual([]);
    });
  });

  describe("derived technology-bias extraWorkers", () => {
    function metallurgyStock(): number {
      return getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy")?.stock ?? 0;
    }

    function settleControl(workers: number): number {
      setSmelterOperations([smelter({ workers })]);
      GuildKnowledge.settleAnnual();
      return metallurgyStock();
    }

    function resetWorld(): void {
      clearEconomyContext();
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.options = { year: 500 };
      worldContext.pack = {
        burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
        cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
      } as unknown as PackedGraph;
    }

    it("does not change stock when seats and residues are empty", () => {
      const control = settleControl(GUILD_SATURATION_WORKERS / 2);
      resetWorld();
      setResearchNamedSeats([]);
      setInstructionResidues([]);
      const emptyBias = settleControl(GUILD_SATURATION_WORKERS / 2);
      expect(emptyBias).toBe(control);
    });

    it("raises metallurgy coverage from a mineLaborer seat versus the empty-seat control", () => {
      const control = settleControl(GUILD_SATURATION_WORKERS / 2);
      resetWorld();
      setResearchNamedSeats([{ burgId: 1, characterId: 9, role: "mineLaborer" }]);
      const withSeat = settleControl(GUILD_SATURATION_WORKERS / 2);
      expect(withSeat).toBeGreaterThan(control);
    });
  });

  describe("applyCalibration closed inventory (docs/plan/craft-demand-calibration.md §2.0, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("caps a smelter site's guild-metallurgy input at GUILD_SITE_KNOWLEDGE_CAP_PEOPLE regardless of furnace size", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      const saturation = guildSaturationPoints(worldContext.populationRate);

      // BASE-only smelter (annualCapacityTons: 0) already yields SMELTER_EMPLOYMENT_BASE_PEOPLE (8),
      // above the 6-person cap. The stale reconciled `workers` field (999 pt) must be ignored.
      setSmelterOperations([smelter({ annualCapacityTons: 0, workers: 999 })]);
      const baseWorkers =
        [...collectGuildPractitioners().values()].find(e => e.burgId === 1 && e.domain === "metallurgy")?.workers ?? 0;
      expect(baseWorkers / saturation).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(baseWorkers).toBeCloseTo(peopleToPoints(GUILD_SITE_KNOWLEDGE_CAP_PEOPLE, worldContext.populationRate), 6);

      // A large, fully-supplied furnace stays at the same 0.50 cap — not a bigger share.
      setSmelterOperations([smelter({ annualCapacityTons: 5000, workers: 999 })]);
      const fullFurnaceWorkers =
        [...collectGuildPractitioners().values()].find(e => e.burgId === 1 && e.domain === "metallurgy")?.workers ?? 0;
      expect(fullFurnaceWorkers / saturation).toBeLessThanOrEqual(0.5 + 1e-9);
    });

    it("does not cap manufacture-only CraftDomainEmploymentRecord labor — a fully-staffed craft chapter still reaches coverage 1", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      // 19.8 real people is the reference-fixture woodworking manufacture typical
      // (docs/plan/craft-demand-calibration.md §2.2), well above the 12-person guild saturation —
      // it must not be capped the way a site source (P3-P5) is.
      setCraftDomainEmploymentRecords([
        { burgId: 1, domain: "woodworking", workers: peopleToPoints(19.8, worldContext.populationRate) }
      ]);

      const workers =
        [...collectGuildPractitioners().values()].find(e => e.burgId === 1 && e.domain === "woodworking")?.workers ?? 0;
      const coverage = Math.min(1, workers / guildSaturationPoints(worldContext.populationRate));
      expect(coverage).toBeCloseTo(1, 2);
    });

    it("uses the real-people saturation threshold in settleAnnual() instead of the flat legacy constant", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      setSmelterOperations([smelter({ annualCapacityTons: 0, workers: 999 })]);

      GuildKnowledge.settleAnnual();

      const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy")?.stock;
      expect(stock).toBeGreaterThan(0);
      // At coverage ≤ 0.50 the single-year EWMA step cannot approach 1 the way the uncapped legacy
      // path (workers=999 / GUILD_SATURATION_WORKERS=6) would.
      expect(stock).toBeLessThan(0.5);
    });
  });
});
