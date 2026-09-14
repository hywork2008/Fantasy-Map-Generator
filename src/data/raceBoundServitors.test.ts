import { describe, expect, it } from "vitest";
import {
  BOUND_SERVITOR_BY_HOST,
  HALF_ELF_SERVITOR_CHANCE,
  isBoundServitorRaceKey,
  resolveRaceIdWithBoundServitor,
  roleUsesBoundServitor
} from "../extensions/characters/raceBoundServitors";
import { canAppearInMixedCourt, raceCivicStance } from "./raceCivicStance";
import { createDefaultRaces, raceIdByKey } from "./races";

describe("raceBoundServitors", () => {
  it("maps draconic host to wyrmkin", () => {
    expect(BOUND_SERVITOR_BY_HOST.draconic?.raceKey).toBe("wyrmkin");
    expect(isBoundServitorRaceKey("wyrmkin")).toBe(true);
    expect(isBoundServitorRaceKey("draconic")).toBe(false);
  });

  it("maps elf host to half_elf at the Human blue-blood rate", () => {
    expect(BOUND_SERVITOR_BY_HOST.elf?.raceKey).toBe("half_elf");
    expect(BOUND_SERVITOR_BY_HOST.elf?.roles).toEqual(["ordinary", "merchant", "religious", "central_officer"]);
    expect(HALF_ELF_SERVITOR_CHANCE).toBe(0.006);
    expect(BOUND_SERVITOR_BY_HOST.elf?.chance).toBe(HALF_ELF_SERVITOR_CHANCE);
    expect(isBoundServitorRaceKey("half_elf")).toBe(true);
    expect(isBoundServitorRaceKey("elf")).toBe(false);
  });

  it("uses servitors only for merchant and ordinary roles by default, and adds commander under demon", () => {
    expect(roleUsesBoundServitor("merchant")).toBe(true);
    expect(roleUsesBoundServitor("ordinary")).toBe(true);
    expect(roleUsesBoundServitor("ruler")).toBe(false);
    expect(roleUsesBoundServitor("commander")).toBe(false);
    expect(roleUsesBoundServitor("commander", "demon")).toBe(true);
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

  it("resolves elf ordinary to half_elf only on a successful rare roll", () => {
    const races = createDefaultRaces();
    const elf = raceIdByKey(races, "elf");
    const halfElf = raceIdByKey(races, "half_elf");
    expect(resolveRaceIdWithBoundServitor(elf, "ordinary", races, () => true)).toBe(halfElf);
    expect(resolveRaceIdWithBoundServitor(elf, "ordinary", races, () => false)).toBe(elf);
    expect(resolveRaceIdWithBoundServitor(elf, "merchant", races, () => true)).toBe(halfElf);
    expect(resolveRaceIdWithBoundServitor(elf, "central_officer", races, () => true)).toBe(halfElf);
    expect(resolveRaceIdWithBoundServitor(elf, "ruler", races, () => true)).toBe(elf);
    expect(resolveRaceIdWithBoundServitor(elf, "commander", races, () => true)).toBe(elf);
  });

  it("leaves non-host races unchanged", () => {
    const races = createDefaultRaces();
    const human = raceIdByKey(races, "human");
    expect(resolveRaceIdWithBoundServitor(human, "merchant", races)).toBe(human);
    expect(resolveRaceIdWithBoundServitor(human, "ordinary", races, () => true)).toBe(human);
  });

  it("maps demon host to fallen_angel", () => {
    expect(BOUND_SERVITOR_BY_HOST.demon?.raceKey).toBe("fallen_angel");
    expect(isBoundServitorRaceKey("fallen_angel")).toBe(true);
    expect(isBoundServitorRaceKey("demon")).toBe(false);
    expect(raceCivicStance("fallen_angel")).toBe("bound");
    expect(canAppearInMixedCourt("fallen_angel")).toBe(false);
  });

  it("resolves demon commander to fallen_angel on majority roll and demon on rare roll", () => {
    const races = createDefaultRaces();
    const demon = raceIdByKey(races, "demon");
    const fallenAngel = raceIdByKey(races, "fallen_angel");
    // Majority roll succeeds -> Fallen Angel commander
    expect(resolveRaceIdWithBoundServitor(demon, "commander", races, () => true)).toBe(fallenAngel);
    // Occasional roll fails -> Demon commander
    expect(resolveRaceIdWithBoundServitor(demon, "commander", races, () => false)).toBe(demon);
  });

  it("resolves demon merchant and ordinary to human majority, rare fallen_angel, and extremely rare demon", () => {
    const races = createDefaultRaces();
    const demon = raceIdByKey(races, "demon");
    const fallenAngel = raceIdByKey(races, "fallen_angel");
    const human = raceIdByKey(races, "human");

    // Case 1: Extremely rare demon roll succeeds (first roll true)
    expect(resolveRaceIdWithBoundServitor(demon, "merchant", races, () => true)).toBe(demon);
    expect(resolveRaceIdWithBoundServitor(demon, "ordinary", races, () => true)).toBe(demon);

    // Case 2: Demon roll fails, fallen_angel roll succeeds (1st false, 2nd true)
    let callCount = 0;
    const fallenAngelRoll = () => ++callCount === 2;
    expect(resolveRaceIdWithBoundServitor(demon, "merchant", races, fallenAngelRoll)).toBe(fallenAngel);

    callCount = 0;
    expect(resolveRaceIdWithBoundServitor(demon, "ordinary", races, fallenAngelRoll)).toBe(fallenAngel);

    // Case 3: Both demon and fallen_angel rolls fail -> Human majority
    expect(resolveRaceIdWithBoundServitor(demon, "merchant", races, () => false)).toBe(human);
    expect(resolveRaceIdWithBoundServitor(demon, "ordinary", races, () => false)).toBe(human);
  });

  it("keeps demon rulers and province lords as demon", () => {
    const races = createDefaultRaces();
    const demon = raceIdByKey(races, "demon");
    expect(resolveRaceIdWithBoundServitor(demon, "ruler", races, () => true)).toBe(demon);
    expect(resolveRaceIdWithBoundServitor(demon, "province_lord", races, () => true)).toBe(demon);
  });

  it("strictly restricts Lich to rulers and delegates all other roles to undead servitors", () => {
    const races = createDefaultRaces();
    const lich = raceIdByKey(races, "lich");
    const zombie = raceIdByKey(races, "zombie");
    const skeleton = raceIdByKey(races, "skeleton");

    // Only ruler stays Lich
    expect(resolveRaceIdWithBoundServitor(lich, "ruler", races, () => true)).toBe(lich);
    expect(roleUsesBoundServitor("ruler", "lich")).toBe(false);

    // Province lords, commanders, merchants, ordinary, officers become Zombie or Skeleton
    expect(resolveRaceIdWithBoundServitor(lich, "province_lord", races, () => true)).toBe(zombie);
    expect(resolveRaceIdWithBoundServitor(lich, "province_lord", races, () => false)).toBe(skeleton);
    expect(resolveRaceIdWithBoundServitor(lich, "commander", races, () => true)).toBe(zombie);
    expect(resolveRaceIdWithBoundServitor(lich, "commander", races, () => false)).toBe(skeleton);
    expect(resolveRaceIdWithBoundServitor(lich, "merchant", races, () => true)).toBe(zombie);
    expect(resolveRaceIdWithBoundServitor(lich, "merchant", races, () => false)).toBe(skeleton);
    expect(resolveRaceIdWithBoundServitor(lich, "ordinary", races, () => true)).toBe(zombie);
    expect(resolveRaceIdWithBoundServitor(lich, "central_officer", races, () => true)).toBe(zombie);

    expect(roleUsesBoundServitor("province_lord", "lich")).toBe(true);
    expect(roleUsesBoundServitor("commander", "lich")).toBe(true);
    expect(roleUsesBoundServitor("merchant", "lich")).toBe(true);
    expect(roleUsesBoundServitor("ordinary", "lich")).toBe(true);
  });

  it("classifies wyrmkin, half_elf, and lesser_vampire as bound and bars mixed courts", () => {
    expect(raceCivicStance("wyrmkin")).toBe("bound");
    expect(raceCivicStance("half_elf")).toBe("bound");
    expect(raceCivicStance("lesser_vampire")).toBe("bound");
    expect(canAppearInMixedCourt("wyrmkin")).toBe(false);
    expect(canAppearInMixedCourt("half_elf")).toBe(false);
    expect(canAppearInMixedCourt("lesser_vampire")).toBe(false);
  });

  it("handles Vampire realm roles with Lesser Vampire and living human servitors", () => {
    const races = createDefaultRaces();
    const vampire = raceIdByKey(races, "vampire");
    const lesserVampire = raceIdByKey(races, "lesser_vampire");
    const human = raceIdByKey(races, "human");

    expect(BOUND_SERVITOR_BY_HOST.vampire?.raceKey).toBe("lesser_vampire");
    expect(isBoundServitorRaceKey("lesser_vampire")).toBe(true);

    // Ruler and province lord stay pure Vampire
    expect(resolveRaceIdWithBoundServitor(vampire, "ruler", races, () => true)).toBe(vampire);
    expect(resolveRaceIdWithBoundServitor(vampire, "province_lord", races, () => true)).toBe(vampire);
    expect(roleUsesBoundServitor("ruler", "vampire")).toBe(false);

    // Commander is majority Lesser Vampire (~70%), balance Vampire (~30%)
    expect(resolveRaceIdWithBoundServitor(vampire, "commander", races, () => true)).toBe(lesserVampire);
    expect(resolveRaceIdWithBoundServitor(vampire, "commander", races, () => false)).toBe(vampire);
    expect(roleUsesBoundServitor("commander", "vampire")).toBe(true);

    // Merchants and ordinary civilians are majority Lesser Vampire (~60%), balance living humans (~40%)
    expect(resolveRaceIdWithBoundServitor(vampire, "merchant", races, () => true)).toBe(lesserVampire);
    expect(resolveRaceIdWithBoundServitor(vampire, "merchant", races, () => false)).toBe(human);
    expect(resolveRaceIdWithBoundServitor(vampire, "ordinary", races, () => true)).toBe(lesserVampire);
    expect(resolveRaceIdWithBoundServitor(vampire, "ordinary", races, () => false)).toBe(human);
    expect(roleUsesBoundServitor("merchant", "vampire")).toBe(true);
    expect(roleUsesBoundServitor("ordinary", "vampire")).toBe(true);
  });
});
