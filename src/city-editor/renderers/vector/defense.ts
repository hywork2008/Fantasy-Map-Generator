import { nearestOnPolyline, pointInPolygon } from "../../generators/geom";
import { defenseAccessSurface } from "../../generators/vector/defense";
import { regionBoolean } from "../../generators/vector/geometry/regions";
import type { Point } from "../../types/primitives";
import type { VectorDefensePlan } from "../../types/vector/defense";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorRenderSurface } from "./renderData";

/** The saved arrays use outer-ring stations; hole and clip vertices interpolate those same stations. */
function levelAt(outer: Point[], levels: number[], point: Point) {
  const hit = nearestOnPolyline(point, [...outer, outer[0]]);
  return levels[hit.segIndex % levels.length] * (1 - hit.t) + levels[(hit.segIndex + 1) % levels.length] * hit.t;
}
export function vectorDefenseSurfaces(plan: VectorDefensePlan, frame: VectorPolygon): VectorRenderSurface[] {
  const surfaces: VectorRenderSurface[] = [];
  const paint = (
    id: string,
    role: string,
    polygons: VectorPolygon[],
    color: string,
    bottom: (p: Point) => number,
    top = bottom,
    kind: VectorRenderSurface["kind"] = "feature"
  ) => {
    const clipped = regionBoolean(polygons, [frame], "intersection");
    if (!clipped.length) return;
    surfaces.push({
      id,
      kind,
      polygons: clipped,
      color,
      heightMeters: 0,
      elevationMeters: 0,
      featureKind: "bastion",
      pieceRole: role,
      elevations: clipped.map(p => ({
        bottom: [p.outer, ...p.holes].flat().map(bottom),
        top: [p.outer, ...p.holes].flat().map(top)
      }))
    });
  };
  for (const [i, region] of plan.glacis.entries())
    paint(
      `${plan.id}:glacis:${i}`,
      "glacis",
      region,
      "#d9d3c3",
      () => 0,
      () => 0.15
    );
  for (const path of plan.coveredWays) {
    let offset = 0;
    for (const [i, polygon] of path.region.entries()) {
      const values = path.elevations.slice(offset, offset + polygon.outer.length);
      offset += polygon.outer.length;
      paint(`${path.id}:${i}`, "covered-way", [polygon], "#cfc6b4", p => levelAt(polygon.outer, values, p) + 0.03);
    }
  }
  for (const ditch of plan.ditches) {
    let offset = 0;
    for (const [i, polygon] of ditch.region.entries()) {
      const bed = ditch.bed.slice(offset, offset + polygon.outer.length),
        bank = ditch.bank.slice(offset, offset + polygon.outer.length);
      offset += polygon.outer.length;
      paint(`${ditch.id}:bed:${i}`, "ditch-bed", [polygon], "#8a7a62", p => levelAt(polygon.outer, bed, p));
      if (ditch.kind === "wet")
        paint(`${ditch.id}:water:${i}`, "ditch-water", [polygon], "#71abc4", () => ditch.waterLevel!);
      for (const [j, ring] of [polygon.outer, ...polygon.holes].entries())
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k],
            b = ring[(k + 1) % ring.length],
            length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (length < 1e-8) continue;
          // A thin inward strip forms the bank; its outer vertices keep the bank datum.
          let dx = (-(b[1] - a[1]) / length) * 0.25,
            dy = ((b[0] - a[0]) / length) * 0.25;
          const probe: Point = [(a[0] + b[0]) / 2 + dx * 0.01, (a[1] + b[1]) / 2 + dy * 0.01];
          if (!pointInPolygon(probe, polygon.outer) || polygon.holes.some(h => pointInPolygon(probe, h))) {
            dx = -dx;
            dy = -dy;
          }
          const strip = { outer: [a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy]] as Point[], holes: [] };
          const h = (p: Point) => {
            const hit = nearestOnPolyline(p, [a, b]),
              t = Math.min(1, hit.dist / 0.25);
            return levelAt(polygon.outer, bank, hit.point) * (1 - t) + levelAt(polygon.outer, bed, hit.point) * t;
          };
          paint(
            `${ditch.id}:bank:${i}:${j}:${k}`,
            "ditch-bank",
            regionBoolean([strip], [polygon], "intersection"),
            "#8a7a62",
            h
          );
        }
    }
  }
  const rampart = (id: string, polygon: Point[], stations: Point[], base: number[], crest: number[]) => {
    const holes = plan.accesses
      .filter(a => a.role === "civic")
      .flatMap(a => defenseAccessSurface([...a.landBefore, ...a.bridge, ...a.landAfter], a.widthMeters));
    paint(
      id,
      "rampart",
      regionBoolean([{ outer: polygon, holes: [] }], holes, "difference"),
      "#5c5144",
      p => levelAt(stations, base, p),
      p => levelAt(stations, crest, p),
      "wall"
    );
  };
  for (const part of plan.bastions)
    rampart(
      part.id,
      part.rampart,
      part.rampart.slice(0, part.elevations.base.length),
      part.elevations.base,
      part.elevations.crest
    );
  for (const part of plan.curtains)
    if (!part.closure || part.closure === "rampart")
      rampart(part.id, part.rampart, part.rampart.slice(0, 2), part.elevations.base, part.elevations.crest);
  for (const part of plan.outworks)
    rampart(
      part.id,
      part.rampart,
      part.outline.slice(0, part.elevations.base.length),
      part.elevations.base,
      part.elevations.crest
    );
  for (const work of plan.works ?? [])
    paint(
      work.id,
      work.kind,
      [{ outer: work.polygon, holes: [] }],
      "#6b5344",
      () => 0,
      () => (work.kind === "barracks" ? 4 : 3)
    );
  for (const sluice of plan.sluices ?? [])
    paint(sluice.id, sluice.kind, defenseAccessSurface(sluice.opening, 3), "#2f4f5f", () => 0.08);
  for (const access of plan.accesses) {
    paint(
      `${access.id}:land`,
      "defense-access",
      [
        ...defenseAccessSurface(access.landBefore, access.widthMeters),
        ...defenseAccessSurface(access.landAfter, access.widthMeters)
      ],
      "#c7ae84",
      () => 0.04,
      undefined,
      "access"
    );
    const height = (p: Point) => {
      const hit = nearestOnPolyline(p, access.bridge);
      return access.elevations[0] * (1 - hit.t) + access.elevations[1] * hit.t;
    };
    paint(
      access.id,
      "defense-bridge",
      defenseAccessSurface(access.bridge, access.widthMeters),
      "#d5cfbf",
      p => height(p) - 0.4,
      height,
      "bridge"
    );
  }
  return surfaces;
}
