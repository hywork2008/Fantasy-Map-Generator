import type { CityDocument } from "../../../types/document";
import type { VectorDefensePlan } from "../../../types/vector/defense";
import type { CurveAnchor, VectorCityDocument } from "../../../types/vector/document";

/** Replace mesh references atomically, keeping the saved metre geometry and heights. */
export function copyLegacyDefense(
  source: CityDocument,
  doc: VectorCityDocument,
  anchors: Map<string, CurveAnchor[]>,
  groupPaths: Map<string, string[]>,
  gateIds: Map<string, string>
): VectorDefensePlan {
  const plan = source.bastionedTown!;
  const ground = Object.values(source.mesh.faces)
    .filter(f => f.properties.water === "land")
    .map(f => f.properties.elevation)
    .filter((h): h is number => Number.isFinite(h));
  if (source.terrain || (ground.length && Math.max(...ground) - Math.min(...ground) > 1e-6))
    throw Error("defense-relief-not-supported");
  if (plan.boundaryKind !== "inland-closed" || plan.sluices?.length) throw Error("defense-waterfront-not-supported");
  const circuit = source.defenseCircuits?.find(c => c.id === plan.circuitId);
  if (!circuit) throw Error("defense-circuit");
  const wallPathIds = circuit.wallGroupIds.flatMap(id => groupPaths.get(id) ?? []);
  if (circuit.wallGroupIds.some(id => !groupPaths.get(id)?.length)) throw Error("defense-wall-copy");
  const spans = (ids: string[]) =>
    ids.map(id => {
      const edge = source.mesh.edges[id];
      if (!edge) throw Error("defense-wall-edge");
      for (const from of anchors.get(edge.a) ?? []) {
        if (!wallPathIds.includes(from.pathId)) continue;
        const to = anchors.get(edge.b)?.find(a => a.pathId === from.pathId);
        if (to) return { from: structuredClone(from), to: structuredClone(to) };
      }
      throw Error("defense-wall-anchor");
    });
  const { circuitId: _circuit, locked: _locked, bastions, curtains, accesses, ...geometry } = structuredClone(plan);
  return {
    ...geometry,
    editPolicy: "fixed",
    circuit: { id: plan.circuitId, wallPathIds },
    bastions: bastions.map(({ wallEdgeIds, ...part }) => ({ ...part, wallSpans: spans(wallEdgeIds) })),
    curtains: curtains.map(({ wallEdgeIds, ...part }) => ({ ...part, wallSpans: spans(wallEdgeIds) })),
    accesses: accesses.map(({ gateId, roadId, ...access }) => {
      const roadPathIds = roadId ? groupPaths.get(roadId) : [];
      const portal = access.role === "civic" ? gateIds.get(gateId) : gateId;
      if (!portal || !roadPathIds || roadPathIds.some(id => !doc.paths[id]))
        throw Error(`defense-access-copy:${access.id}:${gateId}:${roadId}:${portal}:${roadPathIds?.length}`);
      return { ...access, portal: { kind: access.role === "civic" ? "gate" : "curtain", id: portal }, roadPathIds };
    })
  };
}
