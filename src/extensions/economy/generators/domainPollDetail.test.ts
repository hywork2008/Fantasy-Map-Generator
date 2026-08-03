import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, Province, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { getDomainPollDetail } from "./domainPollDetail";

describe("domainPollDetail (PR-13)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  it("builds per-seat levy rows and a poll multiplier", () => {
    const state = { i: 1, name: "Testland", form: "Monarchy" } as unknown as State;
    const province: Province = {
      i: 1,
      state: 1,
      burg: 1,
      name: "North",
      removed: false
    } as Province;
    const burg = {
      i: 1,
      name: "Northburg",
      population: 2,
      domainLevyRate: 1.5,
      domainFiscalPolicy: "extract",
      domainWorksTarget: "walls",
      domainWorksProgress: 20,
      removed: false
    } as unknown as Burg;

    worldContext.pack = {
      states: [undefined, state],
      provinces: [undefined, province],
      burgs: [undefined, burg]
    } as unknown as PackedGraph;

    const detail = getDomainPollDetail(state);
    expect(detail.seats).toHaveLength(1);
    expect(detail.seats[0]?.levyRate).toBe(1.5);
    expect(detail.seats[0]?.policy).toBe("extract");
    expect(detail.pollMultiplier).toBeGreaterThan(1);
    expect(detail.averageLevy).toBe(1.5);
  });
});
