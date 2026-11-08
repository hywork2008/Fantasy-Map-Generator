import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorFabricCell, VectorFabricDistrict, VectorFabricLines } from "../../../types/vector/fabric";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon } from "../../geom";
import { fabricCellHash, fabricDistrictHash } from "../fabric/hash";
import { FABRIC_QUANTUM_METERS, unpackLine, unpackPoints } from "../fabric/pack";

export const VECTOR_FABRIC_LIMITS = {
  districts: 20000,
  cells: 200000,
  houses: 300000,
  coordinatesPerRecord: 2_000_000
};
const ALGORITHMS = ["vector-urban-v5", "vector-urban-v6"];
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, required: string[], optional: string[] = []): v is RecordValue =>
  record(v) &&
  required.every(k => Object.hasOwn(v, k)) &&
  Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9:._/#-]{0,127}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(finite);
const ints = (v: unknown, max = VECTOR_FABRIC_LIMITS.coordinatesPerRecord): v is number[] =>
  Array.isArray(v) && v.length <= max && v.every(n => Number.isSafeInteger(n) && Math.abs(n) <= 1e9);
const indexList = (v: unknown, size: number): v is number[] =>
  ints(v) && v.every((n, i) => n >= 0 && n < size && (i === 0 || n > v[i - 1]));
/** Offsets start at 0 and give every item at least `min` points within `points`. */
const offsets = (v: unknown, points: number, min: number): v is number[] =>
  ints(v) &&
  (v.length === 0 ? points === 0 : v[0] === 0) &&
  v.every((n, i) => (i + 1 < v.length ? v[i + 1] : points) - n >= min);
const ring = (coords: number[], origin: Point): Point[] | undefined => {
  if (coords.length < 6 || coords.length % 2) return;
  const points = unpackPoints(coords, origin);
  return isSimplePolygon(points, 1e-12) ? points : undefined;
};
function lines(v: unknown): v is VectorFabricLines {
  return (
    keys(v, ["widths", "offsets", "coords"]) &&
    Array.isArray(v.widths) &&
    v.widths.every(w => finite(w) && w > 0 && w <= 50) &&
    ints(v.coords) &&
    v.coords.length % 2 === 0 &&
    offsets(v.offsets, v.coords.length / 2, 2) &&
    v.offsets.length === v.widths.length
  );
}

/** Checks that depend only on the record, cached by content hash. A changed record has a new hash. */
const intrinsic = new Map<string, string[]>();
const remember = (key: string, errors: string[]) => {
  if (intrinsic.size >= 100000) intrinsic.clear();
  intrinsic.set(key, errors);
  return errors;
};

/** Shape only; paths and joined lines are checked against the document in the urban validation. */
function detachedLines(v: unknown, owned: unknown): boolean {
  if (v === undefined) return true;
  const count = (owned as VectorFabricCell["lanes"] | undefined)?.widths?.length ?? 0;
  return (
    Array.isArray(v) &&
    v.length <= 10000 &&
    v.every(
      l =>
        keys(l, ["index", "pathId", "joins"]) &&
        Number.isSafeInteger(l.index) &&
        (l.index as number) >= 0 &&
        (l.index as number) < count &&
        id(l.pathId) &&
        Array.isArray(l.joins) &&
        l.joins.length <= 2 &&
        l.joins.every(j => keys(j, ["end", "line"]) && (j.end === 0 || j.end === 1) && typeof j.line === "string")
    ) &&
    new Set(v.map(l => (l as { index: number }).index)).size === v.length
  );
}
function districtErrors(d: RecordValue, key: string): string[] {
  const at = `fabric-district:${key}`;
  if (
    !keys(
      d,
      ["id", "hash", "seed", "parameters", "origin", "outline", "boundaries", "streets", "mouths", "cellIds"],
      ["growthStage", "detachedLines"]
    ) ||
    !detachedLines(d.detachedLines, d.streets) ||
    d.id !== key ||
    !id(d.id) ||
    typeof d.hash !== "string" ||
    typeof d.seed !== "string" ||
    d.seed.length > 256 ||
    !keys(d.parameters, ["lotArea", "laneWidthMeters", "coverage", "streetCellMeters", "streetWidthMeters"]) ||
    !Object.values(d.parameters).every(v => finite(v) && v > 0) ||
    !point(d.origin) ||
    !ints(d.outline) ||
    !Array.isArray(d.boundaries) ||
    !lines(d.streets) ||
    !Array.isArray(d.mouths) ||
    !Array.isArray(d.cellIds) ||
    !d.cellIds.every(id) ||
    new Set(d.cellIds).size !== d.cellIds.length ||
    (d.growthStage !== undefined && !(Number.isSafeInteger(d.growthStage) && (d.growthStage as number) >= 0))
  )
    return [at];
  const district = d as unknown as VectorFabricDistrict;
  const hash = fabricDistrictHash(district);
  if (hash !== district.hash) return [`${at}:hash`];
  const cached = intrinsic.get(`d:${hash}`);
  if (cached) return cached;
  const outline = ring(district.outline, district.origin);
  if (
    !outline ||
    district.boundaries.length !== outline.length ||
    !district.boundaries.every(
      b =>
        keys(b, ["feature", "barrier", "setback"]) &&
        typeof b.feature === "boolean" &&
        typeof b.barrier === "boolean" &&
        finite(b.setback) &&
        b.setback >= 0
    ) ||
    !district.mouths.every(
      m =>
        keys(m, ["street", "end", "nodeId"]) &&
        Number.isSafeInteger(m.street) &&
        m.street >= 0 &&
        m.street < district.streets.widths.length &&
        (m.end === 0 || m.end === 1) &&
        id(m.nodeId)
    )
  )
    return remember(`d:${hash}`, [`${at}:geometry`]);
  return remember(`d:${hash}`, []);
}

