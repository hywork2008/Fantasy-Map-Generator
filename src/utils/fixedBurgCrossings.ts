import { normalWaterSection, validWaterPolygon } from "../services/riverPhysicalGeometry";
import { isRequiredSiteBounds, type RequiredSiteBounds, requiredSiteExtent } from "./requiredSiteBounds";

type Point = readonly [number, number];
export const FIXED_SITE_CROSSING_BUDGETS = Object.freeze({ maxFacilities: 100, maxWaterVertices: 10000 });

export interface FixedCrossingBudgets {
  maxFacilities: number;
  maxWaterVertices: number;
}
export interface FixedBurgCrossings {
  schemaVersion: 1;
  coordinateUnit: "metres";
  revision: number;
  originMeters: Point;
  roadWidthMeters: number;
  requiredBounds: RequiredSiteBounds;
  rivers: readonly { id: number; geometryVersion: number; rings: readonly (readonly Point[])[] }[];
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
    !keys(raw, "schemaVersion,coordinateUnit,revision,originMeters,roadWidthMeters,requiredBounds,rivers,crossings") ||
    raw.schemaVersion !== 1 ||
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
    raw.rivers.length > raw.crossings.length
  )
    return false;
  let vertices = 0;
  const riverIds = new Set<number>();
  for (const r of raw.rivers) {
    if (
      !record(r) ||
      !keys(r, "id,geometryVersion,rings") ||
      !id(r.id) ||
      !id(r.geometryVersion) ||
      r.geometryVersion < 1 ||
      riverIds.has(r.id) ||
      !Array.isArray(r.rings)
    )
      return false;
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
  return a.rivers.every(r => a.crossings.some(c => c.riverId === r.id));
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
  if (f.minX > b.minX || f.minY > b.minY || f.maxX < b.maxX || f.maxY < b.maxY) return false;
  const origin = frame.originMapUnits,
    scale = frame.metersPerMapUnit;
  return origin.every((v, i) => Number.isFinite(v * scale) && Math.abs(v * scale - payload.originMeters[i]) <= 1e-7);
}
