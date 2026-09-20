import { describe, expect, it } from "vitest";
import type { Face, Point } from "../types";
import { buildCirculadeBlocks } from "./circuladeFabric";
import type { BlockBoundary } from "./perimeterBlocks";

describe("buildCirculadeBlocks", () => {
  const dummyFace: Face = {
    id: "f1",
    boundary: [],
    properties: {
      water: "land",
      buildable: true,
      locked: false,
      ward: "craftsmen"
    }
  };

  const ringOutline: Point[] = [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80]
  ];

  const boundaries: BlockBoundary[] = ringOutline.map((p, i) => ({
    a: p,
    b: ringOutline[(i + 1) % ringOutline.length],
    setback: 2,
    feature: true
  }));

  it("produces concentric blocks and buildings within face outline", () => {
    const fabric = buildCirculadeBlocks(dummyFace, ringOutline, boundaries, undefined, "test-seed", true, [0, 0]);
    expect(fabric.blocks.length).toBeGreaterThan(0);
    expect(fabric.buildings.length).toBeGreaterThan(0);
  });
});
