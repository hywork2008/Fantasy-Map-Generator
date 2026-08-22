import { describe, expect, it } from "vitest";
import { resolveBurgBasinKind, resolveBurgEffluentDestination } from "./urbanWaterClimate";

describe("resolveBurgBasinKind", () => {
  it("is openBasin for a burg with no river at all", () => {
    expect(
      resolveBurgBasinKind({
        cellId: 0,
        cells: { r: new Uint16Array([0]), f: new Uint16Array([1]), h: new Uint16Array([50]) }
      })
    ).toBe("openBasin");
  });

  it("is openBasin when the river's mouth reaches an ocean feature at sea level", () => {
    expect(
      resolveBurgBasinKind({
        cellId: 0,
        cells: {
          r: new Uint16Array([1, 1]),
          f: new Uint16Array([1, 2]),
          h: new Uint16Array([50, 5])
        },
        rivers: [{ i: 1, source: 0, mouth: 1 }],
        features: [{ i: 2, type: "ocean" }]
      })
    ).toBe("openBasin");
  });

  it("is closedBasin when the river's mouth sits above sea level (vanishes inland)", () => {
    expect(
      resolveBurgBasinKind({
        cellId: 0,
        cells: {
          r: new Uint16Array([1, 1]),
          f: new Uint16Array([1, 1]),
          h: new Uint16Array([50, 25])
        },
        rivers: [{ i: 1, source: 0, mouth: 1 }]
      })
    ).toBe("closedBasin");
  });

  it("is closedBasin when the river's mouth is a closed (endorheic) lake", () => {
    expect(
      resolveBurgBasinKind({
        cellId: 0,
        cells: {
          r: new Uint16Array([1, 1]),
          f: new Uint16Array([1, 2]),
          h: new Uint16Array([50, 5])
        },
        rivers: [{ i: 1, source: 0, mouth: 1 }],
        features: [{ i: 2, type: "lake", closed: true }]
      })
    ).toBe("closedBasin");
  });

  it("fails open to openBasin when cells/geometry are missing (legacy fixtures)", () => {
    expect(resolveBurgBasinKind({ cellId: 0, cells: undefined })).toBe("openBasin");
  });
});

describe("resolveBurgEffluentDestination", () => {
  it("is riverOutfall for an open-basin river", () => {
    expect(resolveBurgEffluentDestination({ hasRiver: true, isCoastal: false, basinKind: "openBasin" })).toBe(
      "riverOutfall"
    );
  });

  it("is coastalOutfall for a coastal burg even with a closed-basin river", () => {
    expect(resolveBurgEffluentDestination({ hasRiver: true, isCoastal: true, basinKind: "closedBasin" })).toBe(
      "coastalOutfall"
    );
  });

  it("is sealedStorageAndInfiltration when neither an open river nor the coast is reachable", () => {
    expect(resolveBurgEffluentDestination({ hasRiver: true, isCoastal: false, basinKind: "closedBasin" })).toBe(
      "sealedStorageAndInfiltration"
    );
    expect(resolveBurgEffluentDestination({ hasRiver: false, isCoastal: false, basinKind: "openBasin" })).toBe(
      "sealedStorageAndInfiltration"
    );
  });
});
