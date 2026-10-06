import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { harvestForestStock, initializeForestStock, regrowForestStock } from "./forestStock";
import {
  beginInitialLandUse,
  commitLandUsePlan,
  getMaintainedForestConversion,
  initializeSettlementLandUse,
  isInitialLandUsePending
} from "./landUse";
import {
  type ClearanceCellInput,
  calculateBuiltAreaHa,
  planSettlementLandUse,
  requiredFieldAreaHectares,
  resolveLandUseProfile
} from "./settlementClearance";

const cell = (changes: Partial<ClearanceCellInput> = {}): ClearanceCellInput => ({
  id: 1,
  anchor: [10, 10],
  physicalLandAreaHa: 100,
  forestCover: 0.7,
  ruralPeople: 20,
  urbanPeople: 0,
  cultivableAreaHa: 80,
  yieldKgPerSownHa: 450,
  ...changes
});
const plan = (inputs = [cell()], previous?: ReturnType<typeof planSettlementLandUse>, annual = false, year = 100) =>
  planSettlementLandUse(inputs, { seed: "world", year, previous, annual });
const world = () =>
  ({
    seed: "world",
    pack: {
      cells: {
        i: new Uint16Array([0, 1]),
        forestCover: new Float32Array([0, 0.7]),
        forestStock: new Float32Array([0, 0.7]),
        landCover: new Uint8Array(2)
      }
    }
  }) as unknown as WorldContext;
