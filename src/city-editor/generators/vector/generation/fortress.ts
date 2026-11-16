import { resolveBridgeSkewLimit } from "../../../../utils/bridgeSkewPolicy";
import type { GenerationSettings } from "../../../types/generation";
import type { Point } from "../../../types/primitives";
import type { VectorDefensePlan } from "../../../types/vector/defense";
import type { CurveAnchor, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import { planBastionedTownFromInputs } from "../../bastionedTown/plan";
import { type FortressFailureReason, fortressFrameExtent } from "../../bastionedTown/validate";
import type { SkeletonInputs, SkeletonRiver, SkeletonRoad } from "../../generation/skeleton/contracts";
import { bastionEra } from "../../generation/skeleton/wallShapes";
import { minGateSpacingMeters } from "../../passages";
import { createVectorGate, setWallCircuit } from "../editing/network";
import { curveSource, removeVectorPath } from "../editing/paths";
import { evaluateAnchor, pathIsClosed } from "../geometry/curves";
import { pathIntersections } from "../geometry/intersections";
import { distance, unit, widthAt } from "../geometry/network";
import { samplePath } from "../geometry/sampling";
import { assertVectorDocument } from "../validation/document";
import { VECTOR_WALL_WIDTH_METERS } from "./wallShape";

/** The mesh editor's street cell; the fortress planner sizes gate spacing and clearances from it. */
const CELL_METERS = 50;
const ROAD_WIDTH_METERS = 5;
/** Where an approach road ends inside the built-up disc, as on the synthetic site (0.85 of its radius). */
const APPROACH_END = 0.85;
export const FORTRESS_WALL_ID = "fortress-wall";

export type VectorFortressResult = { document: VectorCityDocument } | { failure: FortressFailureReason | string };

/**
 * A bastioned town on a meshless site (P4c). The mesh editor's fortress planner is cell-free: it reads skeleton
 * inputs and returns the trace, the works and the routes. Meshless builds those inputs from its site, then adopts
 * the result as input geometry, as a converted mesh-editor fortress is adopted (M9): the trace is a fixed wall
 * with its gates, the routes replace the site's approach roads, and the works are a fixed defense plan. Waterfront
 * fortresses (a river through the works) wait for the water stage (P5).
 */
export function fortifyVectorInput(
  input: VectorCityDocument,
  settings: GenerationSettings,
  seed: string
): VectorFortressResult {
  const fort = settings.townFortification;
  if (fort?.kind !== "bastioned") return { failure: "fortress-insufficient-space" };
  const site = input.site;
  if (!site) return { failure: "fortress-insufficient-space" };
  const center = site.center,
    radius = Math.max(...site.domain[0].outer.map(p => distance(p, center))),
    period = input.context.historicalPeriod,
    wallWidth = Math.max(4, CELL_METERS * 0.14);
  const roads: SkeletonRoad[] = Object.values(input.paths)
    .filter(p => p.role === "road" && !pathIsClosed(p))
    .map((p, id) => {
      const points = samplePath(p).map(s => s.point);
      if (distance(points[0], center) > distance(points.at(-1)!, center)) points.reverse();
      return { id, path: points, fixed: false, reachesFrame: true };
    });
  const rivers: SkeletonRiver[] = Object.values(input.paths)
    .filter(p => p.role === "river")
    .map((p, index) => ({
      index,
      centerline: samplePath(p).map(s => s.point),
      halfWidth: Math.max(...samplePath(p).map(s => (widthAt(p, s.anchor).left + widthAt(p, s.anchor).right) / 2))
    }));
  const inputs: SkeletonInputs = {
    // Works, ditch and glacis lie well outside the built-up disc; the frame grows to hold them.
    half: Math.max(input.frame.extentMeters, fortressFrameExtent(radius, settings)) / 2,
    cellSize: CELL_METERS,
    core: center,
    cityRadius: radius,
    walls: true,
    walledAreaShare: 1,
    water: site.water
      .filter(w => !w.riverPathId)
      .flatMap(w => w.polygons.map(p => ({ kind: "lake" as const, polygon: p.outer }))),
    rivers,
    roads,
    fixedBridges: [],
    bridgeSkewLimit: resolveBridgeSkewLimit(period),
    bastionEra: bastionEra(period),
    requiredExternalRoads: roads.length,
    wallWidth,
    minGateSpacing: minGateSpacingMeters(wallWidth)
  };
  const planned = planBastionedTownFromInputs(inputs, settings, seed);
  if ("failure" in planned) return { failure: planned.failure.reason };
  const { draft } = planned,
    plan = draft.plan;
  if (plan.boundaryKind !== "inland-closed" || plan.sluices?.length) return { failure: "fortress-water-conflict" };

  let doc = structuredClone(input);
  doc.frame.extentMeters = inputs.half * 2;
  // The site's record of its fixed input is rebuilt once the fortress is in place.
  doc.site!.fixedPaths = [];
  // The routes replace the site's approach roads; a road is unfixed for the removal only.
  for (const p of Object.values(doc.paths).filter(p => p.role === "road")) {
    doc.paths[p.id].editPolicy = "editable";
    doc = removeVectorPath(doc, p.id);
  }
  const roadPath = (id: string, points: Point[], closed: boolean): VectorPath => ({
    id,
    role: "road",
    revision: 0,
    origin: "imported",
    editPolicy: "fixed",
    source: curveSource(points, "polyline", closed),
    width: { leftMeters: ROAD_WIDTH_METERS / 2, rightMeters: ROAD_WIDTH_METERS / 2, stations: [] }
  });
  const routeIds = new Map<number, string>();
  const trace = [...draft.meshRing, draft.meshRing[0]];
  for (const route of draft.skeleton.routes) {
    let points = route.path.filter((p, i) => i === 0 || distance(p, route.path[i - 1]) > 0.05);
    if (route.dropped || points.length < 2) continue;
    // An organic street plan's chords join random points of the ring street; one that would cut through a
    // bastion or into the town is not laid. The town's own streets are routed by the skeleton.
    if (
      route.gateIndex === null &&
      (points.some((p, i) => i > 0 && crossesLine(points[i - 1], p, trace)) ||
        points.some(p => distance(p, center) < radius))
    )
      continue;
    // A gate route enters the town as an approach road does: it stops inside the built-up disc and the skeleton
    // carries it on to the centre, around the civic precinct.
    if (route.gateIndex !== null) points = fromRadius(points, center, radius * APPROACH_END);
    const id = `fortress-road:${route.id}`,
      closed = distance(points[0], points.at(-1)!) < 0.05;
    // A chord that returns to where it started is no street.
    if (closed && (route.gateIndex !== null || points.length < 4)) continue;
    doc.paths[id] = roadPath(id, closed ? points.slice(0, -1) : points, closed);
    routeIds.set(route.id, id);
  }
  const material = settings.config.wall?.material === "wood" ? "wood" : "stone";
  doc.paths[FORTRESS_WALL_ID] = {
    id: FORTRESS_WALL_ID,
    role: "wall",
    revision: 0,
    origin: "imported",
    editPolicy: "editable",
    source: curveSource(draft.meshRing, "polyline", true),
    width: {
      leftMeters: VECTOR_WALL_WIDTH_METERS[material] / 2,
      rightMeters: VECTOR_WALL_WIDTH_METERS[material] / 2,
      stations: []
    }
  };
  doc = setWallCircuit(doc, FORTRESS_WALL_ID);
  // Gates where the routes pass the trace; the planner put each one on a vertex of its own.
  const gateAt = new Map<number, string>();
  for (const road of Object.values(doc.paths).filter(p => p.role === "road"))
    for (const hit of pathIntersections(doc.paths[FORTRESS_WALL_ID], road)) {
      const wall = doc.paths[FORTRESS_WALL_ID],
        at = evaluateAnchor(wall, hit.a),
        index = draft.skeleton.gates.findIndex(g => distance(g.point, at) < 1);
      if (index < 0) return { failure: `fortress-gate:${road.id}:${Math.round(at[0])},${Math.round(at[1])}` };
      const tangent = unit(evaluateAnchor(wall, hit.a, true)),
        axis = unit(evaluateAnchor(road, hit.b, true)),
        sine = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0]),
        width = widthAt(road, hit.b);
      if (sine < 0.1) return { failure: "fortress-gate" };
      const before = new Set(Object.keys(doc.connections.gates));
      const existing = gateAt.get(index);
      doc = createVectorGate(
        doc,
        hit.a,
        hit.b,
        Math.max((width.left + width.right) / sine + 1, existing ? doc.connections.gates[existing].widthMeters : 0),
        "passage",
        existing
      );
      gateAt.set(index, existing ?? Object.keys(doc.connections.gates).find(id => !before.has(id))!);
    }
  doc.paths[FORTRESS_WALL_ID].editPolicy = "fixed";
  const n = draft.meshRing.length,
    spans = ([start, end]: [number, number]) => {
      const out: { from: CurveAnchor; to: CurveAnchor }[] = [];
      for (let k = start; k !== end; k = (k + 1) % n)
        out.push({
          from: { pathId: FORTRESS_WALL_ID, segmentId: `segment:${k}`, t: 0 },
          to: { pathId: FORTRESS_WALL_ID, segmentId: `segment:${k}`, t: 1 }
        });
      return out;
    };
  const { circuitId: _circuit, locked: _locked, bastions, curtains, accesses, ...geometry } = structuredClone(plan);
  const defense: VectorDefensePlan = {
    ...geometry,
    editPolicy: "fixed",
    circuit: { id: plan.circuitId, wallPathIds: [FORTRESS_WALL_ID] },
    bastions: bastions.map(({ wallEdgeIds: _w, ...part }, i) => ({
      ...part,
      wallSpans: spans(draft.bastionVertices[i])
    })),
    curtains: curtains.map(({ wallEdgeIds: _w, ...part }, i) => ({
      ...part,
      wallSpans: spans(draft.curtainVertices[i])
    })),
    accesses: accesses.map(({ gateId, roadId, ...access }) => {
      if (access.role === "defender")
        return { ...access, portal: { kind: "curtain" as const, id: gateId }, roadPathIds: [] };
      const gate = gateAt.get(Number(gateId.split("-").at(-1))),
        road = routeIds.get(Number(roadId?.split("-").at(-1)));
      if (!gate || !road) throw Error(`fortress-access:${access.id}`);
      // Inside the trace the town street is the way in; the access keeps only its last land point before the
      // gate, so the reservation does not close the street hub at the centre.
      return {
        ...access,
        landBefore: access.landBefore.slice(-1),
        portal: { kind: "gate" as const, id: gate },
        roadPathIds: [road]
      };
    })
  };
  doc.environment = {
    features: {},
    hidden: [],
    ...doc.environment,
    defenses: { ...doc.environment?.defenses, [defense.id]: defense }
  };
  doc.site!.fixedPaths = Object.values(doc.paths).map(p => structuredClone(p));
  doc.revision++;
  try {
    assertVectorDocument(doc);
  } catch (error) {
    return { failure: error instanceof Error ? error.message : "fortress-invalid" };
  }
  return { document: doc };
}

function crossesLine(a: Point, b: Point, line: Point[]): boolean {
  const side = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 1; i < line.length; i++) {
    const c = line[i - 1],
      d = line[i];
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
  }
  return false;
}

/** The part of `line` (centre side first) from where it first reaches `reach` from `center`. */
function fromRadius(line: Point[], center: Point, reach: number): Point[] {
  const i = line.findIndex(p => distance(p, center) >= reach);
  if (i <= 0) return line;
  const a = line[i - 1],
    b = line[i];
  let lo = 0,
    hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (distance([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid], center) < reach) lo = mid;
    else hi = mid;
  }
  const start: Point = [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
  return distance(start, b) > 0.05 ? [start, ...line.slice(i)] : line.slice(i);
}
