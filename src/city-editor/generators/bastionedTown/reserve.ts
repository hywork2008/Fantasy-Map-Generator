// One reservation test for buildings, farms, landmarks and wards. The index is derived.
import type { BastionedTownPlan, CityDocument, DefenseRegion, Point } from "../../types/document";
import type { Plan } from "../generation/contracts";
import { polygonCentroid } from "../geom";
import { pointInRings } from "./geometry";

const CELL = 32;

interface Band {
  outer: Point[];
  holes: Point[][];
}

interface ReservationIndex {
  bands: Band[];
  grid: Map<string, number[]>;
}

const cache = new WeakMap<BastionedTownPlan, ReservationIndex>();

function pushBand(bands: Band[], region: DefenseRegion | undefined): void {
  for (const poly of region ?? []) if (poly.outer.length >= 3) bands.push({ outer: poly.outer, holes: poly.holes });
}

function bandsOf(plan: BastionedTownPlan): Band[] {
  const bands: Band[] = [];
  for (const bastion of plan.bastions)
    bands.push({ outer: bastion.rampart, holes: [] }, { outer: bastion.platform, holes: [] });
  for (const curtain of plan.curtains) bands.push({ outer: curtain.rampart, holes: [] });
  for (const work of plan.outworks)
    bands.push(
      { outer: work.outline, holes: [] },
      { outer: work.rampart, holes: [] },
      { outer: work.platform, holes: [] }
    );
  for (const ditch of plan.ditches) pushBand(bands, ditch.region);
  for (const path of plan.coveredWays) pushBand(bands, path.region);
  for (const region of plan.glacis) pushBand(bands, region);
  return bands;
}

function indexPlan(plan: BastionedTownPlan): ReservationIndex {
  const hit = cache.get(plan);
  if (hit) return hit;
  const bands = bandsOf(plan);
  const grid = new Map<string, number[]>();
  bands.forEach((band, index) => {
    const xs = band.outer.map(p => p[0]);
    const ys = band.outer.map(p => p[1]);
    const x0 = Math.floor(Math.min(...xs) / CELL);
    const x1 = Math.floor(Math.max(...xs) / CELL);
    const y0 = Math.floor(Math.min(...ys) / CELL);
    const y1 = Math.floor(Math.max(...ys) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`;
        const list = grid.get(key);
        if (list) list.push(index);
        else grid.set(key, [index]);
      }
  });
  const built = { bands, grid };
  cache.set(plan, built);
  return built;
}

function covers(index: ReservationIndex, point: Point): boolean {
  const list = index.grid.get(`${Math.floor(point[0] / CELL)}:${Math.floor(point[1] / CELL)}`);
  if (!list) return false;
  return list.some(i => {
    const band = index.bands[i];
    return pointInRings(point, [band.outer]) && !pointInRings(point, band.holes);
  });
}

export function fortressOwnsTownWall(document: CityDocument, groupId: string): boolean {
  const plan = document.bastionedTown;
  if (!plan) return false;
  const circuit = document.defenseCircuits?.find(c => c.id === plan.circuitId);
  return !!circuit?.wallGroupIds.includes(groupId);
}

export function pointReserved(plan: BastionedTownPlan | undefined, point: Point): boolean {
  if (!plan) return false;
  return covers(indexPlan(plan), point);
}

/** A lot is reserved when its centroid or any vertex lies on defense ground. */
export function polygonReserved(plan: BastionedTownPlan | undefined, points: Point[]): boolean {
  if (!plan || points.length < 1) return false;
  const index = indexPlan(plan);
  const centroid = polygonCentroid(points);
  return covers(index, centroid) || points.some(point => covers(index, point));
}

export function excludeReserved(plan: Plan, town: BastionedTownPlan): void {
  const cells = plan.cells ?? [];
  const drop = new Set<number>();
  for (const cell of cells) {
    const points = cell.polygon;
    if (polygonReserved(town, points)) drop.add(cell.id);
  }
  for (const id of drop) {
    plan.urban.delete(id);
    plan.outskirts.delete(id);
    plan.builtUp.delete(id);
    plan.wards.delete(id);
  }
}

export function markReservedFaces(document: CityDocument): void {
  const plan = document.bastionedTown;
  if (!plan) return;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.ward === "castle" || face.properties.locked) continue;
    const points = face.boundary.map(ref => {
      const edge = document.mesh.edges[ref.edgeId];
      return document.mesh.vertices[ref.forward ? edge.a : edge.b].point;
    });
    if (!polygonReserved(plan, points)) continue;
    face.properties.buildable = false;
    if (face.properties.ward === "farm" || face.properties.ward === "park") face.properties.ward = "empty";
  }
}
