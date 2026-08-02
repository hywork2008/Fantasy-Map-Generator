import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getInnStayLedgers,
  getMobileAdultCohorts,
  initEconomyContext,
  setInnFacilities,
  setMobileAdultCohorts
} from "../economyContext";
import { admitTemporaryLodgers, getAvailableTemporaryInnBeds, settleInnStaysMonthly } from "./innStays";

beforeEach(() => {
  initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  worldContext.populationRate = 10;
  worldContext.urbanization = 1;
  worldContext.options.year = 100;
  worldContext.options.month = 1;
  worldContext.pack = {
    burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, population: 2, state: 1 }],
    cells: { p: [[0, 0]] }
  } as unknown as PackedGraph;
  setInnFacilities([
    {
      burgId: 1,
      innClass: "market",
      buildingCount: 1,
      privateRooms: 2,
      privateBeds: 2,
      sharedBeds: 8,
      commonSeats: 12,
      stableSpaces: 3,
      condition: 0.8
    }
  ]);
  setMobileAdultCohorts([]);
});

afterEach(() => clearEconomyContext());

describe("temporary inn stays", () => {
  it("uses bed capacity without changing permanent burg population", () => {
    const unresolved = admitTemporaryLodgers(
      { originCell: 0, originState: 1, maleAdults: 1, femaleAdults: 1, yearsSearching: 0 },
      [{ i: 1 }]
    );

    expect(unresolved).toMatchObject({ maleAdults: 0.5, femaleAdults: 0.5 });
    expect(worldContext.pack.burgs[1]?.population).toBe(2);
    expect(getInnStayLedgers()[0]?.temporaryLodgerCohorts).toHaveLength(1);
    expect(getAvailableTemporaryInnBeds(1)).toBe(0);
  });

  it("returns expired lodgers to the mobile-cohort outcome path", () => {
    admitTemporaryLodgers({ originCell: 0, originState: 1, maleAdults: 0.5, femaleAdults: 0.5, yearsSearching: 0 }, [
      { i: 1 }
    ]);
    worldContext.options.year = 101;

    expect(settleInnStaysMonthly()).toBe(true);
    expect(getInnStayLedgers()).toEqual([]);
    expect(getMobileAdultCohorts()).toEqual([
      { originCell: 0, originState: 1, maleAdults: 0.5, femaleAdults: 0.5, yearsSearching: 1 }
    ]);
  });
});
