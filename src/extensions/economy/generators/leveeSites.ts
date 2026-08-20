import { buildRiverDownstream } from "../../../generators/riverWaterAllocation";
import { rn } from "../../hostUtils";
import { getWorldContext, setLeveeSites } from "../economyContext";
import { computeNaturalFloodRisk } from "./floodHazard";
import type { LeveeSite } from "./leveeTypes";

/** A seed cell needs at least this much natural flood risk to start a reach. Same bar
 *  urbanWaterSystem.ts already uses as its own "flood-conscious siting" threshold. */
const LEVEE_RISK_THRESHOLD = 0.45;
/** A reach continues downstream while risk stays at or above this looser bar. */
const LEVEE_CONTINUE_THRESHOLD = 0.3;
/** How many land-river-cell hops a single levee reach may span. */
const MAX_LEVEE_REACH_CELLS = 10;
/** Same "grid spacing x3" minimum-spacing rule damSites.ts/frontierFortsGenerator.ts use to thin candidates. */
const MIN_SPACING_FACTOR = 3;

interface RawReach {
  cells: number[];
  riverId: number;
  meanFloodHazard: number;
  populationSum: number;
  x: number;
  y: number;
}

/**
 * Deterministic, one-time geographic scan for viable levee reaches — same "generate once" shape
 * as damSites.ts/mineralResources.ts. Unlike a Dam's single point, a levee protects a contiguous
 * run of high-hazard land river cells (a real embankment runs alongside the floodplain it
 * protects). Reaches are seeded at the highest-hazard cells first and walked downstream only —
 * simpler than a bidirectional walk, matching Dam's own downstream-only reach.
 * Design: docs/plan/river-levee-and-flood-damage.md §3.2.
 */
export class LeveeSitesModule {
  generate(): void {
    const world = getWorldContext();
    const { cells, rivers } = world.pack;
    const count = cells.i.length;

    const downstreamByCell =
      cells.riverDownstream?.length === count ? cells.riverDownstream : buildRiverDownstream(cells, rivers ?? []);

    const isLandRiverCell = (cellId: number) => Boolean(cells.r?.[cellId]) && (cells.h[cellId] ?? 0) >= 20;

    const hazardByCell = new Map<number, number>();
    for (const cellId of cells.i) {
      if (!isLandRiverCell(cellId)) continue;
      hazardByCell.set(
        cellId,
        computeNaturalFloodRisk({
          cellId,
          cells,
          biomesTags: world.biomesData?.tags,
          gridPrec: world.grid?.cells.prec
        })
      );
    }

    // Highest-hazard cells seed first, so an already-claimed cell downstream of a bigger reach
    // never starts a smaller, redundant one. Ties break on cell id for determinism.
    const seeds = [...hazardByCell.entries()]
      .filter(([, hazard]) => hazard >= LEVEE_RISK_THRESHOLD)
      .sort(([cellA, hazardA], [cellB, hazardB]) => hazardB - hazardA || cellA - cellB);

    const claimed = new Set<number>();
    const rawReaches: RawReach[] = [];

    for (const [seedCell] of seeds) {
      if (claimed.has(seedCell)) continue;

      const reachCells: number[] = [seedCell];
      claimed.add(seedCell);
      let cursor = downstreamByCell?.[seedCell] ?? -1;
      while (
        reachCells.length < MAX_LEVEE_REACH_CELLS &&
        cursor >= 0 &&
        !claimed.has(cursor) &&
        isLandRiverCell(cursor) &&
        (cells.r?.[cursor] ?? 0) === (cells.r?.[seedCell] ?? 0) &&
        (hazardByCell.get(cursor) ?? 0) >= LEVEE_CONTINUE_THRESHOLD
      ) {
        reachCells.push(cursor);
        claimed.add(cursor);
        cursor = downstreamByCell?.[cursor] ?? -1;
      }

      let hazardSum = 0;
      let populationSum = 0;
      let xSum = 0;
      let ySum = 0;
      let pointCount = 0;
      for (const cellId of reachCells) {
        hazardSum += hazardByCell.get(cellId) ?? 0;
        populationSum += cells.pop?.[cellId] ?? 0;
        const point = cells.p?.[cellId];
        if (point) {
          xSum += point[0];
          ySum += point[1];
          pointCount++;
        }
      }
      if (!pointCount) continue;

      rawReaches.push({
        cells: reachCells,
        riverId: cells.r?.[seedCell] ?? 0,
        meanFloodHazard: hazardSum / reachCells.length,
        populationSum,
        x: xSum / pointCount,
        y: ySum / pointCount
      });
    }

    const maxPopulationSum = rawReaches.reduce((max, reach) => Math.max(max, reach.populationSum), 0);

    const scored = rawReaches
      .map(reach => {
        const populationPotential = maxPopulationSum > 0 ? reach.populationSum / maxPopulationSum : 0;
        return { ...reach, qualityScore: reach.meanFloodHazard * 0.6 + populationPotential * 0.4 };
      })
      .sort((a, b) => b.qualityScore - a.qualityScore || a.cells[0]! - b.cells[0]!);

    const minSpacing = (world.grid?.spacing ?? 10) * MIN_SPACING_FACTOR;
    const placedPoints: [number, number][] = [];
    const sites: LeveeSite[] = [];

    for (const reach of scored) {
      const tooClose = placedPoints.some(([px, py]) => Math.hypot(px - reach.x, py - reach.y) < minSpacing);
      if (tooClose) continue;
      placedPoints.push([reach.x, reach.y]);

      sites.push({
        i: sites.length + 1,
        riverId: reach.riverId,
        cells: reach.cells,
        x: rn(reach.x, 2),
        y: rn(reach.y, 2),
        meanFloodHazard: rn(reach.meanFloodHazard, 4),
        qualityScore: rn(reach.qualityScore, 4)
      });
    }

    setLeveeSites(sites);
  }

  clear(): void {
    setLeveeSites([]);
  }
}

export const LeveeSites = new LeveeSitesModule();
