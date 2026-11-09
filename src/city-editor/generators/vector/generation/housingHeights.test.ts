import { describe, expect, it } from "vitest";
import { residentialStoreys } from "../../../../utils/urbanMorphology";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseCount } from "../fabric/pack";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { perimeterHouseDwellings } from "./urbanCapacity";

const frame = { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 };
function city(extra: Partial<ReturnType<typeof defaultGenerationSettings>> = {}) {
  const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(3000),
      historicalPeriod: "lateMedieval" as const,
      buildingPattern: "medieval" as const,
      ...extra
    },
    seed = "p3b-heights",
    input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 });
  return generateVectorUrban(
    generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
    { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
  );
}
const storeysOf = (doc: ReturnType<typeof city>) =>
  Object.values(doc.fabric!.cells).flatMap(c => c.houses.storeys.slice(0, cellHouseCount(c)));

describe("meshless house heights by the mesh editor's rules (feature parity P3b)", () => {
  it("varies storeys by the period weights, keeps capacity consistent and houses everyone", () => {
    const doc = city(),
      storeys = storeysOf(doc),
      counts = new Map<number, number>();
    for (const n of storeys) counts.set(n, (counts.get(n) ?? 0) + 1);
    // Late medieval weights reach four storeys; outside the wall houses stay at one or two.
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(Math.max(...storeys)).toBeLessThanOrEqual(residentialStoreys("lateMedieval").maximum);
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
    let total = 0;
    for (const c of Object.values(doc.fabric!.cells)) total += c.houses.dwellings.reduce((n, d) => n + d, 0);
    expect(total).toBe(doc.urban!.report.capacityDwellings);
    // 3D floors follow the stored storeys, with the per-house height variation, and every house has a culture.
    const houses = vectorRenderData(doc, "housing").surfaces.flatMap(s => (s.houses?.massing ? [s.houses] : []));
    const massing = houses.flatMap(h => h.massing!),
      appearance = houses.flatMap(h => h.appearance!);
    expect(massing.length).toBe(storeys.length);
    expect(new Set(massing.map(m => m.floors[0].heightMeters.toFixed(3))).size).toBeGreaterThan(10);
    expect(appearance.every(a => a && a.profileId !== "legacy")).toBe(true);
  });

  it("keeps the standard storeys without the policy and caps them by the height limit", () => {
    const uniform = storeysOf(city({ buildingHeightPolicy: undefined }));
    expect(new Set(uniform)).toEqual(new Set([residentialStoreys("lateMedieval").standard]));
    const capped = city({ buildingHeightLimit: { maxStoreys: 2 } });
    expect(Math.max(...storeysOf(capped))).toBe(2);
    expect(capped.urban!.report.unplacedPopulation).toBe(0);
    const metres = storeysOf(city({ buildingHeightLimit: { maxHeightMeters: 7 } }));
    // Two floors are 3.2 + 2.9 m with ±5% variation; a third never fits under 7 m.
    expect(Math.max(...metres)).toBe(2);
    expect(perimeterHouseDwellings(100, 2)).toBeGreaterThan(0);
  });
});
