import { placementFootprint } from "../../../../buildings/placementModels";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { polygonOverlaps } from "../../fortifications";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { civicSizeForPopulation } from "../../housing";
import { insetConvexKernel } from "../../lotGeometry";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { CIVIC_PLAZA_ID } from "./market";

/**
 * Furniture of a Christian civic centre (docs/plan/bv-town-church-tiers.md, B6b): the square's stocks or market
 * cross, sized by the square, and the churchyard's cross and lych-gate. Only a churchyard laid with a Christian
 * chapel (`chapel_basilica`, not the Japanese temple town that shares the taxonomy) takes them.
 */
const christian = (doc: VectorCityDocument) => {
  const profile = doc.environment?.landscape?.context.burialProfile;
  return (
    !!doc.placements["civic:church"] && profile?.sanctuary === "chapel_basilica" && profile.id !== "edo_temple_town"
  );
};

/** The square's furniture by its side: stocks on a village green, a stone cross, a canopied cross from 48 m. */
export function plazaFurnitureModel(sideMeters: number): string {
  return sideMeters < 24 ? "pillory-and-stocks" : sideMeters < 40 ? "market-cross-stepped" : "market-cross-canopied";
}

/** A box for a model's footprint turned to `facing` degrees (plan Y is three's -Z, as `scene3d` turns it). */
function plot(modelId: string, center: Point, facing: number): Point[] | null {
  const f = placementFootprint(modelId, "high");
  if (!f) return null;
  const a = (facing * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-f.halfX, -f.halfZ],
    [f.halfX, -f.halfZ],
    [f.halfX, f.halfZ],
    [-f.halfX, f.halfZ]
  ].map(([x, z]) => [center[0] + x * c + z * s, center[1] + x * s - z * c] as Point);
}

function place(doc: VectorCityDocument, id: string, modelId: string, at: Point, facing: number, site: Point[]) {
  // The square's piece belongs to the plaza like its stalls; the churchyard's stand on the yard and its wall, which
  // a cemetery feature does not list, and share the church's street access.
  const plaza = id.startsWith("civic:plaza") ? doc.environment?.features[CIVIC_PLAZA_ID] : undefined,
    access = plaza?.access ?? doc.placements["civic:church"]?.accesses[0];
  doc.placements[id] = {
    id,
    modelId,
    position: at,
    facingDegrees: facing,
    origin: "automatic",
    editPolicy: "editable",
    site: { outer: site, holes: [] },
    accesses: access ? [access] : [],
    appearance: { quality: "high" },
    display: {
      kind: "object",
      heightMeters: 3,
      footprint: [{ outer: site, holes: [] }],
      provenance: "copied",
      note: "Civic furniture laid with the civic centre; excluded from residential capacity.",
      dwellings: 0
    }
  };
  plaza?.placementIds.push(id);
}

/** The square's stocks or cross, on the free ground nearest its middle, clear of stalls, aisles and streets. */
export function raiseVectorPlazaFurniture(doc: VectorCityDocument): boolean {
  const plaza = doc.environment?.features[CIVIC_PLAZA_ID];
  if (plaza?.kind !== "market" || !christian(doc)) return false;
  const modelId = plazaFurnitureModel(civicSizeForPopulation(doc.context.targetPopulation ?? 0).plazaSideMeters),
    kernel = insetConvexKernel(
      plaza.boundary.outer,
      plaza.boundary.outer.map(() => 1)
    );
  if (kernel.length < 3) return false;
  const centre = polygonCentroid(kernel),
    water = allVectorWater(doc),
    blocked = [
      ...Object.values(doc.placements).map(p => p.site.outer),
      ...plaza.pieces.filter(p => p.id.includes(":aisle:")).map(p => p.polygon.outer),
      ...Object.values(doc.paths)
        .filter(p => p.role === "road")
        .map(p => pathSurface(p).outer)
    ];
  const xs = kernel.map(p => p[0]),
    ys = kernel.map(p => p[1]),
    candidates: Point[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) candidates.push([x, y]);
  candidates.sort(
    (a, b) => Math.hypot(a[0] - centre[0], a[1] - centre[1]) - Math.hypot(b[0] - centre[0], b[1] - centre[1])
  );
  // A cross takes the middle of the square in place of the public basin (`wells.ts`); the stocks leave the middle
  // to the basin and stand at least 5 m off it.
  const offCentre = modelId === "pillory-and-stocks" ? 5 : 0;
  for (const at of candidates) {
    if (Math.hypot(at[0] - centre[0], at[1] - centre[1]) < offCentre) continue;
    const site = plot(modelId, at, 0);
    if (!site?.every(p => pointInPolygon(p, kernel))) continue;
    if (blocked.some(b => polygonOverlaps(site, b))) continue;
    if (regionBoolean([{ outer: site, holes: [] }], water, "intersection").some(r => regionArea(r) > 1e-5)) continue;
    place(doc, "civic:plaza-furniture", modelId, at, 0, site);
    return true;
  }
  return false;
}

