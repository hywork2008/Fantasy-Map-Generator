import { defenseAccessSurface } from "../../generators/vector/defense";
import { treeCrown } from "../../generators/vector/geometry/landscape";
import type { VectorLandscape } from "../../types/vector/landscape";
import type { VectorRenderSurface } from "./renderData";

export function vectorLandscapeSurfaces(plan: VectorLandscape): VectorRenderSurface[] {
  const out: VectorRenderSurface[] = [];
  const add = (id: string, role: string, polygons: VectorRenderSurface["polygons"], color: string, height = 0) => {
    out.push({
      id,
      kind: "feature",
      featureKind: "landscape",
      pieceRole: role,
      polygons,
      color,
      elevationMeters: 0.03,
      heightMeters: height
    });
  };
  for (const park of plan.parks) {
    add(park.id, "park-lawn", park.lawns, "#a1bb87");
    for (const [i, line] of park.paths.entries())
      add(`${park.id}:path:${i}`, "park-path", defenseAccessSurface(line, 1.2), "#d8d1bf", 0.01);
  }
  for (const farm of plan.farms) {
    add(farm.id, "farm-plot", [farm.polygon], farm.cropState === "fallow" ? "#baa77c" : "#b7ae71");
    for (const [i, row] of farm.rows.entries())
      add(`${farm.id}:row:${i}`, "farm-row", defenseAccessSurface(row, 0.15), "#85763f", 0.03);
  }
  for (const cemetery of plan.cemeteries) {
    add(
      cemetery.id,
      "cemetery-ground",
      [{ outer: cemetery.boundary, holes: [] }],
      cemetery.burialProfile?.vegetation === "barren_gravel" ? "#c7c2ae" : "#a4ad89"
    );
    for (const part of cemetery.parts) {
      const height =
        part.role === "sanctuary"
          ? 6
          : ["chapel", "rectory", "ossuary"].includes(part.role)
            ? 4
            : part.role === "boundary"
              ? 2
              : 1;
      add(
        part.id,
        `cemetery-${part.kind ?? part.role}`,
        [{ outer: part.footprint, holes: part.holes ?? [] }],
        "#9c9b90",
        height
      );
    }
    for (const [i, access] of cemetery.accesses.entries())
      add(
        `${cemetery.id}:access:${i}`,
        "cemetery-access",
        defenseAccessSurface(access.points, access.widthMeters),
        "#d8d1bf",
        0.02
      );
  }
  for (const tree of plan.trees) {
    const needle = /pine|spruce|cedar|fir|cypress|evergreen|yew/.test(tree.species);
    add(
      tree.id,
      "landscape-tree",
      [treeCrown(tree)],
      needle ? "#45674b" : tree.species === "date_palm" ? "#70875a" : "#54764a"
    );
  }
  return out;
}
