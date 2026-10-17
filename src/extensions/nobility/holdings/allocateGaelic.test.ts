import { describe, expect, it } from "vitest";
import { allocateGaelicHoldings, knightFeesFor, reconcileGaelicHoldings } from "./allocateGaelic";
import { gaelicTitle } from "./titles";
import type { AllocateGaelicInput, GaelicCellInput, NobleHolding } from "./types";

function lineCell(id: number, partial: Partial<GaelicCellInput> = {}): GaelicCellInput {
  return {
    id,
    provinceId: id <= 3 ? 1 : 2,
    areaKm2: 500,
    ruralPeople: 10_000,
    burgId: id === 2 ? 10 : id === 5 ? 11 : 0,
    burgName: id === 2 ? "Dun" : id === 5 ? "Ath" : "",
    urbanPeople: id === 2 || id === 5 ? 8_000 : 0,
    height: id === 6 ? 80 : 30,
    neighborIds: [id - 1, id + 1].filter(next => next >= 1 && next <= 6),
    ...partial
  };
}

function lineFixture(
  period: AllocateGaelicInput["period"],
  cellPatch?: (cell: GaelicCellInput) => GaelicCellInput
): AllocateGaelicInput {
  const cells = [1, 2, 3, 4, 5, 6].map(id => {
    const cell = lineCell(id);
    return cellPatch ? cellPatch(cell) : cell;
  });
  return {
    stateId: 7,
    period,
    cells,
    provinces: [
      { id: 1, name: "Moray", seatBurgId: 10, seatCellId: 2 },
      { id: 2, name: "Atholl", seatBurgId: 11, seatCellId: 5 }
    ],
    capitalBurgId: 10,
    capitalCellId: 2
  };
}

function by(holdings: NobleHolding[], pred: (holding: NobleHolding) => boolean): NobleHolding[] {
  return holdings.filter(pred);
}

describe("knightFeesFor", () => {
  it("rounds the England formula and never exceeds the floored gross quota", () => {
    expect(knightFeesFor(130_000, 3_000_000, 0.35)).toBe(2676);
    expect(knightFeesFor(40, 10_000, 0.35)).toBe(0);
    expect(knightFeesFor(0, 10_000, 0.35)).toBe(0);
    expect(knightFeesFor(500, 0, 0.35)).toBe(0);
  });
});

describe("gaelic titles", () => {
  it("uses one English word for a mormaer or thane of either gender", () => {
    expect(gaelicTitle({ office: "mormaer", dignity: null }, "female")).toBe("Mormaer");
    expect(gaelicTitle({ office: "thane", dignity: null }, "male")).toBe("Thane");
    expect(gaelicTitle({ office: "none", dignity: "count" }, "male")).toBe("Earl");
    expect(gaelicTitle({ office: "none", dignity: "count" }, "female")).toBe("Countess");
    expect(gaelicTitle({ office: "none", dignity: "baron" }, "female")).toBe("Baroness");
    expect(gaelicTitle({ office: "sheriff", dignity: null }, "male")).toBe("Sheriff");
  });
});

