/**
 * Approach (gate candidate) ids shared by the City Editor road projection and the Economy
 * approach ledger (docs/plan/approach-traffic-observatory.md §4.1). One implementation so both
 * sides key the same gate identically.
 */

/** Opens a burg on one route leg: the first neighbour cell the leg leaves the burg cell through. */
export function approachIdForLeg(
  burgId: number,
  burgCell: number,
  routeId: number,
  leg: readonly (readonly number[])[],
  crossingId?: number
): string {
  if (crossingId !== undefined) return `burg:${burgId}:crossing:${crossingId}`;
  const exitCell = leg.find(p => p[2] !== burgCell)?.[2] ?? leg.at(-1)?.[2] ?? burgCell;
  return `burg:${burgId}:route:${routeId}:edge:${exitCell}`;
}

const OPEN_SECTORS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

/**
 * Pseudo-approach for movement off the route network, by the 8-way bearing of `dx, dy` (map
 * units, y down) from the burg. Bearing as in roadAzimuthDeg: 0 = north, clockwise.
 */
export function openApproachId(burgId: number, dx: number, dy: number): string {
  const azimuth = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return `burg:${burgId}:open:${OPEN_SECTORS[Math.round(azimuth / 45) % 8]}`;
}

export function seaApproachId(burgId: number, harbourId?: number): string {
  return harbourId === undefined ? `burg:${burgId}:sea` : `burg:${burgId}:harbour:${harbourId}`;
}

export function riverApproachId(burgId: number, downstream: boolean): string {
  return `burg:${burgId}:river:${downstream ? "down" : "up"}`;
}
