import type { Burg, Route } from "../types/models";
import type { BurgApproachDryLink } from "./burgApproachDryLink";

export const samePosition = (p: readonly number[], burg: Readonly<Burg>) =>
  p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7;

/** Preserve old approaches and bridges; prepend/insert only a surveyed dry link.
 * Original convergence geometry must carry the link too, so later CE preparation
 * cannot restore endpoints at the old town location. A leg that would double
 * back through the old position joins the new one directly when that is dry. */
export function connectRelocatedBurg(
  route: Route,
  before: Readonly<Burg>,
  after: Readonly<Burg>,
  dryLink?: BurgApproachDryLink,
  replaced = false
): void {
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
  if (route.riverRoadConvergence)
    route.riverRoadConvergence.originalPoints = connect(route.riverRoadConvergence.originalPoints);
  if (dryLink) straightenBurgApproaches(route, { ...after, cell: before.cell } as Burg, dryLink, replaced);
  if (route.riverRoadConvergence) route.riverRoadConvergence.pointsKey = JSON.stringify(route.points);
  route.cells = route.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
}

/** Points removed from one side of a town: the in-cell run between the town
 * and the first point beyond its cell, when that run doubles back (> 90° off
 * the direct bearing) and the direct link is dry. Ordinary in-cell bends that
 * keep the leg's heading are kept. `replaced` towns left their old position
 * behind: their run is cut back to the farthest point a dry link reaches. */
function straightenPoints(
  points: Route["points"],
  burg: Readonly<Burg>,
  dryLink: BurgApproachDryLink,
  replaced = false
): Route["points"] | null {
  const drop = new Set<number>();
  const town: [number, number] = [burg.x, burg.y];
  for (let i = 0; i < points.length; i++) {
    if (!samePosition(points[i], burg)) continue;
    for (const step of [-1, 1]) {
      let k = i + step;
      while (k >= 0 && k < points.length && points[k][2] === burg.cell && !samePosition(points[k], burg)) k += step;
      if (k === i + step) continue;
      const outsideExists = k >= 0 && k < points.length && !samePosition(points[k], burg);
      if (!outsideExists && !replaced) continue;
      let target = -1;
      if (replaced) {
        // Farthest point first; the run's first point needs no shortcut.
        for (let j = outsideExists ? k : k - step; j !== i + step; j -= step)
          if (dryLink(town, points[j])) {
            target = j;
            break;
          }
        // No dry link: cross as any cell route does (bridges are sited later),
        // never back through the abandoned position.
        if (target === -1 && outsideExists) target = k;
      } else {
        const first = points[i + step],
          outside = points[k];
        const doublesBack =
          (first[0] - burg.x) * (outside[0] - burg.x) + (first[1] - burg.y) * (outside[1] - burg.y) < 0;
        if (doublesBack && dryLink(town, outside)) target = k;
      }
      if (target === -1) continue;
      for (let j = i + step; j !== target; j += step) drop.add(j);
    }
  }
  return drop.size ? points.filter((_, i) => !drop.has(i)) : null;
}

export interface StraightenedApproach {
  route: Route;
  points: Route["points"];
  originalPoints?: Route["points"];
}

function planStraightened(
  route: Route,
  towns: readonly Readonly<Burg>[],
  dryLink: BurgApproachDryLink,
  replaced = false
): StraightenedApproach | null {
  let points = route.points,
    original = route.riverRoadConvergence?.originalPoints;
  let changed = false;
  for (const burg of towns) {
    const next = straightenPoints(points, burg, dryLink, replaced);
    const nextOriginal = original ? straightenPoints(original, burg, dryLink, replaced) : null;
    if (next) points = next;
    if (nextOriginal) original = nextOriginal;
    changed ||= !!next || !!nextOriginal;
  }
  return changed ? { route, points, ...(original ? { originalPoints: original } : {}) } : null;
}

export function applyStraightenedApproach({ route, points, originalPoints }: StraightenedApproach): void {
  route.points = points;
  if (route.riverRoadConvergence) {
    if (originalPoints) route.riverRoadConvergence.originalPoints = originalPoints;
    route.riverRoadConvergence.pointsKey = JSON.stringify(route.points);
  }
  route.cells = route.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
}

/** Remove a relocation detour from a route's legs at `burg`. Returns whether it changed. */
export function straightenBurgApproaches(
  route: Route,
  burg: Readonly<Burg>,
  dryLink: BurgApproachDryLink,
  replaced = false
): boolean {
  const plan = planStraightened(route, [burg], dryLink, replaced);
  if (plan) applyStraightenedApproach(plan);
  return !!plan;
}

const relinkable = (route: Route) =>
  route.group !== "searoutes" && !route.lock && route.registeredConnectionId === undefined;

/** Land routes that ended at a town's old position follow it to the new one. Sea lanes end at the port anchor. */
export function reconnectRelocatedBurgLandRoutes(
  routes: Route[],
  before: Readonly<Burg>,
  after: Readonly<Burg>,
  dryLink?: BurgApproachDryLink,
  /** The old position is abandoned (e.g. it lay on water), not a surveyed approach. */
  replaced = false
): void {
  if (Math.hypot(after.x - before.x, after.y - before.y) <= 1e-7) return;
  for (const route of routes) {
    if (relinkable(route) && route.points.some(p => samePosition(p, before)))
      connectRelocatedBurg(route, before, after, dryLink, replaced);
  }
}

/** Saved maps carry links made before detours were straightened. Read-only plan;
 * apply each entry with applyStraightenedApproach. */
export function planDetouredBurgApproaches(
  routes: readonly Route[],
  burgs: readonly (Burg | undefined)[],
  dryLink: BurgApproachDryLink
): StraightenedApproach[] {
  const byCell = new Map<number, Burg>();
  for (const burg of burgs) if (burg?.i && !burg.removed) byCell.set(burg.cell, burg);
  const plans: StraightenedApproach[] = [];
  for (const route of routes) {
    if (!relinkable(route) || !route.points?.length) continue;
    const towns = new Set<Burg>();
    for (const p of route.points) {
      const burg = byCell.get(p[2]);
      if (burg && samePosition(p, burg)) towns.add(burg);
    }
    const plan = towns.size ? planStraightened(route, [...towns], dryLink) : null;
    if (plan) plans.push(plan);
  }
  return plans;
}
