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

  it("keeps a German state on the frontier-lord path when a holdings store exists", () => {
    initNobilityContext({
      worldContext,
      simulationContext: { extensions: {}, currentYear: 1000 }
    } as unknown as ExtensionAPI);
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[3, { totalWeight: 5, primaryNeighbor: 2 }]]));
    setPack([undefined, undefined, undefined, { i: 3, state: 1, formName: "County", burg: 7 }] as never);

    assignProvinceLords();

    expect(worldContext.pack.characters).toHaveLength(1);
    expect(worldContext.pack.characters?.[0].titles[0].entityType).toBe("province");
  });

  it("allocates a Celtic mormaer without a province title, then only refills a vacancy", () => {
    const previousRate = worldContext.populationRate;
    try {
      initNobilityContext({
        worldContext,
        simulationContext: { extensions: {}, currentYear: 1000 }
      } as unknown as ExtensionAPI);
      worldContext.options = { year: 1000, historicalPeriod: "earlyMedieval" } as never;
      worldContext.populationRate = 1000;
      worldContext.urbanization = 1;
      worldContext.distanceScale = 1;
      const nameBases = [] as unknown as typeof worldContext.nameBases;
      nameBases[22] = { i: 22, name: "Celtic", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" };
      worldContext.nameBases = nameBases;
      analyzeFrontiers.mockReturnValue(new Map());
      getProvinceThreats.mockReturnValue(new Map());
      worldContext.pack = {
        characters: [],
        cultures: [{ i: 0, name: "Gael", base: 22, shield: "" }],
        states: [
          { i: 0, name: "Neutrals" },
          { i: 1, name: "Alba", culture: 0, capital: 1, form: "Monarchy", formName: "Kingdom" }
        ],
        provinces: [undefined, { i: 1, state: 1, name: "Moray", burg: 1 }],
        burgs: [undefined, { i: 1, name: "Dun", cell: 2, population: 8 }],
        cells: {
          i: [0, 1, 2, 3],
          state: [0, 1, 1, 1],
          province: [0, 1, 1, 1],
          area: [0, 500, 500, 500],
          pop: [0, 10, 10, 10],
          h: [0, 30, 30, 30],
          burg: [0, 0, 1, 0],
          c: [[], [2], [1, 3], [2]]
        }
      } as unknown as PackedGraph;

      assignProvinceLords();

      const characters = worldContext.pack.characters ?? [];
      expect(characters).toHaveLength(1);
      expect(characters[0].titles[0]).toMatchObject({
        title: "Mormaer",
        landed: true,
        entityType: "holding",
        seatName: "Moray"
      });
      expect(characters.some(character => character.titles.some(title => title.entityType === "province"))).toBe(false);

      assignProvinceLords();
      expect(worldContext.pack.characters).toHaveLength(1);

      characters[0].dead = true;
      assignProvinceLords();
      const living = (worldContext.pack.characters ?? []).filter(character => !character.dead);
      expect(worldContext.pack.characters).toHaveLength(2);
      expect(living).toHaveLength(1);
      expect(living[0].titles[0]).toMatchObject({
        title: "Mormaer",
        entityType: "holding",
        entityId: characters[0].titles[0].entityId
      });

      // Leaving the Gaelic procedure dissolves the ledger and closes its titles.
      const alba = worldContext.pack.states[1] as { form: string; formName: string };
      alba.form = "Republic";
      alba.formName = "Free City";
      assignProvinceLords();
      expect(living[0].titles).toHaveLength(0);
      expect(living[0].pastTitles[0]).toMatchObject({ entityType: "holding", reason: "Holding ledger dissolved" });
    } finally {
      worldContext.populationRate = previousRate;
    }
  });

  it("falls back to a frontier lord when a Celtic state has no holdings store", () => {
    worldContext.options = { year: 1000, historicalPeriod: "earlyMedieval" } as never;
    analyzeFrontiers.mockReturnValue(new Map([[1, [{ neighborState: 2 }]]]));
    getProvinceThreats.mockReturnValue(new Map([[1, { totalWeight: 5, primaryNeighbor: 2 }]]));
    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Gael", base: 22, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Alba", culture: 0, capital: 1, form: "Monarchy", formName: "Kingdom" }
      ],
      provinces: [undefined, { i: 1, state: 1, name: "Moray", burg: 1, formName: "County" }],
      burgs: [undefined, { i: 1, name: "Dun", cell: 1, population: 8 }],
      cells: {
        i: [0, 1],
        state: [0, 1],
        province: [0, 1],
        area: [0, 500],
        pop: [0, 10],
        h: [0, 30],
        burg: [0, 1],
        c: [[], []]
      }
    } as unknown as PackedGraph;
    getProvinceThreats.mockClear();

    assignProvinceLords();

    expect(worldContext.pack.characters[0]?.titles[0]).toMatchObject({ entityType: "province", entityId: 1 });
  });
});
