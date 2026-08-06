import { describe, expect, it } from "vitest";
import { DEFAULT_INITIAL_SETTLEMENT_PATTERN, normalizeInitialSettlementPattern } from "./initialSettlementPattern";

describe("normalizeInitialSettlementPattern", () => {
  it("preserves every supported preset", () => {
    expect(normalizeInitialSettlementPattern("frontier")).toBe("frontier");
    expect(normalizeInitialSettlementPattern("marches")).toBe("marches");
    expect(normalizeInitialSettlementPattern("scattered")).toBe("scattered");
    expect(normalizeInitialSettlementPattern("standard")).toBe("standard");
    expect(normalizeInitialSettlementPattern("dense")).toBe("dense");
  });

  it("uses the legacy-compatible standard preset for missing or invalid input", () => {
    expect(normalizeInitialSettlementPattern(undefined)).toBe(DEFAULT_INITIAL_SETTLEMENT_PATTERN);
    expect(normalizeInitialSettlementPattern("unknown")).toBe(DEFAULT_INITIAL_SETTLEMENT_PATTERN);
  });
});
