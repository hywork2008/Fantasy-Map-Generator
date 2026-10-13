import { editorText } from "../../../../i18n/editorMessages";
import type { CityDocument } from "../../../types/document";
import type { Cell } from "../../../types/geometry";
import { castleWallIds, reservedCastleFaces } from "../../fortifications";
import { clone, faceNeighbors, facePoints } from "../../mesh";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import { nearestVertexLookup } from "../planning/meshLookup";
import type { AssemblyCheckpoint } from "./contracts";
import { assignFrameRoads, editorWard, faceFor, landElevation, settingsLegacy } from "./documentProperties";
import { appendGeneratedGroup } from "./generatedFeatures";
import { polylineToVertexPath } from "./riverPath";

export interface ApplyTerrainInput {
  plan: Pick<
    Plan,
    | "mesh"
    | "cells"
    | "faceIdOf"
    | "replaceFixedCrossings"
    | "fixedCrossings"
    | "importedRoads"
    | "channelPolygons"
    | "regionalWater"
    | "regionalSurface"
    | "layout"
    | "castleFailure"
    | "fmgElevations"
    | "urban"
    | "sea"
    | "ocean"
    | "outskirts"
    | "urbanCoreMode"
    | "rivers"
    | "wardOrder"
    | "wards"
    | "templeHarbor"
    | "castleSite"
    | "legacyCastles"
    | "frameRoads"
  >;
  next: CityDocument;
  cells: Cell[];
  faceIdOf: string[];
  source: CityDocument;
  wallCheckpoint: AssemblyCheckpoint | undefined;
  stageStep: number;
}

