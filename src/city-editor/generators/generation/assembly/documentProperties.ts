import type { CityDocument, Mesh } from "../../../types/document";
import type { WardKind } from "../../../types/geometry";
import { clone } from "../../mesh";
import type { Plan } from "../contracts";

export function assignFrameRoads(next: CityDocument, plan: Pick<Plan, "frameRoads">): void {
  if (plan.frameRoads?.length) next.frameRoads = clone(plan.frameRoads);
  else delete next.frameRoads;
}

export function settingsLegacy(plan: Pick<Plan, "legacyCastles">): boolean {
  return !!plan.legacyCastles;
}

// --- write the plan onto a document clone (mesh untouched) -------------------

/** Land face elevation: the FMG heightfield when linked, else the current value
 * kept above sea level. Rounded to 0.1 m; never below 1 m (land is > 0). */
export function landElevation(plan: Pick<Plan, "fmgElevations">, cellId: number, current: number): number {
  const fmg = plan.fmgElevations?.get(cellId);
  if (fmg !== undefined) return Math.max(1, Math.round(fmg * 10) / 10);
  return current <= 0 ? 1 : current;
}

// --- misc -------------------------------------------------------------------

export function editorWard(
  kind: WardKind
):
  | "market"
  | "castle"
  | "merchant"
  | "craftsmen"
  | "patriciate"
  | "harbor"
  | "park"
  | "farm"
  | "cemetery"
  | "empty"
  | null {
  switch (kind) {
    case "market":
    case "castle":
    case "merchant":
    case "craftsmen":
    case "patriciate":
    case "harbor":
    case "park":
    case "farm":
    case "cemetery":
    case "empty":
      return kind;
    case "slum":
    case "gate":
      return "empty";
    default:
      return null;
  }
}

export function faceFor(mesh: Mesh, faceIdOf: string[], cellId: number): Mesh["faces"][string] | undefined {
  return mesh.faces[faceIdOf[cellId]];
}
