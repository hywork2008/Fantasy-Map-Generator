import type { CurveAnchor, VectorCityDocument } from "../../../types/vector/document";
import { splitSegment } from "../geometry/curves";
import { assertVectorDocument } from "../validation/document";

export interface AnchorSplit {
  pathId: string;
  segmentId: string;
  t: number;
  leftId: string;
  rightId: string;
}

export function remapSplitAnchor(anchor: CurveAnchor, split: AnchorSplit): CurveAnchor {
  if (anchor.pathId !== split.pathId || anchor.segmentId !== split.segmentId) return { ...anchor };
  return anchor.t <= split.t
    ? { pathId: anchor.pathId, segmentId: split.leftId, t: anchor.t / split.t }
    : { pathId: anchor.pathId, segmentId: split.rightId, t: (anchor.t - split.t) / (1 - split.t) };
}

/** One transaction updates every persisted reference to the split segment. */
export function splitVectorPath(document: VectorCityDocument, split: AnchorSplit): VectorCityDocument {
  assertVectorDocument(document);
  const next = structuredClone(document);
  const path = Object.hasOwn(next.paths, split.pathId) ? next.paths[split.pathId] : undefined;
  if (path?.source.kind !== "curve" || path.editPolicy === "fixed") throw new Error("Curve is not editable");
  const index = path.source.segments.findIndex(segment => segment.id === split.segmentId);
  if (index < 0) throw new Error("Missing curve segment");
  const occupied = new Set(path.source.segments.filter((_, i) => i !== index).map(segment => segment.id));
  if (occupied.has(split.leftId) || occupied.has(split.rightId)) throw new Error("Curve segment ID already exists");
  path.source.segments.splice(
    index,
    1,
    ...splitSegment(path.source.segments[index], split.t, split.leftId, split.rightId)
  );
  const remap = (anchor: CurveAnchor) => remapSplitAnchor(anchor, split);
  for (const p of Object.values(next.paths))
    for (const station of p.width.stations) station.anchor = remap(station.anchor);
  for (const node of Object.values(next.connections.nodes)) node.anchors = node.anchors.map(remap);
  for (const edge of Object.values(next.connections.edges)) {
    edge.from = remap(edge.from);
    edge.to = remap(edge.to);
  }
  for (const gate of Object.values(next.connections.gates)) gate.anchor = remap(gate.anchor);
  for (const placement of Object.values(next.placements)) placement.accesses = placement.accesses.map(remap);
  path.revision++;
  next.revision++;
  assertVectorDocument(next);
  return next;
}
