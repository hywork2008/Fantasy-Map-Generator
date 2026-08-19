import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold, VolcanoConstants } from "../data/constants";
import type { LavaFlow } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { TIME } from "../utils/debug";
import { Rivers } from "./river-generator";

/**
 * Downhill lava flows from active volcanic craters. Not water: does not write cells.r / cells.fl,
 * does not erode, and does not participate in navigation or hydrology.
 */
class LavaFlowsModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  generate(
    worldContextArg: WorldContext,
    viewContextArg: Readonly<ViewContext>,
    appServicesArg: AppServices,
    state: WorldState
  ): void {
    this.worldContext = worldContextArg;
    this.viewContext = viewContextArg;
    this.appServices = appServicesArg;
    const { pack, grid } = state;
    TIME && console.time("generateLavaFlows");

    pack.lavaFlows = [];
    const volcanoes = grid.volcanoes?.filter(volcano => volcano.active) ?? [];
    if (!volcanoes.length) {
      TIME && console.timeEnd("generateLavaFlows");
      return;
    }

    let nextId = 1;
    for (const volcano of volcanoes) {
      const flow = this.buildFlow(pack, volcano.peakCell, nextId);
      if (!flow) continue;
      pack.lavaFlows.push(flow);
      nextId++;
    }

    TIME && console.timeEnd("generateLavaFlows");
  }

  private buildFlow(pack: PackedGraph, peakGridCell: number, id: number): LavaFlow | null {
    const crater = this.findCraterPackCell(pack, peakGridCell);
    if (crater === null) return null;

    const craterCells = this.collectCraterCells(pack, crater);
    const overflow = this.findOverflow(pack, craterCells);
    if (overflow === null) return null;

    const downhill = this.walkDownhill(pack, overflow, craterCells, VolcanoConstants.LAVA_FLOW_MAX_CELLS - 1);
    const cells = [crater, ...downhill];
    if (cells.length < 2) return null;

    return {
      i: id,
      source: crater,
      mouth: cells[cells.length - 1],
      cells,
      widthFactor: VolcanoConstants.LAVA_FLOW_WIDTH_FACTOR,
      sourceWidth: VolcanoConstants.LAVA_FLOW_SOURCE_WIDTH,
      volcanoGridCell: peakGridCell
    };
  }

  private findCraterPackCell(pack: PackedGraph, peakGridCell: number): number | null {
    const { g, h, i } = pack.cells;
    let landFallback: number | null = null;
    for (let cellId = 0; cellId < i.length; cellId++) {
      if (g[cellId] !== peakGridCell) continue;
      if (h[cellId] < HeightThreshold.WATER_MAX_HEIGHT) return cellId;
      landFallback = cellId;
    }
    return landFallback;
  }

  private collectCraterCells(pack: PackedGraph, crater: number): number[] {
    const feature = pack.features[pack.cells.f[crater]];
    if (feature?.type !== "lake") return [crater];
    const cells: number[] = [];
    const { f, i } = pack.cells;
    for (let cellId = 0; cellId < i.length; cellId++) {
      if (f[cellId] === feature.i) cells.push(cellId);
    }
    return cells.length ? cells : [crater];
  }

  private findOverflow(pack: PackedGraph, craterCells: number[]): number | null {
    const craterSet = new Set(craterCells);
    const { c, h } = pack.cells;
    let best = -1;
    let bestHeight = Infinity;
    for (const cellId of craterCells) {
      for (const neighbor of c[cellId] ?? []) {
        if (craterSet.has(neighbor)) continue;
        if (h[neighbor] < HeightThreshold.WATER_MAX_HEIGHT) continue;
        if (h[neighbor] < bestHeight) {
          best = neighbor;
          bestHeight = h[neighbor];
        }
      }
    }
    return best >= 0 ? best : null;
  }

  private walkDownhill(pack: PackedGraph, start: number, craterCells: number[], maxCells: number): number[] {
    const { c, h, f } = pack.cells;
    const used = new Set(craterCells);
    used.add(start);
    const path = [start];
    let current = start;

    while (path.length < maxCells) {
      let next = -1;
      let nextHeight = h[current];
      let waterSink = -1;

      for (const neighbor of c[current] ?? []) {
        if (used.has(neighbor)) continue;
        if (h[neighbor] < HeightThreshold.WATER_MAX_HEIGHT) {
          const feature = pack.features[f[neighbor]];
          if (feature?.type === "lake" && craterCells.includes(neighbor)) continue;
          if (waterSink < 0) waterSink = neighbor;
          continue;
        }
        if (h[neighbor] < nextHeight) {
          next = neighbor;
          nextHeight = h[neighbor];
        }
      }

      if (next < 0) {
        if (waterSink >= 0) path.push(waterSink);
        break;
      }
      path.push(next);
      used.add(next);
      current = next;
    }

    return path;
  }

  /** Variable-width path for SVG / WebGL, using dummy flux so the ribbon stays thin. */
  getFlowPath(flow: LavaFlow, pack: PackedGraph): string {
    return Rivers.getRiverPath(this.getBankPoints(flow, pack), flow.widthFactor, flow.sourceWidth);
  }

  getBankPoints(flow: LavaFlow, pack: PackedGraph): [number, number, number][] {
    return this.getFlowPoints(flow, pack).map(([x, y], index) => [
      x,
      y,
      VolcanoConstants.LAVA_FLOW_DUMMY_FLUX + index * 2
    ]);
  }

  getFlowPoints(flow: LavaFlow, pack: PackedGraph): [number, number][] {
    if (flow.points && flow.points.length === flow.cells.length) return flow.points;
    return flow.cells.map(cellId => pack.cells.p[cellId] ?? [0, 0]);
  }
}

export const LavaFlows = new LavaFlowsModule();
