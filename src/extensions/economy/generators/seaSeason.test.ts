import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { expectedSeaWaitDays, isSeaBookable, isStormLayUpDate } from "./seaSeason";

describe("isStormLayUpDate", () => {
  const north = { south: false, antiquity: false };

  it("lays ships up from Martinmas to St Peter's Chair", () => {
    expect(isStormLayUpDate(11, 10, north)).toBe(false);
    expect(isStormLayUpDate(11, 11, north)).toBe(true);
    expect(isStormLayUpDate(1, 15, north)).toBe(true);
    expect(isStormLayUpDate(2, 21, north)).toBe(true);
    expect(isStormLayUpDate(2, 22, north)).toBe(false);
  });

  it("keeps antiquity's sea closed to 10 March", () => {
    expect(isStormLayUpDate(3, 9, { south: false, antiquity: true })).toBe(true);
    expect(isStormLayUpDate(3, 10, { south: false, antiquity: true })).toBe(false);
  });

  it("shifts the lay-up six months in the south", () => {
    const south = { south: true, antiquity: false };
    expect(isStormLayUpDate(5, 11, south)).toBe(true);
    expect(isStormLayUpDate(8, 22, south)).toBe(false);
    expect(isStormLayUpDate(1, 15, south)).toBe(false);
  });
});

describe("cargo carted to a laid-up port", () => {
  const setDate = (month: number, day: number) => {
    worldContext.options = { ...worldContext.options, year: 1400, month, day } as never;
  };

  beforeEach(() => {
    simulationContext.worldSettings = { "fmg-long-distance-trade": "on" };
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    // A northern port outside the tropics, before ocean-going hulls: laid up from Martinmas.
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, cell: 0, y: 0, state: 0 } as Burg]
    } as unknown as PackedGraph;
    worldContext.mapCoordinates = { latN: 50, latT: 0 } as never;
    worldContext.graphHeight = 100;
  });

  afterEach(() => {
    delete simulationContext.worldSettings;
    clearEconomyContext();
  });

  it("reckons the wait in port from the day the cargo gets there", () => {
    setDate(10, 25);
    expect(expectedSeaWaitDays(1, 10)).toBe(10);
    // Ten days on the road bring it to the quay on 4 November; the hold is not full before Martinmas.
    expect(expectedSeaWaitDays(1, 10, 10)).toBeGreaterThan(100);
  });

  it("books cargo by the port's state on the day it arrives", () => {
    setDate(10, 25);
    expect(isSeaBookable(1)).toBe(true);
    expect(isSeaBookable(1, 20)).toBe(false);
    setDate(1, 10);
    expect(isSeaBookable(1)).toBe(false);
    expect(isSeaBookable(1, 20)).toBe(true);
  });
});
