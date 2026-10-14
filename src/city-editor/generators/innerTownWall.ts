import type { CityDocument, EdgeRef, Id, Mesh, Point } from "../types/document";
import { registerTownCircuit } from "./castles";
import { boundaryEdges, boundaryRings, outerTownCircuit, reservedCastleFaces, townGates } from "./fortifications";
import { pointInPolygon, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { facePoints, faceVertices, insertEdgeVertex, splitFace } from "./mesh";
import { alternatingPairs, kindEdgeIds, minGateSpacingMeters, orderedIncidentEdges, townCenter } from "./passages";
import { enclosedTownFaces, repairRiverWalls } from "./riverWallRouting";
import { auditTownDefenseClosure } from "./townDefenseClosure";

/**
 * P1 of docs/plan/ce-multi-ring-walls.md: an old-town wall inside the generated
 * (outer) town wall. The outer wall already encloses the whole built-up area;
 * this picks a round, connected set of central faces, keeps every street off
 * the new curtain, and opens a gate wherever a street crosses it. The gate
 * passages, gate squaring and smoothing are the same later passes as the
 * outer wall's (`townGates` includes these gates).
 */

export interface InnerWallOptions {
  /** Old-town area as a share of the outer wall's land area. */
  share: number;
  /** Required face layers between the inner and the outer curtain. */
  minGapCells: number;
  /** Id prefix of generated groups and gates. */
  prefix: string;
  /** The castle was sited in the old town (§4.4): the curtain must take it in. */
  castleInOldTown?: boolean;
  /** The old wall was pulled down: its line is a ring road, every street crosses it (§4.3). */
  razed?: boolean;
  /** Draw the curtain only: no gates are opened and no street crossing is closed (a diagnostic stage). */
  wallOnly?: boolean;
  /**
   * Planned gate-to-centre lines. When given, the wall is built before any town
   * street exists: a gate opens where each line meets the curtain, and the
   * street router later reaches the old town only through those gates (the
   * wall edges are banned and only a gate passage gives a four-way vertex).
   */
  arteries?: Point[][];
  /** Explicit style when no outer curtain exists yet (inner-first generation). */
  wallStyle?: { widthMeters: number; color: string };
  wallMaterial?: import("../types/document").WallMaterial;
  /** Experimental lab override; inner-first defaults to requiring closure. */
  requireClosure?: boolean;
  /** Keep the trial curtain continuous so river repair can reroute it instead of inheriting gaps. */
  retainRiverCurtain?: boolean;
}

/** Order is the diagnostic code (`failureCode` = index + 1) recorded by the generator. */
export const INNER_WALL_FAILURES = [
  "no-outer-wall",
  "too-small",
  "gap",
  "no-gate",
  "castle-crowds",
  "open-defense"
] as const;
export type InnerWallFailure = (typeof INNER_WALL_FAILURES)[number];

export interface InnerWallReport {
  /** Last rejected candidate's closure errors; transient, not document metadata. */
  defenseIssues?: string[];
  ok: boolean;
  failure?: InnerWallFailure;
  faces: number;
  areaShare: number;
  gapCells: number;
  gates: number;
  /** Curtain edges left open where a river crosses the line. */
  riverOpenings: number;
  /** Curtain edges left open because a street still runs along the line. */
  streetOpenings: number;
  /** Faces cut so a street can pass the curtain at a vertex. */
  cuts: number;
  /** A castle borders the old town (it is part of the old-town defence). */
  castleTouches: boolean;
  /** Street crossings closed at the old-town curtain (no gate). */
  closedCrossings: number;
}

interface FaceInfo {
  id: Id;
  area: number;
  dist: number;
  /** Eligible (town land, non-castle) neighbours only. */
  neighbors: Id[];
  /** Borders something that is not eligible town land: the town edge, water or a castle. */
  edge: boolean;
}

const MIN_INNER_FACES = 3;
/** §5.1: non-castle faces the old town keeps for its plaza and streets (a centre and its ring). */
export const MIN_FREE_OLD_TOWN_FACES = 7;
/** §5.1: free old-town area per unit of castle area. */
export const MIN_FREE_AREA_PER_CASTLE = 3;

export interface InnerTownPlan {
  faces: Set<Id>;
  gap: number;
}

/**
 * Planning-time old town on the planning mesh (before streets): the same round
 * selection and wall gap as `addInnerTownWall`, so the castle can be sited
 * against it and a town too small for two walls stays single (§5.3).
 */
export function planInnerTown(
  mesh: Mesh,
  urban: Iterable<Id>,
  share: number,
  minGapCells: number,
  center: Point = [0, 0],
  passable: Set<Id> = new Set(),
  diagnostics?: InnerTownPlanDiagnostics
): InnerTownPlan | null {
  const base = townFaces(mesh, urban, passable, center);
  if (diagnostics) Object.assign(diagnostics, { townFaces: base.ordered.length, trials: 0, bestGap: -1 });
  if (base.ordered.length < MIN_INNER_FACES * 3) {
    if (diagnostics) diagnostics.failure = "too-small";
    return null;
  }
  let target = base.landArea * share;
  for (let attempt = 0; attempt < 6; attempt++, target *= 0.85) {
    const faces = selectRound(base.info, base.ordered, target, base.seed);
    if (faces.size < MIN_INNER_FACES) {
      if (diagnostics) diagnostics.failure = "too-small";
      return null;
    }
    const gap = gapOf(mesh, base.outer, faces, passable);
    if (diagnostics) {
      diagnostics.trials = attempt + 1;
      if (gap > (diagnostics.bestGap ?? -1)) {
        diagnostics.bestGap = gap;
        diagnostics.blocker = gapBlocker(mesh, base.outer, faces, passable);
      }
    }
    if (gap >= minGapCells) return { faces, gap };
  }
  if (diagnostics) diagnostics.failure = "gap";
  return null;
}

/** Why `planInnerTown` found no old town: measurement only, no effect on generation. */
export interface InnerTownPlanDiagnostics {
  failure?: "too-small" | "gap";
  townFaces?: number;
  trials?: number;
  /** Widest gap (face layers) any trial reached; -1 before the first trial. */
  bestGap?: number;
  /** What the shortest escape from the best trial reaches first. */
  blocker?: GapBlocker;
}

/** Diagnostic code order: `blockerCode` = index + 1. */
export const GAP_BLOCKERS = ["water", "outside-land", "mesh-edge"] as const;
export type GapBlocker = (typeof GAP_BLOCKERS)[number];

/** Same walk as `gapOf`, but reports the kind of face (or mesh edge) the nearest escape reaches. */
function gapBlocker(mesh: Mesh, outer: Set<Id>, inner: Set<Id>, passable: Set<Id>): GapBlocker | undefined {
  const seen = new Set<Id>(inner);
  const queue: Id[] = [...inner];
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId];
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (other && passable.has(other)) continue;
      if (!other || !mesh.faces[other]) return "mesh-edge";
      if (!outer.has(other)) return mesh.faces[other].properties.water !== "land" ? "water" : "outside-land";
      if (seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return undefined;
}

/** §5.1 capacity of an old town once `castle` faces are reserved in or beside it. */
export function innerTownCapacity(
  mesh: Mesh,
  inner: Iterable<Id>,
  castle: Iterable<Id>
): { freeFaces: number; freeArea: number; castleArea: number; ok: boolean } {
  const area = (id: Id) => (mesh.faces[id] ? Math.abs(polygonArea(facePoints(mesh, mesh.faces[id]))) : 0);
  const castleSet = new Set(castle);
  const free = [...inner].filter(id => mesh.faces[id] && !castleSet.has(id));
  const freeArea = free.reduce((sum, id) => sum + area(id), 0);
  const castleArea = [...castleSet].reduce((sum, id) => sum + area(id), 0);
  return {
    freeFaces: free.length,
    freeArea,
    castleArea,
    ok: free.length >= MIN_FREE_OLD_TOWN_FACES && freeArea >= castleArea * MIN_FREE_AREA_PER_CASTLE
  };
}

export function addInnerTownWall(
  document: CityDocument,
  options: InnerWallOptions
): { document: CityDocument; report: InnerWallReport } {
  const fail = (failure: InnerWallFailure, extra: Partial<InnerWallReport> = {}) => ({
    document,
    report: {
      ok: false,
      failure,
      faces: 0,
      areaShare: 0,
      gapCells: 0,
      gates: 0,
      riverOpenings: 0,
      streetOpenings: 0,
      cuts: 0,
      castleTouches: false,
      closedCrossings: 0,
      ...extra
    }
  });
  const outer = outerTownCircuit(document);
  if (!outer) return fail("no-outer-wall");
  const center: Point = townCenter(document);
  const castle = reservedCastleFaces(document);
  const outerFaces = () => document.defenseCircuits?.find(c => c.id === outer.id)?.areaFaceIds ?? [];
  const base = townFaces(document.mesh, outerFaces(), castle, center);
  if (base.ordered.length < MIN_INNER_FACES * 3) return fail("too-small");
  const rivers = kindEdgeIds(document, "river");

  let target = base.landArea * options.share;
  for (let attempt = 0; attempt < 6; attempt++, target *= 0.85) {
    const trial = selectRound(base.info, base.ordered, target, base.seed);
    if (options.castleInOldTown)
      hugCastle(document.mesh, base.info, trial, castle, Math.sqrt(target / Math.PI), base.seed);
    if (trial.size < MIN_INNER_FACES) return fail("too-small");
    if (gapOf(document.mesh, base.outer, trial, castle) < options.minGapCells) continue;
    // The radius fits. Give every street that crosses the circle a vertex on
    // it, so the curtain can pass through the street there (the future gate).
    const radius = Math.sqrt(target / Math.PI);
    const cut = cutStreetCrossings(document, center, radius, base.info, !options.arteries);
    const cutCastle = reservedCastleFaces(cut.document);
    const town = townFaces(
      cut.document.mesh,
      cut.document.defenseCircuits?.find(c => c.id === outer.id)?.areaFaceIds ?? [],
      cutCastle,
      center
    );
    const roads = kindEdgeIds(cut.document, "road");
    const inner = selectRound(town.info, town.ordered, target, town.seed);
    const keep = options.castleInOldTown
      ? hugCastle(cut.document.mesh, town.info, inner, cutCastle, radius, town.seed)
      : new Set<Id>();
    // Streets and rivers both keep off the curtain line; each may cross it.
    const offLine = new Set([...roads, ...rivers]);
    const riverCorners = new Set(
      cut.document.featureGroups.flatMap(group => (group.kind === "river" ? group.vertices : []))
    );
    for (const v of cut.riverCuts) riverCorners.delete(v);
    // A bridge must not abut the curtain: a road ending on a wall vertex
    // without a gate is trimmed later, which would cut the bridge in two.
    for (const group of cut.document.featureGroups)
      if (group.kind === "road" && group.id.includes("bridge"))
        for (const ref of group.segments) {
          const edge = cut.document.mesh.edges[ref.edgeId];
          riverCorners.add(edge.a);
          riverCorners.add(edge.b);
        }
    keepStreetsOffCurtain(cut.document, inner, town.info, offLine, town.seed, radius, keep, riverCorners);
    // Moving the curtain off streets can cut the castle's link again; restore it
    // (a street still on the line there becomes an opening).
    if (options.castleInOldTown) hugCastle(cut.document.mesh, town.info, inner, cutCastle, radius, town.seed);
    if (inner.size < MIN_INNER_FACES) continue;
    const gap = gapOf(cut.document.mesh, town.outer, inner, cutCastle);
    if (gap < options.minGapCells) continue;
    // §5.1: a castle in or against the old town must leave it room for streets.
    const besideCastle = [...cutCastle].filter(id =>
      cut.document.mesh.faces[id]?.boundary.some(ref => {
        const edge = cut.document.mesh.edges[ref.edgeId];
        return [edge.leftFace, edge.rightFace].some(f => f && inner.has(f));
      })
    );
    if (besideCastle.length && !innerTownCapacity(cut.document.mesh, inner, besideCastle).ok)
      return fail("castle-crowds", { faces: inner.size });
    const finished = finish(
      cut.document,
      inner,
      outer.id,
      options,
      roads,
      kindEdgeIds(cut.document, "river"),
      town.landArea,
      town.info,
      gap,
      cut.cuts
    );
    if (
      options.requireClosure &&
      finished.report.ok &&
      !options.razed &&
      !auditTownDefenseClosure(finished.document, "gc:defense-town-0").ok
    )
      continue;
    return finished;
  }
  return fail("gap");
}

/** Build the old town on available land before either the outer curtain or bridges exist.
 * The supplied town footprint determines an area budget, never an enclosing wall. */
export function addFirstTownWall(
  source: CityDocument,
  footprint: Iterable<Id>,
  center: Point,
  options: InnerWallOptions
): { document: CityDocument; report: InnerWallReport; outerFaces: Set<Id> } {
  const budgetFaces = new Set(footprint);
  const castle = reservedCastleFaces(source);
  const budget = townFaces(source.mesh, budgetFaces, castle, center);
  const available = () =>
    Object.values(source.mesh.faces)
      .filter(f => f.properties.water === "land")
      .map(f => f.id);
  const failure = (reason: InnerWallFailure, defenseIssues?: string[]) => ({
    document: source,
    outerFaces: budgetFaces,
    report: {
      ok: false,
      failure: reason,
      ...(defenseIssues?.length ? { defenseIssues } : {}),
      faces: 0,
      areaShare: 0,
      gapCells: 0,
      gates: 0,
      riverOpenings: 0,
      streetOpenings: 0,
      cuts: 0,
      castleTouches: false,
      closedCrossings: 0
    }
  });
  if (budget.ordered.length < MIN_INNER_FACES * 3) return failure("too-small");
  const base = townFaces(source.mesh, available(), castle, center);
  let reason: InnerWallFailure = "open-defense";
  let defenseIssues: string[] | undefined;
  let target = budget.landArea * options.share;
  for (let attempt = 0; attempt < 6; attempt++, target *= 0.85) {
    // Each candidate starts from the same document: failed river cuts never leak.
    const cut = cutStreetCrossings(structuredClone(source), center, Math.sqrt(target / Math.PI), base.info, false);
    const candidate = cut.document;
    const reserved = reservedCastleFaces(candidate);
    const land = Object.values(candidate.mesh.faces)
      .filter(f => f.properties.water === "land")
      .map(f => f.id);
    const town = townFaces(candidate.mesh, land, reserved, center);
    const inner = selectRound(town.info, town.ordered, target, town.seed);
    const radius = Math.sqrt(target / Math.PI);
    const keep = options.castleInOldTown
      ? hugCastle(candidate.mesh, town.info, inner, reserved, radius, town.seed)
      : new Set<Id>();
    const rivers = kindEdgeIds(candidate, "river");
    const riverCorners = new Set(candidate.featureGroups.flatMap(g => (g.kind === "river" ? g.vertices : [])));
    for (const v of cut.riverCuts) riverCorners.delete(v);
    keepStreetsOffCurtain(candidate, inner, town.info, rivers, town.seed, radius, keep, riverCorners);
    if (options.castleInOldTown) hugCastle(candidate.mesh, town.info, inner, reserved, radius, town.seed);
    if (inner.size < MIN_INNER_FACES) {
      reason = "too-small";
      continue;
    }
    const beside = [...reserved].filter(id =>
      candidate.mesh.faces[id]?.boundary.some(ref => {
        const e = candidate.mesh.edges[ref.edgeId];
        return [e.leftFace, e.rightFace].some(f => f && inner.has(f));
      })
    );
    if (beside.length && !innerTownCapacity(candidate.mesh, inner, beside).ok) {
      reason = "castle-crowds";
      continue;
    }
    let result = finish(
      candidate,
      inner,
      undefined,
      options,
      kindEdgeIds(candidate, "road"),
      rivers,
      budget.landArea,
      town.info,
      0,
      cut.cuts
    );
    if (!result.report.ok) {
      reason = result.report.failure ?? "no-gate";
      continue;
    }
    if (options.requireClosure !== false && !options.razed) {
      const closure = auditTownDefenseClosure(result.document, "gc:defense-town-0");
      if (!closure.ok) {
        // The old builder drops grazing edges. Shrinking the same circle can
        // repeat that gap at every radius; repair a continuous trial first.
        // Castle-owned boundaries need their own combined-circuit routing and
        // keep the existing capacity/selection fallback for now.
        const repaired = !reserved.size
          ? repairFirstTownCurtain(candidate, inner, center, options, budget.landArea, town.info, cut.cuts)
          : null;
        if (repaired && auditTownDefenseClosure(repaired.document, "gc:defense-town-0").ok) {
          result = repaired;
          inner.clear();
          for (const id of result.document.defenseCircuits!.find(c => c.id === "gc:defense-town-0")!.areaFaceIds)
            inner.add(id);
          // River repair can split faces after the circle cut. Carry their
          // original-cell membership into the two-layer outer expansion.
          for (const face of Object.values(result.document.mesh.faces)) {
            if (cut.parentFaceIds.has(face.id)) continue;
            const at = polygonCentroid(facePoints(result.document.mesh, face));
            const parent = Object.values(source.mesh.faces).find(f => pointInPolygon(at, facePoints(source.mesh, f)));
            if (parent) cut.parentFaceIds.set(face.id, parent.id);
          }
          if ([...inner].some(id => !cut.parentFaceIds.has(id))) {
            reason = "gap";
            continue;
          }
        } else {
          reason = "open-defense";
          defenseIssues = closure.issues;
          continue;
        }
      }
    }
    // Grow outward from the fixed inner footprint. Two original face layers are
    // reserved before combining it with the planned total-town area.
    const outer = new Set(
      Object.values(result.document.mesh.faces)
        .filter(f => f.properties.settlement === "core")
        .map(f => f.id)
    );
    for (const id of budgetFaces) if (result.document.mesh.faces[id]) outer.add(id);
    const originalInner = new Set([...inner].map(id => cut.parentFaceIds.get(id) ?? id));
    const grown = new Set(originalInner);
    let front = [...originalInner];
    for (let layer = 0; layer < options.minGapCells; layer++) {
      const next: Id[] = [];
      for (const id of front)
        for (const ref of source.mesh.faces[id].boundary) {
          const e = source.mesh.edges[ref.edgeId];
          const other = e.leftFace === id ? e.rightFace : e.leftFace;
          if (!other || source.mesh.faces[other].properties.water !== "land") continue;
          if (!grown.has(other)) {
            grown.add(other);
            next.push(other);
          }
        }
      front = next;
    }
    for (const [id, parent] of cut.parentFaceIds) if (grown.has(parent)) outer.add(id);
    const originalOuter = new Set([...outer].map(id => cut.parentFaceIds.get(id) ?? id));
    const gap = gapOf(source.mesh, originalOuter, originalInner, castle);
    if (gap < options.minGapCells) {
      reason = "gap";
      continue;
    }
    const rings = boundaryRings(result.document.mesh, boundaryEdges(result.document.mesh, outer));
    if (rings.length !== 1) {
      reason = "gap";
      continue;
    }
    for (const id of outer) {
      const face = result.document.mesh.faces[id];
      if (reserved.has(id)) continue;
      face.properties.settlement = "core";
      // Ring 1 does not exist until the outer curtain is registered. Publishing
      // it now makes every subsequent mesh split fail document validation.
      if (inner.has(id)) face.properties.wallRing = 0;
      else delete face.properties.wallRing;
      if (!face.properties.locked && !["cemetery", "park"].includes(face.properties.ward ?? ""))
        face.properties.buildable = true;
    }
    return { document: result.document, report: { ...result.report, gapCells: gap }, outerFaces: outer };
  }
  return failure(reason, reason === "open-defense" ? defenseIssues : undefined);
}

/** A private, continuous trial on which the existing river-wall router can
 * make bank detours and actual water gates before streets constrain the mesh. */
function repairFirstTownCurtain(
  source: CityDocument,
  inner: Set<Id>,
  center: Point,
  options: InnerWallOptions,
  landArea: number,
  info: Map<Id, FaceInfo>,
  cuts: number
) {
  if (source.defenseCircuits?.some(c => c.id === "gc:defense-town-0" && c.locked)) return null;
  const trial = finish(
    source,
    inner,
    undefined,
    { ...options, retainRiverCurtain: true },
    kindEdgeIds(source, "road"),
    kindEdgeIds(source, "river"),
    landArea,
    info,
    0,
    cuts
  );
  trial.document.gates = trial.document.gates.filter(g => g.circuitId !== "gc:defense-town-0" || g.locked);
  const repair = repairRiverWalls(
    trial.document,
    [...inner].map(id => facePoints(source.mesh, source.mesh.faces[id]))
  );
  if (repair.issues.length) return null;
  const groups = new Set(
    repair.document.featureGroups
      .filter(g => g.kind === "wall" && !g.locked && g.id.startsWith(`${options.prefix}inner-wall-`))
      .map(g => g.id)
  );
  const enclosed = enclosedTownFaces({
    ...repair.document,
    featureGroups: repair.document.featureGroups.filter(g => g.kind !== "wall" || groups.has(g.id))
  });
  if (!enclosed?.size) return null;
  const doc = repair.document;
  doc.featureGroups = doc.featureGroups.filter(g => !groups.has(g.id));
  doc.defenseCircuits = doc.defenseCircuits!.filter(c => c.id !== "gc:defense-town-0");
  const town = townFaces(doc.mesh, Object.keys(doc.mesh.faces), reservedCastleFaces(doc), center);
  const faces = new Set([...enclosed].filter(id => town.info.has(id)));
  return finish(
    doc,
    faces,
    undefined,
    options,
    kindEdgeIds(doc, "road"),
    kindEdgeIds(doc, "river"),
    landArea,
    town.info,
    0,
    cuts + repair.splitFaces
  );
}

/**
 * The castle was sited against the planned old town, but the final circle is
 * centred on the plaza. Take in the town faces beside the castle that lie near
 * the circle, so the castle stays on the old-town curtain rather than between
 * the walls.
 */
function hugCastle(
  mesh: Mesh,
  info: Map<Id, FaceInfo>,
  inner: Set<Id>,
  castle: Set<Id>,
  radius: number,
  seed: Id
): Set<Id> {
  let added = false;
  const path = new Set<Id>();
  for (const id of castle)
    for (const ref of mesh.faces[id]?.boundary ?? []) {
      const edge = mesh.edges[ref.edgeId];
      for (const other of [edge.leftFace, edge.rightFace])
        if (other && info.has(other) && !inner.has(other) && info.get(other)!.dist <= radius * 1.35) {
          inner.add(other);
          added = true;
        }
    }
  // Still apart: reach the castle along the fewest town faces (a spur, like a
  // castle at the corner of the town wall).
  const beside = new Set<Id>();
  for (const id of castle)
    for (const ref of mesh.faces[id]?.boundary ?? []) {
      const edge = mesh.edges[ref.edgeId];
      for (const other of [edge.leftFace, edge.rightFace]) if (other && info.has(other)) beside.add(other);
    }
  if (beside.size && ![...beside].some(id => inner.has(id))) {
    const previous = new Map<Id, Id | null>();
    const queue: Id[] = [];
    for (const id of beside) {
      previous.set(id, null);
      queue.push(id);
    }
    let reached: Id | null = null;
    for (let q = 0; q < queue.length && !reached; q++)
      for (const n of info.get(queue[q])!.neighbors) {
        if (previous.has(n)) continue;
        previous.set(n, queue[q]);
        if (inner.has(n)) {
          reached = queue[q];
          break;
        }
        queue.push(n);
      }
    for (let at: Id | null = reached; at; at = previous.get(at) ?? null) {
      inner.add(at);
      path.add(at);
      added = true;
    }
  }
  if (added) {
    const refilled = connectedFilled(info, inner, seed);
    inner.clear();
    for (const id of refilled) inner.add(id);
  }
  // The faces that join the old town to the castle: later passes keep them.
  const joined = new Set<Id>([...path].filter(id => inner.has(id)));
  for (const id of beside) if (inner.has(id)) joined.add(id);
  return joined;
}

/** Town land faces inside the outer wall (no water, no castle), with distances from the centre. */
function townFaces(mesh: Mesh, area: Iterable<Id>, castle: Set<Id>, center: Point) {
  const outer = new Set(area);
  const info = new Map<Id, FaceInfo>();
  for (const id of outer) {
    const face = mesh.faces[id];
    if (face?.properties.water !== "land" || castle.has(id)) continue;
    const points = facePoints(mesh, face);
    const c = polygonCentroid(points);
    info.set(id, {
      id,
      area: Math.abs(polygonArea(points)),
      dist: Math.hypot(c[0] - center[0], c[1] - center[1]),
      neighbors: [],
      edge: false
    });
  }
  for (const edge of Object.values(mesh.edges)) {
    const l = edge.leftFace ? info.get(edge.leftFace) : undefined;
    const r = edge.rightFace ? info.get(edge.rightFace) : undefined;
    if (l && r) {
      l.neighbors.push(r.id);
      r.neighbors.push(l.id);
    } else if (l || r) (l ?? r)!.edge = true;
  }
  const ordered = [...info.values()].sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));
  return {
    outer,
    info,
    ordered,
    landArea: ordered.reduce((sum, f) => sum + f.area, 0),
    seed: ordered[0]?.id ?? ""
  };
}

