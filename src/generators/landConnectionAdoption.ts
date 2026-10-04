import type { RiverPoint } from "../services/riverGeometry";
import {
  type ConstrainedLandNetwork,
  type NetworkEnvironment,
  selectConstrainedLandNetwork
} from "./constrainedLandNetwork";
import { assessLandConnection, type LandConnectionAssessment } from "./landConnectionAssessment";
import { assessSharedLandConnections, type SharedConnectionAssessment } from "./sharedLandConnectionAssessment";

type IndividualInput = Omit<
  Parameters<typeof assessLandConnection>[1],
  "environment" | "baselineConnectionIds" | "candidateConnectionIds"
>;
type SharedInput = Omit<
  Parameters<typeof assessSharedLandConnections>[1],
  "environment" | "baselineConnectionIds" | "candidateConnectionIds"
>;
export type LandAdoptionRequest =
  | { kind: "individual"; input: IndividualInput }
  | { kind: "shared"; input: SharedInput; candidateConnectionIds?: readonly number[] };
type Assessment = LandConnectionAssessment | SharedConnectionAssessment;
type Proposed = Extract<Assessment, { status: "proposed" }>;
type Budgets = Parameters<typeof selectConstrainedLandNetwork>[3];
export interface LandConnectionSnapshot {
  revision: number;
  network: ConstrainedLandNetwork;
  connectionIds: readonly number[];
  facilityIds: readonly number[];
}
export interface LandAdoptionDraft {
  baseRevision: number;
  assessment: Proposed;
  network: ConstrainedLandNetwork;
  newConnectionIds: readonly number[];
  newFacilityIds: readonly number[];
}
export interface LandAdoptionCurrent {
  candidateNetwork: ConstrainedLandNetwork;
  environment: NetworkEnvironment;
  /** Resolve actual current city/junction coordinates; IDs alone cannot certify an unmoved endpoint. */
  nodePointAt: (nodeId: number) => RiverPoint | null;
}
const registeredSnapshots = new WeakSet<LandConnectionSnapshot>();
export function isRegisteredLandConnectionSnapshot(snapshot: LandConnectionSnapshot): boolean {
  return registeredSnapshots.has(snapshot);
}
type Failure = { status: "unresolved"; reason: string; assessment?: Assessment };
const ids = (network: ConstrainedLandNetwork) => [...new Set(network.edges.map(e => e.id))].sort((a, b) => a - b);
const facilities = (network: ConstrainedLandNetwork) =>
  [...new Set(network.edges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])))].sort((a, b) => a - b);
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Session registry for an explicit validated baseline. Atomic registration here
 * is independent of pack.routes, persistence, renderers and the world pipeline.
 * Callers must supply a CURRENT candidate network with refreshed cost contracts,
 * current complete water/policies and actual endpoint coordinates on each call.
 */
