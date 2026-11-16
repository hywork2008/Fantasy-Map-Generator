import type { VectorCityDocument } from "../../types/vector/document";
import { prepareVectorEdit } from "./editing/dependencies";
import { rebuildRoadGraph } from "./editing/network";
import { buildVectorFeature, type VectorFeatureDraft } from "./featureBuild";
import { assertVectorDocument } from "./validation/document";

export type { VectorFeatureDraft } from "./featureBuild";
/** Builds a reviewable candidate. Geometry and activity are persisted rather than drawn procedurally later. */
export function addVectorFeature(
  input: VectorCityDocument,
  draft: VectorFeatureDraft,
  requestedId?: string
): VectorCityDocument {
  assertVectorDocument(input);
  return buildVectorFeature(prepareVectorEdit(input), draft, requestedId);
}
export function removeVectorFeature(input: VectorCityDocument, id: string): VectorCityDocument {
  assertVectorDocument(input);
  const feature = input.environment?.features[id];
  if (!feature) throw Error("feature-missing");
  if (feature.editPolicy === "fixed" || feature.placementIds.some(id => input.placements[id]?.editPolicy === "fixed"))
    throw Error("feature-fixed");
  const doc = prepareVectorEdit(input),
    ids = new Set(feature.pathIds);
  if (
    Object.values(doc.placements).some(
      p => !feature.placementIds.includes(p.id) && p.accesses.some(a => ids.has(a.pathId))
    ) ||
    Object.values(doc.environment!.features).some(
      f => f.id !== id && (ids.has(f.access.pathId) || (f.waterAnchor && ids.has(f.waterAnchor.pathId)))
    )
  )
    throw Error("feature-referenced");
  for (const p of feature.pathIds) delete doc.paths[p];
  for (const p of feature.placementIds) delete doc.placements[p];
  for (const [key, b] of Object.entries(doc.connections.bridges))
    if (ids.has(b.roadPathId) || ids.has(b.riverAnchor.pathId)) delete doc.connections.bridges[key];
  for (const [key, g] of Object.entries(doc.connections.gates))
    if (ids.has(g.wallPathId)) delete doc.connections.gates[key];
  for (const [key, c] of Object.entries(doc.connections.circuits))
    if (ids.has(c.pathId)) delete doc.connections.circuits[key];
  for (const n of Object.values(doc.connections.nodes)) {
    n.anchors = n.anchors.filter(a => !ids.has(a.pathId));
    if (!n.anchors.length) delete doc.connections.nodes[n.id];
  }
  for (const [key, e] of Object.entries(doc.connections.edges))
    if (ids.has(e.pathId)) delete doc.connections.edges[key];
  delete doc.environment!.features[id];
  doc.environment!.hidden = doc.environment!.hidden.filter(key => key !== id);
  rebuildRoadGraph(doc);
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}

/** Activity does not reshuffle stall footprints, and locked instances retain their own state. */
export function setVectorFeatureActivity(
  input: VectorCityDocument,
  id: string,
  activity: "market-day" | "closed"
): VectorCityDocument {
  const feature = input.environment?.features[id];
  if (!feature) throw Error("feature-missing");
  if (feature.editPolicy === "fixed") throw Error("feature-fixed");
  const doc = prepareVectorEdit(input),
    f = doc.environment!.features[id];
  f.settings.activity = activity;
  for (const piece of f.pieces) if (piece.role === "stall") piece.heightMeters = activity === "market-day" ? 3 : 1.2;
  for (const id of f.placementIds) {
    const p = doc.placements[id];
    if (p.editPolicy === "fixed") continue;
    p.appearance = { ...p.appearance, quality: p.appearance?.quality ?? "low", activity };
  }
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
