import type { CityDocument } from "../../types/document";
import type { CityProgram } from "../../types/geometry";
import { elevationSampler, settleRiverGrades } from "../elevationPreset";
import { polygonCentroid } from "../geom";
import { clone, facePoints } from "../mesh";
import { assignFrameRoads, editorWard } from "./assembly/documentProperties";
import { polylineToVertexPath } from "./assembly/riverPath";
import { GEN_PREFIX } from "./constants";
import type { Plan } from "./contracts";
import { nearestVertexLookup } from "./planning/meshLookup";

// --- classifier chain (a trimmed pipeline.ts, no mesh-mutating steps) ---------

/** Keep continuous water even when no coarse face is wholly wet.
 * Only wholly covered cells become water; partial cells use the exact reservation. */

/** A planning checkpoint, not another generation pass (notably when a castle has no site). */
export function planningDebugDocument(
  source: CityDocument,
  faceIdOf: string[],
  plan: Plan,
  program: CityProgram
): CityDocument {
  const next = clone(source);
  if (plan.mesh) next.mesh = clone(plan.mesh);
  const ids = plan.faceIdOf ?? faceIdOf;
  if (plan.replaceFixedCrossings)
    next.importedFixedCrossings = plan.fixedCrossings ? clone(plan.fixedCrossings) : undefined;
  next.importedRoadCount = plan.importedRoads?.length;
  next.riverConnections = plan.importedRoads?.flatMap(r => (r.riverConnection ? [clone(r.riverConnection)] : []));
  assignFrameRoads(next, plan);
  next.waterAreas = plan.channelPolygons?.map(polygon => ({ kind: "river", polygon: clone(polygon) }));
  next.regionalWaterAreas = plan.regionalWater?.length ? plan.regionalWater.map(ring => clone(ring)) : undefined;
  next.regionalSurface = plan.regionalSurface ? clone(plan.regionalSurface) : undefined;
  delete next.appearance;
  delete next.townWallGeneration;
  delete next.fabric;
  next.featureGroups = next.featureGroups.filter(g => g.locked || !g.id.startsWith(GEN_PREFIX));
  next.gates = next.gates.filter(g => g.locked || !g.id.startsWith(GEN_PREFIX));
  next.elements = next.elements.filter(e => e.locked || !e.id.startsWith(GEN_PREFIX));
  const sampleElevation = elevationSampler(plan, next.frame);
  for (const [index, id] of ids.entries()) {
    const face = next.mesh.faces[id];
    if (!face || face.properties.locked) continue;
    face.properties.water = plan.sea.has(index) ? "sea" : "land";
    if (!plan.sea.has(index))
      face.properties.elevation = sampleElevation(
        polygonCentroid(facePoints(next.mesh, face)),
        index,
        face.properties.elevation
      );
    face.properties.buildable = !plan.sea.has(index) && (plan.urban.has(index) || plan.outskirts.has(index));
    face.properties.settlement = plan.urban.has(index) ? "core" : "outskirts";
    face.properties.ward = editorWard(plan.wards.get(index) ?? "empty");
    const domain = plan.wardOrder.find(row => row.cellId === index)?.craftDomain;
    if (face.properties.ward === "craftsmen" && domain) face.properties.craftDomain = domain;
    else delete face.properties.craftDomain;
  }
  const nearest = nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters));
  for (const [index, river] of plan.rivers.entries())
    next.featureGroups.push({
      id: `${GEN_PREFIX}river-${index}`,
      kind: "river",
      name: `River ${index + 1}`,
      ...(river.crossing ? { crossing: river.crossing } : {}),
      vertices: polylineToVertexPath(next.mesh, river.resolvedEdgePoints, nearest),
      source: null,
      mouth: null,
      style: { widthMeters: Math.max(6, river.widths[0] ?? 12), color: "#4f8aad" },
      locked: false
    });
  // This is the planned wall, before passage construction and road routing.
  const debugWallMaterial = plan.wallMaterial ?? "stone";
  const isDebugWallWood = debugWallMaterial === "wood";
  for (const [index, loop] of (program.walls ? plan.borderLoops : []).entries())
    next.featureGroups.push({
      id: `${GEN_PREFIX}debug-wall-${index}`,
      kind: "wall",
      name: `Planned wall ${index + 1}`,
      segments: clone(loop.segments),
      style: {
        widthMeters: isDebugWallWood ? 2.4 : 4,
        color: isDebugWallWood ? "#634327" : "#41382e"
      },
      wallMaterial: debugWallMaterial,
      locked: false
    });
  for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
    if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
    next.elements.push({
      id: `${GEN_PREFIX}debug-${precinct.kind}`,
      kind: precinct.kind as "plaza" | "citadel" | "temple" | "harbor",
      faceIds: precinct.cellIds.map(id => ids[id]).filter(Boolean),
      point: clone(precinct.anchor),
      locked: false
    });
  }
  return settleRiverGrades(next);
}