describe("allocateGaelicHoldings", () => {
  it("builds the early six-cell ledger around one mormaer and one thanage", () => {
    const holdings = allocateGaelicHoldings(lineFixture("earlyMedieval"));

    expect(by(holdings, holding => holding.holderKind === "crown")).toMatchObject([
      { cellIds: [2], tenure: "demesne", seatName: "Dun", seatBurgId: 10, knightFees: 10 }
    ]);
    expect(by(holdings, holding => holding.office === "mormaer")).toMatchObject([
      {
        cellIds: [1],
        dignity: null,
        tenure: "kinLand",
        hereditary: true,
        frontier: false,
        seatName: "Moray",
        seatBurgId: 10,
        knightFees: 10
      }
    ]);
    expect(by(holdings, holding => holding.office === "thane")).toMatchObject([
      { cellIds: [5, 4], tenure: "thanage", hereditary: false, seatName: "Ath", seatBurgId: 11, knightFees: 20 }
    ]);
    expect(
      by(holdings, holding => holding.holderKind === "kindred").map(holding => [holding.seatName, holding.cellIds])
    ).toEqual([
      ["Moray", [3]],
      ["Atholl", [6]]
    ]);
    expect(holdings.some(holding => holding.dignity === "baron" || holding.office === "sheriff")).toBe(false);
    expect(holdings.some(holding => holding.dignity === "count")).toBe(false);
  });

  it("marks only the threatened provincial lord as a frontier", () => {
    const input = lineFixture("earlyMedieval");
    input.threatenedProvinceIds = [1];
    const mormaer = allocateGaelicHoldings(input).find(holding => holding.office === "mormaer");
    expect(mormaer?.frontier).toBe(true);
  });

  it("in the high period keeps an earl's demesne, a church block, and one sheriff per province", () => {
    const holdings = allocateGaelicHoldings(lineFixture("highMedieval"));

    expect(holdings.find(holding => holding.holderKind === "crown")?.cellIds).toEqual([2]);
    expect(holdings.find(holding => holding.holderKind === "abbey")).toMatchObject({
      cellIds: [5],
      office: "abbotTemporal",
      tenure: "ecclesiastical"
    });
    expect(holdings.find(holding => holding.dignity === "count")).toMatchObject({
      cellIds: [1],
      office: "none",
      tenure: "fief",
      hereditary: true,
      seatName: "Moray"
    });
    expect(
      holdings.some(
        holding => holding.office === "mormaer" || holding.office === "thane" || holding.dignity === "baron"
      )
    ).toBe(false);
    expect(by(holdings, holding => holding.office === "sheriff").map(holding => holding.provinceIds)).toEqual([
      [1],
      [2]
    ]);
    expect(
      holdings
        .filter(holding => holding.office === "sheriff")
        .every(holding => holding.cellIds.length === 0 && holding.knightFees === 0)
    ).toBe(true);
    expect(by(holdings, holding => holding.holderKind === "kindred").map(holding => holding.cellIds)).toEqual([
      [3],
      [4],
      [6]
    ]);
  });

  it("keeps a high cell out of a town holding and lets the same cell be absorbed on a flat map", () => {
    const raised = lineFixture("highMedieval", cell =>
      cell.id === 3
        ? { ...cell, burgId: 12, burgName: "Abbey", urbanPeople: 20_000 }
        : cell.id === 5
          ? { ...cell, urbanPeople: 1_000 }
          : cell
    );
    const highland = allocateGaelicHoldings(raised);
    expect(highland.find(holding => holding.office === "thane")?.cellIds).toEqual([5]);
    expect(highland.some(holding => holding.holderKind === "kindred" && holding.cellIds.includes(6))).toBe(true);

    const flat = lineFixture("highMedieval", cell => {
      const next =
        cell.id === 3
          ? { ...cell, burgId: 12, burgName: "Abbey", urbanPeople: 20_000 }
          : cell.id === 5
            ? { ...cell, urbanPeople: 1_000 }
            : cell;
      return { ...next, height: 30 };
    });
    const absorbed = allocateGaelicHoldings(flat).find(holding => holding.dignity === "baron");
    expect(absorbed?.cellIds).toEqual([5, 4, 6]);
  });

  it("adds an earl on a province separated by sea and plants no barony there", () => {
    const cells: GaelicCellInput[] = [
      {
        id: 1,
        provinceId: 1,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 0,
        burgName: "",
        urbanPeople: 0,
        height: 30,
        neighborIds: [2]
      },
      {
        id: 2,
        provinceId: 1,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 10,
        burgName: "Dun",
        urbanPeople: 2_000,
        height: 30,
        neighborIds: [1, 3]
      },
      {
        id: 3,
        provinceId: 1,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 12,
        burgName: "Baron",
        urbanPeople: 3_000,
        height: 30,
        neighborIds: [2, 4]
      },
      {
        id: 4,
        provinceId: 1,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 13,
        burgName: "Abbey",
        urbanPeople: 8_000,
        height: 30,
        neighborIds: [3]
      },
      {
        id: 5,
        provinceId: 2,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 0,
        burgName: "",
        urbanPeople: 0,
        height: 30,
        neighborIds: [6]
      },
      {
        id: 6,
        provinceId: 2,
        areaKm2: 500,
        ruralPeople: 10_000,
        burgId: 14,
        burgName: "Port",
        urbanPeople: 4_000,
        height: 30,
        neighborIds: [5]
      }
    ];
    const holdings = allocateGaelicHoldings({
      stateId: 7,
      period: "lateMedieval",
      cells,
      provinces: [
        { id: 1, name: "Core", seatBurgId: 10, seatCellId: 2 },
        { id: 2, name: "Isle", seatBurgId: 0, seatCellId: 5 }
      ],
      capitalBurgId: 10,
      capitalCellId: 2
    });

    const earls = by(holdings, holding => holding.dignity === "count");
    expect(earls.map(holding => holding.provinceIds).sort()).toEqual([[1], [2]]);
    expect(earls.every(holding => holding.office === "none" && holding.tenure === "fief")).toBe(true);
    const baron = holdings.find(holding => holding.dignity === "baron");
    expect(baron?.cellIds).toEqual([3]);
    expect(
      holdings.some(
        holding => (holding.dignity === "baron" || holding.office === "thane") && holding.provinceIds.includes(2)
      )
    ).toBe(false);
    expect(
      holdings.find(holding => holding.holderKind === "kindred" && holding.provinceIds.includes(2))?.cellIds
    ).toEqual([6]);
  });

  it("still allows a barony when the only province is the capital's own island", () => {
    const cells: GaelicCellInput[] = [1, 2, 3, 4].map(id => ({
      id,
      provinceId: 1,
      areaKm2: 500,
      ruralPeople: id === 3 ? 20_000 : 5_000,
      burgId: id === 1 ? 10 : id === 3 ? 12 : id === 4 ? 13 : 0,
      burgName: id === 1 ? "Dun" : id === 3 ? "Baron" : id === 4 ? "Abbey" : "",
      urbanPeople: id === 1 ? 1_000 : id === 3 ? 3_000 : id === 4 ? 8_000 : 0,
      height: 30,
      neighborIds: [id - 1, id + 1].filter(next => next >= 1 && next <= 4)
    }));
    const holdings = allocateGaelicHoldings({
      stateId: 4,
      period: "lateMedieval",
      cells,
      provinces: [{ id: 1, name: "Core", seatBurgId: 10, seatCellId: 1 }],
      capitalBurgId: 10,
      capitalCellId: 1
    });

    expect(by(holdings, holding => holding.dignity === "count")).toHaveLength(1);
    expect(holdings.find(holding => holding.dignity === "baron")?.cellIds).toEqual([3]);
  });

  it("splits sheriffs in a province larger than 8000 km² and does not grow a zero-area thanage", () => {
    const wide = allocateGaelicHoldings({
      stateId: 1,
      period: "highMedieval",
      cells: [
        {
          id: 1,
          provinceId: 1,
          areaKm2: 9_000,
          ruralPeople: 10_000,
          burgId: 1,
          burgName: "Dun",
          urbanPeople: 1_000,
          height: 30,
          neighborIds: []
        }
      ],
      provinces: [{ id: 1, name: "Moray", seatBurgId: 1, seatCellId: 1 }],
      capitalBurgId: 1,
      capitalCellId: 1
    });
    const sheriffs = by(wide, holding => holding.office === "sheriff");
    expect(sheriffs).toHaveLength(2);
    expect(
      sheriffs.every(
        holding => holding.provinceIds.join() === "1" && holding.seatName === "Moray" && holding.cellIds.length === 0
      )
    ).toBe(true);

    const thin = allocateGaelicHoldings({
      stateId: 1,
      period: "earlyMedieval",
      cells: [
        {
          id: 1,
          provinceId: 1,
          areaKm2: 0,
          ruralPeople: 20_000,
          burgId: 2,
          burgName: "Ath",
          urbanPeople: 1_000,
          height: 30,
          neighborIds: [2]
        },
        {
          id: 2,
          provinceId: 1,
          areaKm2: 500,
          ruralPeople: 0,
          burgId: 0,
          burgName: "",
          urbanPeople: 0,
          height: 30,
          neighborIds: [1, 3]
        },
        {
          id: 3,
          provinceId: 1,
          areaKm2: 500,
          ruralPeople: 0,
          burgId: 0,
          burgName: "",
          urbanPeople: 0,
          height: 30,
          neighborIds: [2]
        }
      ],
      provinces: [{ id: 1, name: "Atholl", seatBurgId: 0, seatCellId: 3 }],
      capitalBurgId: 0
    });
    expect(thin.find(holding => holding.office === "thane")?.cellIds).toEqual([1]);
  });
});

