import { describe, expect, it } from "vitest";
import { raceCivicStance } from "../../data/raceCivicStance";
import { createDefaultRaces, RACE_DEFINITIONS, raceIdByKey } from "../../data/races";
import raceRelations from "./data/raceRelations.generated.json";
import { resolveChildRaceId, resolveChildRaceKey } from "./hybridChild";
import {
  BOUND_SERVITOR_BY_HOST,
  isBoundServitorRaceKey,
  resolveRaceIdWithBoundServitor,
  roleUsesBoundServitor
} from "./raceBoundServitors";

describe("Vampire, Dhampir, and Lesser Vampire mechanics", () => {
  const races = createDefaultRaces();
  const human = races.find(r => r.key === "human")!;
  const vampire = races.find(r => r.key === "vampire")!;
  const dhampir = races.find(r => r.key === "dhampir")!;
  const lesserVampire = races.find(r => r.key === "lesser_vampire")!;

  it("defines Vampire as immortal with human-like looks, high arcane, and high intrigue/prowess", () => {
    expect(vampire).toBeDefined();
    expect(vampire.lifespan).toBe(9999);
    expect(vampire.characterAppearance?.kind).toBeUndefined(); // looks human

    const vampireDef = RACE_DEFINITIONS.find(r => r.key === "vampire")!;
    expect(vampireDef.civicStance).toBe("distant");
    expect(vampireDef.supernatural.arcaneCap).toBe(95);
    expect(vampireDef.supernatural.durability).toBe(2.5);

    // Human baseline looks
    expect(vampire.looksBaseline?.stature).toBe(50);
    expect(vampire.looksBaseline?.build).toBe(50);
    expect(vampire.looksBaseline?.refinement).toBe(55);
  });

  it("ensures Human and Vampire / Dhampir have 1.0 aesthetic readability (indistinguishable from humans)", () => {
    const humanVampire = raceRelations.find(r => r.observerKey === "human" && r.targetKey === "vampire");
    const vampireHuman = raceRelations.find(r => r.observerKey === "vampire" && r.targetKey === "human");
    const humanDhampir = raceRelations.find(r => r.observerKey === "human" && r.targetKey === "dhampir");
    const dhampirHuman = raceRelations.find(r => r.observerKey === "dhampir" && r.targetKey === "human");

    expect(humanVampire?.readability).toBe(1);
    expect(vampireHuman?.readability).toBe(1);
    expect(humanDhampir?.readability).toBe(1);
    expect(dhampirHuman?.readability).toBe(1);
  });

  it("resolves Dhampir as child of Human and Vampire", () => {
    expect(resolveChildRaceKey("human", "vampire")).toBe("dhampir");
    expect(resolveChildRaceKey("vampire", "human")).toBe("dhampir");

    const humanId = raceIdByKey(races, "human");
    const vampireId = raceIdByKey(races, "vampire");
    const dhampirId = raceIdByKey(races, "dhampir");
    expect(resolveChildRaceId(humanId, vampireId, races)).toBe(dhampirId);

    // Dhampir derives hybrid lifespan: min of human (75) and vampire (9999) = 75 standard, max = 9999
    expect(dhampir.lifespan).toBe(human.lifespan);
    expect(dhampir.maxLifespan).toBe(vampire.maxLifespan);
    expect(dhampir.fertility?.litterMax).toBeGreaterThanOrEqual(1); // fertile
  });

  it("binds Lesser Vampire as sterile thrall under Vampire host realm", () => {
    expect(raceCivicStance("lesser_vampire")).toBe("bound");
    expect(isBoundServitorRaceKey("lesser_vampire")).toBe(true);
    expect(BOUND_SERVITOR_BY_HOST.vampire?.raceKey).toBe("lesser_vampire");

    // Lesser Vampire is sterile (cannot reproduce naturally)
    expect(lesserVampire.fertility?.litterMean).toBe(0);
    expect(lesserVampire.fertility?.litterMax).toBe(0);

    const vampireId = raceIdByKey(races, "vampire");
    const lesserVampireId = raceIdByKey(races, "lesser_vampire");
    const humanId = raceIdByKey(races, "human");

    // Ruler stays Vampire
    expect(resolveRaceIdWithBoundServitor(vampireId, "ruler", races, () => true)).toBe(vampireId);
    expect(roleUsesBoundServitor("ruler", "vampire")).toBe(false);

    // Commander uses Lesser Vampire on majority roll (~70%)
    expect(resolveRaceIdWithBoundServitor(vampireId, "commander", races, () => true)).toBe(lesserVampireId);
    expect(resolveRaceIdWithBoundServitor(vampireId, "commander", races, () => false)).toBe(vampireId);

    // Civilians use Lesser Vampire (~60%) or Human (~40%)
    expect(resolveRaceIdWithBoundServitor(vampireId, "ordinary", races, () => true)).toBe(lesserVampireId);
    expect(resolveRaceIdWithBoundServitor(vampireId, "ordinary", races, () => false)).toBe(humanId);
  });
});
