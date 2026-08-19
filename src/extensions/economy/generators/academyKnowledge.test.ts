import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getAcademyKnowledgeStocks,
  initEconomyContext,
  setAcademyKnowledgeStocks,
  setAdministrationEmployment,
  setExperimentalWorkshops,
  setInstructionResidues,
  setResearchNamedSeats
} from "../economyContext";
import {
  ACADEMY_CONQUEST_DISRUPTION_PENALTY,
  ACADEMY_SATURATION_WORKERS,
  AcademyKnowledge,
  applyConquestDisruptionToAcademies,
  getAcademyBonus
} from "./academyKnowledge";

describe("AcademyKnowledgeModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  function administrationRecord(overrides: { burgId?: number; stateId?: number; workers?: number } = {}) {
    return { burgId: 1, stateId: 1, workers: ACADEMY_SATURATION_WORKERS, ...overrides };
  }

  it("raises the administration stock for a fully-staffed capital chancery", () => {
    setAdministrationEmployment([administrationRecord()]);

    AcademyKnowledge.settleAnnual();

    const stock = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "administration");
    expect(stock?.stock).toBeGreaterThan(0);
    expect(getAcademyBonus(1, "administration")).toBeGreaterThan(1);
  });

  it("matures a half-staffed chancery's stock by raw headcount, not gated by a population/burg.group threshold", () => {
    // §8.1 decision 2 (reused for the academy layer, docs/plan/knowledge-guild-system.md §9 Phase 3):
    // no minimum settlement-size gate — a half-staffed chancery still accumulates real technique
    // over time, capped below stock=1 by its own headcount rather than blocked outright.
    setAdministrationEmployment([administrationRecord({ workers: ACADEMY_SATURATION_WORKERS / 2 })]);

    let stock = 0;
    for (let i = 0; i < 200; i++) {
      worldContext.options = { year: 500 + i };
      AcademyKnowledge.settleAnnual();
      stock = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    }

    expect(stock).toBeGreaterThan(0.45);
    expect(stock).toBeLessThan(0.55);
  });

  it("decays the stock for a capital whose administration headcount drops to zero", () => {
    setAdministrationEmployment([administrationRecord()]);
    AcademyKnowledge.settleAnnual();
    const stockAfterFirstYear = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterFirstYear).toBeGreaterThan(0);

    setAdministrationEmployment([administrationRecord({ workers: 0 })]);
    worldContext.options = { year: 501 };
    AcademyKnowledge.settleAnnual();

    const stockAfterDecay = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterDecay).toBeLessThan(stockAfterFirstYear);
  });

  it("keeps decaying an orphaned capital's stock after its administration record disappears", () => {
    setAdministrationEmployment([administrationRecord()]);
    AcademyKnowledge.settleAnnual();
    const stockWithRecord = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockWithRecord).toBeGreaterThan(0);

    setAdministrationEmployment([]);
    worldContext.options = { year: 501 };
    AcademyKnowledge.settleAnnual();

    const orphanStock = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(orphanStock).toBeGreaterThan(0);
    expect(orphanStock).toBeLessThan(stockWithRecord);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setAdministrationEmployment([administrationRecord()]);

    AcademyKnowledge.settleAnnual();
    const stockAfterFirstCall = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock;
    AcademyKnowledge.settleAnnual();

    expect(getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock).toBe(stockAfterFirstCall);
  });

  it("returns bonus 1 (no bonus) for a Burg with no tracked stock", () => {
    expect(getAcademyBonus(999, "administration")).toBe(1);
  });

  describe("applyConquestDisruptionToAcademies()", () => {
    it("cuts a Burg's tracked stock by ACADEMY_CONQUEST_DISRUPTION_PENALTY", () => {
      setAcademyKnowledgeStocks([{ burgId: 1, domain: "administration", stock: 0.6 }]);

      applyConquestDisruptionToAcademies(1);

      const stock = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1)?.stock;
      expect(stock).toBeCloseTo(0.6 * (1 - ACADEMY_CONQUEST_DISRUPTION_PENALTY), 4);
    });

    it("is a no-op for a Burg with no tracked stock", () => {
      applyConquestDisruptionToAcademies(999);

      expect(getAcademyKnowledgeStocks()).toEqual([]);
    });
  });

  describe("derived technology-bias extraWorkers", () => {
    function philosophyStock(): number {
      return (
        getAcademyKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "naturalPhilosophy")?.stock ??
        0
      );
    }

    function settleWorkshop(): number {
      setExperimentalWorkshops([
        {
          burgId: 1,
          sponsorStateId: 1,
          active: true,
          researchers: 2,
          annualBudget: 16,
          experimentRecord: 0,
          lastFundedYear: 499
        }
      ]);
      AcademyKnowledge.settleAnnual();
      return philosophyStock();
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
      const control = settleWorkshop();
      resetWorld();
      setResearchNamedSeats([]);
      setInstructionResidues([]);
      expect(settleWorkshop()).toBe(control);
    });

    it("raises naturalPhilosophy coverage from a workshopResearcher seat versus the empty-seat control", () => {
      const control = settleWorkshop();
      resetWorld();
      setResearchNamedSeats([{ burgId: 1, characterId: 9, role: "workshopResearcher" }]);
      expect(settleWorkshop()).toBeGreaterThan(control);
    });
  });
});
