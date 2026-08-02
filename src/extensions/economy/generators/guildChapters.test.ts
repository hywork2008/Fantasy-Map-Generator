import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildChapters,
  initEconomyContext,
  setGuildChapters,
  setSmelterOperations
} from "../economyContext";
import { buildGuildChapterSuitabilityContext, scoreGuildChapterSuitability } from "./guildChapterSuitability";
import { CHAPTER_FOUND_THRESHOLD, GuildChapters, maxChaptersForDomainInState } from "./guildChapters";

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

  it("caps formal halls per state domain from the state burg count", () => {
    expect(maxChaptersForDomainInState(1)).toBe(1);
    expect(maxChaptersForDomainInState(11)).toBe(2);
    expect(maxChaptersForDomainInState(100)).toBe(6);
  });
});
