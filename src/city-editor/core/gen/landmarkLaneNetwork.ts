import { connectedRoadEdgeIds } from "../landmarks";
import type { CityDocument, Id, Point } from "../types";
import { nearestOnPolyline, segmentSegmentHit } from "./geom";
import type { InfillLane } from "./localInfill";
import { type Bounds, bounds, PlotIndex } from "./parcelGeometry";

export interface LandmarkLane extends InfillLane {
  id: Id;
  connectedToRoad: boolean;
}

function box(points: Point[], padding = 0): Bounds {
  const [x0, y0, x1, y1] = bounds(points);
  return [x0 - padding, y0 - padding, x1 + padding, y1 + padding];
}

/** Direction-independent identity from face, geometry and width; array order never enters the ID. */
export function landmarkLaneId(lane: Pick<InfillLane, "faceId" | "points" | "widthMeters">): Id {
  const coordinates = lane.points.map(point => point.map(value => Math.round(value * 100)).join(","));
  const forward = coordinates.join(";");
  const reverse = [...coordinates].reverse().join(";");
  const signature = `${lane.faceId}|${Math.round(lane.widthMeters * 100)}|${forward < reverse ? forward : reverse}`;
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `lane-${lane.faceId}-${(hash >>> 0).toString(36)}`;
}

function touches(a: Point[], b: Point[]): boolean {
  if (a.some(point => nearestOnPolyline(point, b).dist <= 1) || b.some(point => nearestOnPolyline(point, a).dist <= 1))
    return true;
  return a.slice(1).some((end, i) => b.slice(1).some((other, j) => segmentSegmentHit(a[i], end, b[j], other) !== null));
}

/** Only lanes in a component rooted at an exterior-connected public road may receive an entrance. */
export function buildLandmarkLaneNetwork(document: CityDocument, lanes: ReadonlyArray<InfillLane>): LandmarkLane[] {
  if (!lanes.length) return [];
  const publicEdges = connectedRoadEdgeIds(document);
  const roads = document.featureGroups.flatMap(group =>
    group.kind === "road"
      ? group.segments.flatMap(ref => {
          if (!publicEdges.has(ref.edgeId)) return [];
          const edge = document.mesh.edges[ref.edgeId];
          const a = document.mesh.vertices[edge?.a]?.point;
          const b = document.mesh.vertices[edge?.b]?.point;
          return a && b ? [{ points: [a, b], widthMeters: group.style.widthMeters }] : [];
        })
      : []
  );
  const index = new PlotIndex<number>(60);
  for (const [i, lane] of lanes.entries()) index.add(i, box(lane.points, 1));
  const links = lanes.map(() => new Set<number>());
  for (const [i, lane] of lanes.entries()) {
    for (const j of index.query(box(lane.points, 1))) {
      if (j <= i || !touches(lane.points, lanes[j].points)) continue;
      links[i].add(j);
      links[j].add(i);
    }
  }
  const connected = new Set<number>();
  const queue: number[] = [];
  lanes.forEach((lane, i) => {
    const rooted = lane.points.some(point =>
      roads.some(road => nearestOnPolyline(point, road.points).dist <= road.widthMeters / 2 + 1.5)
    );
    if (rooted) {
      connected.add(i);
      queue.push(i);
    }
  });
  for (let cursor = 0; cursor < queue.length; cursor++)
    for (const next of links[queue[cursor]]) {
      if (connected.has(next)) continue;
      connected.add(next);
      queue.push(next);
    }
  return lanes.map((lane, i) => ({ ...lane, id: landmarkLaneId(lane), connectedToRoad: connected.has(i) }));
}

/** A regenerated lane may change ID. Re-resolve near its saved attachment point. */
export function resolveLandmarkLaneTarget(
  id: Id,
  point: Point,
  lanes: ReadonlyArray<LandmarkLane>
): LandmarkLane | null {
  const exact = lanes.find(
    lane =>
      lane.id === id && lane.connectedToRoad && nearestOnPolyline(point, lane.points).dist <= lane.widthMeters / 2 + 1
  );
  if (exact) return exact;
  return (
    lanes
      .filter(lane => lane.connectedToRoad)
      .map(lane => ({ lane, distance: nearestOnPolyline(point, lane.points).dist }))
      .filter(candidate => candidate.distance <= candidate.lane.widthMeters / 2 + 1)
      .sort((a, b) => a.distance - b.distance)[0]?.lane ?? null
  );
}

/** Keep the saved corridor even when its generated lane has vanished; never turn it into housing. */
export function repairLandmarkLaneTargets(
  document: CityDocument,
  lanes: ReadonlyArray<LandmarkLane>
): { document: CityDocument; unresolved: Id[] } {
  const unresolved: Id[] = [];
  let changed = false;
  const landmarks = (document.landmarks ?? []).map(instance => {
    const accesses = instance.accesses.map(access => {
      if (access.target.kind !== "lane") return access;
      const lane = resolveLandmarkLaneTarget(access.target.id, access.target.point, lanes);
      if (!lane) {
        unresolved.push(instance.id);
        return access;
      }
      const point = nearestOnPolyline(access.target.point, lane.points).point;
      if (lane.id === access.target.id && point[0] === access.target.point[0] && point[1] === access.target.point[1])
        return access;
      changed = true;
      return {
        ...access,
        points: [...access.points.slice(0, -1), point],
        target: { kind: "lane" as const, id: lane.id, point }
      };
    });
    return accesses.every((access, i) => access === instance.accesses[i]) ? instance : { ...instance, accesses };
  });
  return { document: changed ? { ...document, landmarks } : document, unresolved };
}
