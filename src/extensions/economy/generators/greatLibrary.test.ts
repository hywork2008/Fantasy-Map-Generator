import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, Culture, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getAcademyKnowledgeStocks,
  getGreatLibraryProjects,
  initEconomyContext,
  setGreatLibraryProjects
} from "../economyContext";
import { setFastForwardTickActive } from "./fastAdvanceEconomyGuard";
import { GreatLibrary } from "./greatLibrary";
import {
  GREAT_LIBRARY_BUILD_POINTS,
  GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST,
  GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS,
  GREAT_LIBRARY_TREASURY_FLOOR,
  type GreatLibraryProject
} from "./greatLibraryTypes";

/** Never rolls fire. */
const NO_FIRE_RNG = { P: () => false, rand: () => 0.5 };
/** Always rolls fire, and always the "catastrophic" severity bucket. */
const CATASTROPHIC_FIRE_RNG = { P: () => true, rand: () => 0.999999 };

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test Ruler",
    age: 40,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 0,
      diplomacy: 0,
      engineering: 0,
      geography: 0,
      intrigue: 0,
      learning: 80,
      martial: 0,
      prowess: 0,
      stewardship: 0
    },
    personality: {
      boldness: 50,
      compassion: 50,
      greed: 40,
      honor: 50,
      rationality: 70,
      sociability: 50,
      vengefulness: 50,
      zeal: 50,
      energy: 50,
      piety: 0,
      guile: 50,
      confidence: 50
    },
    family: {} as Character["family"],
    backstory: {
      origin: {},
      commitment: { primary: { kind: "craft" }, intensity: 50, conflictPolicy: "negotiate" },
      tastes: []
    } as unknown as Character["backstory"],
    ...overrides
  } as Character;
}

