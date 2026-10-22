import type { CemeteryPropKind } from "../../buildings/landscape/cemeteryProps";
import type { TreeSpecies } from "../../buildings/landscape/trees";
import { cemeteryPlots } from "../generators/cemeteryPlots";
import { cemeteryGroundColor } from "../generators/cultureCemeteryLayout";
import type { ParkLawn } from "../generators/parkFabric";
import type { CemeteryPart, CemeteryPlan, Point } from "../types/document";

export type OpenSpaceModel =
  | TreeSpecies
  | CemeteryPropKind
  | "headstone"
  | "ledger"
  | "chapel"
  | "cottage"
  | "woodyard"
  | "basin";
export interface OpenSpaceSite {
  model: OpenSpaceModel;
  point: Point;
  /** Plan angle of the model's local X axis. */
  angle: number;
  width?: number;
  depth?: number;
  radius?: number;
  footprint?: Point[];
  holes?: Point[][];
  height?: number;
}
export interface OpenSpaceSurface {
  ring: Point[];
  holes?: Point[][];
  color: string;
  offset: number;
}
export interface OpenSpacePlan {
  sites: OpenSpaceSite[];
  surfaces: OpenSpaceSurface[];
}

/** The footprint's first edge is the saved local X axis, including rotated crowded graves. */
function partSite(part: CemeteryPart, model: OpenSpaceModel): OpenSpaceSite {
  const ring = part.footprint;
  const a = ring[0],
    b = ring[1];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const u = [Math.cos(angle), Math.sin(angle)],
    v = [-u[1], u[0]];
  const xs = ring.map(p => p[0] * u[0] + p[1] * u[1]);
  const ys = ring.map(p => p[0] * v[0] + p[1] * v[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    model,
    point: [x * u[0] + y * v[0], x * u[1] + y * v[1]],
    angle,
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
    footprint: ring,
    holes: part.holes
  };
}

function pathSurfaces(points: Point[], width: number, color: string, offset: number, out: OpenSpaceSurface[]) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const dx = (-(b[1] - a[1]) * width) / length / 2,
      dy = ((b[0] - a[0]) * width) / length / 2;
    out.push({
      ring: [
        [a[0] + dx, a[1] + dy],
        [b[0] + dx, b[1] + dy],
        [b[0] - dx, b[1] - dy],
        [a[0] - dx, a[1] - dy]
      ],
      color,
      offset
    });
  }
}

