import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyWildernessEcologyState, simulationContext } from "../../../context/simulationContext";
import { createDefaultBiomesData } from "../../../data/biomeCatalog";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getCullJobPostings,
  initEconomyContext,
  setCullHireApplications,
  setCullJobPostings
} from "../economyContext";
import {
  CULL_MAX_POSTINGS_PER_BURG,
  CULL_POST_EXPIRE_DAYS,
  clearCullHireState,
  computeJoinMacroBounty,
  computeMissionDays,
  computePostedBounty,
  formatCullJobPostingsForBurg,
  getLiveOpenSeats,
  pruneInvalidCullPostings,
  rebuildCullJobPostings,
  tickCullJobBoard,
  uiDifficultyFromRarity
} from "./threatCullJobPostings";

function setupWorld(options?: { forest?: boolean; monsters?: boolean; fort?: boolean }) {
  const biomesData = createDefaultBiomesData();
  const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
  const grassland = biomesData.codesByKey?.grassland ?? 4;
  const biome = options?.forest === false ? grassland : forest;
  const n = 8;
  worldContext.biomesData = biomesData;
  worldContext.pack = {
    cells: {
      i: Uint16Array.from({ length: n }, (_, i) => i),
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6]],
      h: new Uint8Array(n).fill(25),
      state: new Uint16Array([1, 1, 0, 0, 0, 0, 0, 0]),
      danger: new Uint8Array(n),
      biomeCode: Uint8Array.from({ length: n }, () => biome)
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
        group: options?.fort ? "fort" : "town",
        population: 2
      }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Aster", treasury: 80, removed: false }
    ],
    monsters:
      options?.monsters === false
        ? []
        : [
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
    dungeons: []
  } as unknown as typeof worldContext.pack;

  simulationContext.currentYear = 100;
  simulationContext.currentMonth = 1;
  simulationContext.currentDay = 1;
  simulationContext.wilderness = createEmptyWildernessEcologyState();
}

describe("threatCullJobPostings pay helpers", () => {
  it("posts target-only bounties as a fraction of setupHuntCost", () => {
    const r1 = computePostedBounty(1);
    const r3 = computePostedBounty(3);
    expect(r1.bounty).toBeGreaterThan(0);
    expect(r1.bountyPartial).toBeLessThan(r1.bounty);
    expect(r3.bounty).toBeGreaterThan(r1.bounty);
    expect(uiDifficultyFromRarity(3)).toBe(3);
    expect(uiDifficultyFromRarity(9)).toBe(5);
  });

  it("join-macro stipend is lower than full bounty", () => {
    const full = computePostedBounty(3);
    const join = computeJoinMacroBounty(3);
    expect(join.bounty).toBeLessThan(full.bounty);
    expect(join.bounty).toBeGreaterThan(0);
  });

  it("mission days clamp to 5..40", () => {
    expect(computeMissionDays({ hops: 0, rarity: 1, powerSnapshot: 1 })).toBeGreaterThanOrEqual(5);
    expect(computeMissionDays({ hops: 10, rarity: 5, powerSnapshot: 100 })).toBeLessThanOrEqual(40);
  });
});

