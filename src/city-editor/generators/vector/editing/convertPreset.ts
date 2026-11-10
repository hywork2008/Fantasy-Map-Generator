import type { CurveAnchor, VectorCityDocument, VectorSegment } from "../../../types/vector/document";
import { evaluatePresetPiece, presetPieces } from "../geometry/presets";
import { assertVectorDocument } from "../validation/document";
import { mapDocumentAnchors, pathAnchors } from "./anchors";

/** Persisted anchors become exact endpoints; approximation never relocates connections. */
export function convertVectorPreset(document: VectorCityDocument, id: string): VectorCityDocument {
  const next = structuredClone(document),
    path = next.paths[id];
  if (path.editPolicy === "fixed") throw new Error("fixed-path");
  if (path.source.kind !== "preset") return next;
  const source = path.source,
    anchors = pathAnchors(document, id),
    segments: VectorSegment[] = [];
  const mapping = new Map<string, { lo: number; hi: number; id: string }[]>();
  for (const piece of presetPieces(source)) {
    const intervals: { lo: number; hi: number; id: string }[] = [];
    const cuts = [...new Set([0, 1, ...anchors.filter(a => a.segmentId === piece.id).map(a => a.t)])].sort(
      (a, b) => a - b
    );
    const add = (lo: number, hi: number, depth: number) => {
      const span = (piece.sweep ?? 0) * (hi - lo),
        axes = piece.axes ?? [1, 1];
      const bound = Math.hypot(...axes) * span ** 4;
      const tangentBound = bound / (2 * Math.min(...axes) * Math.abs(span));
      if (piece.kind === "arc" && (bound / 384 > 0.005 || tangentBound > Math.sin((0.1 * Math.PI) / 180))) {
        if (depth > 24) throw new Error("precision-budget");
        add(lo, (lo + hi) / 2, depth + 1);
        add((lo + hi) / 2, hi, depth + 1);
        return;
      }
      const segmentId = piece.kind === "line" ? piece.id : `${piece.id}.${intervals.length}`;
      const from = evaluatePresetPiece(source, piece, lo),
        to = evaluatePresetPiece(source, piece, hi);
      if (piece.kind === "line") segments.push({ id: segmentId, kind: "line", from, to });
      else {
        const a = evaluatePresetPiece(source, piece, lo, true),
          b = evaluatePresetPiece(source, piece, hi, true),
          scale = (hi - lo) / 3;
        segments.push({
          id: segmentId,
          kind: "cubic",
          from,
          to,
          control1: [from[0] + a[0] * scale, from[1] + a[1] * scale],
          control2: [to[0] - b[0] * scale, to[1] - b[1] * scale],
          startMode: "aligned"
        });
      }
      intervals.push({ lo, hi, id: segmentId });
    };
    // A line also needs subdivision if several persisted anchors lie on it.
    for (let i = 1; i < cuts.length; i++) add(cuts[i - 1], cuts[i], 0);
    if (piece.kind === "line" && intervals.length > 1)
      intervals.forEach((interval, i) => {
        const segment = segments[segments.length - intervals.length + i];
        interval.id = `${piece.id}.${i}`;
        segment.id = interval.id;
      });
    mapping.set(piece.id, intervals);
  }
  path.source = { kind: "curve", closed: true, segments };
  mapDocumentAnchors(next, (anchor: CurveAnchor) => {
    if (anchor.pathId !== id) return anchor;
    const interval = mapping.get(anchor.segmentId)?.find(i => anchor.t >= i.lo - 1e-12 && anchor.t <= i.hi + 1e-12);
    if (!interval) throw new Error("referenced-segment");
    return {
      ...anchor,
      segmentId: interval.id,
      t: Math.max(0, Math.min(1, (anchor.t - interval.lo) / (interval.hi - interval.lo)))
    };
  });
  path.revision++;
  next.revision++;
  assertVectorDocument(next);
  return next;
}
