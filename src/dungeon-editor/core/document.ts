import { accessDiagnostics, boundaryInsets } from "./connectivity";
import { isGenerationSettings, validateSettings } from "./gen/settings";
import {
  boundaryPoints,
  bounds,
  distance,
  isSimplePolygon,
  onSegment,
  polygonArea,
  polygonsOverlap,
  properIntersection,
  samePoint,
  spacePolygon
} from "./geometry";
import type { Boundary, Diagnostic, DungeonDocument, Fixture, Level, Opening, Space, Vertex } from "./types";

export const MAX_FILE_BYTES = 2_000_000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 256;
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !["constructor", "prototype"].includes(value);
const nullableId = (value: unknown): boolean => value === null || id(value);
const point = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(finite);
const locked = (value: Record<string, unknown>): boolean => typeof value.locked === "boolean";

function collection<T>(
  value: unknown,
  limit: number,
  check: (item: Record<string, unknown>) => boolean
): value is Record<string, T> {
  if (!record(value) || Object.keys(value).length > limit) return false;
  return Object.entries(value).every(([key, item]) => id(key) && record(item) && item.id === key && check(item));
}
function isLevel(value: unknown): value is Level {
  if (!record(value) || !id(value.id) || !finite(value.elevationMeters)) return false;
  if (!collection<Vertex>(value.vertices, 2048, item => point(item.point))) return false;
  if (
    !collection<Space>(
      value.spaces,
      128,
      item =>
        ["room", "corridor", "courtyard", "yard"].includes(String(item.kind)) &&
        ["covered", "open"].includes(String(item.roof)) &&
        text(item.use) &&
        text(item.label) &&
        typeof item.required === "boolean" &&
        locked(item) &&
        Array.isArray(item.boundaryRefs) &&
        item.boundaryRefs.length >= 4 &&
        item.boundaryRefs.length <= 256 &&
        item.boundaryRefs.every(ref => record(ref) && id(ref.boundaryId) && typeof ref.forward === "boolean")
    )
  )
    return false;
  if (
    !collection<Boundary>(
      value.boundaries,
      2048,
      item =>
        id(item.a) &&
        id(item.b) &&
        nullableId(item.leftSpaceId) &&
        nullableId(item.rightSpaceId) &&
        ["wall", "open"].includes(String(item.barrier)) &&
        finite(item.thicknessMeters) &&
        locked(item)
    )
  )
    return false;
  if (
    !collection<Opening>(
      value.openings,
      512,
      item =>
        id(item.boundaryId) &&
        finite(item.offsetMeters) &&
        finite(item.widthMeters) &&
        ["door", "gate", "arch"].includes(String(item.kind)) &&
        ["open", "closed", "locked"].includes(String(item.state)) &&
        ["visible", "secret"].includes(String(item.visibility)) &&
        locked(item)
    )
  )
    return false;
  if (
    !collection<Fixture>(
      value.fixtures,
      128,
      item =>
        id(item.spaceId) &&
        ["well", "table"].includes(String(item.kind)) &&
        Array.isArray(item.footprint) &&
        item.footprint.length === 4 &&
        item.footprint.every(point) &&
        item.blocking === false &&
        locked(item)
    )
  )
    return false;
  return (
    Array.isArray(value.entrances) &&
    value.entrances.length <= 64 &&
    value.entrances.every(
      entrance =>
        record(entrance) &&
        id(entrance.id) &&
        id(entrance.openingId) &&
        ["main", "secondary"].includes(String(entrance.role))
    )
  );
}

/** Geometry errors prevent loading/committing. Accessibility is a warning on
 * hand-edited documents so an intentionally sealed room can still be saved. */
