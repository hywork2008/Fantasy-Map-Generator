import { describe, expect, it } from "vitest";
import {
  DEFAULT_INITIAL_POLITY_REALM_SIZE,
  isCapitalOnlyPolityRealm,
  MAX_INITIAL_POLITY_REALM_SIZE,
  MIN_INITIAL_POLITY_REALM_SIZE,
  normalizeInitialPolityRealmSize
} from "./initialPolityScope";

describe("normalizeInitialPolityRealmSize", () => {
  it("maps the former dropdown values onto the cell slider", () => {
    expect(normalizeInitialPolityRealmSize("capital")).toBe(MIN_INITIAL_POLITY_REALM_SIZE);
    expect(normalizeInitialPolityRealmSize("hinterland")).toBe(MAX_INITIAL_POLITY_REALM_SIZE);
  });

  it("clamps numeric input to 1–30", () => {
    expect(normalizeInitialPolityRealmSize(1)).toBe(1);
    expect(normalizeInitialPolityRealmSize(12)).toBe(12);
    expect(normalizeInitialPolityRealmSize(99)).toBe(30);
    expect(normalizeInitialPolityRealmSize(0)).toBe(1);
  });

  it("falls back to the largest start for missing or invalid input", () => {
    expect(normalizeInitialPolityRealmSize(undefined)).toBe(DEFAULT_INITIAL_POLITY_REALM_SIZE);
    expect(normalizeInitialPolityRealmSize("unknown")).toBe(30);
  });
});

describe("isCapitalOnlyPolityRealm", () => {
  it("is true only for a one-cell start", () => {
    expect(isCapitalOnlyPolityRealm(1)).toBe(true);
    expect(isCapitalOnlyPolityRealm(2)).toBe(false);
    expect(isCapitalOnlyPolityRealm(undefined)).toBe(false);
  });
});