/** Face layers from `inner` to anything outside the outer wall, through town faces only. */
function gapOf(mesh: Mesh, outer: Set<Id>, inner: Set<Id>, passable: Set<Id>): number {
  const depth = new Map<Id, number>();
  const queue: Id[] = [];
  for (const id of inner) {
    depth.set(id, 0);
    queue.push(id);
  }
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    const d = depth.get(id)!;
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId];
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      // A castle is neither outside the town nor a way through it.
      if (other && passable.has(other)) continue;
      if (!other || !outer.has(other)) return d;
      if (depth.has(other)) continue;
      depth.set(other, d + 1);
      queue.push(other);
    }
  }
  return Infinity;
}

/**
 * A street on a degree-3 mesh can only pass a curtain where a vertex has four
 * arms, as at the outer wall's gate passages. Put a vertex on each street edge
 * where it crosses the circle and cut both neighbouring faces from it along
 * the circle; the old-town selection then runs its curtain through it.
 */
function cutStreetCrossings(
  document: CityDocument,
  center: Point,
  radius: number,
  eligible: Map<Id, FaceInfo>,
  /** False before the town streets exist (the wall is built on planned lines). */
  includeStreets = true
): { document: CityDocument; cuts: number; riverCuts: Set<Id>; parentFaceIds: Map<Id, Id> } {
  const mesh = document.mesh;
  const dist = (p: Point) => Math.hypot(p[0] - center[0], p[1] - center[1]);
  const crossings: Array<{ edgeId: Id; t: number; faces: Id[]; river: boolean }> = [];
  const riverEdges = kindEdgeIds(document, "river");
  // A river crossing the circle gets the same vertex, so the curtain meets the
  // river as a four-way crossing (wall, river, wall, river) like the outer wall.
  // A bridge is a fixed road–river–road triple; its river edges are not cut.
  const bridgeVertices = new Set(
    document.featureGroups.flatMap(group =>
      group.kind === "road" && group.id.includes("bridge")
        ? group.segments.flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b])
        : []
    )
  );
  const candidates = [...(includeStreets ? kindEdgeIds(document, "road") : []), ...kindEdgeIds(document, "river")];
  for (const edgeId of candidates) {
    const edge = mesh.edges[edgeId];
    if (edge && (bridgeVertices.has(edge.a) || bridgeVertices.has(edge.b))) continue;
    if (!edge?.leftFace || !edge.rightFace || !eligible.has(edge.leftFace) || !eligible.has(edge.rightFace)) continue;
    const a = mesh.vertices[edge.a].point,
      b = mesh.vertices[edge.b].point;
    if (dist(a) < radius === dist(b) < radius) continue;
    // |a + (b - a)t - c| = radius, the root in [0, 1].
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      fx = a[0] - center[0],
      fy = a[1] - center[1];
    const qa = dx * dx + dy * dy,
      qb = 2 * (fx * dx + fy * dy),
      qc = fx * fx + fy * fy - radius * radius;
    const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const t = [(-qb - disc) / (2 * qa), (-qb + disc) / (2 * qa)].find(x => x >= 0 && x <= 1);
    if (t === undefined) continue;
    crossings.push({ edgeId, t, faces: [edge.leftFace, edge.rightFace], river: riverEdges.has(edgeId) });
  }
  let next = document;
  let cuts = 0;
  const riverCuts = new Set<Id>();
  const parentFaceIds = new Map(Object.keys(mesh.faces).map(id => [id, id]));
  for (const crossing of crossings) {
    const edge = next.mesh.edges[crossing.edgeId];
    if (!edge) continue;
    let vertexId: Id;
    // A street snaps to a nearby corner; a river needs its own vertex, because a
    // river corner already has the river's two arms and cannot take a crossing.
    if (!crossing.river && crossing.t < 0.2) vertexId = edge.a;
    else if (!crossing.river && crossing.t > 0.8) vertexId = edge.b;
    else {
      const inserted = insertEdgeVertex(next, crossing.edgeId, crossing.t);
      if (inserted) {
        next = inserted.document;
        vertexId = inserted.vertexId;
      } else {
        // Too close to a corner to split: use the corner.
        vertexId = crossing.t < 0.5 ? edge.a : edge.b;
      }
    }
    if (crossing.river) riverCuts.add(vertexId);
    const at = next.mesh.vertices[vertexId].point;
    for (const faceId of crossing.faces) {
      const face = next.mesh.faces[faceId];
      if (!face || !faceVertices(next.mesh, face).includes(vertexId)) continue;
      // The chord runs along the circle: its far end is the corner nearest the radius.
      const corners = faceVertices(next.mesh, face)
        .filter(id => id !== vertexId)
        .sort(
          (p, q) =>
            Math.abs(dist(next.mesh.vertices[p].point) - radius) - Math.abs(dist(next.mesh.vertices[q].point) - radius)
        );
      for (const corner of corners) {
        const far = next.mesh.vertices[corner].point;
        if (Math.hypot(far[0] - at[0], far[1] - at[1]) < 4) continue;
        const split = splitFace(next, faceId, vertexId, corner);
        if (!split) continue;
        for (const id of Object.keys(split.mesh.faces))
          if (!parentFaceIds.has(id)) parentFaceIds.set(id, parentFaceIds.get(faceId)!);
        next = split;
        cuts++;
        break;
      }
    }
  }
  return { document: next, cuts, riverCuts, parentFaceIds };
}

