/**
 * Read-only debug views for the simulation channel server (docs/plan/simulation-channel-server.md §16):
 * what a human shares as "channel + burg id" and an AI needs to reproduce an FMG/CE defect without
 * opening a browser. Everything here derives from the loaded world; nothing is written back,
 * except `burgSite`, which runs the same road convergence City Editor runs when it opens.
 */
import type { WorldContext } from "../../src/context/worldContext";
import { getBurgSiteDescriptor } from "../../src/services/burgSiteDescriptor";
import { burgCityRadiusMeters, drawnShoreNearBurg, waterfrontIssues } from "../../src/services/waterfrontSettlement";
import { siteWithinHomeCell } from "../../src/services/settlementSiteBounds";
import { optionsStore } from "../../src/state/optionsStore";
import type { Burg, Route } from "../../src/types/models";
import { BRIDGE_SKEW_MAX_DEGREES } from "../../src/utils/bridgeSkewPolicy";
import type { FractalizedShape } from "../../src/utils/coastlineFractal";
import { mapUnitMeters } from "../../src/utils/mapUnitMeters";

type Point = [number, number];
const status = (message: string, code: number) => Object.assign(new Error(message), { status: code });
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function insidePolygon(p: readonly number[], ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function createDebugViews(getWorld: () => WorldContext) {
  const shapes = new Map<number, FractalizedShape | null>();
  const world = () => getWorld();
  const scale = () => mapUnitMeters(world().distanceScale, optionsStore.getState().distanceUnit);
  const polygon = (cellId: number): Point[] => {
    const { cells, vertices } = world().pack;
    return (cells.v[cellId] ?? []).map(v => vertices.p[v] as Point);
  };
  const liveBurgs = () => world().pack.burgs.filter((b): b is Burg => Boolean(b?.i) && !b.removed);

  /** The pack cell whose polygon holds the point: the hint, its neighbours, then a full scan. */
  function cellAt(x: number, y: number, hint: number): number | null {
    const { cells } = world().pack;
    for (const id of [hint, ...(cells.c[hint] ?? [])]) if (insidePolygon([x, y], polygon(id))) return id;
    for (let id = 0; id < cells.i.length; id++) if (insidePolygon([x, y], polygon(id))) return id;
    return null;
  }

  function cell(cellId: number) {
    const { pack } = world();
    const { cells } = pack;
    if (!Number.isSafeInteger(cellId) || cellId < 0 || cellId >= cells.i.length) throw status("Not found", 404);
    const at = <T,>(array: ArrayLike<T> | undefined) => (array ? array[cellId] : undefined);
    const feature = pack.features[cells.f[cellId]];
    return {
      i: cellId,
      p: cells.p[cellId],
      polygon: polygon(cellId),
      h: cells.h[cellId],
      land: cells.h[cellId] >= 20,
      t: at(cells.t),
      feature: feature ? { i: feature.i, type: feature.type, group: feature.group } : null,
      river: at(cells.r) || null,
      flux: at(cells.fl),
      haven: at(cells.haven) || null,
      harbor: at(cells.harbor),
      burg: at(cells.burg) || null,
      state: at(cells.state),
      province: at(cells.province),
      culture: at(cells.culture),
      biome: at(cells.biome),
      population: at(cells.pop),
      neighbors: Array.from(cells.c[cellId] ?? []).map(id => ({ i: id, h: cells.h[id], burg: cells.burg?.[id] || null })),
      routes: cells.routes?.[cellId] ?? {}
    };
  }

  function nearbyBurgs(burg: Burg, limit = 8) {
    const metres = scale();
    return liveBurgs()
      .filter(other => other.i !== burg.i)
      .map(other => ({ other, d: Math.hypot(other.x - burg.x, other.y - burg.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(({ other, d }) => ({
        i: other.i,
        name: other.name,
        cell: other.cell,
        distanceMapUnits: round(d, 3),
        distanceMeters: Math.round(d * metres),
        sharesHomeCellNeighborhood: Array.from(world().pack.cells.c[burg.cell] ?? []).includes(other.cell),
        port: { sea: !!other.waterAccess?.port.sea, river: !!other.waterAccess?.port.river }
      }));
  }

  /** River heading at a crossing cell, from the neighbouring cells on the river path (approximate). */
  function riverHeading(riverId: number, cellId: number): Point | null {
    const river = world().pack.rivers.find(r => r.i === riverId);
    const path = river?.cells ?? [];
    const at = path.indexOf(cellId);
    if (at < 0) return null;
    const { p } = world().pack.cells;
    const a = p[path[Math.max(0, at - 1)]],
      b = p[path[Math.min(path.length - 1, at + 1)]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : null;
  }

  function routeHeadingAt(route: Route, point: readonly number[]): Point | null {
    let best: Point | null = null,
      bestDistance = Infinity;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length ** 2));
      const d = Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
      if (d < bestDistance) [best, bestDistance] = [[dx / length, dy / length], d];
    }
    return best;
  }

  function crossingReport(route: Route) {
    const w = world();
    const metres = scale();
    return (route.riverCrossings ?? []).map(crossing => {
      const river = riverHeading(crossing.riverId, crossing.cellId);
      const road = routeHeadingAt(route, crossing.point);
      // Skew = angle between the road and the river normal (AGENTS.md: bridges cross at right angles).
      // The river heading comes from cell centres, not the meandered channel: a screening hint only;
      // /burgs/{id}/site carries the exact axis CE uses.
      const skew =
        river && road
          ? round((Math.asin(Math.min(1, Math.abs(river[0] * road[0] + river[1] * road[1]))) * 180) / Math.PI, 1)
          : null;
      const shore = drawnShoreNearBurg(
        w,
        { cell: crossing.cellId, x: crossing.point[0], y: crossing.point[1] } as Burg,
        metres,
        1e7,
        shapes
      );
      const inSea = w.pack.cells.h[crossing.cellId] < 20 || (shore ? !shore.onLand(crossing.point) : false);
      return {
        riverId: crossing.riverId,
        cellId: crossing.cellId,
        point: crossing.point,
        kind: crossing.plan?.kind ?? null,
        widthMeters: crossing.plan?.widthMeters ?? null,
        approxSkewDegrees: skew,
        skewOverMax: skew !== null && skew > BRIDGE_SKEW_MAX_DEGREES,
        inSea
      };
    });
  }

  function burgContext(burgId: number) {
    const w = world();
    const { pack } = w;
    const burg = pack.burgs[burgId];
    if (!burg?.i || burg.removed) throw status("Not found", 404);
    const metres = scale();
    const home = pack.cells.p[burg.cell];
    const physical = cellAt(burg.x, burg.y, burg.cell);
    const radius = burgCityRadiusMeters(pack, burg, w.populationRate, w.urbanization);
    const shore = drawnShoreNearBurg(w, burg, metres, Math.max(radius * 6, 2000), shapes);
    const routes = pack.routes.filter(route =>
      route.points.some(p => p[2] === burg.cell || Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-6)
    );
    return {
      burg: { ...burg, production: undefined, demographics: undefined, coa: undefined },
      metersPerMapUnit: metres,
      cityRadiusMeters: Math.round(radius),
      placement: {
        homeCell: burg.cell,
        homeCellCenter: home,
        displacementMapUnits: round(Math.hypot(burg.x - home[0], burg.y - home[1]), 3),
        displacementMeters: Math.round(Math.hypot(burg.x - home[0], burg.y - home[1]) * metres),
        cellUnderBurg: physical,
        outsideHomeCell: physical !== burg.cell,
        cellUnderBurgIsWater: physical !== null && pack.cells.h[physical] < 20,
        riverPhysicalCellId: burg.riverPlacement?.physicalCellId ?? null,
        riverSiteStatus: burg.riverSiteStatus ?? null,
        drawnShore: shore ? { distanceMeters: Math.round(shore.distanceMeters), point: shore.point, onLand: shore.onLand([burg.x, burg.y]) } : null,
        waterfrontIssues: waterfrontIssues(w, burg, radius, metres, shapes)
      },
      homeCell: cell(burg.cell),
      underCell: physical !== null && physical !== burg.cell ? cell(physical) : null,
      nearbyBurgs: nearbyBurgs(burg),
      routes: routes.map(route => ({
        i: route.i,
        group: route.group,
        feature: route.feature,
        points: route.points,
        endpoints: [route.points[0], route.points.at(-1)].map(p => p && pack.cells.burg[p[2]]),
        crossings: crossingReport(route)
      }))
    };
  }

  /** World-wide settlement defects (docs/plan/estuary-port-pair-relocation.md §2). */
  function settlementDiagnostics(minSeparationRadii = 2) {
    const w = world();
    const { pack } = w;
    const metres = scale();
    const burgs = liveBurgs();
    const radius = new Map(burgs.map(b => [b.i!, burgCityRadiusMeters(pack, b, w.populationRate, w.urbanization)]));
    const outsideHomeCell = burgs.flatMap(b => {
      const under = cellAt(b.x, b.y, b.cell);
      if (under === b.cell) return [];
      // Same allowance as relocation (settlementSiteBounds.ts): R/2 into an empty land neighbour.
      const tolerated = siteWithinHomeCell(pack, b.cell, b.i, [b.x, b.y], radius.get(b.i!)! / metres);
      return [{ burg: b.i, name: b.name, homeCell: b.cell, cellUnderBurg: under, underIsWater: under !== null && pack.cells.h[under] < 20, tolerated }];
    });
    // FMG keeps one burg per cell; a pair whose towns sit closer than the neighbour spacing
    // FMG intended (here: a fraction of the original cell-centre distance) has been pulled together.
    const crowded: unknown[] = [];
    for (let a = 0; a < burgs.length; a++)
      for (let b = a + 1; b < burgs.length; b++) {
        const A = burgs[a],
          B = burgs[b];
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        const pa = pack.cells.p[A.cell],
          pb = pack.cells.p[B.cell];
        const original = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
        const minMeters = minSeparationRadii * (radius.get(A.i!)! + radius.get(B.i!)!);
        if (d < original * 0.5 || d * metres < minMeters)
          crowded.push({
            burgs: [A.i, B.i],
            names: [A.name, B.name],
            cells: [A.cell, B.cell],
            distanceMeters: Math.round(d * metres),
            cellCenterDistanceMeters: Math.round(original * metres),
            ratioToCellSpacing: round(d / original, 3)
          });
      }
    const all = pack.routes.flatMap(route => crossingReport(route).map(c => ({ route: route.i, group: route.group, ...c })));
    const crossings = all.filter(c => c.inSea);
    return {
      metersPerMapUnit: metres,
      counts: { burgs: burgs.length, outsideHomeCell: outsideHomeCell.filter(b => !b.tolerated).length, crowdedPairs: crowded.length, crossingsInSea: crossings.length, approxSkewOverMax: all.filter(c => c.skewOverMax).length },
      outsideHomeCell,
      crowdedPairs: crowded,
      crossingsInSea: crossings
    };
  }

  function burgSite(burgId: number) {
    const descriptor = getBurgSiteDescriptor(burgId);
    if (!descriptor) throw status("Not found", 404);
    return descriptor;
  }

  return { cell, burgContext, burgSite, settlementDiagnostics };
}
