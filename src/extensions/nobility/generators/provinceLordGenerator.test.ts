import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";

const { analyzeFrontiers, getProvinceThreats } = vi.hoisted(() => ({
  analyzeFrontiers: vi.fn(),
  getProvinceThreats: vi.fn()
}));

vi.mock("../../../generators/frontierAnalysis", () => ({ analyzeFrontiers, getProvinceThreats }));

import { assignProvinceLords } from "./provinceLordGenerator";

describe("assignProvinceLords", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.seed = "123456";
    worldContext.options = { year: 1000 } as never;
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearNobilityContext();
  });

  function setPack(provinces: PackedGraph["provinces"]) {
    worldContext.pack = {
      characters: [],
      provinces,
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom", culture: 0, capital: 0 }
      ]
    } as unknown as PackedGraph;
  }

  it("creates a landed lord for a province flagged as a frontier by getProvinceThreats", () => {
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[3, { totalWeight: 5, primaryNeighbor: 2 }]]));
    setPack([undefined, undefined, undefined, { i: 3, state: 1, formName: "Margrave", burg: 7 }] as never);

    assignProvinceLords();

    expect(worldContext.pack.characters).toHaveLength(1);
    const lord = worldContext.pack.characters[0];
    expect(lord.titles[0]).toMatchObject({ entityType: "province", entityId: 3, landed: true });
    expect(["Margrave", "Margravine"]).toContain(lord.titles[0].title);
    expect(lord.location).toBe(7);
  });

  it("skips province id 0 (no province)", () => {
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[0, { totalWeight: 5, primaryNeighbor: 2 }]]));
    setPack([{ i: 0, state: 1, formName: "Province", burg: 0 }] as never);

    assignProvinceLords();

    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("skips a frontier province that belongs to a different state", () => {
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[3, { totalWeight: 5, primaryNeighbor: 2 }]]));
    setPack([undefined, undefined, undefined, { i: 3, state: 2, formName: "County", burg: 7 }] as never);

    assignProvinceLords();

    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("does not create a second lord while one is already alive", () => {
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[3, { totalWeight: 5, primaryNeighbor: 2 }]]));
    setPack([undefined, undefined, undefined, { i: 3, state: 1, formName: "County", burg: 7 }] as never);
    worldContext.pack.characters = [
      { i: 1, dead: false, titles: [{ title: "Count", landed: true, entityType: "province", entityId: 3 }] } as never
    ];

    assignProvinceLords();

    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("does not crash when a state has no frontier segments", () => {
    analyzeFrontiers.mockReturnValue(new Map());
    getProvinceThreats.mockReturnValue(new Map());
    setPack([]);

    expect(() => assignProvinceLords()).not.toThrow();
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("does nothing when there are no characters, states, or provinces initialized", () => {
    worldContext.pack = { characters: [], states: [], provinces: [] } as unknown as PackedGraph;
    expect(() => assignProvinceLords()).not.toThrow();
  });
});
