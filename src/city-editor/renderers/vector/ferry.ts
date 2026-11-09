import { octagon } from "../../generators/ferryLanding";
import { defenseAccessSurface } from "../../generators/vector/defense";
import { ferryJetties } from "../../generators/vector/ferry";
import type { VectorFerry } from "../../types/vector/ferry";
import type { VectorRenderSurface } from "./renderData";

/** A ferry as the mesh editor draws it: its two crossings and towpaths, plank jetties and landing stages. */
export function vectorFerrySurfaces(f: VectorFerry): VectorRenderSurface[] {
  const surface = (
    id: string,
    pieceRole: string,
    polygons: VectorRenderSurface["polygons"],
    color: string,
    elevationMeters: number,
    heightMeters = 0
  ): VectorRenderSurface => ({
    id: `${f.id}:${id}`,
    kind: "feature",
    featureKind: "ferry",
    pieceRole,
    polygons,
    color,
    elevationMeters,
    heightMeters
  });
  const landings = f.farInFrame ? [f.landing, f.farLanding] : [f.landing];
  return [
    surface("outbound", "ferry-route", defenseAccessSurface(f.outbound, 1.5), "#c8beaa", 0.03),
    surface("inbound", "ferry-route", defenseAccessSurface(f.inbound, 1.5), "#c8beaa", 0.03),
    ...(f.farInFrame ? [f.townTow, f.farTow] : [f.townTow]).map((t, i) =>
      surface(
        `tow:${i}`,
        "ferry-tow",
        Math.hypot(t[1][0] - t[0][0], t[1][1] - t[0][1]) >= 0.5 ? defenseAccessSurface(t, 1) : [],
        "#c8beaa",
        0.04
      )
    ),
    surface("jetty", "pier", ferryJetties(f), "#8a7356", 0.05, 0.15),
    ...landings.map((p, i) =>
      surface(`landing:${i}`, "ferry-landing", [{ outer: octagon(p, 5), holes: [] }], "#c8beaa", 0.06, 0.05)
    )
  ].filter(s => s.polygons.length);
}
