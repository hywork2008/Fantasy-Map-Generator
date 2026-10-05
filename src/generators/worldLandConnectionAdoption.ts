import { selectConstrainedLandNetwork } from "./constrainedLandNetwork";
import {
  createLandConnectionRegistry,
  type LandAdoptionDraft,
  type LandAdoptionRequest
} from "./landConnectionAdoption";
import { exportRegisteredLandRouteSections } from "./registeredLandRouteSections";
import type { WorldCellLandProposalResult } from "./worldCellLandConnectionProposals";
import {
  getWorldLandProposalContext,
  type WorldLandProposalContext,
  type WorldLandProposalResult
} from "./worldLandConnectionProposals";

export type WorldLandAdoptionSelection = { kind: "individual"; pairId: number } | { kind: "shared"; groupId?: number };
export interface PrioritizedLandAdoptionSettings {
  maxSelections: number;
  maxCurrentEvaluations: number;
  maxRelatedReevaluations: number;
}
export interface PrioritizedLandAdoptionReport {
  status: "completed" | "budget" | "unresolved";
  reason?: string;
  selections: number;
  currentEvaluations: number;
  relatedReevaluations: number;
  decisions: readonly { selection: WorldLandAdoptionSelection; status: "committed" | "rejected"; reason?: string }[];
}
type Evaluation = WorldLandProposalResult | WorldCellLandProposalResult;
type Registry = Extract<ReturnType<typeof createLandConnectionRegistry>, { registry: unknown }>["registry"];
type Failure = { status: "unresolved"; reason: string; evaluation?: Evaluation };
/** Opt-in world adapter for the session registry. The provider must run a fresh
 * full world/cell proposal evaluation with current physical water and costs on
 * every call. This does not mutate pack.routes or enable legacy rendering.
 */
