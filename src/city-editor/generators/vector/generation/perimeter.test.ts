import { describe, expect, it } from "vitest";
import { syntheticVectorInput } from "./input";
import { planVectorPerimeter } from "./perimeter";
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
        map.set(house.district, [...(map.get(house.district) ?? []), JSON.stringify(house.polygon)]);
      return new Map([...map].map(([id, houses]) => [id, houses.sort()]));
    };
    const forward = housesByDistrict(blocks),
      reversed = housesByDistrict(blocks.slice().reverse());
    expect(forward.size).toBeGreaterThan(1);
    expect([...forward.keys()].every(id => id.startsWith("district:"))).toBe(true);
    expect(reversed).toEqual(forward);
  });
});