/** Initializes the attempt mesh and fixed geography, clears unlocked generated output, then assigns wards before any passage splits. Mutates only the supplied attempt document. */
export function applyTerrain(input: ApplyTerrainInput) {
  let { plan, next, cells, faceIdOf, source, wallCheckpoint, stageStep } = input;
  if (plan.mesh) {
    next.mesh = clone(plan.mesh);
    cells = plan.cells!;
    faceIdOf = plan.faceIdOf!;
  }
  if (plan.replaceFixedCrossings)
    next.importedFixedCrossings = plan.fixedCrossings ? clone(plan.fixedCrossings) : undefined;
  next.importedRoadCount = plan.importedRoads?.length;
  next.riverConnections = plan.importedRoads?.flatMap(r => (r.riverConnection ? [clone(r.riverConnection)] : []));
  assignFrameRoads(next, plan);
  next.waterAreas = plan.channelPolygons?.map(polygon => ({ kind: "river", polygon: clone(polygon) }));
  next.regionalWaterAreas = plan.regionalWater?.length ? plan.regionalWater.map(ring => clone(ring)) : undefined;
  next.regionalSurface = plan.regionalSurface ? clone(plan.regionalSurface) : undefined;
  delete next.appearance;
  // Keep the active morphology even when routing rejects before town finish.
  next.layout = plan.layout ?? source.layout;
  if (!settingsLegacy(plan)) {
    next.castles = (next.castles ?? []).filter(c => c.locked || c.provenance !== "generated");
    const retained = new Set(next.castles.map(c => c.id));
    next.defenseCircuits = (next.defenseCircuits ?? []).filter(
      c => c.locked || (c.ownerCastleId && retained.has(c.ownerCastleId))
    );
  }
  if (plan.castleFailure && !wallCheckpoint) return { stopped: true as const, document: null };
  const mesh = next.mesh;

  // Clear this module's previous output + every non-locked face tag, so the
  // stages read as a scrub through the process rather than an accumulation.
  const retainedWalls = castleWallIds(next);
  next.featureGroups = next.featureGroups.filter(
    group => group.locked || retainedWalls.has(group.id) || !group.id.startsWith(GEN_PREFIX)
  );
  next.gates = (next.gates ?? []).filter(
    gate =>
      gate.locked ||
      (gate.ownerCastleId && next.castles?.some(c => c.id === gate.ownerCastleId)) ||
      !gate.id.startsWith(GEN_PREFIX)
  );
  next.elements = next.elements.filter(element => element.locked || !element.id.startsWith(GEN_PREFIX));
  for (const face of Object.values(mesh.faces)) {
    if (face.properties.locked || reservedCastleFaces(next).has(face.id)) continue;
    face.properties.water = "land";
    if (face.properties.elevation <= 0) face.properties.elevation = 1;
    face.properties.buildable = true;
    face.properties.ward = null;
    delete face.properties.settlement;
    delete face.properties.wallRing;
  }
  if (plan.fmgElevations)
    for (const [cellId, faceId] of faceIdOf.entries()) {
      const face = mesh.faces[faceId];
      if (!face || face.properties.locked || reservedCastleFaces(next).has(face.id)) continue;
      face.properties.elevation = landElevation(plan, cellId, face.properties.elevation);
    }
  const nearest = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
  const urbanRegions = [...plan.urban]
    .map(id => faceFor(mesh, faceIdOf, id))
    .filter(face => !!face)
    .map(face => facePoints(mesh, face));
  // ① sea
  for (const cellId of plan.sea) {
    const face = faceFor(mesh, faceIdOf, cellId);
    if (face && !face.properties.locked && !reservedCastleFaces(next).has(face.id)) {
      face.properties.water = "sea";
      face.properties.elevation = 0;
      face.properties.depth ??= 3;
      face.properties.buildable = false;
    }
  }
  next.coastalOceanFaceIds = [...plan.ocean]
    .map(cellId => faceFor(mesh, faceIdOf, cellId)?.id)
    .filter((id): id is string => !!id && mesh.faces[id].properties.water === "sea");

  // ③ built-up cells (buildable). Non-urban land is not buildable.
  if (stageStep >= 3) {
    const built = new Set<number>([...plan.urban, ...plan.outskirts]);
    for (let id = 0; id < cells.length; id++) {
      const face = faceFor(mesh, faceIdOf, id);
      if (
        face &&
        !face.properties.locked &&
        face.properties.water === "land" &&
        !reservedCastleFaces(next).has(face.id)
      ) {
        face.properties.buildable = built.has(id);
        if ((source.gridKind === "evolution" || plan.urbanCoreMode === "compact") && built.has(id))
          face.properties.settlement = plan.urban.has(id) ? "core" : "outskirts";
      }
    }
  }

  // ② river feature groups
  if (stageStep >= 2) {
    const againstFlow = new Set<string>();
    plan.rivers.forEach((band, i) => {
      const vertices = polylineToVertexPath(mesh, band.resolvedEdgePoints, nearest, againstFlow);
      if (vertices.length < 2) return;
      for (let j = 1; j < vertices.length; j++) againstFlow.add(`${vertices[j]}>${vertices[j - 1]}`);
      const width = band.widths.length ? band.widths.reduce((s, w) => s + w, 0) / band.widths.length : 12;
      appendGeneratedGroup(next, {
        id: `${GEN_PREFIX}river-${i}`,
        kind: "river",
        name: `River ${i + 1}`,
        ...(band.crossing ? { crossing: band.crossing } : {}),
        vertices,
        source: null,
        mouth: null,
        // Imported widths are physical. The former completed-view multiplier
        // turned a broad border river into water over the town itself.
        style: { widthMeters: Math.max(6, width), color: "#4f8aad" },
        locked: false
      });
    });
  }

  // Assign stage-six wards before passage splits so every child inherits its district.
  if (stageStep >= 6) {
    const craftDomainOf = new Map(
      plan.wardOrder.flatMap(row => (row.craftDomain ? [[row.cellId, row.craftDomain] as const] : []))
    );
    for (const [cellId, kind] of plan.wards) {
      const face = faceFor(mesh, faceIdOf, cellId);
      let editor = editorWard(kind);
      if (face && !face.properties.locked && editor && !reservedCastleFaces(next).has(face.id)) {
        if (face.properties.water !== "land") continue;
        if (editor === "harbor") {
          const touchesSea = faceNeighbors(mesh, face.id).some(nid => mesh.faces[nid]?.properties.water === "sea");
          if (
            !touchesSea &&
            !plan.templeHarbor.some(
              p =>
                p.kind === "harbor" &&
                p.label === editorText("cityEditor.messages.riverHarbour") &&
                p.cellIds.includes(cellId)
            )
          ) {
            editor = "merchant";
          }
        }
        face.properties.ward = editor;
        if (editor === "craftsmen" && craftDomainOf.get(cellId))
          face.properties.craftDomain = craftDomainOf.get(cellId);
        else delete face.properties.craftDomain;
        // A reserved harbour may be on the first dry cell beyond the compact
        // residential core. It still needs a working quay and port buildings.
        if (editor === "harbor" && face.properties.water === "land") face.properties.buildable = true;
        if (editor === "cemetery" || editor === "park") {
          face.properties.buildable = false;
        }
      }
    }
  }

  if (plan.castleSite) {
    const face = mesh.faces[plan.castleSite.faceId];
    if (face) {
      face.properties.ward = "castle";
      face.properties.buildable = false;
    }
  }

  return { stopped: false as const, mesh, nearest, urbanRegions, cells, faceIdOf };
}

export type ApplyTerrainResult = ReturnType<typeof applyTerrain>;
