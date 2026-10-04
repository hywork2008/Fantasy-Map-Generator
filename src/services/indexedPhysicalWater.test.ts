import { describe, expect, it } from "vitest";
import { IndexedPhysicalWater } from "./indexedPhysicalWater";
import type { RiverPoint } from "./riverGeometry";
import { footprintTouchesWater, pointInWater } from "./riverPhysicalGeometry";

const square = (x: number, y: number, r: number): RiverPoint[] => [
  [x - r, y - r],
  [x + r, y - r],
  [x + r, y + r],
  [x - r, y + r]
];
describe("indexed physical water", () => {
  it("matches exhaustive boundary, containment, holes and disjoint-ring checks", () => {
    const waters = [
      { id: 1, rings: [square(0, 0, 10)] },
      { id: 2, rings: [square(0, 0, 10), square(0, 0, 4)] },
      { id: 3, rings: [square(-20, 0, 10), square(20, 0, 10)] }
    ];
    for (const water of waters) {
      const index = new IndexedPhysicalWater(water);
      for (let x = -35; x <= 35; x += 2.5)
        for (let y = -15; y <= 15; y += 2.5) {
          expect(index.contains([x, y])).toBe(pointInWater([x, y], water));
          for (const radius of [1, 4, 30])
            expect(index.touches(square(x, y, radius))).toBe(footprintTouchesWater(square(x, y, radius), water));
        }
    }
  });
  it("does not scan a long vertical river for a local footprint", () => {
    const left: RiverPoint[] = Array.from({ length: 10000 }, (_, i) => [-10, i * 10]);
    const right: RiverPoint[] = left.map(p => [10, p[1]] as RiverPoint).reverse();
    const index = new IndexedPhysicalWater({ id: 1, rings: [[...left, ...right]] });
    expect(index.touches(square(25, 50000, 5))).toBe(false);
    expect(index.touches(square(10, 50000, 1))).toBe(true);
    expect(index.visitedEdges).toBeLessThan(200);
  });
  it("owns its snapshot of mutable legacy input", () => {
    const ring = square(0, 0, 10);
    const index = new IndexedPhysicalWater({ id: 1, rings: [ring] });
    ring[0][0] = 1000;
    expect(index.contains([0, 0])).toBe(true);
  });
});
