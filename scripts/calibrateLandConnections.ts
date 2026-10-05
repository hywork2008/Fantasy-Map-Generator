#!/usr/bin/env tsx
/** Reproducible stage-5 trial coefficients and operation-budget comparison.
 * node --import tsx scripts/calibrateLandConnections.ts --archive <map.fmg> --output <report.json>
 * Archive runs measure actual food/climate city selection and cost probes only:
 * incomplete world water/support contracts cannot certify bridge adoption.
 * Synthetic runs evaluate complete physical crossings and shared adoption.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { evaluateCalibratedWorldLandConnections } from "../src/generators/calibratedWorldLandConnections";
import { createLandCalibrationWorldFixture } from "../src/generators/fixtures/landConnectionCalibrationWorld";
import { measureLandProposalSearches, tuneLandConnectionBudgets, type LandSearchMeasurements } from "../src/generators/landConnectionBudgets";
import { calibrateBridgeCosts } from "../src/generators/landConnectionCalibration";
import { LAND_CONNECTION_CALIBRATION_PROFILES } from "../src/generators/landConnectionCalibrationProfiles";
import { selectNearbyWorldConnectionPairs } from "../src/generators/landConnectionSelection";
import { createWorldLandConnectionSession } from "../src/generators/worldLandConnectionAdoption";
import { bindSimulationCellColumns } from "../src/runtime/simulationCellColumns";
import { ChunkedWorldCodecAdapter } from "../src/runtime/worldArchive";
import { WorldRiverGeometryRegistry } from "../src/services/worldRiverGeometry";

async function main() {
  const archives: string[] = [];
  let output: string | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i], value = process.argv[++i];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--archive") archives.push(value);
    else if (flag === "--output") output = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!output) throw new Error("--output is required");
  const started = performance.now();
  const fixtureRuns: unknown[] = [];
  let peaks: LandSearchMeasurements = { networkLabels: 0, networkExpansions: 0, approachLabels: 0, approachExpansions: 0 };
  const fixture = createLandCalibrationWorldFixture();
  fixture.input.settings.sharedSelection = { maxGroups: 4, maxPairsPerGroup: 3, maxFacilitiesPerGroup: 2, maxChecks: 10000 };
  fixture.input.settings.maxAssessmentSearches = 200;
  const policy = { headroom: 2,
    minimum: { networkLabels: 16, networkExpansions: 16, approachLabels: 64, approachExpansions: 32 },
    ceiling: { networkLabels: 10000, networkExpansions: 10000, approachLabels: 10000, approachExpansions: 10000 },
    maxAssessmentSearches: 200 };
  // Initial measurement preserves the explicitly supplied broad fixture budgets.
  const initial = fixture.run();
  peaks = measureLandProposalSearches(initial.diagnostics);
  for (const [name, calibration] of Object.entries(LAND_CONNECTION_CALIBRATION_PROFILES)) {
    const f = createLandCalibrationWorldFixture();
    f.input.settings.sharedSelection = fixture.input.settings.sharedSelection;
    f.input.settings.individual.maxConstructionCostMeters = 1000;
    f.input.settings.shared.maxConstructionCostMeters = 1000;
    const evaluate = () => evaluateCalibratedWorldLandConnections(f.world, "km", {
      ...f.input, cityIds: [1, 2, 3],
      nearby: { maxCities: 10, maxNeighbourChecks: 100, maxNeighboursPerCity: 2,
        maxPairs: 3, radiusMeters: 100, firstPairId: 0 },
      calibration, measurements: peaks, budgetPolicy: policy
    });
    const t = performance.now(), result = evaluate();
    const proposal = result.proposal;
    const adoption: unknown[] = [];
    if (result.status === "evaluated" && proposal?.status === "evaluated") {
      const session = createWorldLandConnectionSession(() => {
        const current = evaluate();
        if (!current.proposal) throw new Error(current.status);
        return current.proposal;
      });
      if ("session" in session) for (const entry of proposal.diagnostics.sharedGroups ?? []) {
        if (entry.assessment.status !== "proposed") continue;
        const prepared = session.session.prepare(session.session.snapshot.revision, { kind: "shared", groupId: entry.group.id });
        const committed = "draft" in prepared ? session.session.commit(prepared.draft) : prepared;
        adoption.push({ groupId: entry.group.id, status: committed.status,
          ...(committed.status === "committed" ? { facilityIds: committed.snapshot.facilityIds } : { reason: committed.reason }) });
        break;
      }
    }
    fixtureRuns.push({ profile: name, status: result.status, wallMs: performance.now() - t,
      ...(result.status === "unresolved" ? { reason: result.reason } : { budget: result.budget }),
      measurements: proposal ? measureLandProposalSearches(proposal.diagnostics) : null,
      individual: proposal?.diagnostics.individuals.map(p => ({ pairId: p.pairId, status: p.assessment.status,
        ...( "reason" in p.assessment ? { reason: p.assessment.reason } : {}) })),
      shared: proposal?.diagnostics.sharedGroups?.map(g => ({ group: g.group, status: g.assessment.status,
        ...(g.assessment.status === "proposed" ? { investmentMeters: g.assessment.investmentMeters,
          netBenefitMeters: g.assessment.netBenefitMeters, facilityIds: g.assessment.newFacilityIds } : { reason: g.assessment.reason }) })), adoption });
  }
  const worldRuns: unknown[] = [];
  for (const archive of archives) {
    const bytes = await readFile(archive);
    const { document } = await new ChunkedWorldCodecAdapter().decode({ header: bytes.subarray(0, 4), blob: new Blob([bytes]) });
    const world = document.world;
    bindSimulationCellColumns(world, document.simulation);
    const cityIds = world.pack.burgs.filter(b => b.i > 0 && !b.removed).map(b => b.i);
    const profiles: unknown[] = [];
    for (const [name, calibration] of Object.entries(LAND_CONNECTION_CALIBRATION_PROFILES)) {
      const t = performance.now();
      const settings = { ...fixture.input.settings.individual, maxConstructionCostMeters: 90000, maxRouteCostMeters: 300000 };
      const selection = selectNearbyWorldConnectionPairs(world, world.options.distanceUnit ?? "km", cityIds,
        { maxCities: 2000, maxNeighbourChecks: 100000, maxNeighboursPerCity: 3, maxPairs: 32, radiusMeters: 150000, firstPairId: 0 }, calibration, settings);
      const probes = [10, 30, 100, 300, 1000].map(deckLengthMeters => {
        const cost = calibrateBridgeCosts({ deckLengthMeters }, 4, calibration);
        return { deckLengthMeters, ...cost, withinMaximumConstruction: cost.constructionCostMeters <= calibration.maximumConstructionMeters };
      });
      profiles.push({ profile: name, wallMs: performance.now() - t, selection, physicalDeckCostProbes: probes });
    }
    // Geometry remains diagnostic: never omit unresolved rivers from a certified network.
    const registry = new WorldRiverGeometryRegistry(), reasons: Record<string, number> = {};
    let resolvedRivers = 0;
    const geometryStarted = performance.now();
    for (const river of world.pack.rivers) {
      const geometry = registry.get(world, river, world.options.distanceUnit ?? "km", {
        curveAlpha: 0.1, precision: { arcToleranceMeters: 0.01, maxIntegrationDepth: 20, maxEvaluations: 100000 },
        banks: { maxStepMeters: 2000, maxChordErrorMeters: 0.5, maxSamples: 2000 }, maxSourcePoints: 5000
      });
      if ("geometry" in geometry) resolvedRivers++;
      else reasons[geometry.reason] = (reasons[geometry.reason] ?? 0) + 1;
    }
    worldRuns.push({ archive, seed: world.seed, cities: cityIds.length, profiles,
      geometry: { resolvedRivers, unresolved: reasons, wallMs: performance.now() - geometryStarted },
      adoptionCertified: false, scope: "actual-city-selection-and-cost-probes; full world adoption not evaluated" });
  }
  const tuned = tuneLandConnectionBudgets(fixture.input.settings, peaks, policy, 3);
  const report = { schemaVersion: 1, profilesAreGenerationDefaults: false,
    scope: "stage-5 coefficient comparisons; stage-6 all-seed/performance acceptance excluded",
    profiles: LAND_CONNECTION_CALIBRATION_PROFILES, measuredPeaks: peaks,
    suggestedFixtureBudgets: tuned, fixtureRuns, worldRuns, totalWallMs: performance.now() - started };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, fixtureRuns: fixtureRuns.length, worldRuns: worldRuns.length, totalWallMs: report.totalWallMs }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