/** Distance-ordered prefix by area, pulled round: add in-circle faces, drop protrusions, fill holes. */
function selectRound(info: Map<Id, FaceInfo>, ordered: FaceInfo[], target: number, seed: Id): Set<Id> {
  const set = new Set<Id>();
  let area = 0;
  for (const f of ordered) {
    if (set.size && Math.abs(area - target) <= Math.abs(area + f.area - target)) break;
    set.add(f.id);
    area += f.area;
  }
  const r = Math.sqrt(target / Math.PI);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const id of [...set]) {
      const f = info.get(id)!;
      if (id !== seed && f.dist > 1.15 * r && f.neighbors.some(n => !set.has(n))) {
        set.delete(id);
        changed = true;
      }
    }
    for (const id of [...set])
      for (const n of info.get(id)!.neighbors)
        if (!set.has(n) && info.get(n)!.dist <= r) {
          set.add(n);
          changed = true;
        }
    if (!changed) break;
  }
  return connectedFilled(info, set, seed);
}

/** The seed's component, with enclosed pockets of eligible faces added. */
function connectedFilled(info: Map<Id, FaceInfo>, set: Set<Id>, seed: Id): Set<Id> {
  const component = new Set<Id>([seed]);
  const queue = [seed];
  while (queue.length) {
    const id = queue.pop()!;
    for (const n of info.get(id)!.neighbors)
      if (set.has(n) && !component.has(n)) {
        component.add(n);
        queue.push(n);
      }
  }
  // Faces of the town not reachable from the town edge without crossing the set are pockets.
  const outside = new Set<Id>();
  const pending: Id[] = [];
  for (const f of info.values())
    if (!component.has(f.id) && f.edge) {
      outside.add(f.id);
      pending.push(f.id);
    }
  while (pending.length) {
    const id = pending.pop()!;
    for (const n of info.get(id)!.neighbors)
      if (!component.has(n) && !outside.has(n)) {
        outside.add(n);
        pending.push(n);
      }
  }
  for (const f of info.values()) if (!component.has(f.id) && !outside.has(f.id)) component.add(f.id);
  return component;
}

