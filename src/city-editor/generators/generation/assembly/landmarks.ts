import { editorText } from "../../../../i18n/editorMessages";
import { orientTempleHybrid } from "../../../core/gen/civicPlacement";
import { plazaFootprintMeters, templeFootprintMeters } from "../../../core/gen/housing";
import { townExtentMeters } from "../../../core/gen/settlementExtent";
import { faceNeighbors } from "../../../core/mesh";
import type { CityDocument } from "../../../core/types";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
export function applyLandmarks(
  next: CityDocument,
  mesh: import("../../../core/types").Mesh,
  faceIdOf: string[],
  plan: Pick<Plan, "precincts" | "templeHarbor">
): void {
  for (const precinct of [...plan.precincts, ...plan.templeHarbor]) {
    if (!["plaza", "citadel", "temple", "harbor"].includes(precinct.kind)) continue;
    // An estuary town has a river and a sea harbour: number the second one.
    const elementId =
      precinct.kind === "harbor" &&
      precinct.label === editorText("cityEditor.messages.harbour") &&
      next.elements.some(e => e.id === `${GEN_PREFIX}harbor`)
        ? `${GEN_PREFIX}harbor-sea`
        : `${GEN_PREFIX}${precinct.kind}`;
    if (next.elements.some(e => e.id === elementId)) continue;
    if (precinct.kind === "harbor") {
      const harborFaceIds = precinct.cellIds
        .map(id => faceIdOf[id])
        .filter(
          fid => fid && mesh.faces[fid]?.properties.water === "land" && mesh.faces[fid].properties.ward === "harbor"
        );
      if (!harborFaceIds.length) continue;
      const hasCoastalFace = harborFaceIds.some(fid =>
        faceNeighbors(mesh, fid).some(nid => mesh.faces[nid]?.properties.water === "sea")
      );
      if (!hasCoastalFace && precinct.label !== editorText("cityEditor.messages.riverHarbour")) continue;
    }
    next.elements.push({
      id: elementId,
      kind: precinct.kind as "plaza" | "citadel" | "temple" | "harbor",
      faceIds: precinct.cellIds
        .map(id => faceIdOf[id])
        .filter(
          fid =>
            fid &&
            (precinct.kind !== "harbor" ||
              (mesh.faces[fid]?.properties.water === "land" && mesh.faces[fid].properties.ward === "harbor"))
        ),
      point: [precinct.anchor[0], precinct.anchor[1]],
      sizeMeters:
        precinct.kind === "temple"
          ? templeFootprintMeters(townExtentMeters(next.frame)).length
          : precinct.kind === "plaza"
            ? plazaFootprintMeters(townExtentMeters(next.frame))
            : undefined,
      rotation:
        precinct.kind === "temple"
          ? orientTempleHybrid(
              [precinct.anchor[0], precinct.anchor[1]],
              precinct.rotation ?? 0,
              plan.precincts.find(p => p.kind === "plaza")?.anchor,
              next.historicalPeriod
            )
          : precinct.rotation,
      locked: false,
      ...(precinct.kind === "harbor"
        ? {
            harborKind:
              precinct.label === editorText("cityEditor.messages.riverHarbour") ? ("river" as const) : ("sea" as const)
          }
        : {})
    });
  }
}
