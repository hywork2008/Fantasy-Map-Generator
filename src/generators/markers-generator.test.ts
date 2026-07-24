import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import { Markers } from "./markers-generator";

type BattlefieldCandidateLister = {
  listBattlefields(pack: PackedGraph): number[];
};

describe("Markers battlefield candidates", () => {
  it("excludes cells belonging to states without a campaign", () => {
    const pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        state: new Uint16Array([1, 2]),
        pop: new Float32Array([3, 3]),
        h: new Uint8Array([30, 30])
      },
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Isolated" },
        {
          i: 2,
          name: "Contested",
          campaigns: [{ name: "Border War", start: 100, end: 101, attacker: 2, defender: 1 }]
        }
      ]
    } as unknown as PackedGraph;

    const listBattlefields = (Markers as unknown as BattlefieldCandidateLister).listBattlefields.bind(Markers);

    expect(Array.from(listBattlefields(pack))).toEqual([1]);
  });
});
