import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import {
  analyzeFrontiers,
  getChronicleContestedBurgs,
  normalizeHabitability,
  pickPrimaryFrontier
} from "./frontierAnalysis";

// Two adjacent land cells, each owned by a different state: cell 0 -> state 1, cell 1 -> state 2.
function makePack(overrides: {
  relation?: string;
  campaigns?: { attacker: number; defender: number; start: number; end?: number }[];
}): PackedGraph {
  const { relation = "Enemy", campaigns = [] } = overrides;

  return {
    cells: {
      i: [0, 1],
      h: [50, 50],
      c: [[1], [0]],
      state: [1, 2],
      p: [
        [0, 0],
        [10, 0]
      ]
    },
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      // diplomacy is indexed by target state id: index 1 = self, index 2 = relation to the other state
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", relation], campaigns },
      { i: 2, name: "Beta", diplomacy: [undefined, relation, "x"], campaigns: [] }
    ]
  } as unknown as PackedGraph;
}

describe("analyzeFrontiers", () => {
  it("creates a frontier segment for a hostile neighbor", () => {
    const pack = makePack({ relation: "Enemy" });
    const frontiers = analyzeFrontiers(pack, 1000);

    const segments = frontiers.get(1);
    expect(segments).toHaveLength(1);
    expect(segments![0].neighborState).toBe(2);
    expect(segments![0].relation).toBe("Enemy");
    expect(segments![0].cells).toEqual([0]);
    expect(segments![0].threatWeight).toBe(1);
  });

  it("ignores non-hostile relations entirely", () => {
    const pack = makePack({ relation: "Ally" });
    const frontiers = analyzeFrontiers(pack, 1000);
    expect(frontiers.get(1)).toBeUndefined();
  });

  it("boosts threat weight for an active (ongoing) war", () => {
    const pack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 900 }] // no `end` = ongoing
    });
    const frontiers = analyzeFrontiers(pack, 1000);
    expect(frontiers.get(1)![0].threatWeight).toBeCloseTo(0.5 * 2.5, 5);
  });

  it("boosts threat weight for a recently ended war but not an old one", () => {
    const recentPack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 900, end: 990 }] // 10 years ago
    });
    expect(analyzeFrontiers(recentPack, 1000).get(1)![0].threatWeight).toBeCloseTo(0.5 * 2.5, 5);

    const oldPack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 800, end: 850 }] // 150 years ago
    });
    expect(analyzeFrontiers(oldPack, 1000).get(1)![0].threatWeight).toBeCloseTo(0.5, 5);
  });
});

describe("getChronicleContestedBurgs", () => {
  it("collects fromBurg/toBurg across all wars in the chronicle", () => {
    const pack = {
      states: [
        {
          i: 0,
          name: "Neutrals",
          diplomacy: [
            ["The Alpha-Betan War", { id: "w1", from: 1, to: 2, fromBurg: 5, toBurg: 7, action: "x", rawText: "x" }],
            ["The Gamma-Deltan War", { id: "w2", from: 3, to: 4, fromBurg: 9, action: "x", rawText: "x" }]
          ]
        }
      ]
    } as unknown as PackedGraph;

    expect(getChronicleContestedBurgs(pack)).toEqual(new Set([5, 7, 9]));
  });

  it("returns an empty set when there is no chronicle yet", () => {
    const pack = { states: [{ i: 0, name: "Neutrals" }] } as unknown as PackedGraph;
    expect(getChronicleContestedBurgs(pack)).toEqual(new Set());
  });
});

describe("pickPrimaryFrontier", () => {
  it("prefers the closer segment when weights are equal", () => {
    const near = { neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [], cx: 10, cy: 0 };
    const far = { neighborState: 3, relation: "Enemy", threatWeight: 1, cells: [], cx: 5000, cy: 0 };
    expect(pickPrimaryFrontier(0, 0, [far, near])).toBe(near);
  });

  it("prefers the higher-weight segment when it outweighs distance", () => {
    const nearWeak = { neighborState: 2, relation: "Suspicion", threatWeight: 0.1, cells: [], cx: 10, cy: 0 };
    const farStrong = { neighborState: 3, relation: "Enemy", threatWeight: 5, cells: [], cx: 200, cy: 0 };
    expect(pickPrimaryFrontier(0, 0, [nearWeak, farStrong])).toBe(farStrong);
  });

  it("returns null for an empty segment list", () => {
    expect(pickPrimaryFrontier(0, 0, [])).toBeNull();
  });
});

describe("normalizeHabitability", () => {
  it("clamps to [0, 1] relative to mean/max", () => {
    expect(normalizeHabitability(50, 20, 80)).toBeCloseTo(0.5, 5);
    expect(normalizeHabitability(0, 20, 80)).toBe(0);
    expect(normalizeHabitability(200, 20, 80)).toBe(1);
  });

  it("returns 0 when max does not exceed mean", () => {
    expect(normalizeHabitability(50, 30, 30)).toBe(0);
  });
});