/** Uses the same generated parks and resolved cemetery plans as SVG; never mutates a city document. */
export function collectOpenSpacePlan(parks: readonly ParkLawn[], cemeteries: readonly CemeteryPlan[]): OpenSpacePlan {
  const sites: OpenSpaceSite[] = [],
    surfaces: OpenSpaceSurface[] = [];
  for (const park of parks) {
    for (const ring of park.lawnPolygons) surfaces.push({ ring, color: "#7ea867", offset: 0.025 });
    for (const path of park.paths) pathSurfaces(path, 1.8, "#d8d1bf", 0.045, surfaces);
    for (const [x, y] of park.grassTufts)
      pathSurfaces(
        [
          [x - 0.2, y],
          [x, y + 0.5],
          [x + 0.2, y + 0.05]
        ],
        0.055,
        "#5d8249",
        0.035,
        surfaces
      );
    for (const tree of park.trees)
      sites.push({ model: "garden_parkland", point: tree.center, radius: tree.radius, angle: 0 });
  }
  for (const cemetery of cemeteries) {
    const profile = cemetery.burialProfile;
    for (const ring of cemetery.courtyards)
      surfaces.push({ ring, color: profile ? cemeteryGroundColor(profile) : "#7ea867", offset: 0.025 });
    for (const access of cemetery.accesses) pathSurfaces(access.points, access.widthMeters, "#d8d1bf", 0.045, surfaces);
    if (profile?.vegetation !== "barren_gravel")
      for (const point of cemetery.trees) sites.push({ model: profile?.vegetation ?? "sacred_yew", point, angle: 0 });
    for (const part of cemetery.parts) {
      if (part.footprint.length < 3) continue;
      if (part.role === "graves") {
        for (const plot of cemeteryPlots(cemetery, part)) {
          sites.push({ model: "headstone", point: plot.point, angle: 0, width: 0.8, depth: 1.3 });
          if (plot.slab) sites.push({ model: "ledger", point: plot.point, angle: 0 });
        }
        continue;
      }
      const kind = part.kind;
      if (kind === "open_desert_field" || kind === "stepped_water_terrace") continue;
      const model: OpenSpaceModel =
        kind === "chapel_basilica"
          ? "chapel"
          : kind === "caretaker_cottage"
            ? "cottage"
            : kind === "cremation_woodyard"
              ? "woodyard"
              : kind === "ablution_fountain"
                ? "basin"
                : kind === "headstone_grid" || kind === "crowded_jumble"
                  ? "headstone"
                  : kind === "none_flat_memorial"
                    ? "flat_ground_markers"
                    : (kind ??
                      (part.role === "chapel"
                        ? "chapel"
                        : part.role === "rectory"
                          ? "cottage"
                          : part.role === "calvary"
                            ? "preaching_cross_calvary"
                            : "ossuary_charnel_house"));
      // Japanese temple-town cemeteries share this taxonomy entry, but not Christian architecture.
      if (kind === "chapel_basilica" && profile?.id === "edo_temple_town") sites.push(partSite(part, "ancestral_hall"));
      else sites.push(partSite(part, model));
    }
    const boundary = profile?.boundary ?? "high_stone_wall";
    if (boundary === "high_stone_wall" || boundary === "low_curb_or_hedge" || boundary === "ditch_and_rampart") {
      for (let i = 0; i < cemetery.boundary.length; i++) {
        const a = cemetery.boundary[i],
          b = cemetery.boundary[(i + 1) % cemetery.boundary.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.1) continue;
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const gate = cemetery.gatePoint;
        const t = gate ? ((gate[0] - a[0]) * (b[0] - a[0]) + (gate[1] - a[1]) * (b[1] - a[1])) / length ** 2 : -1;
        const onEdge =
          gate &&
          t >= 0 &&
          t <= 1 &&
          Math.hypot(gate[0] - a[0] - t * (b[0] - a[0]), gate[1] - a[1] - t * (b[1] - a[1])) < 2;
        const intervals = onEdge
          ? [
              [0, Math.max(0, t - 1.5 / length)],
              [Math.min(1, t + 1.5 / length), 1]
            ]
          : [[0, 1]];
        for (const [start, end] of intervals)
          if ((end - start) * length > 0.1)
            sites.push({
              model: boundary,
              point: [a[0] + ((b[0] - a[0]) * (start + end)) / 2, a[1] + ((b[1] - a[1]) * (start + end)) / 2],
              angle,
              width: length * (end - start),
              depth: boundary === "ditch_and_rampart" ? 2 : 0.65
            });
      }
    }
    if (boundary === "stepped_water_terrace") {
      const waterEdge = cemetery.accesses.find(access => access.widthMeters === 0.3)?.points;
      for (let i = 0; i < cemetery.boundary.length; i++) {
        const a = cemetery.boundary[i],
          b = cemetery.boundary[(i + 1) % cemetery.boundary.length];
        const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // Match SVG: leave the water side open and curb only the land sides.
        if (
          waterEdge?.[1] &&
          Math.hypot(
            point[0] - (waterEdge[0][0] + waterEdge[1][0]) / 2,
            point[1] - (waterEdge[0][1] + waterEdge[1][1]) / 2
          ) < 5
        )
          continue;
        sites.push({
          model: "flat_ground_markers",
          point,
          angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
          width: Math.hypot(b[0] - a[0], b[1] - a[1]),
          depth: 0.5,
          height: 0.3
        });
      }
    }
    // Water terraces are already explicit narrow lines in the saved access geometry.
    if (boundary === "stepped_water_terrace")
      for (const [index, access] of cemetery.accesses.filter(a => a.widthMeters === 0.3).entries()) {
        const [a, b] = access.points;
        if (!a || !b) continue;
        sites.push({
          model: "flat_ground_markers",
          point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
          width: Math.hypot(b[0] - a[0], b[1] - a[1]),
          depth: 0.85,
          height: (index + 1) * 0.2
        });
      }
  }
  return { sites, surfaces };
}
