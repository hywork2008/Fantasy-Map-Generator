import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getAcademyKnowledgeStocks,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setAcademyKnowledgeStocks,
  setGuildKnowledgeStocks
} from "../economyContext";
import { applyConquestDisruption } from "./conquestDisruption";

describe("applyConquestDisruption()", () => {
  afterEach(() => clearEconomyContext());

  it("disrupts both guild and academy stocks for the Burg when economy context is ready", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8 }]);
    setAcademyKnowledgeStocks([{ burgId: 1, domain: "administration", stock: 0.6 }]);

    applyConquestDisruption(1);

    expect(getGuildKnowledgeStocks()[0].stock).toBeLessThan(0.8);
    expect(getAcademyKnowledgeStocks()[0].stock).toBeLessThan(0.6);
  });

  it("is a no-op when economy's context has not been initialized (e.g. a Nobility unit test)", () => {
    expect(() => applyConquestDisruption(1)).not.toThrow();
  });
});