describe("reconcileGaelicHoldings", () => {
  it("keeps ids when a cell is lost and drops it from the holding", () => {
    const before = allocateGaelicHoldings(lineFixture("highMedieval")).map((h, i) => ({ ...h, id: i + 1 }));
    const input = lineFixture("highMedieval");
    input.cells = input.cells
      .filter(cell => cell.id !== 6)
      .map(cell => ({
        ...cell,
        neighborIds: cell.neighborIds.filter(id => id !== 6)
      }));
    const { holdings, retiredIds } = reconcileGaelicHoldings(input, before, 100);
    expect(holdings.flatMap(h => h.cellIds)).not.toContain(6);
    const survivors = new Set(holdings.map(h => h.id));
    for (const old of before) expect(survivors.has(old.id) || retiredIds.includes(old.id)).toBe(true);
  });

  it("attaches a new cell to its neighbouring holding", () => {
    const input = lineFixture("highMedieval");
    const full = allocateGaelicHoldings(input).map((h, i) => ({ ...h, id: i + 1 }));
    const owner = full.find(h => h.cellIds.includes(6));
    const trimmed = full.map(h => ({ ...h, cellIds: h.cellIds.filter(id => id !== 6) }));
    const { holdings } = reconcileGaelicHoldings(input, trimmed, 100);
    expect(holdings.find(h => h.cellIds.includes(6))?.id).toBeDefined();
    expect(holdings.filter(h => h.cellIds.includes(6))).toHaveLength(1);
    expect(owner).toBeDefined();
  });

  it("opens kin-land for a cell with no owned neighbour and retires an emptied holding", () => {
    const input = lineFixture("earlyMedieval");
    const base = allocateGaelicHoldings(input).map((h, i) => ({ ...h, id: i + 1 }));
    const only = base.filter(h => h.cellIds.includes(1));
    const { holdings } = reconcileGaelicHoldings(input, only, 100);
    const covered = new Set(holdings.flatMap(h => h.cellIds));
    for (const cell of input.cells) expect(covered.has(cell.id)).toBe(true);
    const ids = holdings.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
