import { describe, expect, it } from "vitest";
import { keepBorderConnectedSea } from "./classifySea";
import type { Cell } from "./types";

describe("keepBorderConnectedSea", () => {
  it("removes isolated inland sea without removing connected coast", () => {
    const cells = [
      { id: 0, onBorder: true, neighbors: [1] },
      { id: 1, onBorder: false, neighbors: [0, 2] },
      { id: 2, onBorder: false, neighbors: [1, 3] },
      { id: 3, onBorder: false, neighbors: [2] }
    ] as Cell[];
    const sea = new Set([0, 1, 3]);
    keepBorderConnectedSea(cells, sea);
    expect([...sea].sort()).toEqual([0, 1]);
  });
});