describe("shared settlement land use", () => {
  it("halves required rotation area at doubled yield, independently of allocation", () => {
    expect(requiredFieldAreaHectares(100, 900)).toBe(requiredFieldAreaHectares(100, 450) / 2);
    const p = plan([cell({ ruralPeople: 1000, cultivableAreaHa: 5 })]).cells[1];
    expect(p.allocatedAreaHa).toBe(5);
    expect(p.unallocatedAreaHa).toBeGreaterThan(900);
  });
  it("keeps unavailable food demand rather than inventing productive land", () => {
    const p = plan([cell({ yieldKgPerSownHa: 0 })]).cells[1];
    expect(p.allocatedAreaHa).toBe(0);
    expect(p.unresolvedFoodPeople).toBe(20);
    expect(p.diagnostics).toContain("staple-production-unavailable");
  });
  it("uses rural people without a burg and records labour deficits under the retained policy", () => {
    const p = plan([cell({ laborAffordableAreaHa: 1 })]).cells[1];
    expect(p.allocatedAreaHa).toBeGreaterThan(20);
    expect(p.maintenanceShortfallHa).toBeGreaterThan(19);
    expect(p.patches.some(p => p.kind === "cultivation")).toBe(true);
  });
  it("partitions land and never converts naturally open fields or treats logging as cropland", () => {
    const p = plan([cell({ forestCover: 0 })]).cells[1];
    expect(p.convertedForestAreaHa).toBe(0);
    expect(p.patches.reduce((s, p) => s + p.areaHa, 0)).toBeCloseTo(100, 8);
    const w = world();
    const snapshot = plan();
    commitLandUsePlan(w, snapshot);
    const fields = JSON.stringify(w.pack.landUse);
    harvestForestStock(w.pack.cells, 1, 0.1);
    expect(JSON.stringify(w.pack.landUse)).toBe(fields);
  });
  it("initializes stock first, applies a revision only once and preserves logging on later revisions", () => {
    const w = world();
    initializeForestStock(w.pack.cells);
    const initial = plan([cell({ ruralPeople: 60 })]);
    commitLandUsePlan(w, initial);
    const stock = w.pack.cells.forestStock![1];
    expect(stock).toBeCloseTo(0.7 - initial.cells[1].convertedForestAreaHa / 100, 6);
    expect(commitLandUsePlan(w, initial)).toBe(false);
    expect(w.pack.cells.forestStock![1]).toBe(stock);
    harvestForestStock(w.pack.cells, 1, 0.03);
    const logged = w.pack.cells.forestStock![1];
    commitLandUsePlan(w, plan([cell({ ruralPeople: 60 })], initial));
    expect(w.pack.cells.forestStock![1]).toBe(logged);
  });
  it("protects only forest intersections and recovers abandoned ground gradually", () => {
    const initial = plan([cell({ ruralPeople: 60 })]);
    const next = plan([cell({ ruralPeople: 0, newClearanceAreaHa: 1 })], initial, true, 101);
    const later = plan([cell({ ruralPeople: 0, newClearanceAreaHa: 1 })], next, true, 102);
    expect(next.cells[1].patches.some(p => p.kind === "abandoned")).toBe(true);
    expect(later.cells[1].convertedForestAreaHa).toBeLessThan(next.cells[1].convertedForestAreaHa);
    expect(getMaintainedForestConversion(next, 1)).toBe(0);
    const w = world();
    commitLandUsePlan(w, initial);
    harvestForestStock(w.pack.cells, 1, 1);
    regrowForestStock(w.pack.cells, 1, 100, getMaintainedForestConversion(initial, 1));
    expect(w.pack.cells.forestStock![1]).toBeCloseTo(0.7 - initial.cells[1].convertedForestAreaHa / 100, 6);
  });
  it("caps annual expansion separately from maintenance and permits established initial fields", () => {
    const first = plan([cell({ ruralPeople: 2 })]);
    const next = plan([cell({ ruralPeople: 200, newClearanceAreaHa: 2 })], first, true, 101);
    expect(next.cells[1].allocatedAreaHa).toBeCloseTo(first.cells[1].allocatedAreaHa + 2);
  });
  it("allocates a shared supplier proportionally and independently of input order", () => {
    const inputs = [
      cell({ id: 1, cultivableAreaHa: 0, neighbors: [3] }),
      cell({ id: 2, cultivableAreaHa: 0, neighbors: [3] }),
      cell({ id: 3, ruralPeople: 0, cultivableAreaHa: 10 })
    ];
    const a = plan(inputs),
      b = plan([...inputs].reverse());
    expect(a).toEqual(b);
    expect(a.cells[3].allocatedAreaHa).toBe(10);
    expect(a.cells[1].unallocatedAreaHa).toBeCloseTo(a.cells[2].unallocatedAreaHa);
    expect(a.cells[3].patches.find(p => p.kind === "cultivation")!.supplierIds).toEqual(["cell:1", "cell:2"]);
  });
  it("excludes duplicate megacity food demand while keeping its built footprint", () => {
    const p = plan([cell({ ruralPeople: 0, urbanPeople: 100, includeUrbanFoodDemand: false })]).cells[1];
    expect(p.requiredAreaHa).toBe(0);
    expect(p.patches.find(p => p.kind === "built")!.areaHa).toBe(2);
  });
  it("keeps embedded food unresolved and honours profile precedence", () => {
    expect(resolveLandUseProfile({ raceKey: "elf", fantasy: true })).toBe("embedded");
    expect(resolveLandUseProfile({ raceKey: "dark_elf", fantasy: true, explicit: "port" })).toBe("port");
    expect(resolveLandUseProfile({ raceKey: "elf", fantasy: true, cultural: "forestry" })).toBe("forestry");
    const p = plan([cell({ ruralPeople: 0, urbanPeople: 100, profile: "embedded" })]).cells[1];
    expect(p.unresolvedFoodPeople).toBe(100);
    expect(p.allocatedAreaHa).toBe(0);
    expect(p.patches[0].areaHa).toBe(0.5);
  });
  it("uses real people for built area independent of population-point conversion", () => {
    expect(calculateBuiltAreaHa(2 * 100 * 3)).toBe(calculateBuiltAreaHa(6 * 100 * 1));
  });
});

it("accounts for the supplying cell's yield when assigning food to adjacent land", () => {
  const result = plan([
    cell({ id: 1, cultivableAreaHa: 0, neighbors: [2] }),
    cell({ id: 2, ruralPeople: 0, yieldKgPerSownHa: 900, cultivableAreaHa: 100 })
  ]);
  expect(result.cells[1].unallocatedAreaHa).toBeCloseTo(0, 8);
  expect(result.cells[2].allocatedAreaHa).toBeCloseTo(requiredFieldAreaHectares(20, 900) * 1.1, 8);
});

it("does not run the OFF fallback after the prepared economy has published the initial revision", () => {
  const w = world();
  beginInitialLandUse(w);
  expect(isInitialLandUsePending(w)).toBe(true);
  initializeForestStock(w.pack.cells);
  commitLandUsePlan(w, plan([cell({ ruralPeople: 60 })]));
  const stock = w.pack.cells.forestStock!.slice(),
    revision = w.pack.landUse!.revision;
  initializeSettlementLandUse(w, 100);
  expect(w.pack.landUse!.revision).toBe(revision);
  expect(w.pack.cells.forestStock).toEqual(stock);
  expect(isInitialLandUsePending(w)).toBe(false);
});