/**
 * The churchyard's lych-gate inside its wall at the gate, the path through it pointing out of the yard, and its
 * cross on the free ground nearest the yard's middle, clear of the graves, buildings and walks.
 */
export function raiseVectorChurchyardFurniture(doc: VectorCityDocument): { gate: boolean; cross: boolean } {
  const plan = doc.environment?.landscape?.cemeteries.find(c => c.id === "civic:cemetery");
  if (!plan?.gatePoint || !plan.courtyards[0] || !christian(doc)) return { gate: false, cross: false };
  const yard = plan.courtyards[0],
    centre = polygonCentroid(yard),
    gate = plan.gatePoint,
    d = Math.hypot(gate[0] - centre[0], gate[1] - centre[1]) || 1,
    out: Point = [(gate[0] - centre[0]) / d, (gate[1] - centre[1]) / d],
    wall = nearestOnPolyline(gate, [...plan.boundary, plan.boundary[0]]).point,
    // The model's path runs along its local +Z, which `scene3d` turns to plan (sin θ, -cos θ).
    facing = (Math.atan2(out[0], -out[1]) * 180) / Math.PI,
    taken = [...plan.parts.map(p => p.footprint), ...Object.values(doc.placements).map(p => p.site.outer)];
  let gateDone = false;
  // Set inside the wall line, its street end flush with the wall: standing out into the street would move the
  // town's blocks for a piece of furniture. It takes the gate, or slides along the wall past a small yard's chapel;
  // the headstones under it are left out, everything else it must clear.
  const half = (placementFootprint("lych-gate", "high")?.halfZ ?? 2.55) + 0.05,
    along: Point = [-out[1], out[0]],
    graves = (t: (typeof plan.parts)[number]) => t.role === "monument" && t.kind === "headstone_grid";
  for (const shift of [0, 3, -3, 5, -5, 7, -7]) {
    const door: Point = [wall[0] + along[0] * shift, wall[1] + along[1] * shift],
      inside: Point = [door[0] - out[0] * half, door[1] - out[1] * half],
      site = plot("lych-gate", inside, facing);
    if (!site?.every(p => pointInPolygon(p, plan.boundary))) continue;
    if (plan.parts.some(t => !graves(t) && t.footprint.length >= 3 && polygonOverlaps(site, t.footprint))) continue;
    if (Object.values(doc.placements).some(p => polygonOverlaps(site, p.site.outer))) continue;
    plan.parts = plan.parts.filter(t => !graves(t) || !polygonOverlaps(site, t.footprint));
    plan.gatePoint = door;
    place(doc, "civic:churchyard-gate", "lych-gate", inside, facing, site);
    taken.splice(
      0,
      taken.length,
      ...plan.parts.map(p => p.footprint),
      ...Object.values(doc.placements).map(p => p.site.outer)
    );
    gateDone = true;
    break;
  }
  const walks = plan.accesses;
  const xs = yard.map(p => p[0]),
    ys = yard.map(p => p[1]),
    candidates: Point[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) candidates.push([x, y]);
  candidates.sort(
    (a, b) => Math.hypot(a[0] - centre[0], a[1] - centre[1]) - Math.hypot(b[0] - centre[0], b[1] - centre[1])
  );
  for (const at of candidates) {
    const site = plot("churchyard-cross", at, 0);
    if (!site?.every(p => pointInPolygon(p, yard))) continue;
    if (taken.some(t => t.length >= 3 && polygonOverlaps(site, t))) continue;
    if (walks.some(w => site.some(p => nearestOnPolyline(p, w.points).dist < w.widthMeters / 2 + 0.3))) continue;
    place(doc, "civic:churchyard-cross", "churchyard-cross", at, 0, site);
    return { gate: gateDone, cross: true };
  }
  return { gate: gateDone, cross: false };
}