/**
 * A street lying along the curtain would be walled over. Move the curtain off
 * it by adding the outside face or dropping the inside one, whichever keeps the
 * line nearer the target circle. Pushing only outward walks the curtain along a
 * radial street to the outer wall. A face toggles at most twice; street edges
 * still on the line afterwards become openings in the curtain.
 */
function keepStreetsOffCurtain(
  document: CityDocument,
  inner: Set<Id>,
  info: Map<Id, FaceInfo>,
  roads: Set<Id>,
  seed: Id,
  radius: number,
  keep: Set<Id> = new Set(),
  /** River corners the curtain may only reach at a planned crossing. */
  avoid: Set<Id> = new Set()
): void {
  const mesh = document.mesh;
  const grazes = (edgeId: Id) => {
    const edge = mesh.edges[edgeId];
    return !!edge && (avoid.has(edge.a) || avoid.has(edge.b));
  };
  const toggles = new Map<Id, number>();
  const off = (id: Id) => Math.abs(info.get(id)!.dist - radius);
  for (let pass = 0; pass < 40; pass++) {
    const onCurtain = boundaryEdges(mesh, inner).filter(ref => roads.has(ref.edgeId) || grazes(ref.edgeId));
    let changed = false;
    for (const ref of onCurtain) {
      const edge = mesh.edges[ref.edgeId];
      const inside = edge.leftFace && inner.has(edge.leftFace) ? edge.leftFace : edge.rightFace;
      const other = inside === edge.leftFace ? edge.rightFace : edge.leftFace;
      if (!inside || !inner.has(inside) || (other && inner.has(other))) continue;
      const canAdd = !!other && info.has(other) && (toggles.get(other) ?? 0) < 2;
      const canDrop = inside !== seed && !keep.has(inside) && (toggles.get(inside) ?? 0) < 2;
      const face = canAdd && (!canDrop || off(other!) <= off(inside)) ? other! : canDrop ? inside : null;
      if (!face) continue;
      if (face === inside) inner.delete(face);
      else inner.add(face);
      toggles.set(face, (toggles.get(face) ?? 0) + 1);
      changed = true;
    }
    if (!changed) break;
    const refilled = connectedFilled(info, inner, seed);
    inner.clear();
    for (const id of refilled) inner.add(id);
  }
}

