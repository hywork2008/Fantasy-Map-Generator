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

interface ApproachTrafficRow {
  approachId: string;
  routeId: number | null;
  cargoSlots: number;
  through: number;
}
interface RoadWithApproach {
  approachId?: string;
  routeId: number;
  sharedRouteIds?: number[];
  approachTraffic?: { cargoSlots: number; through: number; share: number };
}

/**
 * Puts each ledger row on the road entry with the same approach id. A shared-crossing entry
 * (`crossing:<c>`, unknown to the ledger) takes the rows of its bundled routes. Shares are of
 * the town's land approaches; sea, river and off-road rows stay out of the total.
 */
export function attachApproachTraffic(roads: RoadWithApproach[], rows: readonly ApproachTrafficRow[]): void {
  const load = (row: ApproachTrafficRow) => row.cargoSlots + row.through;
  const amounts = roads.map(road => {
    const exact = rows.filter(row => row.approachId === road.approachId);
    const matched = exact.length
      ? exact
      : road.sharedRouteIds
        ? rows.filter(row => row.routeId !== null && road.sharedRouteIds!.includes(row.routeId))
        : [];
    return {
      cargoSlots: matched.reduce((sum, row) => sum + row.cargoSlots, 0),
      through: matched.reduce((sum, row) => sum + row.through, 0),
      load: matched.reduce((sum, row) => sum + load(row), 0)
    };
  });
  const total = amounts.reduce((sum, a) => sum + a.load, 0);
  if (!(total > 0)) return;
  roads.forEach((road, i) => {
    road.approachTraffic = {
      cargoSlots: Math.round(amounts[i].cargoSlots * 1000) / 1000,
      through: Math.round(amounts[i].through * 1000) / 1000,
      share: Math.round((amounts[i].load / total) * 10000) / 10000
    };
  });
}
