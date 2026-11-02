import { describe, expect, it } from "vitest";
import { type PlanBox, planBox, planBoxCorners } from "../../../buildings/placementContract";
import { createPlotIndex, plotRecord } from "./plotIndex";
import { orientedBoxesOverlap } from "./sat";
import { type PlacementCandidate, validatePlacement } from "./validatePlacement";

function box(center: [number, number], halfX = 4, halfZ = 3, rotationY = 0): PlanBox {
  return planBox(center, { halfX, halfZ }, rotationY);
}

function candidate(id: string, plot: PlanBox, patch: Partial<PlacementCandidate> = {}): PlacementCandidate {
  return {
    id,
    box: plot,
    slope: 0.02,
    areaM2: 40,
    edgeDropMeters: 0,
    ...patch
  };
}

describe("freeform placement checks", () => {
  it("treats a shared edge as clear and a crossing as an overlap", () => {
    const left = planBoxCorners(box([-4, 0]));
    const flush = planBoxCorners(box([4, 0]));
    const crossing = planBoxCorners(box([2, 0]));
    expect(orientedBoxesOverlap(left, flush)).toBe(false);
    expect(orientedBoxesOverlap(left, crossing)).toBe(true);
  });

  it("rejects a footprint that crosses a stored plot and accepts a gap", () => {
    const index = createPlotIndex();
    index.insert(plotRecord("a", box([0, 0])));
    expect(validatePlacement(candidate("b", box([20, 0])), index).ok).toBe(true);
    expect(validatePlacement(candidate("b", box([3, 0])), index)).toMatchObject({ ok: false, reason: "overlap" });
    index.remove("a");
    expect(index.size).toBe(0);
    expect(validatePlacement(candidate("b", box([3, 0])), index).ok).toBe(true);
  });

  it("narrows a slope that would reach a neighbour into a wall", () => {
    const index = createPlotIndex();
    index.insert(plotRecord("a", box([0, 0], 4, 3)));
    const beside = validatePlacement(candidate("b", box([10, 0], 4, 3), { edgeDropMeters: 2 }), index);
    expect(beside.ok).toBe(true);
    expect(beside.edge).toEqual({ kind: "wall" });
    const tight = validatePlacement(candidate("b", box([8.5, 0], 4, 3), { edgeDropMeters: 2 }), index);
    expect(tight).toMatchObject({ ok: false, reason: "overlap", edge: { kind: "wall" } });
  });

  it("rejects a wall taller than 3 m, a steep large building, water, a cliff and a way", () => {
    const index = createPlotIndex();
    index.insert(plotRecord("a", box([0, 0])));
    const tall = validatePlacement(candidate("b", box([12, 0]), { edgeDropMeters: 4 }), index);
    expect(tall).toMatchObject({ ok: false, reason: "retaining" });
    expect(validatePlacement(candidate("b", box([30, 0]), { slope: 0.4 }), index)).toMatchObject({
      ok: false,
      reason: "slope"
    });
    expect(validatePlacement(candidate("b", box([30, 0]), { slope: 0.2, areaM2: 120 }), index)).toMatchObject({
      ok: false,
      reason: "slope"
    });
    expect(validatePlacement(candidate("b", box([30, 0]), { slope: 0.2, areaM2: 40 }), index).ok).toBe(true);
    expect(validatePlacement(candidate("b", box([30, 0]), { onWater: true }), index).reason).toBe("water");
    expect(validatePlacement(candidate("b", box([30, 0]), { onCliff: true }), index).reason).toBe("cliff");
    expect(validatePlacement(candidate("b", box([30, 0]), { onWay: true }), index).reason).toBe("way");
  });

  it("ignores the plot being edited", () => {
    const index = createPlotIndex();
    const plot = box([0, 0]);
    index.insert(plotRecord("a", plot));
    expect(validatePlacement(candidate("a", plot), index).ok).toBe(true);
  });
});
