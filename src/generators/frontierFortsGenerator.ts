import { mean } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import type { FrontierFort } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { last, rn, rw } from "../utils";
import { TIME } from "../utils/debug";
import { analyzeFrontiers, type FrontierSegment } from "./frontierAnalysis";
import { buildLandRouteGraph, type LandRouteGraph } from "./landRouteGraph";
import { Names } from "./names-generator";

/**
 * Only Rival/Enemy-grade hostility (or a war-boosted Suspicion) earns a standalone fort —
 * the same threat semantics `getStrategicCitadelBonus` (burgs-generator.ts) already keys
 * off of, not a new threat concept.
 */
const MIN_THREAT_FOR_FORT = 0.5;

/**
 * Just above landRouteGraph.ts's WINTER_ROAD_CLOSURE_ELEVATION (60), so a fort tagged
 * "mountain" always sits on the same terrain the simulation already treats as a
 * winter-closed mountain pass.
 */
const MOUNTAIN_FORT_ELEVATION = 62;

type SiteType = "river" | "mountain" | "road";

/** Lower rank wins when a candidate cell qualifies for more than one site type. */
const SITE_PRIORITY: Record<SiteType, number> = { river: 0, mountain: 1, road: 2 };

const SITE_NOUNS: Record<SiteType, Record<string, number>> = {
  river: { Ford: 3, Crossing: 2, Watch: 1 },
  mountain: { Pass: 3, Watchtower: 2, Redoubt: 1 },
  road: { Waystation: 3, Garrison: 2, Bastion: 1 }
};

interface Chokepoint {
  cell: number;
  siteType: SiteType;
  dist: number;
}

/**
 * Places standalone "frontier fort" markers at real chokepoints (river crossings, mountain
 * passes, roads) along hostile land borders — independent of any burg, guarding the frontier
 * the way a medieval marcher-castle chain would. Distinct from a burg's own `citadel` flag
 * and from the `"fort"` *burg group* (burgs-generator.ts getDefaultGroups()) — see
 * FrontierFort's doc comment in models.ts.
 */
class FrontierFortsModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack, options } = state;
    TIME && console.time("generateFrontierForts");

    const { cells } = pack;
    pack.frontierForts = [];
    this.worldContext.notes = this.worldContext.notes.filter(note => !note.id.startsWith("frontierFort"));

    const frontiers = analyzeFrontiers(pack, options.year ?? 0);
    const landRoutes = buildLandRouteGraph(pack);
    const fluxValues = Array.from(cells.fl).filter(Boolean);
    const meanFlux = (fluxValues.length ? mean(fluxValues) : 0) as number;

    const placedPoints: [number, number][] = [];
    const minSpacing = this.worldContext.grid.spacing * 3;

    frontiers.forEach((segments, stateId) => {
      const ownerState = pack.states[stateId];
      if (!ownerState || ownerState.removed) return;

      for (const segment of segments) {
        if (segment.threatWeight < MIN_THREAT_FOR_FORT) continue;

        const candidate = this.pickChokepoint(pack, segment, landRoutes, meanFlux);
        if (!candidate) continue;

        const [x, y] = cells.p[candidate.cell];
        const tooClose = placedPoints.some(([px, py]) => Math.hypot(px - x, py - y) < minSpacing);
        if (tooClose) continue;

        placedPoints.push([x, y]);
        this.addFort(pack, stateId, segment, candidate.cell, candidate.siteType, x, y);
      }
    });

    TIME && console.timeEnd("generateFrontierForts");
  }

  private pickChokepoint(
    pack: PackedGraph,
    segment: FrontierSegment,
    landRoutes: LandRouteGraph,
    meanFlux: number
  ): Chokepoint | null {
    const { cells } = pack;
    let best: Chokepoint | null = null;

    for (const cellId of segment.cells) {
      if (cells.burg[cellId]) continue;

      let siteType: SiteType | null = null;
      if (cells.r[cellId] && cells.fl[cellId] > meanFlux) siteType = "river";
      else if (cells.h[cellId] >= MOUNTAIN_FORT_ELEVATION) siteType = "mountain";
      else if (landRoutes.adjacency.has(cellId)) siteType = "road";
      if (!siteType) continue;

      const [x, y] = cells.p[cellId];
      const dist = Math.hypot(x - segment.cx, y - segment.cy);

      if (
        !best ||
        SITE_PRIORITY[siteType] < SITE_PRIORITY[best.siteType] ||
        (SITE_PRIORITY[siteType] === SITE_PRIORITY[best.siteType] && dist < best.dist)
      ) {
        best = { cell: cellId, siteType, dist };
      }
    }

    return best;
  }

  private addFort(
    pack: PackedGraph,
    stateId: number,
    segment: FrontierSegment,
    cell: number,
    siteType: SiteType,
    x: number,
    y: number
  ) {
    const { cells, states } = pack;
    const i = last(pack.frontierForts)?.i + 1 || 0;
    const proper = Names.getCulture(cells.culture[cell]);
    const noun = rw(SITE_NOUNS[siteType]);
    const name = `${proper} ${noun}`;

    const fort: FrontierFort = {
      i,
      state: stateId,
      cell,
      x: rn(x, 2),
      y: rn(y, 2),
      siteType,
      neighborState: segment.neighborState,
      threatWeight: segment.threatWeight,
      name,
      icon: "🏰",
      pin: "shield"
    };

    pack.frontierForts.push(fort);

    const neighborName = states[segment.neighborState]?.name ?? "a hostile power";
    const ownerName = states[stateId]?.name ?? "the realm";
    this.worldContext.notes.push({
      id: `frontierFort${i}`,
      name,
      legend: `A frontier fort defending ${ownerName}'s border against ${neighborName}.`
    });
  }
}

export const FrontierForts = new FrontierFortsModule();
