import type { GuildHall, GuildYard, GuildYardKind } from "../../types/vector/guild";
import type { VectorRenderSurface } from "./renderData";

const YARD_COLOR: Record<GuildYardKind, string> = {
  bleachingField: "#d9dcc8",
  timberYard: "#a88b62",
  stoneYard: "#b7b2a6",
  limeKiln: "#cfc8b5",
  smithyYard: "#8e857a",
  sandYard: "#d8c79a"
};

/** Guild halls as massing (a belfry rising above the cloth hall) and their yards as ground. */
export function vectorGuildSurfaces(guilds: { halls: GuildHall[]; yards: GuildYard[] }): VectorRenderSurface[] {
  const surface = (
    id: string,
    pieceRole: string,
    outer: VectorRenderSurface["polygons"][number]["outer"],
    color: string,
    elevationMeters: number,
    heightMeters = 0
  ): VectorRenderSurface => ({
    id,
    kind: "feature",
    featureKind: "guild",
    pieceRole,
    polygons: [{ outer, holes: [] }],
    color,
    elevationMeters,
    heightMeters
  });
  return [
    ...guilds.yards.map(y => surface(y.id, y.kind, y.polygon, YARD_COLOR[y.kind], 0.03, y.kind === "limeKiln" ? 4 : 0)),
    ...guilds.halls.flatMap(h => [
      surface(h.id, "guild-hall", h.footprint, "#b9a585", 0, 13),
      ...(h.tower ? [surface(`${h.id}:belfry`, "belfry", h.tower, "#a8977a", 0, 30)] : [])
    ])
  ];
}
