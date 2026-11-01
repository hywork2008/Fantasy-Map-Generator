import { SHIP_CARGO_GEOMETRY } from "../../buildings/ships/cargoGeometry";
import { SHIP_DIMENSIONS } from "../data/ships";
import type { CargoBerthAssignment, CargoQuay } from "../types/contracts/harborCargo";
import type { CityElement, Point } from "../types/document";

import type { ShipType } from "../types/ships";
import { pointInPolygon } from "./geom";
import { corridor, distance } from "./parcelGeometry";

export type { CargoBerthAssignment, CargoQuay } from "../types/contracts/harborCargo";

/** Construction dimensions, not telescoping controls. Illustrative game profiles in metres. */
export const HARBOR_CRANE_PROFILES = {
  treadwheel: { reach: 9, pulleyHeight: 8, hookHeight: 6.5 },
  derrick: { reach: 7, pulleyHeight: 6.5, hookHeight: 5 }
} as const;

export function cargoShipGeometry(type: ShipType, length: number) {
  const authored = SHIP_CARGO_GEOMETRY[type];
  const scale = length / authored.hullLength;
  return {
    beam: (SHIP_DIMENSIONS[type].baseBeamMeters * length) / SHIP_DIMENSIONS[type].baseLengthMeters,
    draft: authored.draft * scale,
    deckHeight: authored.deckY * scale,
    accessAlong: (authored.accessX - authored.hullCenter) * scale,
    rigging: authored.rigging.map(([a, b]) => [(a - authored.hullCenter) * scale, (b - authored.hullCenter) * scale])
  };
}

export function shipFootprint(point: Point, rotation: number, length: number, beam: number): Point[] {
  const bow: Point = [-Math.sin(rotation), Math.cos(rotation)];
  const side: Point = [bow[1], -bow[0]];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([a, b]) => [
    point[0] + (bow[0] * a * length) / 2 + (side[0] * b * beam) / 2,
    point[1] + (bow[1] * a * length) / 2 + (side[1] * b * beam) / 2
  ]);
}

/** Include edges, not just corners: a thin pier can cross a large hull without containing a corner. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
      const on = (p: Point, q: Point, r: Point) =>
        Math.abs(cross(p, q, r)) < 1e-8 &&
        r[0] >= Math.min(p[0], q[0]) - 1e-8 &&
        r[0] <= Math.max(p[0], q[0]) + 1e-8 &&
        r[1] >= Math.min(p[1], q[1]) - 1e-8 &&
        r[1] <= Math.max(p[1], q[1]) + 1e-8;
      if (on(p, q, r) || on(p, q, s) || on(r, s, p) || on(r, s, q)) return true;
    }
  return false;
}

export function cargoQuayReservation(a: Point, b: Point, outward: Point): Point[] {
  // A reserved working strip keeps ordinary finger piers out of the broadside berth.
  return corridor([a[0] + outward[0] * 6, a[1] + outward[1] * 6], [b[0] + outward[0] * 6, b[1] + outward[1] * 6], 12);
}

/** Solve a fixed-radius hook and a broadside hull together. The callback validates the hull
 * at every position of its straight offshore approach, including neighbouring ships/roads. */
