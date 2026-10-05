import { describe, expect, it } from "vitest";
import { getWorldLandProposalReport } from "../services/worldLandProposalReport";
import {
  evaluateCalibratedWorldCellLandConnections,
  evaluateCalibratedWorldLandConnections
} from "./calibratedWorldLandConnections";
import { createLandCalibrationWorldFixture } from "./fixtures/landConnectionCalibrationWorld";
import { measureLandProposalSearches } from "./landConnectionBudgets";
import { LAND_CONNECTION_CALIBRATION_PROFILES } from "./landConnectionCalibrationProfiles";
import { createWorldLandConnectionSession } from "./worldLandConnectionAdoption";

function fixture() {
  const f = createLandCalibrationWorldFixture();
  f.input.settings.sharedSelection = { maxGroups: 3, maxPairsPerGroup: 3, maxFacilitiesPerGroup: 2, maxChecks: 10000 };
  f.input.settings.maxAssessmentSearches = 200;
  f.input.settings.individual.maxConstructionCostMeters = 1000;
  f.input.settings.shared.maxConstructionCostMeters = 1000;
  const measurements = measureLandProposalSearches(f.run().diagnostics);
  const input = {
    ...f.input,
    cityIds: [1, 2, 3],
    calibration: LAND_CONNECTION_CALIBRATION_PROFILES.balanced,
    nearby: {
      maxCities: 10,
      maxNeighbourChecks: 100,
      maxNeighboursPerCity: 2,
      maxPairs: 3,
      radiusMeters: 100,
      firstPairId: 0
    },
    measurements,
    budgetPolicy: {
      headroom: 2,
      minimum: { networkLabels: 16, networkExpansions: 16, approachLabels: 64, approachExpansions: 32 },
      ceiling: { networkLabels: 10000, networkExpansions: 10000, approachLabels: 10000, approachExpansions: 10000 },
      maxAssessmentSearches: 200
    }
  };
  const run = () => evaluateCalibratedWorldLandConnections(f.world, "km", input);
  return { ...f, input, run };
}
describe("calibrated world selection and group adoption", () => {
  it("uses current world-owned water/cell contracts for calibrated adoption and rejects a new lake at commit", () => {
    const f = fixture();
    f.world.pack.cells.i = new Uint16Array([0, 1, 2, 3, 4, 5]);
    f.world.pack.cells.state = new Uint16Array(6);
    f.world.pack.cells.v = Array.from({ length: 6 }, (_, i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]);
    f.world.pack.vertices = {
      p: Array.from({ length: 6 }, (_, i) => [
        [(i * 100) / 6, 0],
        [((i + 1) * 100) / 6, 0],
        [((i + 1) * 100) / 6, 100],
        [(i * 100) / 6, 100]
      ]).flat()
    } as typeof f.world.pack.vertices;
    const input = {
      ...f.input,
      cellPolicySettings: { maxCells: 10, maxVertices: 100, maxClipOperations: 10000, maxRemainingPieces: 100 },
      cellRules: { allowsCell: () => true, supportsCell: () => true }
    };
    const evaluate = () => evaluateCalibratedWorldCellLandConnections(f.world, "km", input);
    const result = evaluate();
    expect(result.status).toBe("evaluated");
    const created = createWorldLandConnectionSession(() => evaluate().proposal!);
    if (!("session" in created)) throw Error(created.reason);
    const prepared = created.session.prepare(0, { kind: "shared", groupId: 0 });
    if (!("draft" in prepared)) throw Error(prepared.reason);
    f.world.pack.cells.h[2] = 10;
    expect(created.session.commit(prepared.draft).status).toBe("unresolved");
    expect(created.session.snapshot.revision).toBe(0);
  });
  it("retries only related rejected groups after adoption and obeys the retry limit", () => {
    const f = fixture();
    f.input.settings.shared.maxConstructionCostMeters = 100;
    const created = createWorldLandConnectionSession(() => f.run().proposal!);
    if (!("session" in created)) throw new Error("session failed");
    const result = created.session.adoptPrioritized({
      maxSelections: 10,
      maxCurrentEvaluations: 20,
      maxRelatedReevaluations: 1
    });
    expect(result.status).toBe("completed");
    expect(result.relatedReevaluations).toBe(1);
    expect(result.decisions.filter(d => d.selection.kind === "shared")).toHaveLength(2);
    expect(result.decisions[0]).toMatchObject({ selection: { kind: "shared", groupId: 0 }, status: "rejected" });
    expect(result.decisions.some(d => d.status === "committed")).toBe(true);
    expect(created.session.snapshot.facilityIds).toEqual([100]);
  });

  it("adopts higher-priority shared packages within explicit selection/current-evaluation budgets", () => {
    const f = fixture();
    let calls = 0;
    const created = createWorldLandConnectionSession(() => {
      calls++;
      return f.run().proposal!;
    });
    if (!("session" in created)) throw new Error("session failed");
    const before = calls;
    const report = created.session.adoptPrioritized({
      maxSelections: 1,
      maxCurrentEvaluations: 3,
      maxRelatedReevaluations: 0
    });
    expect(report).toMatchObject({
      status: "budget",
      selections: 1,
      currentEvaluations: 3,
      decisions: [{ selection: { kind: "shared", groupId: 0 }, status: "committed" }]
    });
    expect(calls - before).toBe(3);
    expect(created.session.snapshot.facilityIds).toEqual([100]);
    expect(created.session.snapshot.revision).toBe(1);
    const noWork = created.session.adoptPrioritized({
      maxSelections: 1,
      maxCurrentEvaluations: 1,
      maxRelatedReevaluations: 0
    });
    expect(noWork).toMatchObject({ status: "budget", selections: 0, currentEvaluations: 1 });
    expect(created.session.snapshot.revision).toBe(1);
  });

  it("selects finite prioritized pairs, tunes budgets, pays one shared bridge and reports adoption", () => {
    const f = fixture(),
      before = structuredClone(f.world);
    const result = f.run();
    expect(result.status).toBe("evaluated");
    if (result.status !== "evaluated") return;
    expect(result.selection.pairs.map(p => [p.cityAId, p.cityBId])).toEqual([
      [1, 3],
      [2, 3],
      [1, 2]
    ]);
    expect(result.proposal.diagnostics.sharedGroups?.[0]).toMatchObject({
      group: { pairIds: [1, 2], facilityIds: [100] },
      assessment: { status: "proposed", newFacilityIds: [100] }
    });
    expect(result.budget.ceilingLimited).toBe(false);
    expect(result.budget.settings.approaches.corridor.maxLabels).toBeLessThan(10000);
    const created = createWorldLandConnectionSession(() => f.run().proposal!);
    expect("session" in created).toBe(true);
    if (!("session" in created)) return;
    expect(created.session.prepare(0, { kind: "shared" })).toMatchObject({ reason: "unknown-shared-group" });
    const prepared = created.session.prepare(0, { kind: "shared", groupId: 0 });
    expect("draft" in prepared).toBe(true);
    if (!("draft" in prepared)) return;
    expect(created.session.commit(prepared.draft)).toMatchObject({
      status: "committed",
      snapshot: { facilityIds: [100] }
    });
    expect(getWorldLandProposalReport(f.world)?.explanations.find(p => p.key === "shared:0")?.status).toBe("adopted");
    expect(f.world).toEqual(before);
  });
  it("distinguishes capped work from unreachable geometry and does not certify partial groups", () => {
    const f = fixture();
    f.input.budgetPolicy.maxAssessmentSearches = 1;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "assessment-budget" });
    f.input.budgetPolicy.maxAssessmentSearches = 200;
    f.input.settings.sharedSelection!.maxChecks = 1;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "assessment-budget" });
  });
  it("rejects a changed group valuation at commit without publishing a partial package", () => {
    const f = fixture();
    const created = createWorldLandConnectionSession(() => f.run().proposal!);
    if (!("session" in created)) throw new Error("session failed");
    const prepared = created.session.prepare(0, { kind: "shared", groupId: 0 });
    if (!("draft" in prepared)) throw new Error("preparation failed");
    f.input.calibration = { ...f.input.calibration, approachCostPerSquareMeter: 10 };
    expect(created.session.commit(prepared.draft).status).toBe("unresolved");
    expect(created.session.snapshot.revision).toBe(0);
    expect(created.session.snapshot.facilityIds).toEqual([]);
    expect(getWorldLandProposalReport(f.world)?.explanations.every(p => p.status !== "adopted")).toBe(true);
  });
});