export function validateDocument(document: DungeonDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (message: string, targetId?: string) => diagnostics.push({ severity: "error", message, targetId });
  if (document.levels.length !== 1) error("初期版は単層平面のみ対応しています。");
  if (
    document.frame.widthMeters < 1 ||
    document.frame.depthMeters < 1 ||
    document.frame.widthMeters > 250 ||
    document.frame.depthMeters > 250
  )
    error("平面寸法は 1〜250 m にしてください。");
  for (const level of document.levels) {
    const spaces = Object.values(level.spaces);
    const boundaries = Object.values(level.boundaries);
    if (!spaces.length) error("空間がありません。");
    const positions = new Set<string>();
    for (const vertex of Object.values(level.vertices)) {
      const [x, y] = vertex.point;
      if (
        ![x, y].every(Number.isFinite) ||
        x < 0 ||
        y < 0 ||
        x > document.frame.widthMeters ||
        y > document.frame.depthMeters ||
        Math.abs(x * 4 - Math.round(x * 4)) > 1e-7 ||
        Math.abs(y * 4 - Math.round(y * 4)) > 1e-7
      )
        error("頂点は平面内の 0.25 m 格子に置いてください。", vertex.id);
      const key = vertex.point.join(",");
      if (positions.has(key)) error("同じ座標の頂点が重複しています。", vertex.id);
      positions.add(key);
    }
    for (const boundary of boundaries) {
      if (!Object.hasOwn(level.vertices, boundary.a) || !Object.hasOwn(level.vertices, boundary.b))
        error("壁の頂点参照が不正です。", boundary.id);
      if (
        (!boundary.leftSpaceId && !boundary.rightSpaceId) ||
        boundary.leftSpaceId === boundary.rightSpaceId ||
        [boundary.leftSpaceId, boundary.rightSpaceId].some(
          owner => owner !== null && !Object.hasOwn(level.spaces, owner)
        )
      )
        error("壁の空間参照が不正です。", boundary.id);
      if (
        (boundary.barrier === "open" &&
          (boundary.thicknessMeters !== 0 || !boundary.leftSpaceId || !boundary.rightSpaceId)) ||
        (boundary.barrier === "wall" && (boundary.thicknessMeters < 0.25 || boundary.thicknessMeters > 2))
      )
        error("壁厚・開放境界の設定が不正です。", boundary.id);
    }
    for (const space of spaces)
      if (space.boundaryRefs.some(ref => !Object.hasOwn(level.boundaries, ref.boundaryId)))
        error("空間の壁参照が不正です。", space.id);
    for (const opening of Object.values(level.openings))
      if (!Object.hasOwn(level.boundaries, opening.boundaryId)) error("扉の壁参照が不正です。", opening.id);
    for (const fixture of Object.values(level.fixtures))
      if (!Object.hasOwn(level.spaces, fixture.spaceId)) error("家具の空間参照が不正です。", fixture.id);
    if (diagnostics.length) return diagnostics;
    const refs = new Map<string, Set<string>>();
    const segments = new Set<string>();
    for (const boundary of boundaries) {
      const [a, b] = boundaryPoints(level, boundary);
      if (distance(a, b) < 0.25 || (a[0] !== b[0] && a[1] !== b[1]))
        error("壁は長さ 0.25 m 以上の直交線にしてください。", boundary.id);
      const key = [a.join(","), b.join(",")].sort().join("/");
      if (segments.has(key)) error("共有壁が二重に保存されています。", boundary.id);
      segments.add(key);
    }
    const polygons = new Map<string, ReturnType<typeof spacePolygon>>();
    for (const space of spaces) {
      const polygon = spacePolygon(level, space.id);
      polygons.set(space.id, polygon);
      if (!isSimplePolygon(polygon) || polygonArea(polygon) <= 0) error("空間の輪郭が交差・反転しています。", space.id);
      const box = bounds(polygon);
      if (Math.abs(polygonArea(polygon) - (box.x1 - box.x0) * (box.y1 - box.y0)) > 1e-6)
        error("初期版は矩形区画のみ対応しています。", space.id);
      const inset = { left: 0, right: 0, top: 0, bottom: 0 };
      for (let i = 0; i < space.boundaryRefs.length; i++) {
        const ref = space.boundaryRefs[i];
        const edge = level.boundaries[ref.boundaryId];
        const end = level.vertices[ref.forward ? edge.b : edge.a].point;
        const next = polygon[(i + 1) % polygon.length];
        if (!samePoint(end, next)) error("空間の輪郭が閉じていません。", space.id);
        if ((ref.forward ? edge.leftSpaceId : edge.rightSpaceId) !== space.id)
          error("壁と空間の所有関係が一致しません。", space.id);
        const owners = refs.get(edge.id) ?? new Set<string>();
        if (owners.has(space.id)) error("空間内に同じ壁が重複しています。", space.id);
        owners.add(space.id);
        refs.set(edge.id, owners);
        const [a, b] = boundaryPoints(level, edge);
        const half = edge.thicknessMeters / 2;
        if (a[0] === box.x0 && b[0] === box.x0) inset.left = Math.max(inset.left, half);
        if (a[0] === box.x1 && b[0] === box.x1) inset.right = Math.max(inset.right, half);
        if (a[1] === box.y0 && b[1] === box.y0) inset.top = Math.max(inset.top, half);
        if (a[1] === box.y1 && b[1] === box.y1) inset.bottom = Math.max(inset.bottom, half);
      }
      const clearWidth = box.x1 - box.x0 - inset.left - inset.right;
      const clearDepth = box.y1 - box.y0 - inset.top - inset.bottom;
      const minimum = space.kind === "corridor" ? document.generation.settings.corridorWidthMeters : 0.75;
      if (Math.min(clearWidth, clearDepth) + 1e-7 < minimum)
        error(`壁厚を差し引いた空間の幅が ${minimum} m 未満です。`, space.id);
    }
    for (const boundary of boundaries) {
      const expected = [boundary.leftSpaceId, boundary.rightSpaceId].filter(owner => owner !== null);
      if (refs.get(boundary.id)?.size !== expected.length || expected.some(owner => !refs.get(boundary.id)?.has(owner)))
        error("未使用または不整合な共有壁があります。", boundary.id);
    }
    for (let i = 0; i < spaces.length; i++)
      for (let j = i + 1; j < spaces.length; j++) {
        if (polygonsOverlap(polygons.get(spaces[i].id)!, polygons.get(spaces[j].id)!))
          error("空間が重複しています。", spaces[j].id);
      }
    for (let i = 0; i < boundaries.length; i++)
      for (let j = i + 1; j < boundaries.length; j++) {
        const [a, b] = boundaryPoints(level, boundaries[i]);
        const [c, d] = boundaryPoints(level, boundaries[j]);
        const interior = (p: typeof a, q: typeof a, r: typeof a) =>
          onSegment(p, q, r) && !samePoint(p, q) && !samePoint(p, r);
        if (
          properIntersection(a, b, c, d) ||
          interior(a, c, d) ||
          interior(b, c, d) ||
          interior(c, a, b) ||
          interior(d, a, b)
        )
          error("壁の交差・T 字接続が分割されていません。", boundaries[j].id);
      }
    const byBoundary = new Map<string, Opening[]>();
    for (const opening of Object.values(level.openings)) {
      const edge = level.boundaries[opening.boundaryId];
      const len = distance(...boundaryPoints(level, edge));
      const [startInset, endInset] = boundaryInsets(level, edge);
      if (
        edge.barrier !== "wall" ||
        opening.widthMeters < 0.75 ||
        opening.offsetMeters < Math.max(0.25, startInset) - 1e-7 ||
        opening.offsetMeters + opening.widthMeters > len - Math.max(0.25, endInset) + 1e-7
      )
        error("扉が壁や角からはみ出しています（角から 0.25 m 以上必要）。", opening.id);
      const siblings = byBoundary.get(edge.id) ?? [];
      if (
        siblings.some(
          other =>
            Math.max(other.offsetMeters, opening.offsetMeters) <
            Math.min(other.offsetMeters + other.widthMeters, opening.offsetMeters + opening.widthMeters) + 0.25 - 1e-7
        )
      )
        error("扉の間には 0.25 m 以上の壁を残してください。", opening.id);
      siblings.push(opening);
      byBoundary.set(edge.id, siblings);
    }
    const entranceIds = new Set<string>();
    const entranceOpenings = new Set<string>();
    if (level.entrances.filter(item => item.role === "main").length > 1) error("主入口は一つにしてください。");
    for (const entrance of level.entrances) {
      const opening = level.openings[entrance.openingId];
      const boundary = opening && level.boundaries[opening.boundaryId];
      if (
        !opening ||
        !boundary ||
        (boundary.leftSpaceId && boundary.rightSpaceId) ||
        entranceIds.has(entrance.id) ||
        entranceOpenings.has(entrance.openingId)
      )
        error("入口は重複しない外部境界の開口を参照してください。", entrance.id);
      entranceIds.add(entrance.id);
      entranceOpenings.add(entrance.openingId);
    }
    for (const fixture of Object.values(level.fixtures)) {
      const box = bounds(polygons.get(fixture.spaceId)!);
      if (
        !isSimplePolygon(fixture.footprint) ||
        polygonArea(fixture.footprint) <= 0 ||
        fixture.footprint.some(
          ([x, y]) =>
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x <= box.x0 + 1 ||
            x >= box.x1 - 1 ||
            y <= box.y0 + 1 ||
            y >= box.y1 - 1
        )
      )
        error("装飾は空間の壁から 1 m 以上離してください。", fixture.id);
    }
  }
  return diagnostics.some(item => item.severity === "error")
    ? diagnostics
    : [...diagnostics, ...accessDiagnostics(document)];
}

