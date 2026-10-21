import { describe, expect, it } from "vitest";
import type { Good } from "./goods-generator";
import type { Deal, TradeRouteSegment } from "./marketTypes";
import {
  buildCargoManifests,
  getDefaultGoodCargoProfile,
  getManifestCapacitySlots,
  getRouteCargoSlotsPerUnit,
  getTransportAllocations
} from "./tradeCargo";

const LAND_ROUTE: TradeRouteSegment[] = [
  {
    type: "land",
    points: [
      [0, 0],
      [1, 0]
    ]
  }
];

function good(i: number, name: string, value: number, cargoSlotsPerUnit: number): Good {
  return {
    i,
    name,
    value,
    tags: [],
    unit: "crate",
    icon: "good",
    color: "#000",
    cargo: { cargoSlotsPerUnit, handlingClass: "crated" }
  };
}

function deal(i: number, goodId: number, units: number, price: number): Deal {
  return { i, seller: 1, sellerType: "market", buyer: 2, buyerType: "market", good: goodId, units, price, tax: 0 };
}

describe("trade cargo manifests", () => {
  it("limits every manifest to its selected land convoy capacity and preserves every deal unit", () => {
    const goods = [good(0, "Wood", 1, 3)];
    const deals = [deal(1, 0, 200, 1)];

    const manifests = buildCargoManifests(deals, goods, LAND_ROUTE, "horse");

    expect(manifests.length).toBeGreaterThan(1);
    expect(manifests.every(manifest => manifest.usedSlots <= getManifestCapacitySlots(manifest.allocations))).toBe(
      true
    );
    const shippedUnits = manifests.flatMap(manifest => manifest.items).reduce((sum, item) => sum + item.units, 0);
    expect(shippedUnits).toBeCloseTo(200, 6);
  });

  it("finds each deal's good by id, not by catalogue position (ids start at 1)", () => {
    const goods = [good(1, "Wood", 1, 3), good(2, "Silk", 50, 1)];
    const [manifest] = buildCargoManifests([deal(1, 2, 4, 50)], goods, LAND_ROUTE, "horse");

    expect(manifest.items[0].cargoSlotsPerUnit).toBe(1);
  });

  it("reserves hold space for a lower-value alternative before density filling", () => {
    const goods = [good(0, "Jewelry", 100, 1), good(1, "Grain", 1, 1)];
    const deals = [deal(1, 0, 300, 100), deal(2, 1, 300, 1)];

    const [manifest] = buildCargoManifests(deals, goods, LAND_ROUTE, "horse");

    const slotsByGood = new Map<number, number>();
    for (const item of manifest.items) slotsByGood.set(item.deal.good, item.units * item.cargoSlotsPerUnit);
    expect(slotsByGood.get(0)).toBeGreaterThan(0);
    expect(slotsByGood.get(1)).toBeGreaterThan(0);
    expect((slotsByGood.get(0) ?? 0) / manifest.usedSlots).toBeLessThanOrEqual(0.55 + 0.000001);
  });

  it("forms smaller partial manifests when only a cart-sized land asset remains", () => {
    const goods = [good(0, "Wood", 1, 1)];
    const deals = [deal(1, 0, 300, 1)];

    const manifests = buildCargoManifests(deals, goods, LAND_ROUTE, "horse", 80);

    expect(manifests.every(manifest => getManifestCapacitySlots(manifest.allocations) <= 80)).toBe(true);
    expect(manifests[0].allocations[0].transportId).toBe("cart");
  });

  it("keeps a load filled to a cart's slots on a cart despite floating-point dust", () => {
    // 19.9625 × 4 + 0.05 × 3 slots, as summed from a caravan payload.
    const allocations = getTransportAllocations(LAND_ROUTE, 19.96250000000023 * 4 + 0.05 * 3, "horse");

    expect(allocations[0].transportId).toBe("cart");
  });

  it("uses the smaller capacity when a route has both land and water legs", () => {
    const allocations = getTransportAllocations(
      [
        {
          type: "land",
          points: [
            [0, 0],
            [1, 0]
          ]
        },
        {
          type: "water",
          points: [
            [1, 0],
            [2, 0]
          ]
        }
      ],
      500,
      "horse"
    );

    expect(allocations.map(allocation => allocation.mode)).toEqual(["land", "water"]);
    expect(getManifestCapacitySlots(allocations)).toBe(
      Math.min(...allocations.map(allocation => allocation.capacitySlots))
    );
  });

  it("assigns an Economy river barge rather than a Shipbuilding hull to river legs", () => {
    const allocations = getTransportAllocations(
      [
        {
          type: "river",
          points: [
            [0, 0],
            [10, 0]
          ]
        }
      ],
      200,
      "horse",
      true
    );

    expect(allocations).toMatchObject([
      { mode: "river", transportId: "river-barge", unitCount: 2, capacitySlots: 320 }
    ]);
  });
  it("limits a top-up to the remaining berth even when the smallest vessel is larger", () => {
    const good = { i: 1, tags: [], cargo: { cargoSlotsPerUnit: 1 } } as Good;
    const manifests = buildCargoManifests(
      [{ i: 1, good: 1, units: 100, price: 1 } as Deal],
      [good],
      [
        {
          type: "sea",
          points: [
            [0, 0],
            [100, 0]
          ]
        }
      ],
      "horse",
      30
    );
    expect(manifests[0].usedSlots).toBe(30);
    expect(manifests.every(manifest => manifest.usedSlots <= 30)).toBe(true);
  });
  it("adds capacity across vehicle kinds before applying the sea bottleneck", () => {
    expect(
      getManifestCapacitySlots([
        { mode: "land", capacitySlots: 80 },
        { mode: "land", capacitySlots: 36 },
        { mode: "water", capacitySlots: 100 }
      ])
    ).toBe(100);
  });
});