function finish(
  document: CityDocument,
  inner: Set<Id>,
  outerId: Id | undefined,
  options: InnerWallOptions,
  roads: Set<Id>,
  rivers: Set<Id>,
  landArea: number,
  info: Map<Id, FaceInfo>,
  gap: number,
  cuts: number
): { document: CityDocument; report: InnerWallReport } {
  const built = build(document, inner, outerId, options, roads, rivers);
  const wallDrawn = !!options.wallOnly && built.runs > 0;
  const area = [...inner].reduce((sum, id) => sum + (info.get(id)?.area ?? 0), 0);
  const report: InnerWallReport = {
    ok: built.gates > 0 || built.ringRoad || wallDrawn,
    failure: built.gates > 0 || built.ringRoad || wallDrawn ? undefined : "no-gate",
    faces: inner.size,
    areaShare: Math.round((area / landArea) * 1000) / 1000,
    gapCells: Number.isFinite(gap) ? gap : -1,
    gates: built.gates,
    riverOpenings: built.riverOpenings,
    streetOpenings: built.streetOpenings,
    cuts,
    closedCrossings: built.closed,
    castleTouches: [...reservedCastleFaces(document)].some(id =>
      document.mesh.faces[id]?.boundary.some(ref => {
        const edge = document.mesh.edges[ref.edgeId];
        return [edge.leftFace, edge.rightFace].some(f => f && inner.has(f));
      })
    )
  };
  return { document: report.ok ? built.document : document, report };
}

