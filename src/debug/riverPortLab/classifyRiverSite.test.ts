import { describe, expect, it } from "vitest";
import { buildRiverSiteIndex, classifyRiverSite, type RiverSiteWorld } from "./classifyRiverSite";

/**
 * A 1-row strip, x = cell id:
 *   0..6 land, 7 ocean. Main river 1 runs 0→6 into the ocean (cell 7).
 *   Tributary 2 runs 10→11→3 (joins the main river at cell 3).
 *   Cell 12 is a coast cell without a river, 13 inland, 14 a lake, 15 the lake's out cell.
 */
function world(): RiverSiteWorld {
  const n = 16;
  const h = Array(n).fill(30);
  h[7] = 5;
  h[14] = 10;
  const f = Array(n).fill(1);
  f[7] = 2;
  f[14] = 3;
  const p: [number, number][] = Array.from({ length: n }, (_, i) => [i * 10, 0]);
  p[4] = [40, 0];
  p[5] = [45, 10]; // sharp turn at 5 (4→5→6)
  p[6] = [40, 20];
  p[10] = [30, -20];
  p[11] = [30, -10];
  const r = Array(n).fill(0);
  for (const c of [0, 1, 2, 3, 4, 5, 6]) r[c] = 1;
  r[10] = r[11] = 2;
  r[15] = 3;
  const conf = Array(n).fill(0);
  conf[3] = 1;
  const haven = Array(n).fill(0);
  haven[6] = 7;
  haven[12] = 7;
  haven[15] = 14;
  return {
    cells: { r, conf, haven, h, f, fl: Array(n).fill(10), p },
    features: [0, { type: "island" }, { type: "ocean" }, { type: "lake", outCell: 15 }],
    rivers: [
      { i: 1, cells: [0, 1, 2, 3, 4, 5, 6, 7] },
      { i: 2, cells: [10, 11, 3], parent: 1 },
      { i: 3, cells: [15, 13, -1] }
    ]
  };
}

const classify = (cell: number) => classifyRiverSite(buildRiverSiteIndex(world()), cell);

describe("classifyRiverSite", () => {
  it("marks the ocean mouth as an estuary with sea access", () => {
    expect(classify(6)).toMatchObject({ kind: "estuary", distanceToMouthCells: 0, outflow: "ocean", seaAccess: true });
  });

  it("marks the confluence with the number of rivers meeting there", () => {
    expect(classify(3)).toMatchObject({ kind: "confluence", confluenceOrder: 2 });
  });

  it("marks the cell below a confluence, within the delta reach as a delta branch first", () => {
    expect(classify(4)).toMatchObject({ kind: "deltaBranch", distanceToMouthCells: 2 });
  });

  it("detects meanders by the path turn", () => {
    const c = classify(5)!;
    expect(c.curvatureDeg).toBeGreaterThanOrEqual(45);
    expect(c.kind).toBe("deltaBranch"); // delta reach wins over meander
  });

  it("keeps a tributary's receiving cell off its own path", () => {
    expect(classify(11)).toMatchObject({ kind: "riverBank", outflow: "river", distanceToMouthCells: 0 });
  });

  it("marks lake outlets", () => {
    expect(classify(15)).toMatchObject({ kind: "lakeOutlet", outflow: "offmap" });
  });

  it("finds a saved map's lake outlet from the lake's outlet river (outCell is not saved)", () => {
    const w = world();
    w.features[3] = { type: "lake", outlet: 3 };
    w.rivers[2] = { i: 3, cells: [14, 15, 13, -1] }; // starts on the lake water cell
    expect(classifyRiverSite(buildRiverSiteIndex(w), 15)?.kind).toBe("lakeOutlet");
  });

  it("finds the out cell when the outlet river shares its id with an inflow river", () => {
    const w = world();
    w.features[3] = { type: "lake", outlet: 3 };
    w.rivers[2] = { i: 3, cells: [9, 14, 15, 13, -1] }; // inflow from 9, through the lake, out at 15
    w.cells.r[9] = 3;
    const index = buildRiverSiteIndex(w);
    expect(classifyRiverSite(index, 15)?.kind).toBe("lakeOutlet");
    expect(classifyRiverSite(index, 9)?.kind).not.toBe("lakeOutlet");
  });

  it("separates riverless coast and inland cells, and skips water", () => {
    expect(classify(12)?.kind).toBe("coastNoRiver");
    expect(classify(9)?.kind).toBe("inland");
    expect(classify(7)).toBeNull();
  });

  it("classifies upstream plain cells as river bank", () => {
    expect(classify(1)).toMatchObject({ kind: "riverBank", distanceToMouthCells: 5 });
  });
});