function cellErrors(c: RecordValue, key: string): string[] {
  const at = `fabric-cell:${key}`;
  if (
    !keys(
      c,
      ["id", "hash", "districtId", "origin", "ring", "lanes", "attachments", "mouths", "houses", "detached"],
      ["inside", "cleared", "detachedLines"]
    ) ||
    !detachedLines(c.detachedLines, c.lanes) ||
    c.id !== key ||
    !id(c.id) ||
    typeof c.hash !== "string" ||
    !id(c.districtId) ||
    !point(c.origin) ||
    !ints(c.ring) ||
    !lines(c.lanes) ||
    !Array.isArray(c.attachments) ||
    !Array.isArray(c.mouths) ||
    !keys(c.houses, ["offsets", "coords", "storeys", "dwellings", "entrances", "draws"]) ||
    !Array.isArray(c.detached) ||
    (c.inside !== undefined && typeof c.inside !== "boolean") ||
    (c.cleared !== undefined &&
      (!Array.isArray(c.cleared) ||
        c.cleared.length > 100000 ||
        !c.cleared.every(d => typeof d === "number" && Number.isFinite(d))))
  )
    return [at];
  const cell = c as unknown as VectorFabricCell;
  const hash = fabricCellHash(cell);
  if (hash !== cell.hash) return [`${at}:hash`];
  const cached = intrinsic.get(`c:${hash}`);
  if (cached) return cached;
  const h = cell.houses;
  if (!ints(h.coords) || h.coords.length % 2 || !offsets(h.offsets, h.coords.length / 2, 3))
    return remember(`c:${hash}`, [`${at}:houses`]);
  const count = h.offsets.length;
  if (
    !ints(h.storeys) ||
    h.storeys.length !== count ||
    !h.storeys.every(n => n >= 1 && n <= 20) ||
    !ints(h.dwellings) ||
    h.dwellings.length !== count ||
    !h.dwellings.every(n => n >= 0 && n <= 1000) ||
    !ints(h.entrances) ||
    h.entrances.length !== count * 4 ||
    !Array.isArray(h.draws) ||
    h.draws.length !== count ||
    !h.draws.every(v => finite(v) && v >= 0 && v <= 1) ||
    !indexList(cell.detached, count) ||
    !cell.attachments.every(
      a =>
        keys(a, ["lane", "end", "street", "t"]) &&
        Number.isSafeInteger(a.lane) &&
        a.lane >= 0 &&
        a.lane < cell.lanes.widths.length &&
        (a.end === 0 || a.end === 1) &&
        Number.isSafeInteger(a.street) &&
        a.street >= 0 &&
        finite(a.t) &&
        a.t >= 0 &&
        a.t <= 1
    ) ||
    !cell.mouths.every(
      m =>
        keys(m, ["lane", "end", "nodeId"]) &&
        Number.isSafeInteger(m.lane) &&
        m.lane >= 0 &&
        m.lane < cell.lanes.widths.length &&
        (m.end === 0 || m.end === 1) &&
        id(m.nodeId)
    )
  )
    return remember(`c:${hash}`, [`${at}:houses`]);
  const cellRing = ring(cell.ring, cell.origin);
  if (!cellRing) return remember(`c:${hash}`, [`${at}:ring`]);
  // Houses stay within their street block; one quantum of rounding is allowed on the boundary.
  const tolerance = 2 * FABRIC_QUANTUM_METERS;
  const closed = [...cellRing, cellRing[0]];
  for (let i = 0; i < count; i++) {
    const end = i + 1 < count ? h.offsets[i + 1] : h.coords.length / 2;
    const house = unpackPoints(h.coords, cell.origin, h.offsets[i], end);
    if (
      !isSimplePolygon(house, 1e-12) ||
      !house.every(p => pointInPolygon(p, cellRing) || nearestOnPolyline(p, closed).dist <= tolerance)
    )
      return remember(`c:${hash}`, [`${at}:house:${i}`]);
  }
  return remember(`c:${hash}`, []);
}

