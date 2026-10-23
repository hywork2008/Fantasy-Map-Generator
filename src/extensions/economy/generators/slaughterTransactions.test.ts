import { describe, expect, it } from "vitest";
import { type CarcassProfile, commitSlaughter, type SlaughterTransactionState } from "./slaughterTransactions";

// Synthetic balance fixture, not historical calibration or a production default.
const profile: CarcassProfile = {
  id: "test-only",
  version: 1,
  species: "Cattle",
  calibration: "verified",
  carcassKgPerHead: 100,
  leanKgPerHead: 60,
  edibleFatKgPerHead: 10,
  otherCarcassKgPerHead: 30
};
const request = { id: "batch-1", lotId: "lot-1", ownerId: "farm-1", locationId: "yard-1", period: 15601, heads: 1 };
const createState = (): SlaughterTransactionState => ({
  lots: {
    "lot-1": {
      id: "lot-1",
      shipmentId: "shipment-1",
      species: "Cattle",
      ownerId: "farm-1",
      locationId: "yard-1",
      heads: 2,
      cohortProvenance: "aggregate"
    }
  },
  receipts: {},
  portions: {}
});

describe("atomic carcass transactions", () => {
  it("preserves ownership and disjoint mass, and cannot duplicate after archive serialization", () => {
    let state = createState();
    const receipt = commitSlaughter(state, request, profile);
    expect(state.lots["lot-1"].heads).toBe(1);
    expect(Object.values(state.portions).reduce((sum, row) => sum + row.remainingKg, 0)).toBe(100);
    expect(Object.values(state.portions).every(row => row.ownerId === "farm-1")).toBe(true);
    // Later use of a portion must survive a repeated commit.
    state.portions["batch-1:edibleFat"].remainingKg = 4;
    state = JSON.parse(JSON.stringify(state));
    const before = structuredClone(state);
    expect(commitSlaughter(state, request, profile)).toEqual(receipt);
    expect(state).toEqual(before);
    receipt.portionsKg.lean = 999;
    expect(state.receipts[request.id].portionsKg.lean).toBe(60);
  });

  it.each([{ ownerId: "other-farm" }, { heads: 0.25 }, { heads: 3 }, { locationId: "other-yard" }])(
    "rejects invalid ownership, location and head allocation atomically: %j",
    change => {
      const state = createState();
      const before = structuredClone(state);
      expect(() => commitSlaughter(state, { ...request, ...change }, profile)).toThrow();
      expect(state).toEqual(before);
    }
  );

  it("rejects unknown yield, unbalanced mass and missing owner without consuming livestock", () => {
    const state = createState();
    const before = structuredClone(state);
    expect(() => commitSlaughter(state, request, { ...profile, calibration: "unknown" })).toThrow();
    expect(() => commitSlaughter(state, request, { ...profile, edibleFatKgPerHead: 20 })).toThrow();
    expect(state).toEqual(before);
    state.lots["lot-1"].ownerId = null;
    expect(() => commitSlaughter(state, request, profile)).toThrow();
    expect(state.lots["lot-1"].heads).toBe(2);
  });

  it("rejects conflicting receipt reuse and cannot consume the same heads twice", () => {
    const state = createState();
    commitSlaughter(state, request, profile);
    const before = structuredClone(state);
    expect(() => commitSlaughter(state, { ...request, heads: 2 }, profile)).toThrow();
    expect(state).toEqual(before);
    commitSlaughter(state, { ...request, id: "batch-2" }, profile);
    expect(() => commitSlaughter(state, { ...request, id: "batch-3" }, profile)).toThrow();
    expect(state.lots["lot-1"].heads).toBe(0);
  });
});
