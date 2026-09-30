import { boundaryPoints, distance } from "./geometry";
import type { Boundary, Diagnostic, DungeonDocument, Level } from "./types";

export type AccessMode = "normal" | "structural" | "current";

/** An open junction still loses clearance at thick perpendicular walls. */
export function boundaryInsets(level: Level, boundary: Boundary): [number, number] {
  const [a, b] = boundaryPoints(level, boundary);
  const vertical = a[0] === b[0];
  const trim = (vertexId: string): number =>
    Math.max(
      0,
      ...Object.values(level.boundaries)
        .filter(edge => {
          if (edge.barrier !== "wall" || (edge.a !== vertexId && edge.b !== vertexId)) return false;
          const [p, q] = boundaryPoints(level, edge);
          return (p[0] === q[0]) !== vertical;
        })
        .map(edge => edge.thicknessMeters / 2)
    );
  return [trim(boundary.a), trim(boundary.b)];
}

export function boundaryClearance(level: Level, boundary: Boundary): number {
  const [start, end] = boundaryInsets(level, boundary);
  return distance(...boundaryPoints(level, boundary)) - start - end;
}

export function buildAccessGraph(level: Level, mode: AccessMode = "normal"): Map<string, Set<string>> {
  const graph = new Map(Object.keys(level.spaces).map(id => [id, new Set<string>()]));
  for (const boundary of Object.values(level.boundaries)) {
    const a = boundary.leftSpaceId;
    const b = boundary.rightSpaceId;
    if (!a || !b) continue;
    const passable =
      boundary.barrier === "open"
        ? boundaryClearance(level, boundary) >= 0.75
        : Object.values(level.openings).some(opening => {
            if (opening.boundaryId !== boundary.id || opening.widthMeters < 0.75) return false;
            if (mode !== "structural" && opening.visibility === "secret") return false;
            return mode !== "current" || opening.kind === "arch" || opening.state === "open";
          });
    if (passable) {
      graph.get(a)!.add(b);
      graph.get(b)!.add(a);
    }
  }
  return graph;
}

export function accessSummary(
  level: Level,
  mode: AccessMode = "normal"
): { reachable: Set<string>; loops: number; components: number } {
  const graph = buildAccessGraph(level, mode);
  const reachable = new Set<string>();
  const main = level.entrances.find(entrance => entrance.role === "main");
  const opening = main && level.openings[main.openingId];
  const boundary = opening && level.boundaries[opening.boundaryId];
  const root = boundary && (boundary.leftSpaceId ?? boundary.rightSpaceId);
  const visit = (start: string, visited: Set<string>) => {
    const queue = [start];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...graph.get(id)!);
    }
  };
  if (
    root &&
    opening &&
    (mode === "structural" || opening.visibility === "visible") &&
    (mode !== "current" || opening.kind === "arch" || opening.state === "open") &&
    opening.widthMeters >= 0.75
  )
    visit(root, reachable);
  const visited = new Set<string>();
  let components = 0;
  for (const id of graph.keys()) {
    if (visited.has(id)) continue;
    components++;
    visit(id, visited);
  }
  const edges = [...graph.values()].reduce((sum, neighbors) => sum + neighbors.size, 0) / 2;
  return { reachable, loops: edges - graph.size + components, components };
}

export function accessDiagnostics(document: DungeonDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const level of document.levels) {
    if (!level.entrances.some(entrance => entrance.role === "main"))
      diagnostics.push({ severity: "warning", message: "主入口がありません。外壁に主入口を設定してください。" });
    const { reachable } = accessSummary(level);
    for (const space of Object.values(level.spaces)) {
      if (space.required && !reachable.has(space.id))
        diagnostics.push({
          severity: "warning",
          targetId: space.id,
          message: `${space.label || space.use} (${space.id}) に主入口から到達できません。`
        });
    }
  }
  return diagnostics;
}
