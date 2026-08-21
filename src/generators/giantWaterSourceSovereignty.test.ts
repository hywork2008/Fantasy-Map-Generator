import { describe, expect, it } from "vitest";
import { enforceGiantWaterSourceSovereignty } from "./giantWaterSourceSovereignty";

describe("enforceGiantWaterSourceSovereignty", () => {
  it("gives the sole Giant State the highest source, its basin, and a land corridor", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2, 3, 4]),
      c: [[1], [0, 2, 4], [1, 3], [2], [1]],
      h: new Uint16Array([30, 60, 90, 40, 100]),
      r: new Uint16Array([0, 1, 1, 1, 0]),
      state: new Uint16Array([1, 1, 2, 2, 2]),
      p: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [1, 1]
      ]
    };
    const states = [{ i: 0 }, { i: 1, capital: 1, culture: 1 }, { i: 2, culture: 2 }];
    const burgs = [undefined, { i: 1, cell: 0, state: 1, x: 0, y: 0 }, { i: 2, cell: 3, state: 2, x: 3, y: 0 }];

    const selected = enforceGiantWaterSourceSovereignty({
      cells,
      states: states as any,
      burgs: burgs as any,
      cultures: [{ i: 0 }, { i: 1, race: 1 }, { i: 2, race: 2 }] as any,
      races: [
        { i: 0, key: "unknown" },
        { i: 1, key: "giant" },
        { i: 2, key: "human" }
      ] as any,
      rivers: [{ i: 1, source: 2, basin: 1 }] as any,
      culturesSet: "highFantasy"
    });

    expect(selected).toBe(1);
    expect(Array.from(cells.state)).toEqual([1, 1, 1, 1, 1]);
    expect(burgs[2]!.state).toBe(1);
  });

  it("does not permit a Giant State when no land corridor can reach the source", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      h: new Uint16Array([30, 10, 90]),
      r: new Uint16Array([0, 0, 1]),
      state: new Uint16Array([1, 0, 2]),
      p: [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    };
    const states = [{ i: 0 }, { i: 1, capital: 1, culture: 1 }, { i: 2, capital: 2, culture: 2 }];

    expect(
      enforceGiantWaterSourceSovereignty({
        cells,
        states: states as any,
        burgs: [undefined, { i: 1, cell: 0, state: 1, x: 0, y: 0 }] as any,
        cultures: [{ i: 0 }, { i: 1, race: 1 }, { i: 2, race: 2 }] as any,
        races: [
          { i: 0, key: "unknown" },
          { i: 1, key: "giant" },
          { i: 2, key: "human" }
        ] as any,
        rivers: [{ i: 1, basin: 1 }] as any,
        culturesSet: "highFantasy"
      })
    ).toBeNull();
    expect(states[1]!.culture).toBe(2);
  });

  it("does not overwrite a locked State to create a Giant watershed", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      h: new Uint16Array([30, 60, 90]),
      r: new Uint16Array([0, 1, 1]),
      state: new Uint16Array([1, 1, 2]),
      p: [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    };
    const states = [{ i: 0 }, { i: 1, capital: 1, culture: 1 }, { i: 2, capital: 2, culture: 2, lock: true }];

    expect(
      enforceGiantWaterSourceSovereignty({
        cells,
        states: states as any,
        burgs: [undefined, { i: 1, cell: 0, state: 1, x: 0, y: 0 }] as any,
        cultures: [{ i: 0 }, { i: 1, race: 1 }, { i: 2, race: 2 }] as any,
        races: [
          { i: 0, key: "unknown" },
          { i: 1, key: "giant" },
          { i: 2, key: "human" }
        ] as any,
        rivers: [{ i: 1, source: 2, basin: 1 }] as any,
        culturesSet: "highFantasy"
      })
    ).toBeNull();
    expect(states[1]!.culture).toBe(2);
    expect(Array.from(cells.state)).toEqual([1, 1, 2]);
  });

  it("does not absorb another State's capital into the protected watershed", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      h: new Uint16Array([30, 60, 90]),
      r: new Uint16Array([0, 1, 1]),
      state: new Uint16Array([1, 1, 2]),
      p: [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    };
    const states = [{ i: 0 }, { i: 1, capital: 1, culture: 1 }, { i: 2, capital: 2, culture: 2 }];

    expect(
      enforceGiantWaterSourceSovereignty({
        cells,
        states: states as any,
        burgs: [undefined, { i: 1, cell: 0, state: 1, x: 0, y: 0 }, { i: 2, cell: 2, state: 2, x: 2, y: 0 }] as any,
        cultures: [{ i: 0 }, { i: 1, race: 1 }, { i: 2, race: 2 }] as any,
        races: [
          { i: 0, key: "unknown" },
          { i: 1, key: "giant" },
          { i: 2, key: "human" }
        ] as any,
        rivers: [{ i: 1, source: 2, basin: 1 }] as any,
        culturesSet: "highFantasy"
      })
    ).toBeNull();
    expect(states[1]!.culture).toBe(2);
  });
});