export function createWorldLandConnectionSession(
  evaluateCurrent: () => Evaluation
): { session: WorldLandConnectionSession } | Failure {
  const result = evaluateCurrent();
  if (result.status !== "evaluated") return { status: "unresolved", reason: "world-evaluation", evaluation: result };
  const context = getWorldLandProposalContext(result);
  if (!context) return { status: "unresolved", reason: "unvalidated-world-evaluation" };
  const base = selectConstrainedLandNetwork(
    result.network,
    context.baselineConnectionIds,
    context.environment,
    context.settings.network
  );
  if (!("network" in base)) return { status: "unresolved", reason: base.reason };
  const built = createLandConnectionRegistry(base.network, context.environment, context.settings.network);
  return "registry" in built
    ? { session: new WorldLandConnectionSession(evaluateCurrent, built.registry, context.worldIdentity, result) }
    : { status: "unresolved", reason: built.reason };
}
class WorldLandConnectionSession {
  private used = new WeakSet<object>();
  private drafts = new WeakMap<
    LandAdoptionDraft,
    { selection: WorldLandAdoptionSelection; request: LandAdoptionRequest }
  >();
  constructor(
    private readonly evaluateCurrent: () => Evaluation,
    private readonly registry: Registry,
    private readonly identity: string,
    initial: Evaluation
  ) {
    this.used.add(initial);
  }
  get snapshot() {
    return this.registry.snapshot;
  }
  exportSections(): ReturnType<typeof exportRegisteredLandRouteSections> | Failure {
    const fresh = this.current();
    if ("status" in fresh) return fresh;
    return exportRegisteredLandRouteSections(this.snapshot, {
      environment: fresh.context.environment,
      nodePointAt: fresh.context.nodePointAt
    });
  }
  private current():
    | { result: Extract<Evaluation, { status: "evaluated" }>; context: WorldLandProposalContext }
    | Failure {
    const result = this.evaluateCurrent();
    if (this.used.has(result)) return { status: "unresolved", reason: "reused-world-evaluation" };
    this.used.add(result);
    if (result.status !== "evaluated") return { status: "unresolved", reason: "world-evaluation", evaluation: result };
    const context = getWorldLandProposalContext(result);
    if (!context) return { status: "unresolved", reason: "unvalidated-world-evaluation" };
    if (context.worldIdentity !== this.identity) return { status: "unresolved", reason: "changed-world" };
    return { result, context };
  }
  private request(
    selection: WorldLandAdoptionSelection,
    c: WorldLandProposalContext,
    result: Extract<Evaluation, { status: "evaluated" }>
  ): LandAdoptionRequest | null {
    const remaining = c.settings.maxAssessmentSearches - c.assessmentSearches;
    if (remaining < 1) return null;
    if (selection.kind === "individual") {
      const pair = c.pairs.find(p => p.id === selection.pairId);
      return pair
        ? {
            kind: "individual",
            input: {
              startNodeId: pair.cityAId,
              goalNodeId: pair.cityBId,
              startTangent: pair.startTangent,
              goalTangent: pair.goalTangent,
              searchSettings: c.settings.search,
              settings: {
                ...c.settings.individual,
                maxConstructionCostMeters: Math.min(
                  c.settings.individual.maxConstructionCostMeters,
                  pair.assessmentSettings?.maxConstructionCostMeters ?? c.settings.individual.maxConstructionCostMeters
                ),
                maxRouteCostMeters: Math.min(
                  c.settings.individual.maxRouteCostMeters,
                  pair.assessmentSettings?.maxRouteCostMeters ?? c.settings.individual.maxRouteCostMeters
                ),
                maxSearches: Math.min(c.settings.individual.maxSearches, remaining)
              }
            }
          }
        : null;
    }
    const group = selection.groupId === undefined ? undefined : c.sharedGroups.find(g => g.id === selection.groupId);
    if ((selection.groupId !== undefined && !group) || (c.settings.sharedSelection && !group)) return null;
    return {
      kind: "shared",
      ...(group ? { candidateConnectionIds: group.connectionIds } : {}),
      input: {
        pairs: c.pairs
          .filter(p => !group || group.pairIds.includes(p.id))
          .map(p => ({ ...p, startNodeId: p.cityAId, goalNodeId: p.cityBId })),
        sharedFacilityIds: group
          ? group.facilityIds
          : [...new Set(result.network.edges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])))],
        searchSettings: c.settings.search,
        settings: { ...c.settings.shared, maxSearches: Math.min(c.settings.shared.maxSearches, remaining) }
      }
    };
  }
  prepare(expectedRevision: number, selection: WorldLandAdoptionSelection): ReturnType<Registry["prepare"]> | Failure {
    if (expectedRevision !== this.snapshot.revision) return { status: "unresolved", reason: "stale-revision" };
    const fresh = this.current();
    if ("status" in fresh) return fresh;
    const request = this.request(selection, fresh.context, fresh.result);
    if (!request)
      return {
        status: "unresolved",
        reason:
          fresh.context.assessmentSearches >= fresh.context.settings.maxAssessmentSearches
            ? "assessment-budget"
            : selection.kind === "shared"
              ? "unknown-shared-group"
              : "unknown-pair"
      };
    const prepared = this.registry.prepare(expectedRevision, request, {
      candidateNetwork: fresh.result.network,
      environment: fresh.context.environment,
      nodePointAt: fresh.context.nodePointAt
    });
    if ("draft" in prepared)
      this.drafts.set(prepared.draft, { selection: structuredClone(selection), request: structuredClone(request) });
    return prepared;
  }
  /** Prioritized bounded opt-in adoption. Fresh provider contracts remain
   * mandatory at prepare and commit. Only failed selections related to a newly
   * adopted facility/connection are scheduled again; existing paths are never
   * replaced or pruned. A budget stop preserves already committed packages. */
  adoptPrioritized(settings: PrioritizedLandAdoptionSettings): PrioritizedLandAdoptionReport {
    const report: PrioritizedLandAdoptionReport = {
      status: "completed",
      selections: 0,
      currentEvaluations: 0,
      relatedReevaluations: 0,
      decisions: []
    };
    const decisions: PrioritizedLandAdoptionReport["decisions"][number][] = [];
    report.decisions = decisions;
    if (
      ![settings.maxSelections, settings.maxCurrentEvaluations].every(n => Number.isSafeInteger(n) && n > 0) ||
      !Number.isSafeInteger(settings.maxRelatedReevaluations) ||
      settings.maxRelatedReevaluations < 0
    )
      return { ...report, status: "unresolved", reason: "invalid-adoption-budget" };
    report.currentEvaluations++;
    const fresh = this.current();
    if ("status" in fresh) return { ...report, status: "unresolved", reason: fresh.reason };
    type Entry = {
      selection: WorldLandAdoptionSelection;
      priority: number;
      facilityIds: readonly number[];
      connectionIds: readonly number[];
    };
    const pending: Entry[] = fresh.context.pairs.map(pair => {
      const assessment = fresh.result.diagnostics.individuals.find(p => p.pairId === pair.id)?.assessment;
      const candidate = assessment?.comparison.candidate;
      const route = candidate && "route" in candidate ? candidate.route : null;
      return {
        selection: { kind: "individual", pairId: pair.id },
        priority: pair.weight,
        facilityIds: route?.facilityIds ?? [],
        connectionIds: route?.edges.map(e => e.id) ?? []
      };
    });
    for (const group of fresh.context.sharedGroups)
      pending.push({
        selection: { kind: "shared", groupId: group.id },
        priority: fresh.context.pairs
          .filter(pair => group.pairIds.includes(pair.id))
          .reduce((sum, pair) => sum + pair.weight, 0),
        facilityIds: group.facilityIds,
        connectionIds: group.connectionIds
      });
    if (!fresh.context.settings.sharedSelection && fresh.result.diagnostics.shared)
      pending.push({
        selection: { kind: "shared" },
        priority: fresh.context.pairs.reduce((sum, pair) => sum + pair.weight, 0),
        facilityIds: [
          ...new Set(fresh.result.network.edges.flatMap(edge => (edge.crossing ? [edge.crossing.facilityId] : [])))
        ],
        connectionIds: fresh.result.network.edges.map(edge => edge.id)
      });
    pending.sort(
      (a, b) => b.priority - a.priority || JSON.stringify(a.selection).localeCompare(JSON.stringify(b.selection))
    );
    const rejected: Entry[] = [];
    while (pending.length) {
      // Reserve both provider calls before starting another whole package.
      if (report.selections >= settings.maxSelections || report.currentEvaluations + 2 > settings.maxCurrentEvaluations)
        return { ...report, status: "budget", reason: "adoption-budget" };
      const entry = pending.shift()!;
      report.selections++;
      report.currentEvaluations++;
      const prepared = this.prepare(this.snapshot.revision, entry.selection);
      if (!("draft" in prepared)) {
        if (prepared.reason !== "not-proposed") return { ...report, status: "unresolved", reason: prepared.reason };
        decisions.push({ selection: entry.selection, status: "rejected", reason: prepared.reason });
        rejected.push(entry);
        continue;
      }
      report.currentEvaluations++;
      const committed = this.commit(prepared.draft);
      if (committed.status !== "committed") return { ...report, status: "unresolved", reason: committed.reason };
      decisions.push({ selection: entry.selection, status: "committed" });
      const facilities = new Set(prepared.draft.newFacilityIds),
        connections = new Set(prepared.draft.newConnectionIds);
      for (let i = rejected.length - 1; i >= 0; i--) {
        const candidate = rejected[i];
        if (
          !candidate.facilityIds.some(id => facilities.has(id)) &&
          !candidate.connectionIds.some(id => connections.has(id))
        )
          continue;
        if (report.relatedReevaluations >= settings.maxRelatedReevaluations) continue;
        report.relatedReevaluations++;
        pending.push(candidate);
        rejected.splice(i, 1);
      }
    }
    return report;
  }
  commit(draft: LandAdoptionDraft): ReturnType<Registry["commit"]> | Failure {
    const saved = this.drafts.get(draft);
    if (!saved) return { status: "unresolved", reason: "unknown-draft" };
    if (draft.baseRevision !== this.snapshot.revision) return { status: "unresolved", reason: "stale-revision" };
    const fresh = this.current();
    if ("status" in fresh) return fresh;
    const request = this.request(saved.selection, fresh.context, fresh.result);
    if (!request)
      return {
        status: "unresolved",
        reason:
          fresh.context.assessmentSearches >= fresh.context.settings.maxAssessmentSearches
            ? "assessment-budget"
            : saved.selection.kind === "shared"
              ? "unknown-shared-group"
              : "unknown-pair"
      };
    if (JSON.stringify(request) !== JSON.stringify(saved.request))
      return { status: "unresolved", reason: "changed-valuation" };
    const committed = this.registry.commit(draft, {
      candidateNetwork: fresh.result.network,
      environment: fresh.context.environment,
      nodePointAt: fresh.context.nodePointAt
    });
    if (committed.status === "committed") {
      this.drafts.delete(draft);
      fresh.context.reportAdoption(
        saved.selection.kind,
        saved.selection.kind === "individual" ? saved.selection.pairId : saved.selection.groupId,
        draft.newFacilityIds
      );
    }
    return committed;
  }
}
