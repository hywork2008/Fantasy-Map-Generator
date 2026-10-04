import { footprintTouchesWater, normalWaterSection, validWaterPolygon } from "../services/riverPhysicalGeometry";
import { isRequiredSiteBounds, type RequiredSiteBounds, requiredSiteExtent } from "./requiredSiteBounds";

type Point = readonly [number, number];
export const FIXED_SITE_CROSSING_BUDGETS = Object.freeze({ maxFacilities: 100, maxWaterVertices: 10000 });

export interface FixedCrossingBudgets {
  maxFacilities: number;
  maxWaterVertices: number;
}
export interface FixedBurgCrossings {
  /** v2 also accepts surveyed water with no bridge facilities. */
  schemaVersion: 1 | 2 | 3 | 4;
  /** v4: complete additional world water within coverageBounds, with fixed bridges. */
  obstacles?: readonly { id: number; rings: readonly (readonly Point[])[] }[];
  /** v3 certifies only this CE-local area; no bridge facilities are inferred. */
  coverageBounds?: RequiredSiteBounds;
  coordinateUnit: "metres";
  revision: number;
  originMeters: Point;
  roadWidthMeters: number;
  requiredBounds: RequiredSiteBounds;
  rivers: readonly {
    id: number;
    geometryVersion: number;
    rings: readonly (readonly Point[])[];
    sourceSegments?: readonly number[];
    artificialCaps?: readonly (readonly [number, number])[];
    bankPrecisionMeters?: number;
  }[];
  crossings: readonly {
    id: number;
    riverId: number;
    geometryVersion: number;
    kind: "fixedBridge" | "movableBridge";
    q: Point;
    tangent: Point;
    normal: Point;
    waterA: Point;
    waterB: Point;
    deckA: Point;
    deckB: Point;
    approachA: Point;
    approachB: Point;
    witness: { kind: "line" | "cubic"; controls: readonly Point[]; parameter: number };
  }[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const id = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const keys = (v: object, names: string) => Object.keys(v).sort().join() === names.split(",").sort().join();
const close = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7;
/** Validate bounded JSON data before CE uses it; this does not restore FMG session authentication. */
export function validFixedBurgCrossings(raw: unknown, budgets: FixedCrossingBudgets): raw is FixedBurgCrossings {
  if (![budgets.maxFacilities, budgets.maxWaterVertices].every(n => Number.isSafeInteger(n) && n >= 0)) return false;
  if (
    !record(raw) ||
    !keys(
      raw,
      `schemaVersion,coordinateUnit,revision,originMeters,roadWidthMeters,requiredBounds,rivers,crossings${raw.schemaVersion === 3 ? ",coverageBounds" : raw.schemaVersion === 4 ? ",coverageBounds,obstacles" : ""}`
    ) ||
    (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.schemaVersion !== 4) ||
    raw.coordinateUnit !== "metres" ||
    !id(raw.revision) ||
    !point(raw.originMeters) ||
    typeof raw.roadWidthMeters !== "number" ||
    !Number.isFinite(raw.roadWidthMeters) ||
    raw.roadWidthMeters <= 0 ||
    !isRequiredSiteBounds(raw.requiredBounds) ||
    !Array.isArray(raw.rivers) ||
    !Array.isArray(raw.crossings) ||
    raw.crossings.length > budgets.maxFacilities ||
    raw.rivers.length > budgets.maxFacilities ||
    ((raw.schemaVersion === 1 || raw.schemaVersion === 4) && raw.rivers.length > raw.crossings.length) ||
    ((raw.schemaVersion === 2 || raw.schemaVersion === 3) && raw.crossings.length !== 0)
  )
    return false;
  if (
    (raw.schemaVersion === 3 || raw.schemaVersion === 4) &&
    (!isRequiredSiteBounds(raw.coverageBounds) ||
      raw.coverageBounds.minX > raw.requiredBounds.minX ||
      raw.coverageBounds.minY > raw.requiredBounds.minY ||
      raw.coverageBounds.maxX < raw.requiredBounds.maxX ||
      raw.coverageBounds.maxY < raw.requiredBounds.maxY)
  )
    return false;
  let vertices = 0;
  if (raw.schemaVersion === 4) {
    if (!Array.isArray(raw.obstacles) || raw.obstacles.length > budgets.maxWaterVertices) return false;
    for (const obstacle of raw.obstacles) {
      if (
        !record(obstacle) ||
        !keys(obstacle, "id,rings") ||
        !Number.isSafeInteger(obstacle.id) ||
        !Array.isArray(obstacle.rings)
      )
        return false;
      for (const ring of obstacle.rings) {
        if (!Array.isArray(ring) || !ring.every(point) || vertices + ring.length > budgets.maxWaterVertices)
          return false;
        vertices += ring.length;
      }
      if (!validWaterPolygon(obstacle as unknown as { id: number; rings: Point[][] })) return false;
    }
  }
  const riverIds = new Set<number>();
  for (const r of raw.rivers) {
    if (
      !record(r) ||
      !keys(
        r,
        `id,geometryVersion,rings${raw.schemaVersion === 3 ? ",sourceSegments,artificialCaps,bankPrecisionMeters" : ""}`
      ) ||
      !id(r.id) ||
      !id(r.geometryVersion) ||
      r.geometryVersion < 1 ||
      riverIds.has(r.id) ||
      !Array.isArray(r.rings)
    )
      return false;
    if (raw.schemaVersion === 3) {
      if (
        !Array.isArray(r.sourceSegments) ||
        !r.sourceSegments.length ||
        r.sourceSegments.length > budgets.maxWaterVertices ||
        !r.sourceSegments.every((v, i, a) => id(v) && (i === 0 || v > a[i - 1])) ||
        typeof r.bankPrecisionMeters !== "number" ||
        !Number.isFinite(r.bankPrecisionMeters) ||
        r.bankPrecisionMeters <= 0 ||
        !Array.isArray(r.artificialCaps) ||
        r.artificialCaps.length > budgets.maxWaterVertices
      )
        return false;
      const coverage = raw.coverageBounds as RequiredSiteBounds;
      for (const cap of r.artificialCaps) {
        if (!Array.isArray(cap) || cap.length !== 2 || !cap.every(id)) return false;
        const ring = r.rings[cap[0]];
        if (!Array.isArray(ring) || !ring.length || cap[1] >= ring.length) return false;
        const a = ring[cap[1]],
          b = ring[(cap[1] + 1) % ring.length];
        if (
          !point(a) ||
          !point(b) ||
          (Math.min(a[0], b[0]) <= coverage.maxX &&
            Math.max(a[0], b[0]) >= coverage.minX &&
            Math.min(a[1], b[1]) <= coverage.maxY &&
            Math.max(a[1], b[1]) >= coverage.minY)
        )
          return false;
      }
    }
    riverIds.add(r.id);
    for (const ring of r.rings) {
      if (
        !Array.isArray(ring) ||
        ring.length < 3 ||
        vertices + ring.length > budgets.maxWaterVertices ||
        !ring.every(point)
      )
        return false;
      vertices += ring.length;
    }
    if (!validWaterPolygon(r as unknown as { id: number; rings: Point[][] })) return false;
  }
  const a = raw as unknown as FixedBurgCrossings;
  const ids = new Set<number>();
  for (const c of a.crossings) {
    if (
      !record(c) ||
      !keys(
        c,
        "id,riverId,geometryVersion,kind,q,tangent,normal,waterA,waterB,deckA,deckB,approachA,approachB,witness"
      ) ||
      !id(c.id) ||
      ids.has(c.id) ||
      !id(c.riverId) ||
      !id(c.geometryVersion) ||
      !["fixedBridge", "movableBridge"].includes(c.kind) ||
      ![c.q, c.tangent, c.normal, c.waterA, c.waterB, c.deckA, c.deckB, c.approachA, c.approachB].every(point)
    )
      return false;
    ids.add(c.id);
    const r = a.rivers.find(r => r.id === c.riverId && r.geometryVersion === c.geometryVersion);
    if (
      !r ||
      Math.abs(Math.hypot(...c.tangent) - 1) > 1e-9 ||
      Math.abs(Math.hypot(...c.normal) - 1) > 1e-9 ||
      Math.abs(c.tangent[0] * c.normal[0] + c.tangent[1] * c.normal[1]) > 1e-9
    )
      return false;
    const w = c.witness;
    if (
      !record(w) ||
      !keys(w, "kind,controls,parameter") ||
      !["line", "cubic"].includes(w.kind) ||
      !Array.isArray(w.controls) ||
      w.controls.length !== (w.kind === "line" ? 2 : 4) ||
      !w.controls.every(point) ||
      !Number.isFinite(w.parameter) ||
      w.parameter < 0 ||
      w.parameter > 1
    )
      return false;
    const t = w.parameter,
      v = 1 - t,
      p = w.controls;
    const q: [number, number] = [0, 0],
      derivative: [number, number] = [0, 0];
    for (const i of [0, 1]) {
      q[i] =
        w.kind === "line"
          ? v * p[0][i] + t * p[1][i]
          : v ** 3 * p[0][i] + 3 * v * v * t * p[1][i] + 3 * v * t * t * p[2][i] + t ** 3 * p[3][i];
      derivative[i] =
        w.kind === "line"
          ? p[1][i] - p[0][i]
          : 3 * v * v * (p[1][i] - p[0][i]) + 6 * v * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]);
    }
    const speed = Math.hypot(...derivative);
    if (!close(q, c.q) || speed <= 1e-9 || !close([derivative[0] / speed, derivative[1] / speed], c.tangent))
      return false;
    const section = normalWaterSection(c.q, c.normal, { id: r.id, rings: r.rings });
    if (!section || !close(section.negative.point, c.waterA) || !close(section.positive.point, c.waterB)) return false;
    const ordered = [c.approachA, c.deckA, c.waterA, c.q, c.waterB, c.deckB, c.approachB];
    if (a.schemaVersion === 4) {
      const half = a.roadWidthMeters / 2;
      const footprint = [
        [c.approachA[0] - c.tangent[0] * half, c.approachA[1] - c.tangent[1] * half],
        [c.approachB[0] - c.tangent[0] * half, c.approachB[1] - c.tangent[1] * half],
        [c.approachB[0] + c.tangent[0] * half, c.approachB[1] + c.tangent[1] * half],
        [c.approachA[0] + c.tangent[0] * half, c.approachA[1] + c.tangent[1] * half]
      ] as Point[];
      if (
        [...a.rivers.filter(river => river.id !== c.riverId), ...(a.obstacles ?? [])].some(water =>
          footprintTouchesWater(footprint, water)
        )
      )
        return false;
    }
    let previous = -Infinity;
    for (const p of ordered) {
      const d = (p[0] - c.q[0]) * c.normal[0] + (p[1] - c.q[1]) * c.normal[1];
      if (
        !Number.isFinite(d) ||
        d <= previous ||
        Math.abs((p[0] - c.q[0]) * c.tangent[0] + (p[1] - c.q[1]) * c.tangent[1]) > 1e-7
      )
        return false;
      previous = d;
      for (const sign of [-1, 1]) {
        const x = p[0] + (sign * c.tangent[0] * a.roadWidthMeters) / 2,
          y = p[1] + (sign * c.tangent[1] * a.roadWidthMeters) / 2;
        if (
          x < a.requiredBounds.minX ||
          x > a.requiredBounds.maxX ||
          y < a.requiredBounds.minY ||
          y > a.requiredBounds.maxY
        )
          return false;
      }
    }
  }
  return (
    (a.schemaVersion !== 1 && a.schemaVersion !== 4) || a.rivers.every(r => a.crossings.some(c => c.riverId === r.id))
  );
}

