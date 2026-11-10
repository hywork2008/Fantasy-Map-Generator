import { describe, expect, it } from "vitest";
import { placementFootprint } from "../../../buildings/placementModels";
import { placeFreeformBuildings } from "./autoPlace";
import { commitRiver } from "./commitLedger";
import { commitPlacement } from "./commitPlacement";
import {
  captureFreeform,
  createFreeformCity,
  materializeFreeform,
  parseFreeformCity,
  serializeFreeform
} from "./freeformCity";

const footprint = placementFootprint("house:mediterranean");

function domeView(extent = 96) {
  return materializeFreeform(createFreeformCity(extent, 3, 16));
}

describe("freeform automatic placement", () => {
  it("writes houses through the placement commit and keeps them on the ledger", () => {
    expect(footprint).not.toBeNull();
    const placed = placeFreeformBuildings(domeView(), { count: 4, seed: 7 });
    expect(placed.placed).toBe(4);
    expect(placed.reason).toBeUndefined();
    const pads = placed.document.terrain?.features.filter(
      feature => feature.kind === "platform" && feature.role === "pad"
    );
    expect(pads).toHaveLength(4);
    expect(placed.document.elements.map(element => element.objectType)).toEqual([
      "house:mediterranean",
      "house:mediterranean",
      "house:mediterranean",
      "house:mediterranean"
    ]);
    const captured = captureFreeform(placed.document);
    expect(captured.freeform?.placements).toHaveLength(4);
    expect(captured.freeform?.plots).toHaveLength(4);
    const saved = parseFreeformCity(serializeFreeform(captured));
    const opened = saved ? materializeFreeform(saved) : null;
    expect(opened?.freeform?.placements).toHaveLength(4);
    expect(opened?.elements).toHaveLength(4);
  });

  it("repeats the same seed and turns with a different seed", () => {
    const first = placeFreeformBuildings(domeView(), { count: 3, seed: 10 });
    const again = placeFreeformBuildings(domeView(), { count: 3, seed: 10 });
    const other = placeFreeformBuildings(domeView(), { count: 3, seed: 100 });
    const pose = (document: typeof first.document) =>
      document.elements.map(element => ({ point: element.point, rotation: element.rotation }));
    expect(pose(again.document)).toEqual(pose(first.document));
    expect(pose(other.document).map(item => item.point)).toEqual(pose(first.document).map(item => item.point));
    expect(pose(other.document).map(item => item.rotation)).not.toEqual(
      pose(first.document).map(item => item.rotation)
    );
  });

  it("skips water and a house that is already there, then stops at the count", () => {
    const wet = commitRiver(
      domeView(),
      "river-1",
      [
        [-30, 0],
        [30, 0]
      ],
      10
    ).document;
    const around = placeFreeformBuildings(wet, { count: 4, seed: 1 });
    expect(around.placed).toBeGreaterThan(0);
    expect(around.document.elements.some(element => element.point?.[0] === 0 && element.point?.[1] === 0)).toBe(false);

    const box = footprint ?? { halfX: 4, halfZ: 6, centerX: 0, centerZ: 0, groundY: 0 };
    const manual = commitPlacement(domeView(), {
      id: "hand",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint: box
    }).document;
    const added = placeFreeformBuildings(manual, { count: 3, seed: 1 });
    expect(added.placed).toBe(2);
    expect(added.document.elements.some(element => element.id === "hand")).toBe(true);
    const full = placeFreeformBuildings(added.document, { count: 3, seed: 1 });
    expect(full.placed).toBe(0);
    expect(full.reason).toBe("full");
    expect(full.document).toBe(added.document);
  });

  it("does nothing without a freeform ledger", () => {
    const bare = { ...domeView(), freeform: undefined };
    const result = placeFreeformBuildings(bare, { count: 4, seed: 1 });
    expect(result.placed).toBe(0);
    expect(result.reason).toBe("ledger");
    expect(result.document).toBe(bare);
  });
});
