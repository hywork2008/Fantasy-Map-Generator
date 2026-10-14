import type { CityDocument } from "../../../types/document";
import type { GenerationObserver } from "../../generationDiagnostics";
import type { SkeletonPlanData } from "./toPlan";

/** Temporary pins, never persisted. Audit repairs before accepting their result;
 * changing any certified constraint discards that repair, not the whole city. */
export function finishSkeletonGeometry(
  document: CityDocument,
  data: SkeletonPlanData,
  phase: string,
  operation: (doc: CityDocument) => CityDocument,
  observer?: GenerationObserver,
  attempt = 1
): CityDocument {
  const started = performance.now();
  const vertices = new Set(
    data.lines.flatMap(l =>
      l.edges.flatMap(r => {
        const e = document.mesh.edges[r.edgeId];
        return e ? [e.a, e.b] : [];
      })
    )
  );
  const snapshot = new Map(
    [...vertices].map(id => [id, { ...document.mesh.vertices[id], point: [...document.mesh.vertices[id].point] }])
  );
  const edgeSnapshot = data.lines
    .flatMap(l => l.edges.map(r => document.mesh.edges[r.edgeId]))
    .filter(e => !!e)
    .map(e => ({ ...e }));
  const input = structuredClone(document);
  for (const id of vertices) input.mesh.vertices[id].locked = true;
  const output = operation(input);
  let changed = 0;
  for (const [id, v] of snapshot) {
    const next = output.mesh.vertices[id];
    if (!next || Math.hypot(next.point[0] - v.point[0], next.point[1] - v.point[1]) > 1e-6) changed++;
    if (next) next.locked = v.locked;
  }
  for (const edge of edgeSnapshot) {
    const e = output.mesh.edges[edge.id];
    if (!e || e.a !== edge.a || e.b !== edge.b) changed++;
  }
  const groupsChanged = JSON.stringify(output.featureGroups) !== JSON.stringify(document.featureGroups);
  observer?.({
    phase: `skeleton-audit:${phase}`,
    attempt,
    elapsedMs: performance.now() - started,
    counts: {
      constraintChanges: changed,
      featureChanges: Number(groupsChanged),
      repairDiscarded: Number(changed > 0 || groupsChanged)
    }
  });
  return changed || groupsChanged ? document : output;
}
