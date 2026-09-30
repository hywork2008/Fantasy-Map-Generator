import { boundaryInsets } from "../connectivity";
import { boundaryPoints, distance, onSegment, samePoint } from "../geometry";
import type { GenerationSettings, Level, Point } from "../types";
import type { LayoutPlan } from "./types";

/** Split every side at all T-junctions, then give coincident sides a single ID.
 * Canonical sides point right/down; forward rings own leftSpaceId. */
export function buildLevel(plan: LayoutPlan, settings: GenerationSettings): Level {
  const level: Level = {
    id: "level-1",
    elevationMeters: 0,
    vertices: {},
    boundaries: {},
    spaces: {},
    openings: {},
    fixtures: {},
    entrances: []
  };
  const rings = plan.spaces.map(space => {
    const [x0, y0, x1, y1] = space.rect;
    if (x1 <= x0 || y1 <= y0) throw new Error("空間の寸法が不足しています。");
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1]
    ] as Point[];
  });
  const vertexIds = new Map<string, string>();
  const vertex = (point: Point): string => {
    const key = point.join(",");
    let id = vertexIds.get(key);
    if (!id) {
      id = `v-${vertexIds.size + 1}`;
      vertexIds.set(key, id);
      level.vertices[id] = { id, point };
    }
    return id;
  };
  const edgeIds = new Map<string, string>();
  const points: Point[] = [];
  for (const ring of rings) points.push(...ring);
  for (let i = 0; i < plan.spaces.length; i++) {
    const planned = plan.spaces[i];
    const space = {
      id: planned.id,
      kind: planned.kind,
      use: planned.use,
      label: planned.label,
      roof: planned.kind === "courtyard" || planned.kind === "yard" ? ("open" as const) : ("covered" as const),
      boundaryRefs: [] as Array<{ boundaryId: string; forward: boolean }>,
      required: true,
      locked: false
    };
    level.spaces[space.id] = space;
    const ring = rings[i];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      const candidates = points.filter(p => onSegment(p, a, b)).sort((p, q) => distance(a, p) - distance(a, q));
      const splits = candidates.filter((p, index) => index === 0 || !samePoint(p, candidates[index - 1]));
      for (let k = 0; k < splits.length - 1; k++) {
        const p = splits[k];
        const q = splits[k + 1];
        const forward = p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]);
        const start = vertex(forward ? p : q);
        const end = vertex(forward ? q : p);
        const key = `${start}/${end}`;
        let id = edgeIds.get(key);
        if (!id) {
          id = `b-${edgeIds.size + 1}`;
          edgeIds.set(key, id);
          level.boundaries[id] = {
            id,
            a: start,
            b: end,
            leftSpaceId: null,
            rightSpaceId: null,
            barrier: "wall",
            thicknessMeters: settings.partitionWallMeters,
            locked: false
          };
        }
        const boundary = level.boundaries[id];
        const ownerKey = forward ? "leftSpaceId" : "rightSpaceId";
        if (boundary[ownerKey]) throw new Error("空間が重複しています。");
        boundary[ownerKey] = space.id;
        space.boundaryRefs.push({ boundaryId: id, forward });
      }
    }
  }
  for (const boundary of Object.values(level.boundaries)) {
    if (!boundary.leftSpaceId || !boundary.rightSpaceId) boundary.thicknessMeters = settings.outerWallMeters;
  }
  const addOpening = (boundaryId: string, width: number, kind: "door" | "gate" | "arch"): string => {
    const boundary = level.boundaries[boundaryId];
    const len = distance(...boundaryPoints(level, boundary));
    const [start, end] = boundaryInsets(level, boundary).map(value => Math.max(0.25, value));
    if (len < width + start + end) throw new Error("扉を配置する共有壁の長さが不足しています。");
    const id = `o-${Object.keys(level.openings).length + 1}`;
    level.openings[id] = {
      id,
      boundaryId,
      offsetMeters: Math.max(start, Math.min(len - width - end, (len - width) / 2)),
      widthMeters: width,
      kind,
      state: kind === "door" ? "closed" : "open",
      visibility: "visible",
      locked: false
    };
    return id;
  };
  for (const connection of plan.connections) {
    const shared = Object.values(level.boundaries).filter(
      edge =>
        (edge.leftSpaceId === connection.a && edge.rightSpaceId === connection.b) ||
        (edge.leftSpaceId === connection.b && edge.rightSpaceId === connection.a)
    );
    if (!shared.length) throw new Error("接続対象の空間が隣接していません。");
    if (connection.kind === "open") {
      for (const edge of shared) {
        edge.barrier = "open";
        edge.thicknessMeters = 0;
      }
    } else {
      shared.sort((a, b) => distance(...boundaryPoints(level, b)) - distance(...boundaryPoints(level, a)));
      addOpening(shared[0].id, connection.width, connection.kind);
    }
  }
  const entrance = level.spaces[plan.entranceSpaceId];
  const planned = plan.spaces.find(space => space.id === entrance.id)!;
  const [x0, y0, x1, y1] = planned.rect;
  const exterior = entrance.boundaryRefs
    .map(ref => level.boundaries[ref.boundaryId])
    .filter(edge => {
      if (edge.leftSpaceId && edge.rightSpaceId) return false;
      const [a, b] = boundaryPoints(level, edge);
      if (plan.entranceSide === "north") return a[1] === y0 && b[1] === y0;
      if (plan.entranceSide === "south") return a[1] === y1 && b[1] === y1;
      if (plan.entranceSide === "west") return a[0] === x0 && b[0] === x0;
      return a[0] === x1 && b[0] === x1;
    })
    .sort((a, b) => distance(...boundaryPoints(level, b)) - distance(...boundaryPoints(level, a)));
  if (!exterior.length) throw new Error("主入口を外部境界に配置できません。");
  const gate = addOpening(exterior[0].id, plan.entranceWidth, "gate");
  level.entrances.push({ id: "e-1", openingId: gate, role: "main" });
  if (plan.fixture)
    level.fixtures["f-1"] = {
      id: "f-1",
      spaceId: plan.fixture.spaceId,
      kind: "well",
      footprint: plan.fixture.footprint,
      blocking: false,
      locked: false
    };
  return level;
}
