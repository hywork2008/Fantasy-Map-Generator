import { describe, expect, it } from "vitest";
import { regionArea } from "../geometry/regions";
import { syntheticVectorInput } from "./input";
import { perimeterJobs, planVectorPerimeter } from "./perimeter";
import { DEFAULT_VECTOR_GENERATION, deriveVectorBlocks, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN } from "./urban";

describe("vector perimeter districts", () => {
  it("keeps each district's houses when the other districts change order", () => {
    const doc = generateVectorSkeleton(syntheticVectorInput("district-ids", 150, true), {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 4,
      wall: "ellipse"
    }).document;
    const blocks = deriveVectorBlocks(doc);
    expect(blocks.length).toBeGreaterThan(1);
    const housesByDistrict = (order: typeof blocks) => {
      const plan = planVectorPerimeter(structuredClone(doc), order, DEFAULT_VECTOR_URBAN);
      const map = new Map<string, string[]>();
      for (const house of plan.houses)
        map.set(house.districtId, [...(map.get(house.districtId) ?? []), JSON.stringify(house.polygon)]);
      return new Map([...map].map(([id, houses]) => [id, houses.sort()]));
    };
    const forward = housesByDistrict(blocks),
      reversed = housesByDistrict(blocks.slice().reverse());
    expect(forward.size).toBeGreaterThan(1);
    expect([...forward.keys()].every(id => id.startsWith("district:"))).toBe(true);
    expect(reversed).toEqual(forward);
  });
  it("plans a block with a hole (a free-standing precinct) as districts around it, never leaves it empty", () => {
    const doc = generateVectorSkeleton(syntheticVectorInput("district-ids", 150, true), {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 4,
      wall: "ellipse"
    }).document;
    const block = deriveVectorBlocks(doc).sort((a, b) => b.areaMeters2 - a.areaMeters2)[0],
      [cx, cy] = block.outer.reduce(
        (c, p) => [c[0] + p[0] / block.outer.length, c[1] + p[1] / block.outer.length],
        [0, 0]
      ),
      hole: [number, number][] = [
        [cx - 5, cy - 5],
        [cx - 5, cy + 5],
        [cx + 5, cy + 5],
        [cx + 5, cy - 5]
      ],
      holed = { ...block, holes: [hole], areaMeters2: block.areaMeters2 - 100 };
    const { jobs } = perimeterJobs(doc, [holed], DEFAULT_VECTOR_URBAN);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    // No outline vertex lies inside the precinct (to the centimetre the record keeps).
    const area = jobs.reduce((n, j) => n + regionArea({ outer: j.outline, holes: [] }), 0);
    expect(area).toBeGreaterThan(holed.areaMeters2 * 0.95);
    expect(
      jobs.every(j => !j.outline.some(p => p[0] > cx - 4.9 && p[0] < cx + 4.9 && p[1] > cy - 4.9 && p[1] < cy + 4.9))
    ).toBe(true);
  });
});