describe("measured cargo", () => {
  const catalogueGood = (name: string, unit: string, tags: string[] = []): Good => ({
    i: 1,
    name,
    value: 1,
    tags,
    unit,
    icon: "good",
    color: "#000",
    trade: { weight: 3, bulk: 3, rarity: 2, distancePremium: 0, timeValueTrend: 0, durability: 3, lossRisk: 2 }
  });

  it("takes a wain of any staple by its weight, and the light ones by their bulk", () => {
    const slots = (name: string) => getDefaultGoodCargoProfile(catalogueGood(name, "wain"))?.cargoSlotsPerUnit ?? 0;
    // 465 kg a wain: 3.1 slots of 150 kg, whether the crop was given 3 or 4 slots before.
    expect(slots("Wheat")).toBeCloseTo(3.13, 2);
    expect(slots("Grain")).toBeCloseTo(slots("Wheat"), 6);
    // Oats take more room than their weight.
    expect(slots("Oats")).toBeGreaterThan(4.5);
  });

  it("takes 10 m³ of wood by the room the stacked pile fills", () => {
    expect(getDefaultGoodCargoProfile(catalogueGood("Wood", "pile"))?.cargoSlotsPerUnit).toBe(60);
    // A renamed unit is not the measured good.
    expect(getDefaultGoodCargoProfile(catalogueGood("Wood", "beam"))?.cargoSlotsPerUnit).toBe(3);
  });

  it("lets livestock walk overland but gives it deck room on water", () => {
    const sheep = {
      ...catalogueGood("Sheep", "head", ["liveAnimal"]),
      cargo: { cargoSlotsPerUnit: 5, handlingClass: "live" as const }
    };
    const sea: TradeRouteSegment[] = [...LAND_ROUTE, { ...LAND_ROUTE[0], type: "sea" }];
    expect(getRouteCargoSlotsPerUnit(sheep, LAND_ROUTE)).toBe(0);
    expect(getRouteCargoSlotsPerUnit(sheep, sea)).toBe(5);
    const [manifest] = buildCargoManifests([deal(1, 1, 300, 1)], [sheep], LAND_ROUTE, "horse");
    expect(manifest.items[0].units).toBe(300);
    expect(manifest.usedSlots).toBe(0);
  });
});
