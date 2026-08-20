import { mean } from "d3";
import { buildRiverDownstream } from "../../../generators/riverWaterAllocation";
import { rn } from "../../hostUtils";
import { getWorldContext, setDamSites } from "../economyContext";
import type { DamSite } from "./damTypes";

/** How far downstream (in land-river-cell hops) a dam's flood protection reaches. */
const DOWNSTREAM_HOPS = 8;
/** Same "grid spacing x3" minimum-spacing rule frontierFortsGenerator.ts uses to thin candidates. */
const MIN_SPACING_FACTOR = 3;

interface Candidate {
  cell: number;
  riverId: number;
  discharge: number;
  head: number;
  x: number;
  y: number;
}

/**
 * Deterministic, one-time geographic scan for viable dam sites — same "generate once" shape as
 * mineralResources.ts. Discharge above the map's mean flux is a hard gate (a real river, not a
 * trickle); local head (elevation drop to the next downstream river cell) is a soft quality
 * weight, not a hard gate, so flat-terrain maps still get candidate sites.
 * Design: docs/plan/dam-flood-control-and-hydropower.md §3.
 */
export class DamSitesModule {
  generate(): void {
    const world = getWorldContext();
    const { cells, rivers } = world.pack;
    const count = cells.i.length;

    const downstreamByCell =
      cells.riverDownstream?.length === count ? cells.riverDownstream : buildRiverDownstream(cells, rivers ?? []);

    const isLandRiverCell = (cellId: number) => Boolean(cells.r?.[cellId]) && (cells.h[cellId] ?? 0) >= 20;

    const fluxValues = Array.from(cells.fl ?? []).filter(Boolean);
    const meanFlux = (fluxValues.length ? mean(fluxValues) : 0) as number;

    const candidates: Candidate[] = [];
    for (const cellId of cells.i) {
      if (!isLandRiverCell(cellId)) continue;
      const discharge = cells.fl?.[cellId] ?? 0;
      if (discharge <= meanFlux) continue;

      // A mouth (downstream < 0) or a reach that runs straight into open water has no channel on
      // both sides — not a viable dam site.
      const downstream = downstreamByCell?.[cellId] ?? -1;
      if (downstream < 0 || !isLandRiverCell(downstream)) continue;

      const point = cells.p?.[cellId];
      if (!point) continue;

      const head = Math.max(0, (cells.h[cellId] ?? 0) - (cells.h[downstream] ?? 0));
      candidates.push({ cell: cellId, riverId: cells.r[cellId] ?? 0, discharge, head, x: point[0], y: point[1] });
    }

    const maxDischarge = candidates.reduce((max, candidate) => Math.max(max, candidate.discharge), 0);
    const maxHead = candidates.reduce((max, candidate) => Math.max(max, candidate.head), 0);

    const scored = candidates
      .map(candidate => {
        const dischargePotential = maxDischarge > 0 ? candidate.discharge / maxDischarge : 0;
        const headPotential = maxHead > 0 ? candidate.head / maxHead : 0;
        return {
          ...candidate,
          dischargePotential,
          headPotential,
          qualityScore: dischargePotential * 0.5 + headPotential * 0.5
        };
      })
      // Highest quality first, so the min-spacing thinning below keeps the better of two close
      // candidates. Ties break on cell id for determinism.
      .sort((a, b) => b.qualityScore - a.qualityScore || a.cell - b.cell);

    const minSpacing = (world.grid?.spacing ?? 10) * MIN_SPACING_FACTOR;
    const placedPoints: [number, number][] = [];
    const sites: DamSite[] = [];

    for (const candidate of scored) {
      const tooClose = placedPoints.some(([px, py]) => Math.hypot(px - candidate.x, py - candidate.y) < minSpacing);
      if (tooClose) continue;
      placedPoints.push([candidate.x, candidate.y]);

      const downstreamCells: number[] = [];
      let cursor = downstreamByCell?.[candidate.cell] ?? -1;
      for (let hop = 0; hop < DOWNSTREAM_HOPS && cursor >= 0 && isLandRiverCell(cursor); hop++) {
        downstreamCells.push(cursor);
        cursor = downstreamByCell?.[cursor] ?? -1;
      }

      sites.push({
        i: sites.length + 1,
        cell: candidate.cell,
        x: rn(candidate.x, 2),
        y: rn(candidate.y, 2),
        riverId: candidate.riverId,
        dischargePotential: rn(candidate.dischargePotential, 4),
        headPotential: rn(candidate.headPotential, 4),
        qualityScore: rn(candidate.qualityScore, 4),
        downstreamCells
      });
    }

    setDamSites(sites);
  }

  clear(): void {
    setDamSites([]);
  }
}

export const DamSites = new DamSitesModule();
