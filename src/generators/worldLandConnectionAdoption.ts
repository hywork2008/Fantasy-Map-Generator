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

export type WorldLandAdoptionSelection = { kind: "individual"; pairId: number } | { kind: "shared" };
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
                maxSearches: Math.min(c.settings.individual.maxSearches, remaining)
              }
            }
          }
        : null;
    }
    return {
      kind: "shared",
      input: {
        pairs: c.pairs.map(p => ({ ...p, startNodeId: p.cityAId, goalNodeId: p.cityBId })),
        sharedFacilityIds: [...new Set(result.network.edges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])))],
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
            : "unknown-pair"
      };
    if (JSON.stringify(request) !== JSON.stringify(saved.request))
      return { status: "unresolved", reason: "changed-valuation" };
    const committed = this.registry.commit(draft, {
      candidateNetwork: fresh.result.network,
      environment: fresh.context.environment,
      nodePointAt: fresh.context.nodePointAt
    });
    if (committed.status === "committed") this.drafts.delete(draft);
    return committed;
  }
}
