import type { WorldContext } from "../context/worldContext";
import type { LandConnectionAssessment } from "../generators/landConnectionAssessment";
import type { SharedConnectionAssessment } from "../generators/sharedLandConnectionAssessment";
import type { WorldConnectionPair, WorldLandProposalResult } from "../generators/worldLandConnectionProposals";

export interface LandProposalExplanation {
  key: string;
  kind: "individual" | "shared";
  id?: number;
  cityIds: readonly number[];
  status: "proposed" | "adopted" | "kept" | "rejected" | "unresolved";
  reason: string;
  facilityIds: readonly number[];
  travelScoreMeters: number | null;
  constructionScoreMeters: number | null;
  repeatScoreMeters: number | null;
  netBenefitMeters: number | null;
}
export interface WorldLandProposalReport {
  mapId: number;
  seed: string;
  status: WorldLandProposalResult["status"];
  reason?: string;
  searches: number;
  approachAttempts: number;
  explanations: readonly LandProposalExplanation[];
}
type ReportedLandProposal = Pick<WorldLandProposalResult, "status" | "diagnostics"> & { reason?: string };
const reports = new WeakMap<object, { result: ReportedLandProposal; report: WorldLandProposalReport }>();
const listeners = new Set<() => void>();
export const subscribeWorldLandProposalReports = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function getWorldLandProposalReport(world: Readonly<WorldContext>): WorldLandProposalReport | null {
  const report = reports.get(world)?.report;
  return report && report.mapId === world.mapId && report.seed === world.seed ? report : null;
}

/** Plain explanations only: this store never grants geometry/adoption authority.
 * It reports the last evaluation for this map, not a fresh certification after an edit. */
export function publishWorldLandProposalReport(
  world: Readonly<WorldContext>,
  result: ReportedLandProposal,
  pairs: readonly WorldConnectionPair[]
): void {
  const explanations: LandProposalExplanation[] = [];
  const individual = (pairId: number, assessment: LandConnectionAssessment) => {
    const pair = pairs.find(p => p.id === pairId);
    const route =
      "route" in assessment
        ? assessment.route
        : assessment.comparison.candidate && "route" in assessment.comparison.candidate
          ? assessment.comparison.candidate.route
          : null;
    explanations.push({
      key: `individual:${pairId}`,
      kind: "individual",
      id: pairId,
      cityIds: pair ? [pair.cityAId, pair.cityBId] : [],
      status: assessment.status === "keep-baseline" ? "kept" : assessment.status,
      reason:
        "reason" in assessment
          ? assessment.reason
          : assessment.travelSavingMeters === null
            ? "new-connection"
            : "travel-saving",
      facilityIds: route ? [...route.facilityIds] : [],
      travelScoreMeters: route?.costs.travelMeters ?? null,
      constructionScoreMeters: route?.costs.constructionMeters ?? null,
      repeatScoreMeters: route?.costs.repeatCrossingMeters ?? null,
      netBenefitMeters: assessment.status === "proposed" ? assessment.netImprovementMeters : null
    });
  };
  const shared = (assessment: SharedConnectionAssessment, pairIds: readonly number[], id?: number) => {
    explanations.push({
      key: `shared:${id ?? "all"}`,
      kind: "shared",
      id,
      cityIds: [...new Set(pairs.filter(p => pairIds.includes(p.id)).flatMap(p => [p.cityAId, p.cityBId]))],
      status: assessment.status,
      reason: "reason" in assessment ? assessment.reason : "shared-benefit",
      facilityIds: assessment.status === "proposed" ? [...assessment.newFacilityIds] : [],
      // Shared travel is weighted. Repeat costs are already inside operatingScore.
      travelScoreMeters: assessment.status === "proposed" ? assessment.operatingScoreMeters : null,
      constructionScoreMeters: assessment.status === "proposed" ? assessment.investmentMeters : null,
      repeatScoreMeters: null,
      netBenefitMeters: assessment.status === "proposed" ? assessment.netBenefitMeters : null
    });
  };
  for (const entry of result.diagnostics.individuals) individual(entry.pairId, entry.assessment);
  if (result.diagnostics.shared)
    shared(
      result.diagnostics.shared,
      pairs.map(p => p.id)
    );
  for (const entry of result.diagnostics.sharedGroups ?? [])
    shared(entry.assessment, entry.group.pairIds, entry.group.id);
  const report: WorldLandProposalReport = Object.freeze({
    mapId: world.mapId,
    seed: world.seed,
    status: result.status,
    ...(result.status === "unresolved" ? { reason: result.reason } : {}),
    searches: result.diagnostics.assessmentSearches,
    approachAttempts: result.diagnostics.approachAttempts,
    explanations: Object.freeze(
      explanations.map(original => {
        const entry =
          result.status === "unresolved"
            ? { ...original, status: "unresolved" as const, reason: result.reason ?? original.reason }
            : original;
        return Object.freeze({
          ...entry,
          cityIds: Object.freeze([...entry.cityIds]),
          facilityIds: Object.freeze([...entry.facilityIds])
        });
      })
    )
  });
  reports.set(world, { result, report });
  for (const listener of listeners) listener();
}
export function recordWorldLandProposalAdoption(
  world: Readonly<WorldContext>,
  result: ReportedLandProposal,
  kind: "individual" | "shared",
  id: number | undefined,
  facilityIds: readonly number[]
): void {
  const current = reports.get(world);
  if (result.status !== "evaluated" || !current || current.result !== result || !getWorldLandProposalReport(world))
    return;
  const key = `${kind}:${id ?? "all"}`;
  const report = Object.freeze({
    ...current.report,
    explanations: Object.freeze(
      current.report.explanations.map(entry =>
        entry.key === key
          ? Object.freeze({ ...entry, status: "adopted" as const, facilityIds: Object.freeze([...facilityIds]) })
          : entry
      )
    )
  });
  reports.set(world, { result, report });
  for (const listener of listeners) listener();
}