/** Native v8 fabric. Record checks are cached by content hash; references between records and to the road
 * graph are checked every time. */
export function validateVectorFabric(doc: VectorCityDocument): string[] {
  const fabric: unknown = doc.fabric;
  if (
    !keys(fabric, ["algorithm", "districts", "cells"]) ||
    !ALGORITHMS.includes(fabric.algorithm as string) ||
    !record(fabric.districts) ||
    !record(fabric.cells) ||
    Object.keys(fabric.districts).length > VECTOR_FABRIC_LIMITS.districts ||
    Object.keys(fabric.cells).length > VECTOR_FABRIC_LIMITS.cells
  )
    return ["fabric"];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(fabric.districts))
    errors.push(...(record(value) ? districtErrors(value, key) : [`fabric-district:${key}`]));
  for (const [key, value] of Object.entries(fabric.cells))
    errors.push(...(record(value) ? cellErrors(value, key) : [`fabric-cell:${key}`]));
  if (errors.length) return errors;
  const districts = fabric.districts as Record<string, VectorFabricDistrict>,
    cells = fabric.cells as Record<string, VectorFabricCell>;
  let houses = 0;
  for (const cell of Object.values(cells)) {
    houses += cell.houses.offsets.length;
    const district = Object.hasOwn(districts, cell.districtId) ? districts[cell.districtId] : undefined;
    if (!district?.cellIds.includes(cell.id)) {
      errors.push(`fabric-cell:${cell.id}:district`);
      continue;
    }
    for (const a of cell.attachments) {
      if (a.street >= district.streets.widths.length) {
        errors.push(`fabric-cell:${cell.id}:attachment`);
        break;
      }
      const lane = unpackLine(cell.lanes, a.lane, cell.origin),
        end = a.end === 0 ? lane[0] : lane.at(-1)!,
        street = unpackLine(district.streets, a.street, district.origin);
      if (nearestOnPolyline(end, street).dist > 2 * FABRIC_QUANTUM_METERS) {
        errors.push(`fabric-cell:${cell.id}:attachment`);
        break;
      }
    }
  }
  for (const cell of Object.values(cells))
    for (const m of cell.mouths) {
      const node = Object.hasOwn(doc.connections.nodes, m.nodeId) ? doc.connections.nodes[m.nodeId] : undefined,
        lane = unpackLine(cell.lanes, m.lane, cell.origin),
        end = m.end === 0 ? lane[0] : lane.at(-1)!;
      if (!node || Math.hypot(node.position[0] - end[0], node.position[1] - end[1]) > FABRIC_QUANTUM_METERS) {
        errors.push(`fabric-cell:${cell.id}:mouth`);
        break;
      }
    }
  if (houses > VECTOR_FABRIC_LIMITS.houses) errors.push("fabric-houses");
  for (const district of Object.values(districts)) {
    if (!district.cellIds.every(cellId => Object.hasOwn(cells, cellId) && cells[cellId].districtId === district.id))
      errors.push(`fabric-district:${district.id}:cells`);
    for (const m of district.mouths) {
      const node = Object.hasOwn(doc.connections.nodes, m.nodeId) ? doc.connections.nodes[m.nodeId] : undefined,
        street = unpackLine(district.streets, m.street, district.origin),
        end = m.end === 0 ? street[0] : street.at(-1)!;
      if (!node || Math.hypot(node.position[0] - end[0], node.position[1] - end[1]) > FABRIC_QUANTUM_METERS) {
        errors.push(`fabric-district:${district.id}:mouth`);
        break;
      }
    }
  }
  return errors;
}