function build(
  source: CityDocument,
  inner: Set<Id>,
  outerId: Id | undefined,
  options: InnerWallOptions,
  roads: Set<Id>,
  rivers: Set<Id>
): {
  document: CityDocument;
  gates: number;
  riverOpenings: number;
  streetOpenings: number;
  closed: number;
  ringRoad: boolean;
  runs: number;
} {
  const next = structuredClone(source);
  const mesh = next.mesh;
  const outerWall = next.featureGroups.find(
    g => g.kind === "wall" && next.defenseCircuits?.find(c => c.id === outerId)?.wallGroupIds.includes(g.id)
  );
  const style =
    options.wallStyle ?? (outerWall?.kind === "wall" ? outerWall.style : { widthMeters: 4, color: "#41382e" });
  const material = options.wallMaterial ?? (outerWall?.kind === "wall" ? outerWall.wallMaterial : undefined);

  // One closed ring, or open runs where a river passes under the line.
  const ring = boundaryRings(mesh, boundaryEdges(mesh, inner)).sort((a, b) => b.length - a.length)[0] ?? [];
  // The curtain runs through a river at a four-way vertex (wall, river, wall,
  // river), as the outer wall does. Only where a river merely touches the line
  // (no such crossing) is the curtain left open.
  const riverVertices = new Set(next.featureGroups.flatMap(group => (group.kind === "river" ? group.vertices : [])));
  const ringEdges = new Set(ring.map(ref => ref.edgeId));
  const crossesRiver = (vertexId: Id): boolean => {
    const ordered = orderedIncidentEdges(next, vertexId);
    const wall = ordered.filter(e => ringEdges.has(e.id)).map(e => e.id);
    const river = ordered.filter(e => rivers.has(e.id)).map(e => e.id);
    return alternatingPairs(ordered, wall, river);
  };
  const touchesRiver = (ref: EdgeRef) => {
    const edge = mesh.edges[ref.edgeId];
    return (
      rivers.has(ref.edgeId) ||
      [edge.a, edge.b].some(vertexId => riverVertices.has(vertexId) && !crossesRiver(vertexId))
    );
  };
  // Where the old town meets the castle the castle curtain is the wall (as at an
  // integrated castle on the outer wall); the town curtain must not double it.
  const castle = reservedCastleFaces(next);
  const castleSide = (ref: EdgeRef) => {
    const edge = mesh.edges[ref.edgeId];
    return [edge.leftFace, edge.rightFace].some(id => id && castle.has(id));
  };
  const open = (ref: EdgeRef) =>
    (!options.retainRiverCurtain && touchesRiver(ref)) || roads.has(ref.edgeId) || castleSide(ref);
  const riverOpenings = options.retainRiverCurtain ? 0 : ring.filter(touchesRiver).length;
  const streetOpenings = ring.filter(ref => roads.has(ref.edgeId)).length;
  const runs: EdgeRef[][] = [];
  const castleEdges = ring.filter(castleSide).length;
  if (!riverOpenings && !streetOpenings && !castleEdges) runs.push(ring);
  else {
    const start = ring.findIndex(open);
    let run: EdgeRef[] = [];
    for (let k = 1; k <= ring.length; k++) {
      const ref = ring[(start + k) % ring.length];
      if (open(ref)) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(ref);
    }
    if (run.length) runs.push(run);
  }
  // A razed wall leaves its line as a boulevard, as wide as the main roads.
  const mainRoad = next.featureGroups
    .filter(g => g.kind === "road")
    .reduce<CityDocument["featureGroups"][number] | null>(
      (widest, g) =>
        g.kind === "road" && (!widest || g.style.widthMeters > (widest.kind === "road" ? widest.style.widthMeters : 0))
          ? g
          : widest,
      null
    );
  if (options.razed)
    runs.forEach((segments, k) => {
      next.featureGroups.push({
        id: `${options.prefix}ring-road-${k}`,
        kind: "road",
        name: `Ring road ${k + 1}`,
        segments,
        style: mainRoad?.kind === "road" ? { ...mainRoad.style } : { widthMeters: 8, color: "#8d6e63" },
        locked: false
      });
    });
  else
    runs.forEach((segments, k) => {
      const id = `${options.prefix}inner-wall-${k}`;
      // The renderer draws the water gate (grate) where a wall run crosses a river.
      const runVertices = new Set(segments.flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b]));
      const riverPassages = [...runVertices].filter(v => riverVertices.has(v) && crossesRiver(v));
      next.featureGroups.push({
        id,
        kind: "wall",
        name: `Old town wall ${k + 1}`,
        segments,
        ...(riverPassages.length ? { riverPassages } : {}),
        style: { ...style, widthMeters: Math.max(2.4, style.widthMeters * 0.85) },
        ...(material ? { wallMaterial: material } : {}),
        locked: false
      });
    });

  // Gates: curtain vertices a street passes through (one street edge inside, one outside).
  const wallVertices = new Set(runs.flat().flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b]));
  const side = (edgeId: Id): "in" | "out" | "on" => {
    const e = mesh.edges[edgeId];
    const l = !!e.leftFace && inner.has(e.leftFace);
    const r = !!e.rightFace && inner.has(e.rightFace);
    return l && r ? "in" : l || r ? "on" : "out";
  };
  const crossings = new Map<Id, { in: boolean; out: boolean }>();
  for (const edgeId of roads) {
    const e = mesh.edges[edgeId];
    if (!e) continue;
    const s = side(edgeId);
    if (s === "on") continue;
    for (const v of [e.a, e.b]) {
      if (!wallVertices.has(v)) continue;
      const c = crossings.get(v) ?? { in: false, out: false };
      c[s] = true;
      crossings.set(v, c);
    }
  }
  // Run ends are not curtain vertices with two wall neighbours; a gate needs both arms.
  const runEnds = new Set(
    runs.length === 1 && !riverOpenings && !streetOpenings && !castleEdges
      ? []
      : runs.flatMap(run => [mesh.edges[run[0].edgeId], mesh.edges[run.at(-1)!.edgeId]].flatMap(e => [e.a, e.b]))
  );
  const crossingVertices = [...crossings].filter(([v, c]) => c.in && c.out && !runEnds.has(v)).map(([v]) => v);
  // An old-town wall had a few gates on the main roads, not one per lane: keep
  // the crossings on each outer gate's shortest street route to the plaza
  // (at least two), and close the others at the curtain.
  const gateVertices =
    options.razed || options.wallOnly
      ? []
      : options.arteries
        ? arteryGates(next, runs, runEnds, riverVertices, castleSide, options.arteries, style.widthMeters)
        : mainRoadCrossings(next, crossingVertices, roads, townCenter(next));
  // Before streets there is nothing to close: later streets can only use the gates.
  const closed =
    options.razed || options.wallOnly || options.arteries
      ? []
      : crossingVertices.filter(v => !gateVertices.includes(v));
  closeCrossings(next, closed, roads, side);

  registerTownCircuit(next, [], true, [...inner], 0);
  const circuitId = `gc:defense-town-0`;
  for (const c of next.defenseCircuits!) if (c.id === outerId) c.ring = 1;
  if (options.razed) next.defenseCircuits!.find(c => c.id === circuitId)!.state = "razed";
  gateVertices.forEach((vertexId, k) => {
    next.gates.push({ id: `${options.prefix}inner-gate-${k}`, vertexId, locked: false, role: "town", circuitId });
  });
  const outerCircuit = next.defenseCircuits!.find(c => c.id === outerId)!;
  const outerFaces = new Set(outerCircuit?.areaFaceIds ?? []);
  for (const face of Object.values(mesh.faces)) {
    if (inner.has(face.id)) face.properties.wallRing = 0;
    else if (outerFaces.has(face.id)) face.properties.wallRing = 1;
  }
  return {
    document: next,
    gates: gateVertices.length,
    riverOpenings,
    streetOpenings,
    closed: closed.length,
    ringRoad: options.razed ? runs.length > 0 : false,
    runs: runs.length
  };
}

