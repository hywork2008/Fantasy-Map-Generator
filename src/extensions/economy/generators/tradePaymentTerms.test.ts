import { describe, expect, it } from "vitest";
import { getEscrowChance, type PaymentTermsContext } from "./tradePaymentTerms";

const QUIET: PaymentTermsContext = {
  war: 0,
  robberyRisk: 0,
  inArrears: false,
  regard: 0,
  sellerBoldness: 50,
  buyerHonor: 50,
  coinFactor: 1
};

describe("trade payment terms", () => {
  it("asks for escrow more often in war, on robbed roads, in arrears and when coin is short", () => {
    const base = getEscrowChance(QUIET);
    expect(getEscrowChance({ ...QUIET, war: 1 })).toBeGreaterThan(base);
    expect(getEscrowChance({ ...QUIET, robberyRisk: 0.1 })).toBeGreaterThan(base);
    expect(getEscrowChance({ ...QUIET, inArrears: true })).toBeGreaterThan(base);
    expect(getEscrowChance({ ...QUIET, coinFactor: 0.4 })).toBeGreaterThan(base);
  });

  it("gives open account more often to a trusted, honourable buyer and from a bold seller", () => {
    const base = getEscrowChance(QUIET);
    expect(getEscrowChance({ ...QUIET, regard: 80, buyerHonor: 90, sellerBoldness: 80 })).toBeLessThan(base);
  });

  it("stays within its bounds", () => {
    const worst = { ...QUIET, war: 2.5, robberyRisk: 1, inArrears: true, regard: -100, coinFactor: 0 };
    expect(getEscrowChance(worst)).toBeLessThanOrEqual(0.95);
    expect(getEscrowChance({ ...QUIET, regard: 100, buyerHonor: 100, sellerBoldness: 100 })).toBeGreaterThanOrEqual(
      0.05
    );
  });
});
