import type { CityDocument, EdgeRef, FeatureGroup } from "../../../core/types";
export function appendGeneratedGroup(next: CityDocument, group: FeatureGroup): void {
  if (next.featureGroups.some(existing => existing.id === group.id && existing.locked)) return;
  if (group.kind === "wall" && next.castles?.length) {
    const occupied = new Set(next.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
    const runs: EdgeRef[][] = [];
    let current: EdgeRef[] = [];
    for (const ref of group.segments) {
      if (occupied.has(ref.edgeId)) {
        if (current.length) runs.push(current);
        current = [];
      } else current.push(ref);
    }
    if (current.length) runs.push(current);
    for (const [index, segments] of runs.entries())
      next.featureGroups.push({
        ...group,
        id: next.featureGroups.some(g => g.id === group.id) || index ? `${group.id}:town-run-${index}` : group.id,
        segments
      });
    return;
  }
  next.featureGroups.push(group);
}