/** Shortest street route (by length) from `from` to `to`; vertex ids, or null. */
function streetRoute(document: CityDocument, roads: Set<Id>, from: Id, to: Id): Id[] | null {
  const mesh = document.mesh;
  const adj = new Map<Id, Array<[Id, number]>>();
  for (const id of roads) {
    const edge = mesh.edges[id];
    if (!edge) continue;
    const a = mesh.vertices[edge.a].point,
      b = mesh.vertices[edge.b].point;
    const w = Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const [p, q] of [
      [edge.a, edge.b],
      [edge.b, edge.a]
    ]) {
      if (!adj.has(p)) adj.set(p, []);
      adj.get(p)!.push([q, w]);
    }
  }
  const dist = new Map<Id, number>([[from, 0]]);
  const previous = new Map<Id, Id>();
  const open = new Set<Id>([from]);
  while (open.size) {
    let at: Id | null = null;
    for (const v of open) if (at === null || dist.get(v)! < dist.get(at)!) at = v;
    open.delete(at!);
    if (at === to) break;
    for (const [n, w] of adj.get(at!) ?? []) {
      const d = dist.get(at!)! + w;
      if (d < (dist.get(n) ?? Infinity)) {
        dist.set(n, d);
        previous.set(n, at!);
        open.add(n);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0])!);
  return path;
}

