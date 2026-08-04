import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyWildernessEcologyState, simulationContext } from "../../../context/simulationContext";
import { createDefaultBiomesData } from "../../../data/biomeCatalog";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getConstructionNamedSeats,
  getCullActiveContracts,
  getCullHireApplications,
  getCullJobPostings,
  initEconomyContext,
  setConstructionOperations,
  setGoods
} from "../economyContext";
import type { ConstructionOperation } from "./constructionEmploymentTypes";
import {
  applyCharacterToConstructionJob,
  clearConstructionHireState,
  PLAYER_HIRE_LAG_DAYS,
  tickConstructionHiring
} from "./constructionHire";
import {
  applyCharacterToCullJob,
  CULL_RESOLVE_ENABLED,
  cancelCullApplication,
  clearCullHiringSession,
  getCharacterCullContract,
  getCharacterPendingCullApplication,
  resignCullJob,
  tickCullHiring
} from "./threatCullHire";
import { CULL_PLAYER_HIRE_LAG_DAYS, clearCullHireState, rebuildCullJobPostings } from "./threatCullJobPostings";

function setupFantasyBurgWithMonster(): void {
  const biomesData = createDefaultBiomesData();
  const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
  worldContext.biomesData = biomesData;
  worldContext.pack = {
    cells: {
      i: Uint16Array.from({ length: 8 }, (_, i) => i),
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6]],
      h: new Uint8Array(8).fill(25),
      state: new Uint16Array([1, 1, 0, 0, 0, 0, 0, 0]),
      danger: new Uint8Array(8),
      biomeCode: Uint8Array.from({ length: 8 }, () => forest)
    },
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 1,
        state: 1,
        name: "Borderburg",
        x: 0,
        y: 0,
        removed: false,
        group: "town",
        population: 2,
        type: "Generic",
        demographics: {
          capacity: 1000,
          maleAdults: 200,
          femaleAdults: 200,
          children: 0,
          elders: 0
        }
      }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Aster", treasury: 80, removed: false }
    ],
    monsters: [
      {
        i: 0,
        cell: 5,
        name: "Dire Beast",
        rarity: 2,
        power: 8,
        basePower: 8,
        type: "Dire Beast"
      }
    ],
    markers: [],
    dungeons: [],
    cultures: [null, { i: 1, type: "Generic" }],
    characters: [
      {
        i: 10,
        name: "Hunter",
        location: 1,
        dead: false,
        roles: [],
        titles: [],
        wealth: 0
      }
    ]
  } as unknown as PackedGraph;

  simulationContext.currentYear = 100;
  simulationContext.currentMonth = 1;
  simulationContext.currentDay = 1;
  simulationContext.wilderness = createEmptyWildernessEcologyState();

  setGoods([
    { i: 1, name: "Wood", tags: ["construction"], value: 1, unit: "pile", icon: "good-wood", color: "#000" },
    { i: 2, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#000" },
    { i: 3, name: "Brick", tags: ["construction"], value: 2, unit: "wain", icon: "good-clay", color: "#000" }
  ]);
  setConstructionOperations([
    {
      i: 1,
      burgId: 1,
      marketId: 1,
      masonWorkers: 0,
      carpenterWorkers: 0,
      buildingStock: 0,
      dwellingStock: 0,
      hasQuarryAccess: true,
      active: true
    } as ConstructionOperation
  ]);
}

