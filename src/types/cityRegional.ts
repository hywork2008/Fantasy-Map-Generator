export interface RegionalRoad {
  routeId: number;
  branchId: number;
  points: [number, number][];
  widthMeters: number;
  facilityIds: number[];
}

/** FMG snapshot in local metres, Y north-positive. SVG reverses Y at rendering. */
export interface RegionalContext {
  version: 1;
  sourceRevision: string;
  coverageBounds: { minX: number; minY: number; maxX: number; maxY: number };
  roads: RegionalRoad[];
  settlements: Array<{
    burgId: number;
    name: string;
    center: [number, number];
    outline?: [number, number][];
    radiusMeters?: number;
    representation: "outline" | "estimated";
  }>;
}

/** Reject damaged snapshots rather than silently falling back to legacy input. */
export function validRegionalContext(value: unknown): value is RegionalContext {
  if (!value || typeof value !== "object") return false;
  const region = value as RegionalContext;
  const b = region.coverageBounds;
  const point = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (
    region.version !== 1 ||
    typeof region.sourceRevision !== "string" ||
    !region.sourceRevision ||
    !b ||
    ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) ||
    b.minX >= b.maxX ||
    b.minY >= b.maxY ||
    !Array.isArray(region.settlements) ||
    region.settlements.length > 1000
  )
    return false;
  if (!Array.isArray(region.roads) || region.roads.length > 1000) return false;
  let vertices = 0;
  if (
    !region.roads.every(road => {
      if (
        !road ||
        !Number.isInteger(road.routeId) ||
        !Number.isInteger(road.branchId) ||
        !Number.isFinite(road.widthMeters) ||
        road.widthMeters <= 0 ||
        road.widthMeters > 100 ||
        !Array.isArray(road.facilityIds) ||
        road.facilityIds.length > 100 ||
        !road.facilityIds.every(Number.isSafeInteger) ||
        !Array.isArray(road.points) ||
        road.points.length < 2 ||
        !road.points.every(point)
      )
        return false;
      vertices += road.points.length;
      return vertices <= 20000;
    })
  )
    return false;
  const ids = new Set<number>();
  return region.settlements.every(s => {
    if (
      !s ||
      !Number.isInteger(s.burgId) ||
      s.burgId <= 0 ||
      ids.has(s.burgId) ||
      typeof s.name !== "string" ||
      s.name.length > 500 ||
      !point(s.center) ||
      s.center[0] < b.minX ||
      s.center[0] > b.maxX ||
      s.center[1] < b.minY ||
      s.center[1] > b.maxY
    )
      return false;
    ids.add(s.burgId);
    return s.representation === "outline"
      ? Array.isArray(s.outline) && s.outline.length >= 3 && s.outline.length <= 2000 && s.outline.every(point)
      : s.representation === "estimated" &&
          s.outline === undefined &&
          Number.isFinite(s.radiusMeters) &&
          s.radiusMeters! > 0;
  });
}

/** Deterministic revision, includes geometry rather than only burg identity. */
export function regionalRevision(value: unknown): string {
  let hash = 2166136261;
  for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
