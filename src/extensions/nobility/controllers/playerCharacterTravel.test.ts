import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { clearEconomyContext, initEconomyContext } from "../../economy/economyContext";
import { CaravanMovement } from "../../economy/generators/caravanMovement";
import { TradeAnimation } from "../../economy/generators/trade-animation";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import * as hostUi from "../../hostUi";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import { usePlayerCharacterState } from "../store/playerCharacterState";
import {
  applyCharacterArrival,
  beginPlayerTravel,
  estimateTravelBetweenBurgs,
  requestTravelToBurg,
  tickPlayerTravel
} from "./playerCharacterTravel";

function makeCharacter(overrides: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 1,
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
    location: 1,
    ...overrides
  };
}

function makePack(): PackedGraph {
  return {
    cells: {
      h: [20, 20, 20],
      burg: [0, 1, 2],
      p: [
        [0, 0],
        [32, 0],
        [64, 0]
      ],
      routes: {
        0: { 1: 0 },
        1: { 0: 0, 2: 0 },
        2: { 1: 0 }
      }
    },
    burgs: [
      {},
      { i: 1, name: "Startford", cell: 0, x: 0, y: 0, removed: false },
      { i: 2, name: "Endham", cell: 2, x: 64, y: 0, removed: false }
    ],
    routes: [{ i: 0, group: "roads", points: [] }],
    characters: [makeCharacter({ i: 10, name: "Elena", location: 1 })]
  } as unknown as PackedGraph;
}

describe("playerCharacterTravel", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    initNobilityContext({ worldContext, viewContext: { renderMode: "svg" } } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = makePack();
    CaravanMovement.configure({
      landKmPerDay: 32,
      seaKmPerDay: 60,
      seaCurrentStrength: 0,
      gradeEffectStrength: 0,
      merchantRoutePreference: "preferSpeed"
    });
    TradeAnimation.clearRouteCache();
    usePlayerCharacterState.getState().clear();
    usePlayerCharacterState.getState().setPlayerCharacterId(10);
  });

  afterEach(() => {
    usePlayerCharacterState.getState().clear();
    clearNobilityContext();
    clearEconomyContext();
    vi.restoreAllMocks();
  });

  it("returns zero days for the same burg", () => {
    expect(estimateTravelBetweenBurgs(1, 1)).toEqual({
      sourceBurgId: 1,
      destinationBurgId: 1,
      durationDays: 0,
      destinationName: "Startford"
    });
  });

  it("estimates caravan travel days along the trade route path", () => {
    // 64 map-units at distanceScale 1 and 32 km/day → 2 days.
    const estimate = estimateTravelBetweenBurgs(1, 2);
    expect(estimate).not.toBeNull();
    expect(estimate!.destinationName).toBe("Endham");
    expect(estimate!.durationDays).toBe(2);
  });

  it("returns null when no route connects the burgs", () => {
    worldContext.pack = {
      ...makePack(),
      cells: {
        h: [20, 20],
        burg: [0, 1],
        p: [
          [0, 0],
          [10, 0]
        ],
        routes: {}
      }
    } as unknown as PackedGraph;
    TradeAnimation.clearRouteCache();
    expect(estimateTravelBetweenBurgs(1, 2)).toBeNull();
  });

  it("applies destination location on arrival", () => {
    applyCharacterArrival(10, 2);
    const character = worldContext.pack.characters!.find(c => c.i === 10);
    expect(character?.location).toBe(2);
  });

  it("updates location only after pending travel days are consumed", () => {
    beginPlayerTravel(10, 2, 3);
    expect(usePlayerCharacterState.getState().pendingTravel).toEqual({
      characterId: 10,
      destinationBurgId: 2,
      remainingDays: 3
    });
    expect(worldContext.pack.characters!.find(c => c.i === 10)?.location).toBe(1);

    tickPlayerTravel(1);
    expect(usePlayerCharacterState.getState().pendingTravel?.remainingDays).toBe(2);
    expect(worldContext.pack.characters!.find(c => c.i === 10)?.location).toBe(1);

    tickPlayerTravel(2);
    expect(usePlayerCharacterState.getState().pendingTravel).toBeNull();
    expect(worldContext.pack.characters!.find(c => c.i === 10)?.location).toBe(2);
  });

  it("dispatches Advance Day for the travel duration when beginning a journey", () => {
    const events: CustomEvent[] = [];
    const handler = (event: Event) => {
      events.push(event as CustomEvent);
    };
    document.addEventListener("react-tool-action", handler);
    beginPlayerTravel(10, 2, 5);
    document.removeEventListener("react-tool-action", handler);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({
      action: "advanceTimeButton",
      years: 0,
      months: 0,
      days: 5
    });
  });

  it("requestTravelToBurg opens a confirm dialog for a connected destination", () => {
    const spy = vi.spyOn(hostUi, "openConfirm").mockImplementation(() => {});

    requestTravelToBurg(2);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/Travel will take 2 days\. Move to Endham\?/);
    expect(spy.mock.calls[0][1]).toMatchObject({ title: "Travel", confirm: "Move" });

    spy.mockRestore();
  });

  it("requestTravelToBurg does not open confirm when already at the destination", () => {
    const spy = vi.spyOn(hostUi, "openConfirm").mockImplementation(() => {});
    requestTravelToBurg(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