describe("threatCullHire PR-3a", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext
    } as unknown as ExtensionAPI);
    useOptionsState.setState({ culturesSet: "highFantasy" });
    clearConstructionHireState();
    clearCullHireState();
    clearCullHiringSession();
    setupFantasyBurgWithMonster();
    rebuildCullJobPostings({ clearAll: true });
  });

  afterEach(() => {
    clearConstructionHireState();
    clearCullHireState();
    clearCullHiringSession();
    clearEconomyContext();
  });

  it("keeps CULL_RESOLVE_ENABLED false in PR-3a", () => {
    expect(CULL_RESOLVE_ENABLED).toBe(false);
  });

  it("lets a character apply and reserves a pending app for CULL_PLAYER_HIRE_LAG_DAYS", () => {
    const posts = getCullJobPostings();
    expect(posts.length).toBeGreaterThan(0);
    const result = applyCharacterToCullJob({ characterId: 10, postingId: posts[0].i });
    expect(result.ok).toBe(true);
    expect(result.daysRemaining).toBe(CULL_PLAYER_HIRE_LAG_DAYS);
    expect(getCullHireApplications()).toHaveLength(1);
    expect(getCullActiveContracts()).toHaveLength(0);
    expect(getCharacterPendingCullApplication(10)?.postingId).toBe(posts[0].i);
  });

  it("rejects apply when character is not in the burg", () => {
    (worldContext.pack.characters![0] as { location: number }).location = 99;
    const post = getCullJobPostings()[0];
    const result = applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    expect(result.ok).toBe(false);
  });

  it("accepts after lag: deducts escrow, creates contract, adds role", () => {
    const post = getCullJobPostings()[0];
    const treasuryBefore = worldContext.pack.states![1].treasury as number;
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    tickCullHiring(CULL_PLAYER_HIRE_LAG_DAYS);

    expect(getCharacterPendingCullApplication(10)).toBeNull();
    const contract = getCharacterCullContract(10);
    expect(contract).toBeTruthy();
    expect(contract!.escrow).toBeGreaterThan(0);
    // Same multi-day tick that accepts also advances mission countdown.
    expect(contract!.missionDaysRemaining).toBe(Math.max(0, post.missionDays - CULL_PLAYER_HIRE_LAG_DAYS));
    expect(worldContext.pack.states![1].treasury).toBeLessThan(treasuryBefore);
    const character = worldContext.pack.characters![0];
    expect(character.roles?.some(r => r.kind === "cullHunter" || r.kind === "pestController")).toBe(true);
  });

  it("freezes mission at 0 without resolving while CULL_RESOLVE_ENABLED is false", () => {
    const post = getCullJobPostings()[0];
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    tickCullHiring(CULL_PLAYER_HIRE_LAG_DAYS);
    const missionDays = getCharacterCullContract(10)!.missionDaysRemaining;
    tickCullHiring(missionDays + 10);
    const contract = getCharacterCullContract(10);
    expect(contract).toBeTruthy();
    expect(contract!.missionDaysRemaining).toBe(0);
    // Still employed — no pay/ecology in PR-3a
    expect(worldContext.pack.characters![0].roles?.length).toBeGreaterThan(0);
    expect(worldContext.pack.monsters![0].power).toBe(8);
  });

  it("cancel withdraws pending application", () => {
    const post = getCullJobPostings()[0];
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    const result = cancelCullApplication(10);
    expect(result.ok).toBe(true);
    expect(getCullHireApplications()).toHaveLength(0);
  });

  it("resign forfeits escrow and clears role", () => {
    const post = getCullJobPostings()[0];
    const treasuryAtPost = worldContext.pack.states![1].treasury as number;
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    tickCullHiring(CULL_PLAYER_HIRE_LAG_DAYS);
    const afterEscrow = worldContext.pack.states![1].treasury as number;
    expect(afterEscrow).toBeLessThan(treasuryAtPost);

    const result = resignCullJob(10);
    expect(result.ok).toBe(true);
    expect(getCharacterCullContract(10)).toBeNull();
    // Forfeit — treasury does not gain escrow back
    expect(worldContext.pack.states![1].treasury).toBe(afterEscrow);
    expect(worldContext.pack.characters![0].roles ?? []).toHaveLength(0);
  });

  it("purges named contract when character leaves the burg (forfeit)", () => {
    const post = getCullJobPostings()[0];
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    tickCullHiring(CULL_PLAYER_HIRE_LAG_DAYS);
    (worldContext.pack.characters![0] as { location: number }).location = 99;
    tickCullHiring(1);
    expect(getCharacterCullContract(10)).toBeNull();
  });

  it("blocks construction apply while cull pending and vice versa", () => {
    const post = getCullJobPostings()[0];
    expect(applyCharacterToCullJob({ characterId: 10, postingId: post.i }).ok).toBe(true);
    expect(applyCharacterToConstructionJob({ characterId: 10, burgId: 1 }).ok).toBe(false);

    cancelCullApplication(10);
    expect(applyCharacterToConstructionJob({ characterId: 10, burgId: 1 }).ok).toBe(true);
    expect(applyCharacterToCullJob({ characterId: 10, postingId: post.i }).ok).toBe(false);

    // Clear construction commitment via lag+resign path: complete hire then resign isn't exported for cancel only
    // Cancel is only for applications — tick to seat then we still have commitment.
    tickConstructionHiring(PLAYER_HIRE_LAG_DAYS);
    expect(getConstructionNamedSeats().some(s => s.characterId === 10)).toBe(true);
    expect(applyCharacterToCullJob({ characterId: 10, postingId: post.i }).ok).toBe(false);
  });

  it("refunds half escrow when target dies mid-mission", () => {
    const post = getCullJobPostings()[0];
    applyCharacterToCullJob({ characterId: 10, postingId: post.i });
    tickCullHiring(CULL_PLAYER_HIRE_LAG_DAYS);
    const contract = getCharacterCullContract(10)!;
    const escrow = contract.escrow;
    const treasuryAfterEscrow = worldContext.pack.states![1].treasury as number;

    worldContext.pack.monsters![0].power = 0;
    tickCullHiring(1);

    expect(getCharacterCullContract(10)).toBeNull();
    expect(worldContext.pack.states![1].treasury).toBeCloseTo(treasuryAfterEscrow + escrow * 0.5, 5);
  });
});