/** The local preview must refer to this descriptor's exact physical town origin. */
export function fixedCrossingsMatchFrame(payload: FixedBurgCrossings, frame: unknown): boolean {
  if (
    !record(frame) ||
    !point(frame.originMapUnits) ||
    typeof frame.metersPerMapUnit !== "number" ||
    !Number.isFinite(frame.metersPerMapUnit) ||
    frame.metersPerMapUnit <= 0 ||
    !isRequiredSiteBounds(frame.requiredBounds) ||
    typeof frame.extentMeters !== "number" ||
    !Number.isFinite(frame.extentMeters) ||
    frame.extentMeters <= 0 ||
    requiredSiteExtent(frame.requiredBounds) > frame.extentMeters
  )
    return false;
  const b = payload.requiredBounds,
    f = frame.requiredBounds;
  if (payload.schemaVersion === 3 || payload.schemaVersion === 4) {
    const coverage = payload.coverageBounds,
      half = frame.extentMeters / 2;
    if (!coverage || coverage.minX > -half || coverage.minY > -half || coverage.maxX < half || coverage.maxY < half)
      return false;
  }
  if (f.minX > b.minX || f.minY > b.minY || f.maxX < b.maxX || f.maxY < b.maxY) return false;
  const origin = frame.originMapUnits,
    scale = frame.metersPerMapUnit;
  return origin.every((v, i) => Number.isFinite(v * scale) && Math.abs(v * scale - payload.originMeters[i]) <= 1e-7);
}
