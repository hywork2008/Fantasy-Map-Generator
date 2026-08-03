import { describe, expect, it } from "vitest";
import { type CharacterMarketRow, filterCharacterMarketRows } from "./characterMarket";

const rows: CharacterMarketRow[] = [
  {
    goodId: 1,
    goodName: "Cloth",
    goodIcon: "good-cloth",
    tags: ["utilities"],
    unit: "bale",
    retailLotSize: 0.01,
    merchantId: 4,
    merchantName: "Weaver",
    retailStock: 3,
    buyPrice: 4,
    sellPrice: 3,
    playerUnits: 0
  },
  {
    goodId: 2,
    goodName: "Horse",
    goodIcon: "good-horse",
    tags: ["military", "luxury"],
    unit: "head",
    retailLotSize: 1,
    merchantId: 5,
    merchantName: "Drover",
    retailStock: 0,
    buyPrice: 20,
    sellPrice: 15,
    playerUnits: 1
  },
  {
    goodId: 3,
    goodName: "Amber",
    goodIcon: "good-amber",
    tags: ["luxury"],
    unit: "piece",
    retailLotSize: 1,
    merchantId: null,
    merchantName: "Unassigned",
    retailStock: 2,
    buyPrice: 8,
    sellPrice: 6,
    playerUnits: 0
  }
];

describe("Character Market filters", () => {
  it("intersects tag, merchant, and in-stock filters", () => {
    expect(
      filterCharacterMarketRows(rows, { tag: "luxury", merchant: null, inStockOnly: true }).map(row => row.goodName)
    ).toEqual(["Amber"]);
    expect(
      filterCharacterMarketRows(rows, { tag: null, merchant: 4, inStockOnly: true }).map(row => row.goodName)
    ).toEqual(["Cloth"]);
  });

  it("can show goods without an assigned merchant", () => {
    expect(
      filterCharacterMarketRows(rows, { tag: null, merchant: "unassigned", inStockOnly: false }).map(
        row => row.goodName
      )
    ).toEqual(["Amber"]);
  });
});
