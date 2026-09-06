import { describe, expect, it } from "vitest";
import type { SubterraneanDomain } from "../types/models";
import { seedDwarfHoldOikoumene, withDwarfMountainRegion } from "./seedDwarfHoldOikoumene";

function makeWorld(overrides: { domains: SubterraneanDomain[] }) {
  const cells = {
    i: new Uint16Array([0, 1, 2, 3, 4]),
    c: [[1], [0, 2], [1, 3], [2, 4], [3]],
    h: new Uint16Array([95, 80, 90, 30, 10]),
    r: new Uint16Array([0, 0, 0, 0, 0]),
    g: new Uint16Array([0, 1, 2, 3, 4]),
    culture: new Uint16Array([1, 1, 1, 1, 1]),
    capacity: new Float32Array([0, 0, 0, 100, 0]),
    subsistenceCapacity: new Float32Array([0, 0, 0, 100, 0]),
    subsistenceNonAgriculturalCapacity: new Float32Array([0, 0, 0, 100, 0]),
    biomeCode: new Uint8Array([0, 0, 0, 0, 0]),
    subterraneanVoid: new Float32Array([0.6, 0.7, 0.65, 0, 0]),
    area: new Float32Array([10, 10, 10, 10, 10]),
    s: new Int16Array([0, 0, 0, 20, 0]),
    pop: new Float32Array(5),
    children: new Float32Array(5),
    maleAdults: new Float32Array(5),
    femaleAdults: new Float32Array(5),
    elders: new Float32Array(5)
  };
  const world = {
    pack: {
      cells,
      cultures: [{ i: 0 }, { i: 1, race: 2, type: "Generic" }, { i: 2, race: 1, type: "Generic" }],
      races: [
        { i: 0, key: "unknown" },
        {
          i: 1,
          key: "dwarf",
          environmentalSurvival: {
            foodIndependent: true,
            temperatureIndependent: true,
            populationCapacityMultiplier: 0.3
          }
        },
        { i: 2, key: "human" }
      ],
      subterraneanDomains: overrides.domains
    },
    grid: {
      cells: {
        temp: new Int8Array([12, 12, 12, 12, 12]),
        prec: new Uint8Array([45, 45, 45, 45, 45])
      }
    },
    biomesData: { tags: [[]] }
  };
  return world;
}

describe("seedDwarfHoldOikoumene", () => {
  it("returns null when there is no dwarf culture", () => {
    const world = makeWorld({ domains: [] });
    world.pack.cultures = [{ i: 0 }, { i: 1, race: 2, type: "Generic" }] as never;
    const result = seedDwarfHoldOikoumene(world as never, "highFantasy", 1);
    expect(result).toBeNull();
  });

  it("returns null when there is no wildCavern domain (no mountains ⇒ no forced Dwarf nation)", () => {
    const world = makeWorld({ domains: [] });
    const result = seedDwarfHoldOikoumene(world as never, "highFantasy", 1);
    expect(result).toBeNull();
  });

  it("returns null on non-Fantasy culture sets", () => {
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [0, 1, 2],
      entrances: [1],
      depth: 2,
      voidVolume: 50
    };
    const world = makeWorld({ domains: [domain] });
    const result = seedDwarfHoldOikoumene(world as never, "european", 1);
    expect(result).toBeNull();
  });

  it("claims the wildCavern domain, moves culture, and raises capacity/s at every domain cell", () => {
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [0, 1, 2],
      entrances: [1],
      depth: 2,
      voidVolume: 50
    };
    const world = makeWorld({ domains: [domain] });

    const result = seedDwarfHoldOikoumene(world as never, "highFantasy", 1);

    expect(result).not.toBeNull();
    expect(result!.cultureId).toBe(2);
    expect(result!.raceId).toBe(1); // culture i=2 has race=1 ("dwarf" in this fixture's race table)
    expect(result!.anchorCell).toBe(1); // the only entrance
    expect(domain.kind).toBe("dwarfHold");
    expect(domain.raceId).toBe(1);
    expect(world.pack.cultures[2]!.center).toBe(1);
    expect(world.pack.cultures[2]!.type).toBe("Highland");
    for (const cell of domain.cells) {
      expect(world.pack.cells.culture[cell]).toBe(2);
      expect(world.pack.cells.capacity[cell]).toBeGreaterThan(0);
      expect(world.pack.cells.subterraneanCapacity![cell]).toBeGreaterThan(0);
      expect(world.pack.cells.s[cell]).toBeGreaterThan(0);
    }
    // Anchor cell's `s` gets a strategic capital boost beyond its raw population-capacity score.
    expect(world.pack.cells.s[1]).toBeGreaterThanOrEqual(20 * 4);
  });

  it("picks the wildCavern domain with the largest voidVolume when several exist", () => {
    const small: SubterraneanDomain = { i: 1, kind: "wildCavern", cells: [0], entrances: [0], depth: 1, voidVolume: 5 };
    const large: SubterraneanDomain = {
      i: 2,
      kind: "wildCavern",
      cells: [1, 2],
      entrances: [1],
      depth: 2,
      voidVolume: 500
    };
    const world = makeWorld({ domains: [small, large] });
    const result = seedDwarfHoldOikoumene(world as never, "highFantasy", 1);
    expect(result!.domain.i).toBe(2);
    expect(small.kind).toBe("wildCavern"); // untouched
    expect(large.kind).toBe("dwarfHold");
  });
});

describe("withDwarfMountainRegion", () => {
  it("returns the plan unchanged when there is no plan or no hold", () => {
    expect(withDwarfMountainRegion(undefined, null)).toBeUndefined();
    const plan = { regions: [], nodes: [], links: [] };
    expect(withDwarfMountainRegion(plan, null)).toBe(plan);
  });

  it("injects a mountain region and a mandatoryCapital node at the anchor cell", () => {
    const plan = {
      regions: [{ id: 0, kind: "river" as const, center: 5, cells: [5, 6] }],
      nodes: [{ id: 0, regionId: 0, cell: 5, role: "center" as const, score: 10 }],
      links: []
    };
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "dwarfHold",
      raceId: 2,
      cells: [1, 2, 3],
      entrances: [1],
      depth: 2,
      voidVolume: 80
    };
    const hold = { cultureId: 1, raceId: 2, domain, anchorCell: 1 };

    const result = withDwarfMountainRegion(plan, hold);

    expect(result!.regions).toHaveLength(2);
    const mountainRegion = result!.regions.find(r => r.kind === "mountain");
    expect(mountainRegion?.center).toBe(1);
    expect(mountainRegion?.cells).toEqual([1, 2, 3]);
    const mountainNode = result!.nodes.find(n => n.mandatoryCapital);
    expect(mountainNode?.cell).toBe(1);
    expect(mountainNode?.regionId).toBe(mountainRegion?.id);
    // Original plan untouched (immutable update).
    expect(plan.regions).toHaveLength(1);
  });

  it("is idempotent — re-calling with the same hold does not duplicate the region", () => {
    const plan = { regions: [], nodes: [], links: [] };
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "dwarfHold",
      cells: [1],
      entrances: [1],
      depth: 1,
      voidVolume: 10
    };
    const hold = { cultureId: 1, raceId: 2, domain, anchorCell: 1 };
    const once = withDwarfMountainRegion(plan, hold)!;
    const twice = withDwarfMountainRegion(once, hold)!;
    expect(twice.regions).toHaveLength(1);
  });
});
