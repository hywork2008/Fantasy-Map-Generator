import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { CityDocument, Point } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import type { Cell, Precinct } from "../../../types/geometry";
import { frameRoadLegs } from "../../frameRoads";
import { minExternalRoadsForExtent } from "../../settlementExtent";
import { dryRuns } from "../../waterGeometry";
export function keepCitySide(lines: Point[][], polygon: Point[]): Point[][] {
  const out: Point[][] = [];
  for (const line of lines) {
    const runs = dryRuns(line, [polygon]);
    if (!runs.length) continue;
    let best = runs[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const run of runs) {
      let d = Number.POSITIVE_INFINITY;
      for (const p of run) d = Math.min(d, p[0] * p[0] + p[1] * p[1]);
      if (d < bestD) {
        best = run;
        bestD = d;
      }
    }
    if (best.length >= 2) out.push(best);
  }
  return out;
}

export function outerFrameRoads(site: BurgSiteDescriptor | undefined): CityDocument["frameRoads"] {
  const legs = site ? frameRoadLegs(site, "beyond-mesh") : [];
  return legs.length ? legs : undefined;
}

export function requiredExternalRoads(settings: GenerationSettings, extentMeters: number): number {
  return settings.descriptor ? 0 : minExternalRoadsForExtent(extentMeters);
}

export function plazaApproachPoint(cells: Cell[], plaza: Precinct | undefined, from?: Point): Point | null {
  if (!plaza) return null;
  if (!plaza.cellIds?.length) {
    if (plaza.polygon?.length && from) {
      let bestDist = Infinity;
      let bestPt: Point | null = null;
      for (const p of plaza.polygon) {
        const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
        if (d < 1) continue;
        if (d < bestDist) {
          bestDist = d;
          bestPt = p;
        }
      }
      if (bestPt) return bestPt;
    }
    return plaza.anchor ?? null;
  }
  const byId = new Map(cells.map(c => [c.id, c]));
  const members = plaza.cellIds.map(id => byId.get(id)).filter((c): c is Cell => !!c);
  if (!members.length) return plaza.anchor ?? null;
  const memberSet = new Set(members.map(m => m.id));

  const isShared = (u: Point, v: Point, currentCell: Cell): boolean => {
    for (const otherId of currentCell.neighbors) {
      if (!memberSet.has(otherId)) continue;
      const other = byId.get(otherId);
      if (!other) return false;
      const m = other.polygon.length;
      for (let j = 0; j < m; j++) {
        const pu = other.polygon[j];
        const pv = other.polygon[(j + 1) % m];
        if (
          (Math.hypot(u[0] - pu[0], u[1] - pu[1]) < 0.1 && Math.hypot(v[0] - pv[0], v[1] - pv[1]) < 0.1) ||
          (Math.hypot(u[0] - pv[0], u[1] - pv[1]) < 0.1 && Math.hypot(v[0] - pu[0], v[1] - pu[1]) < 0.1)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const perimeterVertices: Point[] = [];
  for (const cell of members) {
    const n = cell.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = cell.polygon[i];
      const b = cell.polygon[(i + 1) % n];
      if (!isShared(a, b, cell)) {
        perimeterVertices.push(a, b);
      }
    }
  }
  if (!perimeterVertices.length) return plaza.anchor;

  let best: Point | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of perimeterVertices) {
    const d = from ? Math.hypot(p[0] - from[0], p[1] - from[1]) : Math.hypot(p[0], p[1]);
    if (from && d < 1) continue;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best ?? plaza.anchor;
}