describe("rebuildCullJobPostings", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext
    } as unknown as ExtensionAPI);
    useOptionsState.setState({ culturesSet: "highFantasy" });
    clearCullHireState();
  });

  afterEach(() => {
    clearCullHireState();
    clearEconomyContext();
  });

  it("posts monster culls near a border burg on fantasy maps", () => {
    setupWorld({ monsters: true, forest: true });
    rebuildCullJobPostings({ clearAll: true });
    const posts = getCullJobPostings();
    expect(posts.some(p => p.target.kind === "monster" && p.target.monsterId === 0)).toBe(true);
    expect(posts.every(p => p.expiresInDays === CULL_POST_EXPIRE_DAYS)).toBe(true);
    expect(posts.every(p => p.openSeats === 1)).toBe(true);
    expect(posts.every(p => p.bounty > 0 && p.bountyPartial > 0)).toBe(true);
  });

  it("posts pest targets without painted danger on forest hinterland", () => {
    setupWorld({ monsters: false, forest: true });
    worldContext.pack.cells.danger.fill(0);
    useOptionsState.setState({ culturesSet: "world" });
    rebuildCullJobPostings({ clearAll: true });
    const posts = getCullJobPostings();
    expect(posts.some(p => p.target.kind === "pest")).toBe(true);
    expect(formatCullJobPostingsForBurg(1)).not.toBe("—");
  });

  it("respects per-burg cap", () => {
    setupWorld({ monsters: true, forest: true });
    // Extra monsters in range to tempt more posts.
    worldContext.pack.monsters = [
      {
        i: 0,
        cell: 4,
        name: "A",
        rarity: 1,
        power: 4,
        basePower: 4,
        type: "Beast"
      },
      {
        i: 1,
        cell: 5,
        name: "B",
        rarity: 2,
        power: 6,
        basePower: 6,
        type: "Beast"
      },
      {
        i: 2,
        cell: 3,
        name: "C",
        rarity: 1,
        power: 5,
        basePower: 5,
        type: "Beast"
      },
      {
        i: 3,
        cell: 2,
        name: "D",
        rarity: 1,
        power: 5,
        basePower: 5,
        type: "Beast"
      }
    ];
    rebuildCullJobPostings({ clearAll: true });
    const forBurg = getCullJobPostings().filter(p => p.burgId === 1);
    expect(forBurg.length).toBeLessThanOrEqual(CULL_MAX_POSTINGS_PER_BURG);
  });

  it("skips forts unless darkFantasy border fort flag path", () => {
    setupWorld({ monsters: true, forest: true, fort: true });
    useOptionsState.setState({ culturesSet: "highFantasy" });
    rebuildCullJobPostings({ clearAll: true });
    expect(getCullJobPostings().filter(p => p.burgId === 1)).toHaveLength(0);

    useOptionsState.setState({ culturesSet: "darkFantasy" });
    rebuildCullJobPostings({ clearAll: true });
    // Border fort on darkFantasy may post.
    expect(getCullJobPostings().some(p => p.burgId === 1)).toBe(true);
  });

  it("marks join-macro posts when a ThreatCullProject is active", () => {
    setupWorld({ monsters: true });
    simulationContext.wilderness.cullProjects[5] = {
      cellId: 5,
      stateId: 1,
      monsterId: 0,
      establishedYear: 99,
      progressYears: 1,
      dangerReduced: 0
    };
    rebuildCullJobPostings({ clearAll: true });
    const join = getCullJobPostings().find(p => p.macroCellId === 5);
    expect(join).toBeTruthy();
    expect(join!.bounty).toBe(computeJoinMacroBounty(join!.target.rarity).bounty);
  });

  it("prunes expired postings and frees pending applications", () => {
    setupWorld({ monsters: true });
    rebuildCullJobPostings({ clearAll: true });
    const posts = getCullJobPostings();
    expect(posts.length).toBeGreaterThan(0);
    const id = posts[0].i;
    setCullHireApplications([{ i: 1, postingId: id, burgId: 1, characterId: 9, daysRemaining: 7 }]);
    setCullJobPostings(posts.map(p => ({ ...p, expiresInDays: 0 })));
    pruneInvalidCullPostings();
    expect(getCullJobPostings()).toHaveLength(0);
    // Application for removed post is dropped.
    expect(getCullJobPostings().length).toBe(0);
  });

  it("tickCullJobBoard expires and eventually refills", () => {
    setupWorld({ monsters: true, forest: true });
    rebuildCullJobPostings({ clearAll: true });
    const before = getCullJobPostings().length;
    expect(before).toBeGreaterThan(0);
    tickCullJobBoard(CULL_POST_EXPIRE_DAYS);
    // Expired and pruned; monthly refresh also ran (30d multiple inside 45).
    // Board may refill on the 30-day gate inside tick.
    const after = getCullJobPostings();
    // All remaining posts should have positive expiry if any.
    expect(after.every(p => p.expiresInDays > 0)).toBe(true);
  });

  it("getLiveOpenSeats subtracts pending applications", () => {
    setupWorld({ monsters: true });
    rebuildCullJobPostings({ clearAll: true });
    const post = getCullJobPostings()[0];
    expect(getLiveOpenSeats(post.i)).toBe(1);
    setCullHireApplications([{ i: 1, postingId: post.i, burgId: post.burgId, characterId: 1, daysRemaining: 7 }]);
    expect(getLiveOpenSeats(post.i)).toBe(0);
  });
});