export function createLandConnectionRegistry(
  baseline: ConstrainedLandNetwork,
  environment: NetworkEnvironment,
  budgets: Budgets,
  initialRevision = 0
): { registry: LandConnectionRegistry } | { reason: string } {
  if (!Number.isSafeInteger(initialRevision) || initialRevision < 0) return { reason: "invalid-revision" };
  const built = selectConstrainedLandNetwork(baseline, ids(baseline), environment, budgets);
  return "network" in built
    ? {
        registry: new LandConnectionRegistry(
          built.network,
          {
            maxNodes: budgets.maxNodes,
            maxEdges: budgets.maxEdges,
            maxCorridorPieces: budgets.maxCorridorPieces,
            maxGuideNodes: budgets.maxGuideNodes,
            maxGuideEdges: budgets.maxGuideEdges
          },
          initialRevision
        )
      }
    : built;
}
class LandConnectionRegistry {
  private current: LandConnectionSnapshot;
  private drafts = new WeakMap<LandAdoptionDraft, { request: LandAdoptionRequest; base: LandConnectionSnapshot }>();
  constructor(
    network: ConstrainedLandNetwork,
    private readonly budgets: Budgets,
    initialRevision: number
  ) {
    this.current = this.makeSnapshot(network, initialRevision);
  }
  get snapshot(): LandConnectionSnapshot {
    return this.current;
  }
  private makeSnapshot(network: ConstrainedLandNetwork, revision: number): LandConnectionSnapshot {
    const snapshot = freeze({ revision, network, connectionIds: ids(network), facilityIds: facilities(network) });
    registeredSnapshots.add(snapshot);
    return snapshot;
  }
  private evaluate(
    request: LandAdoptionRequest,
    current: LandAdoptionCurrent
  ): { assessment: Proposed; network: ConstrainedLandNetwork } | Failure {
    const network = current.candidateNetwork;
    if (
      network.roadWidthMeters !== this.current.network.roadWidthMeters ||
      JSON.stringify(network.nodes) !== JSON.stringify(this.current.network.nodes)
    )
      return { status: "unresolved", reason: "changed-nodes" };
    if (
      typeof current.nodePointAt !== "function" ||
      network.nodes.some(n => {
        const p = current.nodePointAt(n.id);
        return !p || p[0] !== n.point[0] || p[1] !== n.point[1];
      })
    )
      return { status: "unresolved", reason: "changed-nodes" };
    const existing = new Set(this.current.connectionIds);
    if (JSON.stringify(network.edges.filter(e => existing.has(e.id))) !== JSON.stringify(this.current.network.edges))
      return { status: "unresolved", reason: "changed-baseline" };
    const common = {
      baselineConnectionIds: this.current.connectionIds,
      candidateConnectionIds: ids(network),
      environment: current.environment
    };
    if (request.kind === "shared" && request.candidateConnectionIds) {
      const known = new Set(common.candidateConnectionIds);
      if (
        new Set(request.candidateConnectionIds).size !== request.candidateConnectionIds.length ||
        request.candidateConnectionIds.some(id => !known.has(id))
      )
        return { status: "unresolved", reason: "invalid-candidate-selection" };
      common.candidateConnectionIds = [
        ...new Set([...this.current.connectionIds, ...request.candidateConnectionIds])
      ].sort((a, b) => a - b);
    }
    const assessment: Assessment =
      request.kind === "individual"
        ? assessLandConnection(network, { ...request.input, ...common })
        : assessSharedLandConnections(network, { ...request.input, ...common });
    if (assessment.status !== "proposed") return { status: "unresolved", reason: "not-proposed", assessment };
    const selected = [...new Set([...this.current.connectionIds, ...assessment.newConnectionIds])];
    const built = selectConstrainedLandNetwork(network, selected, current.environment, this.budgets);
    if (!("network" in built)) return { status: "unresolved", reason: built.reason, assessment };
    return { assessment, network: built.network };
  }
  prepare(
    expectedRevision: number,
    request: LandAdoptionRequest,
    current: LandAdoptionCurrent
  ): { draft: LandAdoptionDraft } | Failure {
    if (expectedRevision !== this.current.revision) return { status: "unresolved", reason: "stale-revision" };
    const base = this.current;
    // Preserve all valuation, pair and direction settings independently of subsequent caller edits.
    const saved = structuredClone(request);
    const result = this.evaluate(saved, current);
    if (base !== this.current) return { status: "unresolved", reason: "stale-revision" };
    if ("status" in result) return result;
    const draft = freeze({
      baseRevision: this.current.revision,
      ...result,
      newConnectionIds: [...result.assessment.newConnectionIds],
      newFacilityIds: [...result.assessment.newFacilityIds]
    });
    this.drafts.set(draft, { request: saved, base: this.current });
    return { draft };
  }
  commit(
    draft: LandAdoptionDraft,
    current: LandAdoptionCurrent
  ): { status: "committed"; snapshot: LandConnectionSnapshot } | Failure {
    const saved = this.drafts.get(draft);
    if (!saved) return { status: "unresolved", reason: "unknown-draft" };
    if (saved.base !== this.current) return { status: "unresolved", reason: "stale-revision" };
    const result = this.evaluate(saved.request, current);
    if (saved.base !== this.current) return { status: "unresolved", reason: "stale-revision" };
    if ("status" in result) return result;
    if (
      JSON.stringify(result.assessment) !== JSON.stringify(draft.assessment) ||
      JSON.stringify(result.network) !== JSON.stringify(draft.network)
    )
      return { status: "unresolved", reason: "changed-proposal" };
    if (!Number.isSafeInteger(this.current.revision + 1)) return { status: "unresolved", reason: "revision-overflow" };
    // Publish once, after ALL comparisons, geometry and whole-package checks succeed.
    this.current = this.makeSnapshot(result.network, this.current.revision + 1);
    this.drafts.delete(draft);
    return { status: "committed", snapshot: this.current };
  }
}
