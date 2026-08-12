import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { getNightscapeRouteGlowWidthScale, getWaterSurfaceHeight } from "./three-d-renderer";

function createWaterWorld(gridFeatureType: "ocean" | "lake", packedLakeHeight = 20): WorldContext {
  return {
    grid: {
      cells: { f: Uint16Array.of(1) },
      features: [
        {} as WorldContext["grid"]["features"][number],
        { i: 1, land: false, border: gridFeatureType === "ocean", type: gridFeatureType }
      ]
    },
    pack: {
      cells: { f: Uint16Array.of(1) },
      features: [
        {} as WorldContext["pack"]["features"][number],
        {
          i: 1,
          type: "lake",
          land: false,
          border: false,
          height: packedLakeHeight
        }
      ]
    }
  } as WorldContext;
}

describe("getWaterSurfaceHeight", () => {
  it("keeps ocean cells at one sea level when reGraph has no packed cell for deep water", () => {
    const world = createWaterWorld("ocean");

    expect(getWaterSurfaceHeight(world, 0, new Map())).toBe(20);
  });

  it("does not borrow a lake height for an ocean cell from a stale packed-cell mapping", () => {
    const world = createWaterWorld("ocean", 68);

    expect(getWaterSurfaceHeight(world, 0, new Map([[0, 0]]))).toBe(20);
  });

  it("preserves an elevated lake surface when the grid cell belongs to that lake", () => {
    const world = createWaterWorld("lake", 35);

    expect(getWaterSurfaceHeight(world, 0, new Map([[0, 0]]))).toBe(35);
  });
});

describe("getNightscapeRouteGlowWidthScale", () => {
  it("widens trails and sea routes to the Nightscape road width only", () => {
    expect(getNightscapeRouteGlowWidthScale({ group: "roads", width: 1.1 })).toBe(1);
    expect(getNightscapeRouteGlowWidthScale({ group: "trails", width: 0.65 })).toBeCloseTo(1.1 / 0.65);
    expect(getNightscapeRouteGlowWidthScale({ group: "searoutes", width: 0.7 })).toBeCloseTo(1.1 / 0.7);
  });

  it("leaves unknown and invalid-width route data unchanged", () => {
    expect(getNightscapeRouteGlowWidthScale({ group: "custom", width: 0.5 })).toBe(1);
    expect(getNightscapeRouteGlowWidthScale({ group: "trails", width: 0 })).toBe(1);
  });
});
