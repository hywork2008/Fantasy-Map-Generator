import type { GateInn } from "../../types/vector/inn";
import type { VectorRenderSurface } from "./renderData";

/** An inn as the mesh editor draws it: a ring of rooms round an open stable yard. */
export function vectorInnSurfaces(inns: GateInn[]): VectorRenderSurface[] {
  return inns.flatMap(inn => [
    {
      id: `${inn.id}:yard`,
      kind: "feature" as const,
      featureKind: "inn",
      pieceRole: "inn-yard",
      polygons: [{ outer: inn.court, holes: [] }],
      color: "#c7b994",
      elevationMeters: 0.03,
      heightMeters: 0
    },
    {
      id: inn.id,
      kind: "feature" as const,
      featureKind: "inn",
      pieceRole: inn.kind,
      polygons: [{ outer: inn.footprint, holes: [[...inn.court].reverse()] }],
      color: "#b49c7a",
      elevationMeters: 0,
      heightMeters: inn.kind === "caravanserai" ? 7 : 8
    }
  ]);
}
