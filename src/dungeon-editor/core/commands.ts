import { boundaryInsets } from "./connectivity";
import { validateDocument } from "./document";
import { boundaryPoints, distance, snap } from "./geometry";
import type { DungeonDocument, Level, Opening } from "./types";

export type EditResult = { ok: true; document: DungeonDocument } | { ok: false; message: string };
function edit(document: DungeonDocument, change: (level: Level) => void): EditResult {
  const next = structuredClone(document);
  try {
    change(next.levels[0]);
    const error = validateDocument(next).find(item => item.severity === "error");
    return error ? { ok: false, message: error.message } : { ok: true, document: next };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "変更できませんでした。" };
  }
}
function nextId(prefix: string, collection: Record<string, unknown>): string {
  let index = 1;
  while (Object.hasOwn(collection, `${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}
function requireEditableBoundary(level: Level, boundaryId: string): void {
  const boundary = level.boundaries[boundaryId];
  if (!boundary) throw new Error("壁が見つかりません。");
  if (boundary.locked || [boundary.leftSpaceId, boundary.rightSpaceId].some(id => id && level.spaces[id].locked))
    throw new Error("壁または接する部屋がロックされています。");
}
export function updateSpace(
  document: DungeonDocument,
  spaceId: string,
  fields: { label?: string; use?: string; locked?: boolean }
): EditResult {
  return edit(document, level => {
    const space = level.spaces[spaceId];
    if (!space) throw new Error("部屋が見つかりません。");
    if (space.locked && (fields.label !== undefined || fields.use !== undefined))
      throw new Error("部屋がロックされています。");
    for (const value of [fields.label, fields.use])
      if (value !== undefined && value.length > 256) throw new Error("文字は 256 字以内にしてください。");
    Object.assign(space, fields);
  });
}
export function addOpening(
  document: DungeonDocument,
  boundaryId: string,
  centerOffset: number,
  width = 1.25
): EditResult {
  return edit(document, level => {
    requireEditableBoundary(level, boundaryId);
    const boundary = level.boundaries[boundaryId];
    if (boundary.barrier !== "wall") throw new Error("扉は壁に配置してください。");
    const len = distance(...boundaryPoints(level, boundary));
    const [start, end] = boundaryInsets(level, boundary).map(value => Math.max(0.25, value));
    if (!Number.isFinite(width) || width < 0.75 || width > len - start - end || !Number.isFinite(centerOffset))
      throw new Error("この壁には指定幅の扉が収まりません。");
    const id = nextId("o", level.openings);
    level.openings[id] = {
      id,
      boundaryId,
      offsetMeters: Math.max(start, Math.min(len - width - end, snap(centerOffset - width / 2))),
      widthMeters: width,
      kind: "door",
      state: "closed",
      visibility: "visible",
      locked: false
    };
    if (!boundary.leftSpaceId || !boundary.rightSpaceId) {
      const entranceId = nextId("e", Object.fromEntries(level.entrances.map(item => [item.id, item])));
      level.entrances.push({
        id: entranceId,
        openingId: id,
        role: level.entrances.some(item => item.role === "main") ? "secondary" : "main"
      });
    }
  });
}
export function updateOpening(
  document: DungeonDocument,
  openingId: string,
  fields: Partial<Pick<Opening, "offsetMeters" | "widthMeters" | "kind" | "state" | "visibility" | "locked">>
): EditResult {
  return edit(document, level => {
    const opening = level.openings[openingId];
    if (!opening) throw new Error("扉が見つかりません。");
    if (opening.locked && Object.keys(fields).some(key => key !== "locked"))
      throw new Error("扉がロックされています。");
    requireEditableBoundary(level, opening.boundaryId);
    if (
      (fields.offsetMeters !== undefined && !Number.isFinite(fields.offsetMeters)) ||
      (fields.widthMeters !== undefined && !Number.isFinite(fields.widthMeters))
    )
      throw new Error("扉の寸法を数値で指定してください。");
    Object.assign(opening, fields);
    if (opening.kind === "arch") opening.state = "open";
  });
}
export function removeOpening(document: DungeonDocument, openingId: string): EditResult {
  return edit(document, level => {
    const opening = level.openings[openingId];
    if (!opening) throw new Error("扉が見つかりません。");
    if (opening.locked) throw new Error("扉がロックされています。");
    requireEditableBoundary(level, opening.boundaryId);
    delete level.openings[openingId];
    level.entrances = level.entrances.filter(item => item.openingId !== openingId);
  });
}
export function setMainEntrance(document: DungeonDocument, openingId: string): EditResult {
  return edit(document, level => {
    const entrance = level.entrances.find(item => item.openingId === openingId);
    if (!entrance) throw new Error("主入口は外壁上の扉から選んでください。");
    for (const item of level.entrances) item.role = item === entrance ? "main" : "secondary";
  });
}
/** Move a whole connected collinear chain, keeping all adjoining rectangles
 * orthogonal and updating their shared vertices in one transaction. */
export function moveBoundary(document: DungeonDocument, boundaryId: string, deltaMeters: number): EditResult {
  return edit(document, level => {
    requireEditableBoundary(level, boundaryId);
    if (!Number.isFinite(deltaMeters)) throw new Error("移動距離を数値で指定してください。");
    const boundary = level.boundaries[boundaryId];
    const [a, b] = boundaryPoints(level, boundary);
    const axis = a[0] === b[0] ? 0 : 1;
    const vertices = new Set([boundary.a, boundary.b]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of Object.values(level.boundaries)) {
        const [p, q] = boundaryPoints(level, edge);
        if (p[axis] !== a[axis] || q[axis] !== a[axis] || (!vertices.has(edge.a) && !vertices.has(edge.b))) continue;
        if (!vertices.has(edge.a) || !vertices.has(edge.b)) changed = true;
        vertices.add(edge.a);
        vertices.add(edge.b);
      }
    }
    for (const edge of Object.values(level.boundaries)) {
      if (!vertices.has(edge.a) && !vertices.has(edge.b)) continue;
      requireEditableBoundary(level, edge.id);
      if (Object.values(level.openings).some(opening => opening.boundaryId === edge.id && opening.locked))
        throw new Error("移動する壁にロック済みの扉があります。");
    }
    const delta = snap(deltaMeters);
    for (const id of vertices) level.vertices[id].point[axis] += delta;
  });
}
