import { describe, expect, it } from "vitest";
import { allocateEuropeanHoldings } from "./allocateEuropean";
import { type AllocateGaelicInput, FEUDAL_REGIMES } from "./types";

const input: AllocateGaelicInput = {
  stateId: 1,
  period: "highMedieval",
  capitalCellId: 0,
  capitalBurgId: 1,
  provinces: [
    { id: 1, name: "West", seatBurgId: 1, seatCellId: 0 },
    { id: 2, name: "East", seatBurgId: 2, seatCellId: 7 }
  ],
  threatenedProvinceIds: [2],
  cells: Array.from({ length: 16 }, (_, id) => ({
    id,
    provinceId: id < 8 ? 1 : 2,
    areaKm2: 1000,
    ruralPeople: 50000,
    urbanPeople: id % 4 === 0 ? 10000 : 0,
    burgId: id % 4 === 0 ? id + 1 : 0,
    burgName: `Seat ${id}`,
    height: 30,
    neighborIds: [id - 1, id + 1].filter(n => n >= 0 && n < 16)
  }))
};
describe("population-based European holding ledgers", () => {
  it.each(FEUDAL_REGIMES.filter(r => r !== "gaelicProvincial"))(
    "accounts for every land right in %s without NPC creation",
    regime => {
      const holdings = allocateEuropeanHoldings(input, regime);
      const sums = new Map<number, number>();
      for (const h of holdings) {
        expect(h.holderCharacterId).toBeUndefined();
        for (const id of h.cellIds) sums.set(id, (sums.get(id) ?? 0) + 10000);
        for (const share of h.shares ?? []) sums.set(share.cellId, (sums.get(share.cellId) ?? 0) + share.basisPoints);
      }
      expect([...sums.values()]).toEqual(Array(16).fill(10000));
      expect(new Set(holdings.map(h => h.id)).size).toBe(holdings.length);
    }
  );
  it("keeps shires administrative and distributes English honours across multiple shires", () => {
    const holdings = allocateEuropeanHoldings(input, "englishHonour");
    expect(holdings.filter(h => h.office === "sheriff")).toHaveLength(2);
    expect(holdings.filter(h => h.dignity === "baron")).toHaveLength(Math.floor(840000 / 17500));
    expect(holdings.some(h => h.dignity && h.provinceIds.length > 1)).toBe(true);
  });
  it("does not turn Nordic odal land into French hereditary counties", () => {
    const holdings = allocateEuropeanHoldings(input, "nordicOfficer");
    expect(holdings.filter(h => h.office === "sysselman")).toHaveLength(2);
    expect(holdings.filter(h => h.holderKind === "odal").every(h => h.dignity === null)).toBe(true);
  });
});
