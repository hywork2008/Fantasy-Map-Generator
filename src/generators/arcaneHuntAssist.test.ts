import { afterEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../data/races";
import { useOptionsState } from "../store/optionsState";
import { applyArcaneHuntAssist } from "./arcaneHuntAssist";

describe("applyArcaneHuntAssist", () => {
  const previous = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previous });
  });

  it("adds one army-year from a meteor caster and marks the state year spent", () => {
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    const monster = { i: 0, cell: 5, name: "Calamity", rarity: 5, power: 50, basePower: 50, type: "Calamity" };
    const caster = { i: 1, state: 1, race: 2, arcane: 90 };
    const extra = applyArcaneHuntAssist({
      stateId: 1,
      monster,
      armyYearChunk: 7,
      year: 1000,
      characters: [caster],
      races: createDefaultRaces(),
      rand: () => 0
    });
    expect(extra).toBe(7);
    expect(monster.power).toBe(43);
    expect(caster.arcaneLastHighYear).toBe(1000);
    expect(caster.arcaneReadyYear).toBe(1001);
  });

  it("does not let a calamity working finish the last point of a rarity-5", () => {
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    const monster = { i: 0, cell: 5, name: "Calamity", rarity: 5, power: 50, basePower: 50, type: "Calamity" };
    const caster = { i: 1, state: 1, race: 12, arcane: 100 };
    const extra = applyArcaneHuntAssist({
      stateId: 1,
      monster,
      armyYearChunk: 7,
      year: 1000,
      characters: [caster],
      races: createDefaultRaces(),
      rand: () => 0
    });
    expect(extra).toBe(49);
    expect(monster.power).toBe(1);
  });

  it("is a no-op on historical maps", () => {
    useOptionsState.setState({ culturesSet: "world" });
    const monster = { i: 0, cell: 5, name: "Calamity", rarity: 5, power: 50, basePower: 50, type: "Calamity" };
    const extra = applyArcaneHuntAssist({
      stateId: 1,
      monster,
      armyYearChunk: 7,
      year: 1000,
      characters: [{ i: 1, state: 1, race: 2, arcane: 90 }],
      rand: () => 0
    });
    expect(extra).toBe(0);
    expect(monster.power).toBe(50);
  });
});
