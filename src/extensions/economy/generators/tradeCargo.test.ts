import { describe, expect, it } from "vitest";
import type { Good } from "./goods-generator";
import type { Deal, TradeRouteSegment } from "./marketTypes";
import { buildCargoManifests, getManifestCapacitySlots, getTransportAllocations } from "./tradeCargo";

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
});
