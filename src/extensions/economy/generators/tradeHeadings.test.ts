import { describe, expect, it } from "vitest";
import { GOODS_DATA } from "./goods-generator";
import { CATALOG_TRADE_HEADINGS, tradeHeadingOf } from "./tradeHeadings";

const ALCOHOL = ["Wine", "Beer", "Cider", "Perry", "Pomace Wine", "Liquor"] as const;

describe("trade headings", () => {
  it("classifies every catalogue good once", () => {
    const names = GOODS_DATA.map(good => good.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(CATALOG_TRADE_HEADINGS).sort()).toEqual([...names].sort());
  });

  it("counts alcoholic drinks as beverages and leaves the other victuals in food", () => {
    for (const name of ALCOHOL) {
      const good = GOODS_DATA.find(entry => entry.name === name);
      expect(tradeHeadingOf({ name, tags: good?.tags ?? [], tradeHeading: "food" })).toBe("Beverages");
    }
    for (const name of ["Vinegar", "Pomace", "Milk", "Tea", "Coffee", "Cocoa", "Spices", "Meat"]) {
      expect(tradeHeadingOf({ name, tags: ["food"] })).toBe("Food");
    }
    expect(tradeHeadingOf({ name: "Tobacco", tags: ["luxury"] })).toBe("Tobacco");
    expect(tradeHeadingOf({ name: "Slaves", tags: ["supply"] })).toBe("People");
    expect(tradeHeadingOf({ name: "Cattle", tags: ["food", "liveAnimal"] })).toBe("Live animals");
    expect(tradeHeadingOf({ name: "Sheep", tags: ["food", "clothing", "liveAnimal"] })).toBe("Live animals");
    expect(tradeHeadingOf({ name: "Salt", tags: ["preservative", "mineral"] })).toBe("Crude materials");
  });

  it("does not split an unlisted drink that is still tagged as food", () => {
    expect(tradeHeadingOf({ name: "Mead", tags: ["food", "luxury", "beverage"] })).toBe("Beverages");
    expect(tradeHeadingOf({ name: "Oddment", tags: [] })).toBe("Other");
  });
});
