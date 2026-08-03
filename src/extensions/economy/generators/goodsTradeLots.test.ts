import { describe, expect, it } from "vitest";
import { floorToRetailLot, formatRetailQuantity, getRetailLotSize, isRetailLotQuantity } from "./goodsTradeLots";

describe("retail trade lots", () => {
  it("does not advertise a fractional animal as an available whole animal", () => {
    const lotSize = getRetailLotSize({ unit: "head" });

    expect(lotSize).toBe(1);
    expect(floorToRetailLot(3.999, lotSize)).toBe(3);
    expect(formatRetailQuantity(3.999, lotSize)).toBe("3");
    expect(isRetailLotQuantity(0.5, lotSize)).toBe(false);
    expect(isRetailLotQuantity(3, lotSize)).toBe(true);
  });

  it("keeps bulk goods tradeable in hundredths without rounding their shelves up", () => {
    const lotSize = getRetailLotSize({ unit: "bale" });

    expect(lotSize).toBe(0.01);
    expect(floorToRetailLot(2.009, lotSize)).toBe(2);
    expect(formatRetailQuantity(2.009, lotSize)).toBe("2.00");
    expect(isRetailLotQuantity(1.23, lotSize)).toBe(true);
    expect(isRetailLotQuantity(1.231, lotSize)).toBe(false);
  });
});
