import { describe, expect, it } from "vitest";
import { GOODS_DATA } from "../extensions/economy/generators/goods-generator";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

describe("default economy good names", () => {
  const defaultGoodNames = GOODS_DATA.map(good => good.name).sort();

  it("has English and Japanese translations for every default good", () => {
    expect(Object.keys(en.economy.goods.names).sort()).toEqual(defaultGoodNames);
    expect(Object.keys(ja.economy.goods.names).sort()).toEqual(defaultGoodNames);
  });
});