export function parseDocument(
  json: string
): { ok: true; document: DungeonDocument; diagnostics: Diagnostic[] } | { ok: false; message: string } {
  if (new TextEncoder().encode(json).length > MAX_FILE_BYTES)
    return { ok: false, message: "ファイルは 2 MB 以下にしてください。" };
  try {
    const value: unknown = JSON.parse(json);
    if (
      !record(value) ||
      value.format !== "fmg-dungeon-editor" ||
      value.version !== 1 ||
      !id(value.id) ||
      !text(value.title) ||
      value.units !== "meters" ||
      !record(value.frame) ||
      !finite(value.frame.widthMeters) ||
      !finite(value.frame.depthMeters) ||
      !Array.isArray(value.levels) ||
      value.levels.length !== 1 ||
      !value.levels.every(isLevel) ||
      !record(value.generation) ||
      value.generation.algorithmVersion !== "dungeon-v1" ||
      !isGenerationSettings(value.generation.settings) ||
      value.generation.strategy !== value.generation.settings.strategy ||
      value.generation.seed !== value.generation.settings.seed ||
      !Number.isInteger(value.generation.attempt) ||
      Number(value.generation.attempt) < 0 ||
      Number(value.generation.attempt) >= 32
    )
      return { ok: false, message: "対応していない形式・版、または不正な文書です。" };
    const document = value as unknown as DungeonDocument;
    const settingsErrors = validateSettings(document.generation.settings);
    if (settingsErrors.length) return { ok: false, message: settingsErrors[0].message };
    if (
      document.frame.widthMeters !== document.generation.settings.widthMeters ||
      document.frame.depthMeters !== document.generation.settings.depthMeters
    )
      return { ok: false, message: "平面寸法と生成記録が一致しません。" };
    const diagnostics = validateDocument(document);
    const invalid = diagnostics.find(item => item.severity === "error");
    return invalid ? { ok: false, message: invalid.message } : { ok: true, document, diagnostics };
  } catch {
    return { ok: false, message: "JSON を読み込めませんでした。" };
  }
}
