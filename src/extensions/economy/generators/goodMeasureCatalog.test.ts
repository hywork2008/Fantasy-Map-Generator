import { describe, expect, it } from "vitest";
import { FLEECES_PER_WOOL_MARKET_LOT, GOOD_MEASURES, SALT_KILOGRAMS_PER_BAG } from "./goodMeasureCatalog";
import { GOODS_DATA } from "./goods-generator";
import { SALT_KILOGRAMS_PER_BAG as SALT_BAG } from "./saltLogistics";
import { FLEECES_PER_WOOL_MARKET_LOT as WOOL_LOT } from "./woolProduction";

describe("good measure catalogue", () => {
  it("measures every shipped good in the unit the catalogue names", () => {
    const unmeasured = GOODS_DATA.filter(good => GOOD_MEASURES[good.name]?.unit !== good.unit).map(
      good => `${good.name} (${good.unit})`
    );
    expect(unmeasured).toEqual([]);
  });

  it("keeps the contracts it copies in step with the modules that own them", () => {
    expect(SALT_KILOGRAMS_PER_BAG).toBe(SALT_BAG);
    expect(FLEECES_PER_WOOL_MARKET_LOT).toBe(WOOL_LOT);
  });
});