describe("GreatLibraryModule.settleAnnual", () => {
  beforeEach(() => {
    // Marker plumbing (docs/plan/great-library.md PR3.5/PR6) is exercised by app.ts's own tests
    // (mapMarkerApi.test.ts); here it only needs to not throw.
    const api = {
      worldContext,
      createMapMarker: () => null,
      updateMapMarker: () => false,
      requestWebglRender: () => {}
    } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);

    const capital = { i: 1, x: 0, y: 0, cell: 0, state: 1, name: "Testopolis", removed: false } as unknown as Burg;
    const state = {
      i: 1,
      capital: 1,
      culture: 1,
      treasury: 100_000,
      form: "Monarchy",
      removed: false,
      rulerId: 1
    } as unknown as State;
    const culture = { i: 1, name: "Testish", knowledgeValue: 0.9 } as unknown as Culture;
    const ruler = makeCharacter({ i: 1, state: 1 });

    worldContext.options = { year: 500 };
    worldContext.pack = {
      states: [undefined, state],
      burgs: [undefined, capital],
      cultures: [undefined, culture],
      characters: [ruler],
      markers: []
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  function state(): State {
    return worldContext.pack.states[1] as State;
  }

  function capital(): Burg {
    return worldContext.pack.burgs[1] as Burg;
  }

  function project(): GreatLibraryProject | undefined {
    return getGreatLibraryProjects().find(p => p.stateId === 1);
  }

  it("starts a new 'planning' project for an eligible state, spending nothing that year", () => {
    const treasuryBefore = state().treasury;

    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    const p = project();
    expect(p?.status).toBe("planning");
    expect(p?.progress).toBe(0);
    expect(p?.burgId).toBe(1);
    expect(state().treasury).toBe(treasuryBefore);
  });

  it("does not start a second project for a state that already has one", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(getGreatLibraryProjects().filter(p => p.stateId === 1)).toHaveLength(1);

    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(getGreatLibraryProjects().filter(p => p.stateId === 1)).toHaveLength(1);
  });

  it("never starts a project for the neutral state (i === 0)", () => {
    worldContext.pack.states[0] = {
      i: 0,
      capital: 1,
      culture: 1,
      treasury: 100_000,
      form: "Monarchy"
    } as unknown as State;

    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(getGreatLibraryProjects().some(p => p.stateId === 0)).toBe(false);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    const afterFirstCall = getGreatLibraryProjects();

    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(getGreatLibraryProjects()).toEqual(afterFirstCall);
  });

  it("under Fast-Forward, the project still builds but its treasury is left to the preset rate", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // year 500: planning (no spend)
    const treasuryBeforeBuilding = state().treasury;

    setFastForwardTickActive(true);
    try {
      for (let year = 501; year <= 505; year++) {
        worldContext.options = { year };
        GreatLibrary.settleAnnual(NO_FIRE_RNG);
      }
    } finally {
      setFastForwardTickActive(false);
    }

    // Five building years elapsed and progressed (coverage math untouched)...
    expect(project()?.status).toBe("building");
    expect(project()?.progress).toBeCloseTo(5, 4);
    // ...but applyFastForwardEconomySettlement() owns treasury during Fast-Forward, so this
    // module didn't draw it down (§9.4 / Phase 3).
    expect(state().treasury).toBe(treasuryBeforeBuilding);
  });

  it("completes in exactly 13 calendar years at full coverage (1 planning + 12 building), per docs/plan/great-library.md KD-5", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // year 500: planning
    expect(project()?.status).toBe("planning");

    for (let year = 501; year <= 511; year++) {
      worldContext.options = { year };
      GreatLibrary.settleAnnual(NO_FIRE_RNG);
    }
    // 501..511 is 11 building years at full coverage.
    expect(project()?.status).toBe("building");
    expect(project()?.progress).toBeCloseTo(11, 4);
    expect(project()?.completedYear).toBeUndefined();

    worldContext.options = { year: 512 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    const finished = project();
    expect(finished?.status).toBe("completed");
    expect(finished?.progress).toBeGreaterThanOrEqual(GREAT_LIBRARY_BUILD_POINTS);
    expect(finished?.completedYear).toBe(512);
    // startedYear (500, planning) through completedYear (512) inclusive = 13 distinct years.
    expect((finished?.completedYear ?? 0) - (finished?.startedYear ?? 0)).toBe(12);
  });

  it("boosts the site's AcademyKnowledgeStock(administration) on completion", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning
    for (let year = 501; year <= 512; year++) {
      worldContext.options = { year };
      GreatLibrary.settleAnnual(NO_FIRE_RNG);
    }

    expect(project()?.status).toBe("completed");
    const stock = getAcademyKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "administration");
    expect(stock?.stock).toBeCloseTo(GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST, 4);
  });

  it("creates a marker on building promotion, then updates its icon on completion (docs/plan/great-library.md §Marker作成経路)", () => {
    const createCalls: unknown[] = [];
    const updateCalls: Array<[number, unknown]> = [];
    const spyApi = {
      worldContext,
      createMapMarker: (input: unknown) => {
        createCalls.push(input);
        return { markerId: 42, noteId: "marker42" };
      },
      updateMapMarker: (markerId: number, patch: unknown) => {
        updateCalls.push([markerId, patch]);
        return true;
      },
      requestWebglRender: () => {}
    } as unknown as ExtensionAPI;
    initEconomyContext(spyApi);
    initCharactersContext(spyApi);

    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning: no marker yet
    expect(createCalls).toHaveLength(0);
    expect(project()?.markerId).toBeUndefined();

    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning -> building: marker created here
    expect(createCalls).toHaveLength(1);
    expect(project()?.markerId).toBe(42);

    for (let year = 502; year <= 512; year++) {
      worldContext.options = { year };
      GreatLibrary.settleAnnual(NO_FIRE_RNG);
    }
    expect(project()?.status).toBe("completed");
    expect(createCalls).toHaveLength(1); // only ever created once
    expect(updateCalls.some(([id, patch]) => id === 42 && (patch as { icon?: string }).icon === "📚")).toBe(true);
  });

  it("pauses when the patron state can no longer fund/maintain the project, and resumes once it can again", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning

    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // building, year 1
    expect(project()?.status).toBe("building");
    const progressBeforePause = project()?.progress ?? 0;

    state().treasury = 0; // can no longer fund upkeep
    worldContext.options = { year: 502 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(project()?.status).toBe("paused");
    expect(project()?.progress).toBe(progressBeforePause); // no progress while paused

    state().treasury = 100_000; // funded again
    worldContext.options = { year: 503 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(project()?.status).toBe("building");
    expect(project()?.progress).toBeGreaterThan(progressBeforePause); // resumed and built this same year
  });

  it("takes no action on an occupied project (its Burg belongs to a different State)", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning
    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // building
    const progressBeforeOccupation = project()?.progress ?? 0;
    const treasuryBeforeOccupation = state().treasury;

    capital().state = 2; // conquered by another state

    worldContext.options = { year: 502 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(project()?.status).toBe("building");
    expect(project()?.progress).toBe(progressBeforeOccupation);
    expect(state().treasury).toBe(treasuryBeforeOccupation);
  });

  it("ruins a building project on a catastrophic fire roll", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning
    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(CATASTROPHIC_FIRE_RNG);

    expect(project()?.status).toBe("ruined");
    expect(project()?.ruinedYear).toBe(501);
  });

  it("drops a planning project outright when its state disappears (orphan pass)", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(project()?.status).toBe("planning");

    worldContext.pack.states[1] = { ...state(), removed: true };
    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(project()).toBeUndefined();
  });

  it("ruins a building project when its Burg disappears (orphan pass)", () => {
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // planning
    worldContext.options = { year: 501 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG); // building

    worldContext.pack.burgs[1] = { ...capital(), removed: true };
    worldContext.options = { year: 502 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(project()?.status).toBe("ruined");
  });

  it("blocks a new attempt during the rebuild cooldown, and allows one after it elapses", () => {
    const ruinedYear = 500;
    setGreatLibraryProjects([
      {
        id: 1,
        stateId: 1,
        burgId: 1,
        status: "ruined",
        phase: "structure",
        progress: 3,
        startedYear: 490,
        ruinedYear,
        totalSpent: 50,
        endowment: 0,
        name: "Ruined Great Library"
      }
    ]);

    worldContext.options = { year: ruinedYear + GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS - 1 };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(getGreatLibraryProjects().filter(p => p.status !== "ruined")).toHaveLength(0);

    worldContext.options = { year: ruinedYear + GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS };
    GreatLibrary.settleAnnual(NO_FIRE_RNG);
    expect(getGreatLibraryProjects().some(p => p.status === "planning")).toBe(true);
  });

  it("does not start a project for a state below the treasury floor", () => {
    state().treasury = GREAT_LIBRARY_TREASURY_FLOOR - 1;

    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(project()).toBeUndefined();
  });

  it("does not start a project without a scholarly-enough culture", () => {
    (worldContext.pack.cultures[1] as Culture).knowledgeValue = 0.1;

    GreatLibrary.settleAnnual(NO_FIRE_RNG);

    expect(project()).toBeUndefined();
  });
});
