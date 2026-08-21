import { describe, expect, it } from "vitest";
import {
  chooseLowerGiantWaterworksSite,
  highestWaterSourceElevation,
  isGiantWaterworksState
} from "./giantWaterworksSiting";

describe("Giant waterworks siting", () => {
  const cells = {
    i: new Uint16Array([0, 1, 2, 3]),
    h: new Uint16Array([20, 90, 55, 40]),
    r: new Uint16Array([0, 1, 0, 0]),
    s: new Uint16Array([0, 10, 80, 80]),
    state: new Uint16Array([1, 1, 1, 1])
  };

  it("recognizes a Giant State only in a Fantasy culture set", () => {
    const args = {
      stateId: 1,
      states: [{ i: 0 }, { i: 1, culture: 1 }],
      cultures: [
        { i: 0, type: "Generic" },
        { i: 1, type: "Generic", race: 1 }
      ],
      races: [
        { i: 0, key: "unknown", name: "Unknown" },
        { i: 1, key: "giant", name: "Giant" }
      ]
    };

    expect(isGiantWaterworksState({ ...args, culturesSet: "highFantasy" })).toBe(true);
    expect(isGiantWaterworksState({ ...args, culturesSet: "world" })).toBe(false);
  });

  it("places Giant waterworks settlements strictly below the highest source", () => {
    const highest = highestWaterSourceElevation(cells);
    expect(highest).toBe(90);
    expect(chooseLowerGiantWaterworksSite({ cells, stateId: 1, fromCell: 1, highestSourceElevation: highest! })).toBe(
      2
    );
  });
});
