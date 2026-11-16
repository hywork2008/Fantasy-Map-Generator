import type { Monastery, PrecinctBuilding } from "../../generators/monasteryLayout";
import { defenseAccessSurface } from "../../generators/vector/defense";
import type { Point } from "../../types/primitives";
import type { VectorRenderSurface } from "./renderData";

/** Heights of a precinct's buildings by role, as massing (the catalogue has no precinct models in meshless yet). */
const HEIGHT: Record<PrecinctBuilding["role"], number> = {
  church: 14,
  apse: 10,
  "crossing-tower": 24,
  range: 8,
  gatehouse: 7,
  "bell-tower": 22,
  dome: 16
};
const COURT: Record<"garth" | "yard" | "garden", string> = { garth: "#9fb582", yard: "#c9bea6", garden: "#8fae70" };

/** A religious house: its precinct ground, courts, buildings as massing and its wall. */
export function vectorMonasterySurfaces(m: Monastery): VectorRenderSurface[] {
  const surface = (
    id: string,
    pieceRole: string,
    polygons: VectorRenderSurface["polygons"],
    color: string,
    elevationMeters: number,
    heightMeters = 0
  ): VectorRenderSurface => ({
    id: `${m.id}:${id}`,
    kind: "feature",
    featureKind: "monastery",
    pieceRole,
    polygons,
    color,
    elevationMeters,
    heightMeters
  });
  const ring = (outer: Point[]) => [{ outer, holes: [] }];
  return [
    surface("precinct", "ground", ring(m.precinct), "#c4b99f", 0.015),
    ...m.courts.map((c, i) => surface(`court:${i}`, c.kind, ring(c.polygon), COURT[c.kind], 0.03)),
    ...m.beds.map((b, i) => surface(`bed:${i}`, "garden", ring(b), "#7f9a5c", 0.04)),
    ...(m.wall.length >= 2 ? [surface("wall", "wall", defenseAccessSurface(m.wall, 0.8), "#a39a88", 0, 3)] : []),
    ...m.buildings.map((b, i) => surface(`building:${i}`, b.role, ring(b.polygon), "#b8ad98", 0, HEIGHT[b.role]))
  ].filter(s => s.polygons.length);
}
