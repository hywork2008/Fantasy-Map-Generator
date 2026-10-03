import type { ApproachCorridor } from "../../generators/approachCorridorSearch";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { findFixedCrossingApproach } from "./fixedCrossingApproach";
import type { CityDocument } from "./types";
export type FixedApproachInput = Parameters<typeof findFixedCrossingApproach>[1];
export type FixedApproachRequest = Omit<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge">;
export interface SavedFixedApproach {
  id: string;
  request: FixedApproachRequest;
  corridor: ApproachCorridor;
  geometryVersion: number;
}
export type FixedApproachProvider = (
  /** Resolve against this immutable current-document snapshot, never a captured previous state. */
  request: Readonly<FixedApproachRequest>,
  document: Readonly<CityDocument>
) => Pick<FixedApproachInput, "otherWater" | "supportsDryFootprint" | "allowsMeshEdge"> | null;
const providers = new WeakMap<CityDocument, FixedApproachProvider>();
function freezeSnapshot<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)])
    );
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
/** Current providers are never serialized or recovered from a copied document. */
export function adoptFixedCrossingApproaches(
  doc: CityDocument,
  requests: readonly { id: string; request: FixedApproachRequest }[],
  provider: FixedApproachProvider
): { document: CityDocument } | { reason: string } {
  if (requests.length > 100 || new Set(requests.map(r => r.id)).size !== requests.length || requests.some(r => !r.id))
    return { reason: "invalid-requests" };
  if (!validFixedBurgCrossings(doc.importedFixedCrossings, FIXED_SITE_CROSSING_BUDGETS))
    return { reason: "invalid-fixed-crossings" };
  if (
    !validSavedFixedApproaches(
      requests.map(r => ({
        ...r,
        geometryVersion: 1,
        corridor: { guideNodeIds: [], pieces: [], distanceMeters: 0, costMeters: 0 }
      }))
    )
  )
    return { reason: "invalid-requests" };
  const before = JSON.stringify(doc),
    records: SavedFixedApproach[] = [],
    providerDocument = freezeSnapshot(structuredClone(doc));
  for (const r of requests) {
    const request = structuredClone(r.request);
    let result: ReturnType<typeof findFixedCrossingApproach>;
    try {
      const current = provider(structuredClone(request), providerDocument);
      if (JSON.stringify(doc) !== before) return { reason: "changed-document" };
      if (!current) return { reason: "missing-current-contract" };
      result = findFixedCrossingApproach(doc, { ...request, ...current });
    } catch {
      return { reason: JSON.stringify(doc) !== before ? "changed-document" : "current-contract-failed" };
    }
    if (JSON.stringify(doc) !== before) return { reason: "changed-document" };
    if (!("corridor" in result)) return { reason: result.reason };
    records.push({
      id: r.id,
      request,
      corridor: structuredClone(result.corridor),
      geometryVersion: result.geometryVersion
    });
  }
  if (!validSavedFixedApproaches(records)) return { reason: "archive-budget" };
  if (JSON.stringify(doc) !== before) return { reason: "changed-document" };
  const document = structuredClone(doc);
  document.fixedCrossingApproaches = records;
  providers.set(document, provider);
  return { document };
}
/** Reestablish session validation only when every saved curve matches current search. */
export function restoreFixedCrossingApproaches(
  doc: CityDocument,
  provider: FixedApproachProvider
): { document: CityDocument } | { reason: string } {
  if (!validSavedFixedApproaches(doc.fixedCrossingApproaches)) return { reason: "invalid-approaches" };
  const result = adoptFixedCrossingApproaches(doc, doc.fixedCrossingApproaches, provider);
  if (!("document" in result)) return result;
  if (!same(result.document.fixedCrossingApproaches, doc.fixedCrossingApproaches))
    return { reason: "changed-approaches" };
  return result;
}
export function currentFixedCrossingApproaches(doc: CityDocument): readonly SavedFixedApproach[] | null {
  if (doc.fixedCrossingApproaches === undefined) return [];
  const provider = providers.get(doc);
  if (!provider) return null;
  const checked = restoreFixedCrossingApproaches(doc, provider);
  return "document" in checked ? structuredClone(checked.document.fixedCrossingApproaches!) : null;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: object, list: string) => Object.keys(v).every(k => list.split(",").includes(k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(finite);
/** Structural file guard only. Active rendering requires current-provider restoration. */
export function validSavedFixedApproaches(raw: unknown): raw is SavedFixedApproach[] {
  if (!Array.isArray(raw) || raw.length > 100) return false;
  const ids = new Set<string>();
  let pieces = 0;
  for (const r of raw) {
    if (
      !object(r) ||
      !keys(r, "id,request,corridor,geometryVersion") ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      !Number.isSafeInteger(r.geometryVersion) ||
      (r.geometryVersion as number) < 1 ||
      !object(r.request) ||
      !object(r.corridor)
    )
      return false;
    ids.add(r.id);
    const q = r.request,
      c = r.corridor;
    if (
      !keys(
        q,
        "facilityId,side,startVertexId,startTangent,settings,maxTerminalConnectors,maxConnectorMeters,terminalLeadMeters,maxWaterVertices"
      ) ||
      !Number.isSafeInteger(q.facilityId) ||
      (q.facilityId as number) < 0 ||
      !["A", "B"].includes(q.side as string) ||
      typeof q.startVertexId !== "string" ||
      !q.startVertexId ||
      (q.startTangent !== undefined && !point(q.startTangent)) ||
      !object(q.settings)
    )
      return false;
    if (q.terminalLeadMeters !== undefined && (!finite(q.terminalLeadMeters) || q.terminalLeadMeters <= 0))
      return false;
    for (const key of ["maxTerminalConnectors", "maxConnectorMeters", "maxWaterVertices"])
      if (!finite(q[key]) || q[key] <= 0) return false;
    if (
      !Number.isSafeInteger(q.maxTerminalConnectors) ||
      (q.maxTerminalConnectors as number) > 10000 ||
      !Number.isSafeInteger(q.maxWaterVertices) ||
      (q.maxWaterVertices as number) > 1000000
    )
      return false;
    const s = q.settings,
      names =
        "roadWidthMeters,minimumTurnRadiusMeters,minimumStraightMeters,minimumFinalStraightMeters,turnPenaltyMetersPerRadian,maxEnvelopeErrorMeters,maxArcSections,maxNodes,maxEdges,maxLabels,maxExpansions";
    if (
      !keys(s, names) ||
      names.split(",").some(k => !finite(s[k]) || s[k] < 0) ||
      (s.maxNodes as number) > 10000 ||
      (s.maxEdges as number) > 100000 ||
      (s.maxArcSections as number) > 10000 ||
      (s.maxLabels as number) > 100000 ||
      (s.maxExpansions as number) > 100000
    )
      return false;
    if (
      !keys(c, "guideNodeIds,pieces,distanceMeters,costMeters") ||
      !finite(c.distanceMeters) ||
      c.distanceMeters < 0 ||
      !finite(c.costMeters) ||
      c.costMeters < 0 ||
      !Array.isArray(c.guideNodeIds) ||
      c.guideNodeIds.length > 10000 ||
      !c.guideNodeIds.every(n => Number.isSafeInteger(n) && n >= 0) ||
      !Array.isArray(c.pieces) ||
      pieces + c.pieces.length > 2000
    )
      return false;
    pieces += c.pieces.length;
    for (const p of c.pieces) {
      if (!object(p) || !point(p.start) || !point(p.end) || !finite(p.lengthMeters) || p.lengthMeters <= 0)
        return false;
      if (p.kind === "line") {
        if (!keys(p, "kind,start,end,lengthMeters")) return false;
      } else if (p.kind === "arc") {
        if (
          !keys(p, "kind,start,end,lengthMeters,center,radiusMeters,startAngle,sweep") ||
          !point(p.center) ||
          !finite(p.radiusMeters) ||
          p.radiusMeters <= 0 ||
          !finite(p.startAngle) ||
          !finite(p.sweep) ||
          Math.abs(p.sweep) > 2 * Math.PI
        )
          return false;
      } else return false;
    }
  }
  return true;
}
