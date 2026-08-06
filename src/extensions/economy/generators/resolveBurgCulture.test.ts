import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../../data/races";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { firstNonWildCultureId, resolveBurgCulture } from "./resolveBurgCulture";

describe("resolveBurgCulture", () => {
  afterEach(() => clearEconomyContext());

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const races = createDefaultRaces();
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 1, shield: "round", race: 0 },
        { i: 4, name: "Anor", base: 1, shield: "heater", race: 1 }
      ],
      states: [{ i: 0 }, { i: 1 }, { i: 2, culture: 0, name: "Clif" }],
      burgs: [{ i: 0 }, { i: 2, name: "Chistoney", culture: 0, state: 2, cell: 0 }],
      cells: { culture: new Uint16Array([0]) }
    } as unknown as PackedGraph;
  });

  it("skips Wildlands and falls back to a Human culture", () => {
    expect(firstNonWildCultureId(0, 0, undefined)).toBe(0);
    expect(resolveBurgCulture(worldContext.pack.burgs[2])).toBe(4);
  });

  it("prefers an explicit non-wild burg culture", () => {
    worldContext.pack.burgs[2] = { i: 2, name: "X", culture: 4, state: 2, cell: 0 };
    expect(resolveBurgCulture(worldContext.pack.burgs[2])).toBe(4);
  });
});
