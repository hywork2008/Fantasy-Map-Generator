import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { assertValidLandUseSnapshot } from "../types/landUse";
import { commitLandUsePlan, deliverConversionTimber, recordManagedHarvest } from "./landUse";
import { clearanceLabor, managedHarvestAllowance, newlyConvertedForest, recoveryYears } from "./landUseActivities";
import { clipConvex, polygonArea } from "./landUseGeometry";
import { type ClearanceCellInput, planSettlementLandUse } from "./settlementClearance";

const input = (changes: Partial<ClearanceCellInput> = {}): ClearanceCellInput => ({
  id: 0,
  anchor: [5, 5],
  physicalLandAreaHa: 100,
  forestCover: 0.8,
  ruralPeople: 10,
  urbanPeople: 0,
  cultivableAreaHa: 80,
  yieldKgPerSownHa: 450,
  ...changes
});
const plan = (inputs: ClearanceCellInput[], year = 100, previous?: ReturnType<typeof planSettlementLandUse>) =>
  planSettlementLandUse(inputs, { seed: "activities", year, previous, annual: !!previous });
describe("resolved land-use activities", () => {
  it("measures actual intersections and partitions the world geometry", () => {
    const p = plan([
      input({
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ],
        ruralPeople: 60
      })
    ]);
    const cell = p.cells[0];
    assertValidLandUseSnapshot(p, 1);
    for (const patch of cell.patches) {
      expect(patch.polygons?.reduce((s, p) => s + polygonArea(p), 0)).toBeCloseTo(patch.areaHa, 6);
      if (patch.kind === "cultivation")
        expect(patch.convertedForestAreaHa).toBeCloseTo(
          patch.polygons!.reduce(
            (s, p) => s + cell.forestPolygons!.reduce((t, f) => t + polygonArea(clipConvex(p, f)), 0),
            0
          ),
          6
        );
    }
    expect(cell.diagnostics).not.toContain("estimated-spatial-forest-intersection");
    const polygons = cell.patches.flatMap(p => p.polygons ?? []);
    for (let i = 0; i < polygons.length; i++)
      for (let j = i + 1; j < polygons.length; j++)
        expect(polygonArea(clipConvex(polygons[i], polygons[j]))).toBeLessThan(1e-6);
    expect(
      plan([
        input({
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ],
          ruralPeople: 60
        })
      ])
    ).toEqual(p);
  });
  it("separates dedicated clearance from maintenance and other work", () => {
    const i = input({
      workforce: {
        adultPeople: 10,
        workableDays: 100,
        maintenanceDaysPerHa: 10,
        otherOccupationDays: 900,
        clearanceShare: 0.2,
        clearanceDaysPerHa: 100
      }
    });
    expect(clearanceLabor(i)).toBe(1);
    const prev = plan([input({ ruralPeople: 50 })]);
    expect(clearanceLabor(i, prev.cells[0])).toBe(0);
    expect(recoveryYears(0, 70)).toBeGreaterThan(recoveryYears(25, 80));
  });
  it("reserves disjoint livestock areas and credits fodder/fallow once", () => {
    const p = plan([
      input({
        livestock: {
          grazingAreaHa: 30,
          hayAreaHa: 5,
          woodPastureHa: 8,
          grazedFallowHa: 1000,
          fodderWithinFieldsHa: 1000
        }
      })
    ]);
    const c = p.cells[0];
    const grazing = c.patches
      .filter(p => ["pasture", "wood_pasture"].includes(p.kind))
      .reduce((s, p) => s + p.areaHa, 0);
    expect(grazing).toBeCloseTo(30 - c.allocatedAreaHa);
    expect(c.patches.find(p => p.kind === "hay_meadow")?.areaHa).toBe(5);
    assertValidLandUseSnapshot(p, 1);
  });
  it("advances shifting fallow cycles and preserves productive active area", () => {
    const initial = plan([
      input({
        profile: "shifting",
        forestCover: 1,
        ruralPeople: 3,
        shiftingCycleYears: 6,
        shiftingActiveYears: 2,
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ]
      })
    ]);
    const next = plan(
      [
        input({
          profile: "shifting",
          forestCover: 1,
          ruralPeople: 3,
          shiftingCycleYears: 6,
          shiftingActiveYears: 2,
          newClearanceAreaHa: 0,
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ]
        })
      ],
      102,
      initial
    );
    const field = next.cells[0].patches.find(p => p.kind === "cultivation")!;
    expect(field.rotation?.phase).toBe(2);
    expect(next.cells[0].patches.find(p => p.kind === "agroforestry")?.areaHa).toBeCloseTo(field.areaHa * 2);
    expect(newlyConvertedForest(next.cells[0], initial.cells[0])).toBeGreaterThan(0);
    expect(field.polygons).not.toEqual(initial.cells[0].patches.find(p => p.kind === "cultivation")?.polygons);
    assertValidLandUseSnapshot(next, 1);
  });
  it("uses multi-hop transport and blocks protected and unauthorized private supply", () => {
    const a = input({ cultivableAreaHa: 0, access: [{ cellId: 1, cost: 2 }], maxTransportCost: 5 });
    const b = input({ id: 1, ruralPeople: 0, cultivableAreaHa: 0, access: [{ cellId: 2, cost: 2 }] });
    const c = input({ id: 2, ruralPeople: 0, access: [] });
    const p = plan([a, b, c]);
    expect(p.cells[2].allocatedAreaHa).toBeGreaterThan(0);
    expect(p.cells[2].transportAllocations?.[0].transportCost).toBe(4);
    expect(plan([a, b, { ...c, tenure: "protected" }]).cells[2].allocatedAreaHa).toBe(0);
    expect(plan([a, b, { ...c, tenure: "private", ownerId: 3 }]).cells[2].allocatedAreaHa).toBe(0);
    expect(plan([a, b, c])).toEqual(plan([c, b, a]));
  });
  it("supplies an unproductive port from productive distant cells without erasing demand", () => {
    const p = plan([
      input({
        profile: "port",
        urbanPeople: 100,
        ruralPeople: 0,
        yieldKgPerSownHa: 0,
        cultivableAreaHa: 0,
        access: [{ cellId: 1, cost: 2 }]
      }),
      input({ id: 1, ruralPeople: 0, access: [], cultivableAreaHa: 1000, physicalLandAreaHa: 1000 })
    ]);
    expect(p.cells[0].foodDemandPeople).toBe(100);
    expect(p.cells[0].allocatedAreaHa).toBe(0);
    expect(p.cells[0].unallocatedAreaHa).toBeCloseTo(0);
    expect(p.cells[1].allocatedAreaHa).toBeGreaterThan(100);
    expect(p.cells[1].transportAllocations?.[0].demandCellId).toBe(0);
  });
  it("caps managed harvest by rotating compartments and saves repeated harvests", () => {
    const p = plan([input({ ruralPeople: 0, managedForestAreaHa: 50, forestRotationYears: 10 })]);
    const world = { pack: { landUse: p } } as WorldContext;
    expect(managedHarvestAllowance(p, 0, 100)).toBeCloseTo(0.05);
    recordManagedHarvest(world, 0, 100, 0.03);
    expect(managedHarvestAllowance(p, 0, 100)).toBeCloseTo(0.02);
    recordManagedHarvest(world, 0, 100, 0.02);
    expect(managedHarvestAllowance(p, 0, 100)).toBeCloseTo(0);
    expect(managedHarvestAllowance(p, 0, 101)).toBeCloseTo(0.05);
    const next = plan([input({ ruralPeople: 0, managedForestAreaHa: 50, forestRotationYears: 10 })], 101, p);
    expect(next.cells[0].patches.find(p => p.kind === "managed_forest")?.management?.lastHarvestYear).toBe(100);
  });
  it("adopts geometry for an existing ledger without reharvesting historical fields", () => {
    const initial = plan([input({ ruralPeople: 50, forestCover: 1 })]);
    const migrated = plan(
      [
        input({
          ruralPeople: 50,
          forestCover: 1,
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ]
        })
      ],
      101,
      initial
    );
    expect(newlyConvertedForest(migrated.cells[0], initial.cells[0])).toBeCloseTo(0);
    expect(migrated.cells[0].diagnostics).toContain("legacy-geometry-baseline-preserved");
  });
  it("creates no historical wood, queues actual annual wood and acknowledges once", () => {
    const world = {
      pack: {
        cells: { i: new Uint16Array([0]), forestCover: new Float32Array([1]), forestStock: new Float32Array([1]) }
      }
    } as unknown as WorldContext;
    const initial = plan([input({ ruralPeople: 2, forestCover: 1 })]);
    commitLandUsePlan(world, initial);
    expect(world.pack.landUse?.conversionTimber).toEqual([]);
    const next = plan([input({ ruralPeople: 10, forestCover: 1, newClearanceAreaHa: 30 })], 101, initial);
    commitLandUsePlan(world, next, { annual: true });
    const receipt = next.conversionTimber![0];
    expect(receipt.coverage).toBeGreaterThan(0);
    let supplied = 0;
    deliverConversionTimber(world, (_id, n) => {
      supplied += n;
      return n;
    });
    deliverConversionTimber(world, (_id, n) => {
      supplied += n;
      return n;
    });
    expect(supplied).toBe(receipt.coverage);
    const restored = JSON.parse(JSON.stringify(next));
    assertValidLandUseSnapshot(restored, 1);
    world.pack.landUse = restored;
    deliverConversionTimber(world, (_id, n) => {
      supplied += n;
      return n;
    });
    expect(supplied).toBe(receipt.coverage);
    restored.conversionTimber[0].coverage = NaN;
    expect(() => assertValidLandUseSnapshot(restored, 1)).toThrow();
  });
});
