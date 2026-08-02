import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGuildChapters, setGuildKnowledgeStocks } from "../economyContext";
import { getGuildOverviewState } from "../store/guildOverviewState";
import { refreshGuildOverview } from "./guild-overview";

describe("refreshGuildOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, state: 1, name: "Anvil" }],
      states: [undefined, { i: 1, name: "Testland" }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("joins formal chapter status onto the technique-stock ledger", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.4, treasury: 8 }]);
    setGuildChapters([{ burgId: 1, domain: "metallurgy", foundedYear: 500, status: "chapter", suitability: 0.9 }]);

    refreshGuildOverview();

    expect(getGuildOverviewState().rows).toEqual([
      expect.objectContaining({ domain: "metallurgy", status: "chapter" })
    ]);
  });
});
