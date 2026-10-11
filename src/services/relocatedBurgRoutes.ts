import type { Burg, Route } from "../types/models";

export const samePosition = (p: readonly number[], burg: Readonly<Burg>) =>
  p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7;

/** Preserve old approaches and bridges; prepend/insert only a surveyed dry link.
 * Original convergence geometry must carry the link too, so later CE preparation
 * cannot restore endpoints at the old town location. */
export function connectRelocatedBurg(route: Route, before: Readonly<Burg>, after: Readonly<Burg>): void {
  const connect = (points: Route["points"]): Route["points"] =>
    points.flatMap((p, i) => {
      if (!samePosition(p, before)) return [p];
      const next: [number, number, number] = [after.x, after.y, before.cell];
      if (i === 0) return [next, p];
      if (i === points.length - 1) return [p, next];
      return [p, next, [...p] as [number, number, number]];
    });
  route.points = connect(route.points);
  route.fixedSettlementApproach = true;
  if (route.riverRoadConvergence) {
    route.riverRoadConvergence.originalPoints = connect(route.riverRoadConvergence.originalPoints);
    route.riverRoadConvergence.pointsKey = JSON.stringify(route.points);
  }
  route.cells = route.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
}

/** Land routes that ended at a town's old position follow it to the new one. Sea lanes end at the port anchor. */
export function reconnectRelocatedBurgLandRoutes(routes: Route[], before: Readonly<Burg>, after: Readonly<Burg>): void {
  if (Math.hypot(after.x - before.x, after.y - before.y) <= 1e-7) return;
  for (const route of routes) {
    if (
      route.group !== "searoutes" &&
      !route.lock &&
      route.registeredConnectionId === undefined &&
      route.points.some(p => samePosition(p, before))
    )
      connectRelocatedBurg(route, before, after);
  }
}
