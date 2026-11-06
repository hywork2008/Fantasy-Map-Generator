import type { Point } from "../types/document";
import { polygonArea } from "./geom";

/** Placement districts from the facility-packing design. Demand is not redefined. */
export type FacilityUse = "commerce" | "craft" | "hazard" | "river";

export interface FacilityDemand {
  id: string;
  use?: FacilityUse;
  zone?: "core" | "outskirts";
  riverbankMaxDistanceMeters?: number;
  asset: {
    residentialDwellings?: number;
    minimumSite: { outer: Point[] }[];
  };
}

export interface FacilityGroup {
  use: FacilityUse;
  count: number;
  median: number;
  total: number;
}

export function facilitySiteArea(request: FacilityDemand): number {
  return request.asset.minimumSite.reduce((sum, part) => sum + Math.abs(polygonArea(part.outer)), 0);
}

/** River and outskirts checks win over the id, matching the existing zone rules. */
export function facilityUseOf(request: FacilityDemand): FacilityUse {
  if (request.use) return request.use;
  if (request.riverbankMaxDistanceMeters !== undefined) return "river";
  if (request.zone === "outskirts") return "hazard";
  if (request.id.includes(":guild:") || request.asset.residentialDwellings !== 1) return "commerce";
  return "craft";
}

export function facilityGroupKey(request: FacilityDemand): string {
  return `${facilityUseOf(request)}:${request.zone ?? "any"}:${request.riverbankMaxDistanceMeters ?? ""}`;
}

export function facilityGroups(requests: readonly FacilityDemand[]): Map<string, FacilityGroup> {
  const areas = new Map<string, number[]>();
  for (const request of requests) {
    const key = facilityGroupKey(request);
    const bucket = areas.get(key) ?? [];
    bucket.push(facilitySiteArea(request));
    areas.set(key, bucket);
  }
  const groups = new Map<string, FacilityGroup>();
  for (const [key, bucket] of areas) {
    const sorted = [...bucket].sort((a, b) => a - b);
    groups.set(key, {
      use: facilityUseOf(requests.find(request => facilityGroupKey(request) === key)!),
      count: sorted.length,
      median: sorted[Math.floor((sorted.length - 1) / 2)] ?? 0,
      total: sorted.reduce((sum, area) => sum + area, 0)
    });
  }
  return groups;
}

/** Constrained and larger sites first, so later small workshops fill the gaps. */
export function facilityPlacementOrder<T extends FacilityDemand>(requests: readonly T[]): T[] {
  const rank = (request: FacilityDemand) => {
    const use = facilityUseOf(request);
    if (use === "river") return 0;
    if (use === "hazard") return 1;
    if (use === "commerce") return 2;
    return 3;
  };
  return [...requests].sort(
    (a, b) => rank(a) - rank(b) || facilitySiteArea(b) - facilitySiteArea(a) || a.id.localeCompare(b.id)
  );
}
