import { describe, expect, it } from "vitest";
import { demLevelOrder } from "./localTerrainSampler";

describe("demLevelOrder", () => {
  it("tries the coarsest level fine enough, then finer, then coarser", () => {
    // steps are finest first, as the sampler stores them
    expect(demLevelOrder([250, 500, 1000], 600)).toEqual([1, 0, 2]);
    expect(demLevelOrder([250, 500, 1000], 100)).toEqual([0, 1, 2]);
    expect(demLevelOrder([250, 500, 1000], 2000)).toEqual([2, 1, 0]);
  });
});
