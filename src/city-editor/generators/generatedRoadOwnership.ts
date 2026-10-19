import type { CityDocument, EdgeFeatureGroup, EdgeRef, FeatureGroup, Id, Mesh } from "../types/document";

/** Roads whose route identity carries an external destination or a crossing
 * contract remain authoritative. Ordinary generated streets own only their
 * physical intervals, even when their planned route reused a longer road. */
function isGeneratedStreet(group: FeatureGroup, preserved: ReadonlySet<Id>): boolean {
  return (
    group.kind === "road" &&
    /^gc:(road|street|riverRoad|ring-road)-/.test(group.id) &&
    !group.locked &&
    !group.sourceRoad &&
    !group.beyond &&
    !group.crossing &&
    !preserved.has(group.id)
  );
}

/** Split at omitted intervals; never concatenate across an existing road.
 * Join the serialization seam of a closed ring when both sides survive. */
export function ownedRoadRuns(mesh: Mesh, segments: readonly EdgeRef[], keep: (ref: EdgeRef) => boolean): EdgeRef[][] {
  const runs: EdgeRef[][] = [];
  let current: EdgeRef[] = [];
  const flush = () => {
    if (current.length) runs.push(current);
    current = [];
  };
  for (const ref of segments) {
    if (!keep(ref)) {
      flush();
      continue;
    }
    const previous = current.at(-1);
    if (
      previous &&
      mesh.edges[previous.edgeId][previous.forward ? "b" : "a"] !== mesh.edges[ref.edgeId][ref.forward ? "a" : "b"]
    )
      flush();
    current.push(ref);
  }
  flush();
  if (runs.length > 1) {
    const first = runs[0][0];
    const last = runs.at(-1)!.at(-1)!;
    if (mesh.edges[last.edgeId][last.forward ? "b" : "a"] === mesh.edges[first.edgeId][first.forward ? "a" : "b"]) {
      runs[0] = [...runs.pop()!, ...runs[0]];
    }
  }
  return runs;
}

/** Materialize the union, not overlapping route walks. Each ordinary street
 * edge has one owner across gate streets, optional streets and late repairs.
 * The edge union remains unchanged. Fixed-road styles are authoritative;
 * ordinary streets retain the widest owner. Mutates the candidate
 * document only; no mesh edits or coordinate snapping take place here. */
export function normalizeGeneratedRoadOwnership(document: CityDocument, preserved: ReadonlySet<Id> = new Set()) {
  const owner = new Map<Id, EdgeFeatureGroup>();
  const reserved = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    if (!isGeneratedStreet(group, preserved)) {
      for (const ref of group.segments) reserved.add(ref.edgeId);
      continue;
    }
    for (const ref of group.segments) {
      const previous = owner.get(ref.edgeId);
      if (!previous || group.style.widthMeters > previous.style.widthMeters) owner.set(ref.edgeId, group);
    }
  }
  const used = new Set<Id>(reserved);
  const ids = new Set(document.featureGroups.map(group => group.id));
  let removedRoadReferences = 0;
  let removedRoadGroups = 0;
  let splitRoadGroups = 0;
  document.featureGroups = document.featureGroups.flatMap((group): FeatureGroup[] => {
    if (group.kind !== "road" || !isGeneratedStreet(group, preserved)) return [group];
    const runs = ownedRoadRuns(document.mesh, group.segments, ref => {
      if (owner.get(ref.edgeId) !== group || used.has(ref.edgeId)) return false;
      used.add(ref.edgeId);
      return true;
    });
    removedRoadReferences += group.segments.length - runs.reduce((sum, run) => sum + run.length, 0);
    if (!runs.length) removedRoadGroups++;
    splitRoadGroups += Math.max(0, runs.length - 1);
    if (runs.length === 1 && runs[0].length === group.segments.length) return [group];
    return runs.map((segments, index) => {
      if (!index) return { ...group, segments };
      let suffix = index;
      while (ids.has(`${group.id}:part-${suffix}`)) suffix++;
      const id = `${group.id}:part-${suffix}`;
      ids.add(id);
      return { ...group, id, segments };
    });
  });
  return { removedRoadReferences, removedRoadGroups, splitRoadGroups };
}