export function solveCargoBerth(
  quay: CargoQuay,
  type: ShipType,
  length: number,
  isClear: (polygon: Point[], center: Point, beam: number) => boolean,
  isLoadClear: (point: Point) => boolean = () => true
): { point: Point; rotation: number; assignment: CargoBerthAssignment } | undefined {
  if (!Number.isFinite(length) || length <= 0 || distance(quay.a, quay.b) < 1 || quay.reach <= 0) return;
  const g = cargoShipGeometry(type, length);
  if (
    quay.depth < g.draft + 0.5 ||
    Math.max(0, g.deckHeight - quay.waterBelowQuay) + 1.5 > quay.transferHeight ||
    quay.transferHeight + 0.5 > quay.pulleyHeight
  )
    return;
  const shoreLength = distance(quay.a, quay.b);
  const tangent: Point = [(quay.b[0] - quay.a[0]) / shoreLength, (quay.b[1] - quay.a[1]) / shoreLength];
  const hook: Point = [quay.axis[0] + quay.outward[0] * quay.reach, quay.axis[1] + quay.outward[1] * quay.reach];
  // A fixed jib cannot lower anywhere inside its working circle.
  if (Math.abs(distance(quay.axis, quay.landDrop) - quay.reach) > 0.01) return;
  const offshore = (p: Point) => (p[0] - quay.a[0]) * quay.outward[0] + (p[1] - quay.a[1]) * quay.outward[1];
  if (offshore(hook) < g.beam / 2 + 1.2) return;
  const startAngle = Math.atan2(quay.outward[1], quay.outward[0]);
  const endAngle = Math.atan2(quay.landDrop[1] - quay.axis[1], quay.landDrop[0] - quay.axis[0]);
  const shortSwing = Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle));
  for (const sign of [1, -1]) {
    const bow: Point = [tangent[0] * sign, tangent[1] * sign];
    const point: Point = [hook[0] - bow[0] * g.accessAlong, hook[1] - bow[1] * g.accessAlong];
    const rotation = -Math.atan2(bow[0], bow[1]);
    const along = (point[0] - quay.a[0]) * tangent[0] + (point[1] - quay.a[1]) * tangent[1];
    if (along < length / 2 + 2 || along + length / 2 + 2 > shoreLength) continue;
    const polygon = shipFootprint(point, rotation, length + 1.2, g.beam + 1.2);
    if (polygon.some(p => !pointInPolygon(p, quay.water))) continue;
    for (const swing of [shortSwing, shortSwing > 0 ? shortSwing - 2 * Math.PI : shortSwing + 2 * Math.PI]) {
      if (!quay.swingDirections.includes(Math.sign(swing))) continue;
      let blocked = false;
      // Conservative 0.5 m swept-load samples; also reserve clearance around mast/shroud bands.
      const steps = Math.ceil((Math.abs(swing) * quay.reach) / 0.5);
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (swing * i) / steps;
        const p: Point = [quay.axis[0] + Math.cos(angle) * quay.reach, quay.axis[1] + Math.sin(angle) * quay.reach];
        if (!isLoadClear(p)) {
          blocked = true;
          break;
        }
        const x = (p[0] - point[0]) * bow[0] + (p[1] - point[1]) * bow[1];
        const y = Math.abs((p[0] - point[0]) * bow[1] - (p[1] - point[1]) * bow[0]);
        if (y < g.beam / 2 + 0.8 && g.rigging.some(([a, b]) => x >= a - 0.8 && x <= b + 0.8)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      // Translate out of the berth before turning: test the swept hull, not just its destination.
      for (let d = 0; d <= length; d += 1) {
        const p: Point = [point[0] + quay.outward[0] * d, point[1] + quay.outward[1] * d];
        if (!isClear(shipFootprint(p, rotation, length + 1.2, g.beam + 1.2), p, g.beam + 1.2)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      return {
        point,
        rotation,
        assignment: {
          kind: "cargo-quay",
          berthId: quay.id,
          craneId: quay.craneId,
          cargoAccessId: `${type}:deck-handover`,
          shipType: type,
          point: [point[0], point[1]],
          rotation,
          length,
          hook,
          landDrop: quay.landDrop,
          swingAngleRad: swing
        }
      };
    }
  }
}

export function activeCargoAssignment(
  ship: CityElement,
  quays?: readonly CargoQuay[]
): CargoBerthAssignment | undefined {
  const a = ship.harborOperation;
  if (
    !a ||
    a.shipType !== ship.shipType ||
    !ship.point ||
    !Array.isArray(a.hook) ||
    a.hook.length !== 2 ||
    !a.hook.every(Number.isFinite) ||
    !Array.isArray(a.landDrop) ||
    a.landDrop.length !== 2 ||
    !a.landDrop.every(Number.isFinite) ||
    !Array.isArray(a.point) ||
    a.point.length !== 2 ||
    !a.point.every(Number.isFinite) ||
    !Number.isFinite(a.length) ||
    !Number.isFinite(a.rotation) ||
    distance(ship.point, a.point) > 0.01 ||
    Math.abs((ship.rotation ?? 0) - a.rotation) > 0.001 ||
    Math.abs((ship.sizeMeters ?? 0) - a.length) > 0.01
  )
    return;
  if (
    quays &&
    !quays.some(
      q =>
        q.id === a.berthId &&
        q.craneId === a.craneId &&
        ship.faceIds.includes(q.waterFaceId) &&
        distance(a.hook, [q.axis[0] + q.outward[0] * q.reach, q.axis[1] + q.outward[1] * q.reach]) < 0.01 &&
        distance(a.landDrop, q.landDrop) < 0.01
    )
  )
    return;
  return a;
}
