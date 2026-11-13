import { describe, expect, it } from "vitest";
import type { Market } from "./marketTypes";
import {
  emptyCirculation,
  getContainerReplacementPerLot,
  getContainerSetPerLot,
  getContainerYieldCap,
  planContainerDraw,
  receiveShippedContainers,
  recordContainerFilling,
  returnDrunkContainers,
  shipFilledContainers
} from "./returnableContainers";

describe("returnable drink containers", () => {
  it("keeps the recipes' cask wear and sizes a tun's set of casks, pots and bottles", () => {
    expect(getContainerSetPerLot("Beer", "Barrels")).toBeCloseTo(1000 / 120);
    expect(getContainerReplacementPerLot("Beer", "Barrels")).toBe(0.4);
    expect(getContainerReplacementPerLot("Wine", "Barrels")).toBe(0.08);
    expect(getContainerSetPerLot("Beer", "Ceramics")).toBeCloseTo(1.075);
  });

  it("refills empties and buys new casks only for what the empties and the recipe cannot cover", () => {
    const circulation = emptyCirculation();
    circulation.empties.Barrels = 10;
    const set = getContainerSetPerLot("Beer", "Barrels");
    const draw = planContainerDraw(circulation, "Beer", "Barrels", 2, 0.8);
    expect(draw.reused).toBe(10);
    expect(draw.extra).toBeCloseTo(2 * set - 0.8 - 10);

    recordContainerFilling(circulation, "Beer", "Barrels", 2, draw);
    expect(circulation.empties.Barrels).toBe(0);
    expect(circulation.filled.Beer?.Barrels).toBe(2);

    // Drunk at home: the casks come back, less the trip's loss.
    returnDrunkContainers(circulation, "Beer", 2);
    expect(circulation.filled.Beer?.Barrels).toBe(0);
    expect(circulation.empties.Barrels).toBeCloseTo(2 * set * (1 - 0.048));
  });

  it("caps the filling by the empties while they last, then by whole sets bought new", () => {
    const set = 1000 / 120;
    // Plenty of empties: the replacement casks are all the market must sell.
    expect(getContainerYieldCap(100, 2, set, 0.4, 1)).toBeCloseTo(5);
    // No empties: every lot takes a whole new set.
    expect(getContainerYieldCap(0, 20, set, 0.4, 1)).toBeCloseTo(20 / set);
  });

  it("sends the casks with a shipped lot and returns them to the market that drinks it", () => {
    const origin = { returnableContainerLedger: { circulation: emptyCirculation() } } as unknown as Market;
    const destination = { returnableContainerLedger: { circulation: emptyCirculation() } } as unknown as Market;
    const from = origin.returnableContainerLedger!.circulation!;
    const to = destination.returnableContainerLedger!.circulation!;
    from.filled.Wine = { Barrels: 3, Ceramics: 1 };

    shipFilledContainers(from, "Wine", 2);
    expect(from.filled.Wine.Barrels).toBeCloseTo(1.5);
    expect(from.shipped.Wine?.Ceramics).toBeCloseTo(0.5);

    receiveShippedContainers([origin, destination], to, "Wine", 2);
    expect(to.filled.Wine?.Barrels).toBeCloseTo(1.5);
    expect(to.filled.Wine?.Ceramics).toBeCloseTo(0.5);
    expect(from.shipped.Wine?.Barrels).toBeCloseTo(0);
  });
});
