import type { PackedGraph, Point, TypedArray } from "@fmg/types";

type GridCellsForRegraph = {
  i: number[];
  h: ArrayLike<number>;
  t: ArrayLike<number>;
  b: ArrayLike<number>;
  c: number[][];
  f: ArrayLike<number>;
};

type GridFeatureLike = {
  type?: string;
};

type GridForRegraph = {
  cells: GridCellsForRegraph;
  points: Point[];
  features: GridFeatureLike[];
  spacing: number;
  boundary: Point[];
};

export type D3Like = {
  polygonArea: (polygon: [number, number][]) => number;
  median: (values: number[]) => number | undefined;
  max: (values: ArrayLike<number>) => number;
  mean: (values: ArrayLike<number>) => number;
};

export type ReGraphDeps = {
  TIME: boolean;
  grid: GridForRegraph;
  pack: PackedGraph;
  rn: (value: number, digits?: number) => number;
  calculateVoronoi: (
    points: Point[],
    boundary: Point[]
  ) => { cells: PackedGraph["cells"]; vertices: PackedGraph["vertices"] };
  createTypedArray: (options: { maxValue: number; length?: number; from?: ArrayLike<number> }) => TypedArray;
  UINT16_MAX: number;
  getPackPolygon: (cellId: number) => [number, number][];
  d3: D3Like;
};

export function reGraphFlow({
  TIME,
  grid,
  pack,
  rn,
  calculateVoronoi,
  createTypedArray,
  UINT16_MAX,
  getPackPolygon,
  d3
}: ReGraphDeps) {
  TIME && console.time("reGraph");
  const { cells: gridCells, points, features } = grid;
  const newCells: { p: [number, number][]; g: number[]; h: number[] } = { p: [], g: [], h: [] };
  const spacing2 = grid.spacing ** 2;

  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    if (height < 20 && type !== -1 && type !== -2) continue;
    if (type === -2 && (i % 4 === 0 || features[gridCells.f[i]].type === "lake")) continue;

    const [x, y] = points[i];
    addNewPoint(i, x, y, height);

    if (type === 1 || type === -1) {
      if (gridCells.b[i]) continue;
      gridCells.c[i].forEach((e: number) => {
        if (i > e) return;
        if (gridCells.t[e] === type) {
          const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
          if (dist2 < spacing2) return;
          const x1 = rn((x + points[e][0]) / 2, 1);
          const y1 = rn((y + points[e][1]) / 2, 1);
          addNewPoint(i, x1, y1, height);
        }
      });
    }
  }

  function addNewPoint(i: number, x: number, y: number, height: number) {
    newCells.p.push([x, y]);
    newCells.g.push(i);
    newCells.h.push(height);
  }

  const { cells: packCells, vertices } = calculateVoronoi(newCells.p, grid.boundary);
  pack.vertices = vertices;
  pack.cells = packCells;
  pack.cells.p = newCells.p;
  pack.cells.g = createTypedArray({ maxValue: grid.points.length, from: newCells.g }) as any;
  pack.cells.h = createTypedArray({ maxValue: 100, from: newCells.h }) as any;
  pack.cells.area = createTypedArray({ maxValue: UINT16_MAX, length: packCells.i.length }).map((_: unknown, cellId: number) => {
    const area = Math.abs(d3.polygonArea(getPackPolygon(cellId)));
    return Math.min(area, UINT16_MAX);
  });

  TIME && console.timeEnd("reGraph");
}

export type RankCellsDeps = {
  TIME: boolean;
  pack: PackedGraph;
  biomesData: { habitability: ArrayLike<number> };
  normalize: (value: number, min: number, max: number) => number;
  d3: D3Like;
};

export function rankCellsFlow({ TIME, pack, biomesData, normalize, d3 }: RankCellsDeps) {
  TIME && console.time("rankCells");
  const { cells, features } = pack;
  cells.s = new Int16Array(cells.i.length);
  cells.pop = new Float32Array(cells.i.length);

  const meanFlux = d3.median(Array.from(cells.fl.filter((f: number) => f))) || 0;
  const maxFlux = d3.max(cells.fl) + d3.max(cells.conf);
  const meanArea = d3.mean(cells.area);

  const scoreMap: Record<string, number> = {
    estuary: 15,
    ocean_coast: 5,
    save_harbor: 20,
    freshwater: 30,
    salt: 10,
    frozen: 1,
    dry: -5,
    sinkhole: -5,
    lava: -30
  };

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    let score = biomesData.habitability[cells.biome[i]];
    if (!score) continue;

    if (meanFlux) score += normalize(cells.fl[i] + cells.conf[i], meanFlux, maxFlux) * 250;
    score -= (cells.h[i] - 50) / 5;

    if (cells.t[i] === 1) {
      if (cells.r[i]) score += scoreMap.estuary;
      const feature = features[cells.f[cells.haven[i]]];
      if (feature.type === "lake") {
        score += scoreMap[feature.group] || 0;
      } else {
        score += scoreMap.ocean_coast;
        if (cells.harbor[i] === 1) score += scoreMap.save_harbor;
      }
    }

    cells.s[i] = score / 5;
    cells.pop[i] = cells.s[i] > 0 ? (cells.s[i] * cells.area[i]) / meanArea : 0;
  }

  TIME && console.timeEnd("rankCells");
}
