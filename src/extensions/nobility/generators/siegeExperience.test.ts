import { afterEach, describe, expect, it, vi } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { emptySpecializations } from "../../characters/specializations";
import type { MilitaryRegiment, PackedGraph } from "../../hostTypes";

const { getWorld, random } = vi.hoisted(() => ({ getWorld: vi.fn(), random: vi.fn() }));
vi.mock("../nobilityContext", () => ({
  getWorldContext: getWorld,
  getApi: () => ({ simulationContext: { currentYear: 1000, currentMonth: 6, currentDay: 1 } }),
  getRulerId: () => undefined
}));
vi.mock("../../hostCore", () => ({
  appServices: { rng: { rand: random } },
  buildSeaRouteGraph: () => ({}),
  applyDemographicCasualties: vi.fn()
}));
vi.mock("./localDefense", () => ({
  calculateEffectiveSiegePower: (regiment: MilitaryRegiment) => regiment.a,
  captureBurg: vi.fn(),
  commanderPowerMultiplier: () => 1,
  occupyingDisciplineMultiplier: () => 1,
  isBurgFortified: () => false,
  fortificationAttackRatio: () => 1.5,
  regimentDistanceTo: (regiment: MilitaryRegiment) => regiment.x,
  regimentReinforcementRadius: () => 50
}));
vi.mock("./officerAssignment", () => ({
  getRegimentCommander: (characters: Character[], regiment: MilitaryRegiment) =>
    characters.find(character => character.i === regiment.commanderId)
}));

import { BattleResolutionGenerator } from "./battle-resolution";

afterEach(() => vi.restoreAllMocks());
describe("siege participation experience", () => {
  it("records actual arrivals and pre-casualty troop composition, excluding stale battled status", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    random.mockReturnValueOnce(0.9).mockReturnValueOnce(0.1).mockReturnValue(0.5);
    const commanders = [1, 2, 3].map(i => ({ i, titles: [], specializations: emptySpecializations() }) as Character);
    const attacker = {
      i: 1,
      state: 1,
      a: 2000,
      x: 0,
      y: 0,
      u: { infantry: 2000, archers: 0 },
      commanderId: 1
    } as unknown as MilitaryRegiment;
    const arrived = {
      i: 2,
      state: 2,
      a: 100,
      x: 0,
      y: 0,
      u: { infantry: 100 },
      commanderId: 2
    } as unknown as MilitaryRegiment;
    const absent = {
      i: 3,
      state: 2,
      a: 100,
      x: 1000,
      y: 0,
      u: { cavalry: 100 },
      commanderId: 3,
      actionStatus: "battled"
    } as unknown as MilitaryRegiment;
    const pack = {
      states: [
        { i: 0, diplomacy: [] },
        { i: 1, name: "A", military: [attacker] },
        { i: 2, name: "B", military: [arrived, absent] }
      ],
      burgs: [null, { i: 1, state: 2, name: "Burg", x: 0, y: 0, cell: 1, population: 100 }],
      characters: commanders
    } as unknown as PackedGraph;
    getWorld.mockReturnValue({ pack, options: { year: 1000, military: [] } });
    BattleResolutionGenerator.resolveSiege(
      { targetState: 2, targetBurg: 1 } as Parameters<typeof BattleResolutionGenerator.resolveSiege>[0],
      1
    );
    expect(commanders[0].specializations!.experience).toHaveLength(1);
    expect(commanders[1].specializations!.experience).toHaveLength(1);
    expect(commanders[2].specializations!.experience).toHaveLength(0);
    expect(commanders[0].specializations!.experience[0].targets).toContainEqual({ kind: "commandScale", id: "army" });
    expect(commanders[0].specializations!.experience[0].targets).not.toContainEqual({ kind: "troop", id: "archers" });
  });
});
