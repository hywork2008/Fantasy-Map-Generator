import { describe, expect, it } from "vitest";
import {
  BOUND_SERVITOR_BY_HOST,
  isBoundServitorRaceKey,
  resolveRaceIdWithBoundServitor,
  roleUsesBoundServitor
} from "./raceBoundServitors";
import { canAppearInMixedCourt, raceCivicStance } from "./raceCivicStance";
import { createDefaultRaces, raceIdByKey } from "./races";

describe("raceBoundServitors", () => {
  it("maps draconic host to wyrmkin", () => {
    expect(BOUND_SERVITOR_BY_HOST.draconic).toBe("wyrmkin");
    expect(isBoundServitorRaceKey("wyrmkin")).toBe(true);
    expect(isBoundServitorRaceKey("draconic")).toBe(false);
  });

  it("uses servitors only for merchant and ordinary roles", () => {
    expect(roleUsesBoundServitor("merchant")).toBe(true);
    expect(roleUsesBoundServitor("ordinary")).toBe(true);
    expect(roleUsesBoundServitor("ruler")).toBe(false);
    expect(roleUsesBoundServitor("commander")).toBe(false);
    expect(roleUsesBoundServitor("central_officer")).toBe(false);
  });

  it("resolves merchant under draconic to wyrmkin id", () => {
    const races = createDefaultRaces();
    const draconic = raceIdByKey(races, "draconic");
    const wyrmkin = raceIdByKey(races, "wyrmkin");
    expect(resolveRaceIdWithBoundServitor(draconic, "merchant", races)).toBe(wyrmkin);
    expect(resolveRaceIdWithBoundServitor(draconic, "ordinary", races)).toBe(wyrmkin);
    expect(resolveRaceIdWithBoundServitor(draconic, "ruler", races)).toBe(draconic);
  });

  it("leaves non-host races unchanged", () => {
    const races = createDefaultRaces();
    const human = raceIdByKey(races, "human");
    expect(resolveRaceIdWithBoundServitor(human, "merchant", races)).toBe(human);
  });

  it("classifies wyrmkin as bound and bars mixed courts", () => {
    expect(raceCivicStance("wyrmkin")).toBe("bound");
    expect(canAppearInMixedCourt("wyrmkin")).toBe(false);
  });
});
