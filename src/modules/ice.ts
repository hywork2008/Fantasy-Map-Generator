import { min } from "d3";
import { aleaPRNG } from "../components/AleaPRNG";
import { TemperatureThreshold } from "../config/constants";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import type { WorldState } from "../types/WorldState";
import { clipPoly, getIsolines, lerp, minmax, normalize, P, ra, rand, rn } from "../utils";
import { getGridPolygon } from "../utils/graphUtils";
import type { Point } from "./voronoi";
export type IceGlacier = { i: number; points: [number, number][]; type: "glacier"; offset?: [number, number] };
export type IceIceberg = {
  i: number;
  points: [number, number][];
  type: "iceberg";
  cellId: number;
  size: number;
  offset?: [number, number];
};
export type IceElement = IceGlacier | IceIceberg;

class IceModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  // Find next available id for new ice element idealy filling gaps
  private getNextId() {
    const { pack } = this.worldContext;
    if (pack.ice.length === 0) return 0;
    // find gaps in existing ids
    const existingIds = pack.ice.map(e => e.i).sort((a, b) => a - b);
    for (let id = 0; id < existingIds[existingIds.length - 1]; id++) {
      if (!existingIds.includes(id)) return id;
    }
    return existingIds[existingIds.length - 1] + 1;
  }

  // Clear all ice
  private clear() {
    const { pack } = this.worldContext;
    pack.ice = [];
  }

  // Generate glaciers and icebergs based on temperature and height
  public generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack, grid, seed } = state;
    this.clear();
    const { cells, features } = grid;
    const { temp, h } = cells;
    Math.random = aleaPRNG(seed);

    const ICEBERG_MAX_TEMP = TemperatureThreshold.ICEBERG_MAX_TEMP;
    const GLACIER_MAX_TEMP = TemperatureThreshold.GLACIER_MAX_TEMP;
    const minMaxTemp = min<number>(temp)!;

    // Generate glaciers on cold land
    {
      const { graphWidth, graphHeight } = worldContext;
      const type = "iceShield";
      const getType = (cellId: number) => (h[cellId] >= 20 && temp[cellId] <= GLACIER_MAX_TEMP ? type : null);
      const isolines = getIsolines(grid, getType, { polygons: true });

      if (isolines[type]?.polygons) {
        isolines[type].polygons.forEach((points: Point[]) => {
          const clipped = clipPoly(points, graphWidth, graphHeight);
          pack.ice.push({
            i: this.getNextId(),
            points: clipped,
            type: "glacier"
          });
        });
      }
    }

    // Generate icebergs on cold water
    for (const cellId of grid.cells.i) {
      const t = temp[cellId];
      if (h[cellId] >= 20) continue; // no icebergs on land
      if (t > ICEBERG_MAX_TEMP) continue; // too warm: no icebergs
      if (features[cells.f[cellId]].type === "lake") continue; // no icebergs on lakes
      if (P(0.8)) continue; // skip most of eligible cells

      const randomFactor = 0.8 + rand() * 0.4; // random size factor
      let baseSize = (1 - normalize(t, minMaxTemp, 1)) * 0.8; // size: 0 = zero, 1 = full
      if (cells.t[cellId] === -1) baseSize /= 1.3; // coastline: smaller icebergs
      const size = minmax(rn(baseSize * randomFactor, 2), 0.1, 1);

      const [cx, cy] = grid.points[cellId];
      const points = getGridPolygon(cellId, grid).map(([x, y]: Point): [number, number] => [
        rn(lerp(cx, x, size), 2),
        rn(lerp(cy, y, size), 2)
      ]);

      pack.ice.push({
        i: this.getNextId(),
        points,
        type: "iceberg",
        cellId,
        size
      });
    }
  }

  addIceberg(cellId: number, size: number): number {
    const { grid, pack } = this.worldContext;
    const [cx, cy] = grid.points[cellId];
    const points = getGridPolygon(cellId, grid).map(([x, y]: Point): [number, number] => [
      rn(lerp(cx, x, size), 2),
      rn(lerp(cy, y, size), 2)
    ]);
    const id = this.getNextId();
    pack.ice.push({
      i: id,
      points,
      type: "iceberg",
      cellId,
      size
    });
    return id;
  }

  removeIce(id: number): "glacier" | "iceberg" | undefined {
    const { pack } = this.worldContext;
    const index = pack.ice.findIndex(element => element.i === id);
    if (index === -1) return undefined;
    const type = pack.ice[index].type;
    pack.ice.splice(index, 1);
    return type;
  }

  randomizeIcebergShape(id: number) {
    const { pack, grid } = this.worldContext;
    const iceberg = pack.ice.find(element => element.i === id);
    if (iceberg?.type !== "iceberg") return;

    const cellId = iceberg.cellId;
    const size = iceberg.size;
    const [cx, cy] = grid.points[cellId];

    // Get a different random cell for the polygon template
    const i = ra(Array.from(grid.cells.i));
    const cn = grid.points[i];
    const poly = getGridPolygon(i, grid).map((p: Point): [number, number] => [p[0] - cn[0], p[1] - cn[1]]);
    const points: [number, number][] = poly.map((p: [number, number]): [number, number] => [
      rn(cx + p[0] * size, 2),
      rn(cy + p[1] * size, 2)
    ]);

    iceberg.points = points;
  }

  changeIcebergSize(id: number, newSize: number) {
    const { pack, grid } = this.worldContext;
    const iceberg = pack.ice.find(element => element.i === id);
    if (iceberg?.type !== "iceberg") return;

    const cellId = iceberg.cellId;
    const [cx, cy] = grid.points[cellId];
    const oldSize = iceberg.size;

    const flat = iceberg.points.reduce<number[]>((acc, [x, y]) => {
      acc.push(x, y);
      return acc;
    }, []);
    const pairs: number[][] = [];
    while (flat.length) pairs.push(flat.splice(0, 2));
    const poly = pairs.map((p): [number, number] => [(p[0] - cx) / oldSize, (p[1] - cy) / oldSize]);
    const points: [number, number][] = poly.map((p): [number, number] => [
      rn(cx + p[0] * newSize, 2),
      rn(cy + p[1] * newSize, 2)
    ]);

    iceberg.points = points;
    iceberg.size = newSize;
  }
}

export const Ice = new IceModule();
