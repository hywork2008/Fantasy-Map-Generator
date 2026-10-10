import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildChapters,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setCraftDomainEmploymentRecords,
  setGuildChapters,
  setGuildKnowledgeStocks,
  setSmelterOperations
} from "../economyContext";
import { buildGuildChapterSuitabilityContext, scoreGuildChapterSuitability } from "./guildChapterSuitability";
import {
  CHAPTER_FOUND_THRESHOLD,
  GuildChapters,
  guildHallVacancyRate,
  maxChaptersForDomainInState
} from "./guildChapters";
import type { GuildChapter } from "./guildChapterTypes";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

describe("GuildChaptersModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.biomesData = { tags: [[], ["forest"]] } as typeof worldContext.biomesData;
    worldContext.pack = {
      burgs: [
        undefined,
        { i: 1, cell: 0, x: 0, y: 0, state: 1, market: 1, name: "Forge Town", population: 40 },
        { i: 2, cell: 1, x: 1, y: 0, state: 1, market: 1, name: "Large Town", population: 400 }
      ],
      states: [undefined, { i: 1, name: "Testland", capital: 2 }],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [1, 0]
        ],
        c: [[1], [0]],
        biomeCode: Uint8Array.from([0, 0]),
        h: Uint8Array.from([55, 55]),
        r: Uint16Array.from([0, 0]),
        routes: {}
      }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("prefers a staffed smelter over a larger burg without mineral activity", () => {
    setSmelterOperations([
      {
        i: 1,
        depositId: 1,
        cell: 0,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        technology: 1,
        smeltingYield: 1,
        annualCapacityTons: 10,
        workers: 6,
        securityInvestment: 0,
        lastSecurityUpkeep: 0,
        lastTheftLoss: 0,
        lastTheftRisk: 0,
        active: true
      }
    ]);

    const context = buildGuildChapterSuitabilityContext();
    expect(scoreGuildChapterSuitability(1, "metallurgy", context)).toBeGreaterThan(
      scoreGuildChapterSuitability(2, "metallurgy", context)
    );
    expect(scoreGuildChapterSuitability(1, "metallurgy", context)).toBeGreaterThanOrEqual(CHAPTER_FOUND_THRESHOLD);

    GuildChapters.seedAfterGenerate();
    expect(getGuildChapters()).toContainEqual(
      expect.objectContaining({ burgId: 1, domain: "metallurgy", status: "chapter" })
    );
  });

  it("uses an independent annual self-gate", () => {
    setGuildChapters([{ burgId: 1, domain: "metallurgy", foundedYear: 500, status: "chapter", suitability: 1 }]);
    worldContext.options = { year: 501 };
    const neverFound = { P: () => false };

    expect(GuildChapters.settleAnnual(neverFound)).toBe(true);
    expect(GuildChapters.settleAnnual(neverFound)).toBe(false);
  });

  it("closes an empty hall after three years even when the terrain score stays high", () => {
    worldContext.options = { year: 500 };
    setGuildChapters([
      { burgId: 1, domain: "instruments", foundedYear: 497, status: "chapter", suitability: 0.9 },
      { burgId: 2, domain: "instruments", foundedYear: 500, status: "chapter", suitability: 0.9 }
    ]);

    expect(GuildChapters.settleAnnual({ P: () => false })).toBe(true);

    const halls = getGuildChapters().filter(chapter => chapter.domain === "instruments");
    expect(halls.map(chapter => chapter.burgId)).toEqual([2]);
    expect(scoreGuildChapterSuitability(2, "instruments", buildGuildChapterSuitabilityContext())).toBeGreaterThan(0.2);
  });

  it("caps formal halls per state domain from the state burg count", () => {
    expect(maxChaptersForDomainInState(1)).toBe(1);
    expect(maxChaptersForDomainInState(11)).toBe(2);
    expect(maxChaptersForDomainInState(100)).toBe(6);
  });

  it("scores a staffed woodworking burg above a forest burg with no craft workers", () => {
    worldContext.pack.cells.biomeCode = Uint8Array.from([1, 0]);
    setCraftDomainEmploymentRecords([{ burgId: 2, domain: "woodworking", workers: 6 }]);
    const context = buildGuildChapterSuitabilityContext();
    expect(scoreGuildChapterSuitability(2, "woodworking", context)).toBeGreaterThan(
      scoreGuildChapterSuitability(1, "woodworking", context)
    );
    expect(scoreGuildChapterSuitability(2, "woodworking", context)).toBeGreaterThanOrEqual(CHAPTER_FOUND_THRESHOLD);
  });

  it("promotes a tenured informal smithy into the slot of an empty smelter hall", () => {
    setSmelterOperations([
      {
        i: 1,
        depositId: 1,
        cell: 0,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        technology: 1,
        smeltingYield: 1,
        annualCapacityTons: 10,
        workers: 6,
        securityInvestment: 0,
        lastSecurityUpkeep: 0,
        lastTheftLoss: 0,
        lastTheftRisk: 0,
        active: true
      }
    ]);
    setCraftDomainEmploymentRecords([{ burgId: 2, domain: "metallurgy", workers: 6 }]);
    setGuildKnowledgeStocks([{ burgId: 2, domain: "metallurgy", stock: 0.5, treasury: 0 }]);

    GuildChapters.seedAfterGenerate();

    const metallurgy = getGuildChapters().filter(chapter => chapter.domain === "metallurgy");
    expect(metallurgy).toEqual([expect.objectContaining({ burgId: 2, status: "chapter" })]);
  });

  it("brings hall vacancy to half or below when tenured informal practice outnumbers empty halls", () => {
    const burgs = [undefined];
    for (let id = 1; id <= 11; id++) {
      burgs.push({ i: id, cell: 0, x: id, y: 0, state: 1, market: 1, name: `Burg ${id}`, population: 10 });
    }
    worldContext.pack = {
      burgs,
      states: [undefined, { i: 1, name: "Testland", capital: 1 }],
      cells: {
        i: [0],
        p: [[0, 0]],
        c: [[]],
        biomeCode: Uint8Array.from([0]),
        h: Uint8Array.from([20]),
        r: Uint16Array.from([0]),
        routes: {}
      }
    } as unknown as PackedGraph;
    worldContext.options = { year: 510 };

    const empty = (burgId: number, domain: CraftKnowledgeDomain): GuildChapter => ({
      burgId,
      domain,
      foundedYear: 400,
      status: "chapter",
      suitability: 0.9
    });
    setGuildChapters([
      empty(1, "metallurgy"),
      empty(2, "woodworking"),
      empty(3, "masonry"),
      empty(4, "leather"),
      { burgId: 5, domain: "metallurgy", foundedYear: 400, status: "chapter", suitability: 0.9 }
    ]);
    setCraftDomainEmploymentRecords([
      { burgId: 5, domain: "metallurgy", workers: 4 },
      { burgId: 6, domain: "metallurgy", workers: 4 },
      { burgId: 7, domain: "woodworking", workers: 4 },
      { burgId: 8, domain: "masonry", workers: 4 },
      { burgId: 9, domain: "leather", workers: 4 },
      { burgId: 10, domain: "glassware", workers: 4 },
      { burgId: 11, domain: "printing", workers: 4 },
      { burgId: 7, domain: "instruments", workers: 4 }
    ]);
    setGuildKnowledgeStocks([
      { burgId: 5, domain: "metallurgy", stock: 0.6, treasury: 0 },
      { burgId: 6, domain: "metallurgy", stock: 0.5, treasury: 0 },
      { burgId: 7, domain: "woodworking", stock: 0.5, treasury: 0 },
      { burgId: 8, domain: "masonry", stock: 0.5, treasury: 0 },
      { burgId: 9, domain: "leather", stock: 0.5, treasury: 0 },
      { burgId: 10, domain: "glassware", stock: 0.5, treasury: 0 },
      { burgId: 11, domain: "printing", stock: 0.5, treasury: 0 },
      { burgId: 6, domain: "instruments", stock: 0.9, treasury: 0 },
      { burgId: 7, domain: "instruments", stock: 0.1, treasury: 0 }
    ]);

    expect(GuildChapters.settleAnnual({ P: () => false })).toBe(true);

    const chapters = getGuildChapters();
    expect(chapters.some(chapter => chapter.burgId === 1 && chapter.domain === "metallurgy")).toBe(false);
    expect(chapters).toContainEqual(expect.objectContaining({ burgId: 6, domain: "metallurgy", status: "chapter" }));
    expect(chapters.some(chapter => chapter.domain === "instruments")).toBe(false);
    expect(guildHallVacancyRate(chapters, getGuildKnowledgeStocks())).toBeLessThanOrEqual(0.5);
  });
});
