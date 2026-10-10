import type { NetworkEnvironment } from "../generators/constrainedLandNetwork";
import type { LandConnectionSnapshot } from "../generators/landConnectionAdoption";
import { exportRegisteredLandRouteSections } from "../generators/registeredLandRouteSections";
import {
  type FixedBurgCrossings,
  type FixedCrossingBudgets,
  validFixedBurgCrossings
} from "../utils/fixedBurgCrossings";
import type { RequiredSiteBounds } from "../utils/requiredSiteBounds";
import { evaluateRiverAxis } from "./riverAxisSampling";
import type { RiverPoint } from "./riverGeometry";

/** Opt-in CE preview contract. Local x east/y north, physical metres; no clipping,
 * smoothing, snapping, bridge discovery or change of the river's physical banks. */
export function exportFixedBurgCrossings(
  snapshot: LandConnectionSnapshot,
  current: { environment: NetworkEnvironment; nodePointAt: (id: number) => RiverPoint | null },
  originMeters: RiverPoint,
  budgets: FixedCrossingBudgets,
  selection?: { facilityIds: readonly number[]; coverageBounds: RequiredSiteBounds }
): { crossings: FixedBurgCrossings } | { reason: string } {
  if (!originMeters.every(Number.isFinite)) return { reason: "invalid-origin" };
  if (typeof current.environment.allowsBridgeFootprint !== "function") return { reason: "missing-current-contract" };
  const exported = exportRegisteredLandRouteSections(snapshot, current);
  if (!("sections" in exported)) return exported;
  const selected = selection
    ? exported.sections.crossings.filter(c => selection.facilityIds.includes(c.id))
    : exported.sections.crossings;
  if (
    selection &&
    (new Set(selection.facilityIds).size !== selection.facilityIds.length ||
      selected.length !== selection.facilityIds.length)
  )
    return { reason: "unknown-facility" };
  if (selected.length > budgets.maxFacilities) return { reason: "facility-budget" };
  const point = (p: RiverPoint): [number, number] => [p[0] - originMeters[0], originMeters[1] - p[1]];
  const vector = (p: RiverPoint): [number, number] => [p[0], -p[1]];
  const rivers: FixedBurgCrossings["rivers"][number][] = [];
  const crossings: FixedBurgCrossings["crossings"][number][] = [];
  let vertices = 0;
  for (const c of selected) {
    const input = current.environment.crossingInputAt(c.id);
    if (!input) return { reason: "changed-facility" };
    const axis = input.geometry.axis;
    const sample = evaluateRiverAxis(axis, c.arcLengthMeters);
    if (!sample) return { reason: "invalid-axis" };
    const segment = axis.segments.find(s => s.index === sample.segmentIndex);
    if (!segment) return { reason: "invalid-axis" };
    const witness =
      "controls" in segment && "parameter" in sample && typeof sample.parameter === "number"
        ? { kind: "cubic" as const, controls: segment.controls.map(point), parameter: sample.parameter }
        : "start" in segment && "end" in segment
          ? {
              kind: "line" as const,
              controls: [point(segment.start), point(segment.end)],
              parameter: (c.arcLengthMeters - segment.arcStart) / segment.length
            }
          : null;
    if (!witness) return { reason: "invalid-axis" };
    if (!rivers.some(r => r.id === c.riverId)) {
      vertices += input.geometry.water.rings.reduce((n, ring) => n + ring.length, 0);
      if (vertices > budgets.maxWaterVertices) return { reason: "water-budget" };
      rivers.push({
        id: c.riverId,
        geometryVersion: c.geometryVersion,
        rings: input.geometry.water.rings.map(ring => ring.map(point))
      });
    }
    if (c.plan.kind !== "fixedBridge" && c.plan.kind !== "movableBridge") return { reason: "unsupported-crossing" };
    crossings.push({
      id: c.id,
      riverId: c.riverId,
      geometryVersion: c.geometryVersion,
      kind: c.plan.kind,
      q: point(c.q),
      tangent: vector(c.tRiver),
      normal: vector(c.nCrossing),
      witness,
      waterA: point(c.waterA),
      waterB: point(c.waterB),
      deckA: point(c.deckA),
      deckB: point(c.deckB),
      approachA: point(c.approachA),
      approachB: point(c.approachB)
    });
  }
  const all = crossings.flatMap(c =>
    [c.approachA, c.approachB, c.waterA, c.waterB, c.deckA, c.deckB].flatMap(p =>
      [-1, 1].map(sign => [
        // Deck width runs square to the (possibly skewed) bridge axis.
        p[0] + (sign * -c.normal[1] * exported.sections.roadWidthMeters) / 2,
        p[1] + (sign * c.normal[0] * exported.sections.roadWidthMeters) / 2
      ])
    )
  );
  const requiredBounds = all.length
    ? {
        minX: Math.min(...all.map(p => p[0])),
        minY: Math.min(...all.map(p => p[1])),
        maxX: Math.max(...all.map(p => p[0])),
        maxY: Math.max(...all.map(p => p[1]))
      }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const result: FixedBurgCrossings = {
    schemaVersion: selection ? 4 : 1,
    coordinateUnit: "metres",
    revision: snapshot.revision,
    originMeters: [...originMeters],
    roadWidthMeters: exported.sections.roadWidthMeters,
    requiredBounds,
    rivers,
    crossings
  };
  if (selection) {
    const b = selection.coverageBounds;
    result.coverageBounds = { ...b };
    const targetWater = new Set(
      selected.map(c => {
        const input = current.environment.crossingInputAt(c.id);
        return input ? current.environment.water.getSnapshot(input.geometry.water) : null;
      })
    );
    if (targetWater.has(null)) return { reason: "changed-water" };
    const obstacles = current.environment.water
      .query({
        minX: originMeters[0] + b.minX,
        maxX: originMeters[0] + b.maxX,
        minY: originMeters[1] - b.maxY,
        maxY: originMeters[1] - b.minY
      })
      .filter(w => !targetWater.has(w));
    result.obstacles = obstacles.map(w => ({ id: w.id, rings: w.rings.map(r => r.map(point)) }));
  }
  if (!validFixedBurgCrossings(result, budgets)) return { reason: "invalid-fixed-crossings" };
  return { crossings: freeze(result) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