/** Crossings on the outer gates' street routes to the plaza; at least two, spread round the curtain. */
function mainRoadCrossings(document: CityDocument, crossings: Id[], roads: Set<Id>, center: Point): Id[] {
  if (crossings.length <= 2) return crossings;
  const mesh = document.mesh;
  const roadVertices = new Set([...roads].flatMap(id => (mesh.edges[id] ? [mesh.edges[id].a, mesh.edges[id].b] : [])));
  let plaza: Id | null = null;
  for (const v of roadVertices) {
    const p = mesh.vertices[v].point;
    if (
      plaza === null ||
      Math.hypot(p[0] - center[0], p[1] - center[1]) <
        Math.hypot(mesh.vertices[plaza].point[0] - center[0], mesh.vertices[plaza].point[1] - center[1])
    )
      plaza = v;
  }
  const keep = new Set<Id>();
  const crossingSet = new Set(crossings);
  if (plaza)
    for (const gate of townGates(document)) {
      const route = streetRoute(document, roads, gate.vertexId, plaza);
      // The first crossing on the way in is this road's old-town gate.
      const first = route?.find(v => crossingSet.has(v));
      if (first) keep.add(first);
    }
  // Too few main roads: add the crossings farthest round from those kept.
  const angle = (v: Id) => {
    const p = mesh.vertices[v].point;
    return Math.atan2(p[1] - center[1], p[0] - center[0]);
  };
  const apart = (v: Id) =>
    Math.min(
      ...[...keep].map(k => {
        const d = Math.abs(angle(v) - angle(k)) % (2 * Math.PI);
        return d > Math.PI ? 2 * Math.PI - d : d;
      }),
      Math.PI
    );
  while (keep.size < 2) {
    const rest = crossings.filter(v => !keep.has(v));
    if (!rest.length) break;
    keep.add(rest.reduce((a, b) => (apart(b) > apart(a) ? b : a)));
  }
  return crossings.filter(v => keep.has(v));
}

/**
 * Close a crossing at the curtain: drop the street edges on the outer side of
 * the vertex, so the lane ends at the wall on both sides. Groups are split
 * where an edge leaves, keeping each run contiguous.
 */
function closeCrossings(
  document: CityDocument,
  vertices: Id[],
  roads: Set<Id>,
  side: (edgeId: Id) => "in" | "out" | "on"
): void {
  if (!vertices.length) return;
  const mesh = document.mesh;
  const at = new Set(vertices);
  const drop = new Set(
    [...roads].filter(id => {
      const edge = mesh.edges[id];
      return edge && side(id) === "out" && (at.has(edge.a) || at.has(edge.b));
    })
  );
  const groups: CityDocument["featureGroups"] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || !group.segments.some(ref => drop.has(ref.edgeId))) {
      groups.push(group);
      continue;
    }
    const runs: EdgeRef[][] = [[]];
    for (const ref of group.segments) {
      if (drop.has(ref.edgeId)) runs.push([]);
      else runs.at(-1)!.push(ref);
    }
    runs
      .filter(run => run.length)
      .forEach((segments, k) => {
        groups.push({ ...group, id: k ? `${group.id}:closed-${k}` : group.id, segments });
      });
  }
  document.featureGroups = groups;
  for (const id of drop) roads.delete(id);
}

/**
 * Gates for a wall built before the town streets: where each planned
 * gate-to-centre line first meets the curtain, the nearest usable curtain
 * vertex (not a run end, a river corner or the castle's side). Gates closer
 * than one gate spacing share the first.
 */
function arteryGates(
  document: CityDocument,
  runs: EdgeRef[][],
  runEnds: Set<Id>,
  riverVertices: Set<Id>,
  castleSide: (ref: EdgeRef) => boolean,
  arteries: Point[][],
  wallWidthMeters: number
): Id[] {
  const mesh = document.mesh;
  const usable = new Set<Id>();
  const castleVertices = new Set<Id>();
  for (const run of runs)
    for (const ref of run) {
      const edge = mesh.edges[ref.edgeId];
      if (castleSide(ref)) {
        castleVertices.add(edge.a);
        castleVertices.add(edge.b);
      }
      usable.add(edge.a);
      usable.add(edge.b);
    }
  for (const v of [...usable]) if (runEnds.has(v) || riverVertices.has(v) || castleVertices.has(v)) usable.delete(v);
  const segments = runs.flat().map(ref => {
    const edge = mesh.edges[ref.edgeId];
    return [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point] as [Point, Point];
  });
  const spacing = minGateSpacingMeters(wallWidthMeters);
  const gates: Id[] = [];
  for (const line of arteries) {
    // Walk from the plaza outward: the first curtain hit is this road's old-town gate.
    const inward = [...line].reverse();
    let hit: Point | null = null;
    for (let i = 1; i < inward.length && !hit; i++)
      for (const [a, b] of segments) {
        const h = segmentSegmentHit(inward[i - 1], inward[i], a, b);
        if (h) {
          hit = h.point;
          break;
        }
      }
    if (!hit) continue;
    let best: Id | null = null;
    let bestDistance = Infinity;
    for (const v of usable) {
      const p = mesh.vertices[v].point;
      const d = Math.hypot(p[0] - hit[0], p[1] - hit[1]);
      if (d < bestDistance) {
        best = v;
        bestDistance = d;
      }
    }
    if (!best) continue;
    const at = mesh.vertices[best].point;
    if (gates.some(g => Math.hypot(mesh.vertices[g].point[0] - at[0], mesh.vertices[g].point[1] - at[1]) < spacing))
      continue;
    gates.push(best);
  }
  return gates;
}
