import Alea from "alea";
import { curveBasis, curveCatmullRom, line, mean, min, sum } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { HeightmapConstants, HeightThreshold, RiverConstants } from "../data/constants";
import { useOptionsState } from "../store/optionsState";
import type { River } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { each, rn, round, rw } from "../utils";
import { TIME, WARN } from "../utils/debug";
import { Lakes } from "./lakes";
import { Names } from "./names-generator";
import type { Point } from "./voronoi";

export interface RiverBankGeometry {
  left: [number, number][];
  right: [number, number][];
  widths: number[];
  fluxes: number[];
}

class RiverModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  private FLUX_FACTOR = 500;
  private MAX_FLUX_WIDTH = 1;
  private LENGTH_FACTOR = 200;
  private LENGTH_STEP_WIDTH = 1 / this.LENGTH_FACTOR;
  private LENGTH_PROGRESSION = [1, 1, 2, 3, 5, 8, 13, 21, 34].map(n => n / this.LENGTH_FACTOR);
  private lineGen = line().curve(curveBasis);

  riverTypes = {
    main: {
      big: { River: 1 },
      small: { Creek: 9, River: 3, Brook: 3, Stream: 1 }
    },
    fork: {
      big: { Fork: 1 },
      small: { Branch: 1 }
    }
  };

  smallLength: number | null = null;

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState,
    allowErosion = true
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack, grid, seed } = state;
    TIME && console.time("generateRivers");
    Math.random = Alea(seed);
    const { cells, features } = pack;

    const riversData: { [riverId: number]: number[] } = {};
    const riverParents: { [key: number]: number } = {};

    const addCellToRiver = (cellId: number, riverId: number) => {
      if (!riversData[riverId]) riversData[riverId] = [cellId];
      else riversData[riverId].push(cellId);
    };

    const drainWater = () => {
      const MIN_FLUX_TO_FORM_RIVER = RiverConstants.MIN_FLUX_TO_FORM_RIVER;
      const { points } = useOptionsState.getState();
      const cellsNumberModifier = ((points === 4 ? 10000 : points * 2500) / 10000) ** 0.25;

      const prec = grid.cells.prec;
      const land = cells.i.filter((i: number) => h[i] >= 20).sort((a: number, b: number) => h[b] - h[a]);
      const lakeOutCells = Lakes.defineClimateData(h);

      for (const i of land) {
        cells.fl[i] += prec[cells.g[i]] / cellsNumberModifier; // add flux from precipitation

        // create lake outlet if lake is not in deep depression and flux > evaporation
        const lakes = lakeOutCells[i]
          ? features.filter(feature => i === feature.outCell && feature.flux > feature.evaporation)
          : [];
        for (const lake of lakes) {
          const lakeCell = cells.c[i].find((c: number) => h[c] < 20 && cells.f[c] === lake.i)!;
          cells.fl[lakeCell] += Math.max(lake.flux - lake.evaporation, 0); // not evaporated lake water drains to outlet

          // allow chain lakes to retain identity
          if (cells.r[lakeCell] !== lake.river) {
            const sameRiver = cells.c[lakeCell].some((c: number) => cells.r[c] === lake.river);

            if (sameRiver) {
              cells.r[lakeCell] = lake.river as number;
              addCellToRiver(lakeCell, lake.river as number);
            } else {
              cells.r[lakeCell] = riverNext;
              addCellToRiver(lakeCell, riverNext);
              riverNext++;
            }
          }

          lake.outlet = cells.r[lakeCell];
          flowDown(i, cells.fl[lakeCell], lake.outlet);
        }

        // assign all tributary rivers to outlet basin
        const outlet = lakes[0]?.outlet;
        for (const lake of lakes) {
          if (!Array.isArray(lake.inlets)) continue;
          for (const inlet of lake.inlets) {
            riverParents[inlet] = outlet as number;
          }
        }

        // near-border cell: pour water out of the screen
        if (cells.b[i] && cells.r[i]) {
          addCellToRiver(-1, cells.r[i]);
          continue;
        }

        // downhill cell (make sure it's not in the source lake)
        let min = null;
        if (lakeOutCells[i]) {
          const filtered = cells.c[i].filter((c: number) => !lakes.map(lake => lake.i).includes(cells.f[c]));
          min = filtered.sort((a: number, b: number) => h[a] - h[b])[0];
        } else if (cells.haven[i]) {
          min = cells.haven[i];
        } else {
          min = cells.c[i].reduce((minCell, c) => (h[c] < h[minCell] ? c : minCell));
        }

        // cells is depressed
        if (h[i] <= h[min]) continue;

        // debug
        //   .append("line")
        //   .attr("x1", pack.cells.p[i][0])
        //   .attr("y1", pack.cells.p[i][1])
        //   .attr("x2", pack.cells.p[min][0])
        //   .attr("y2", pack.cells.p[min][1])
        //   .attr("stroke", "#333")
        //   .attr("stroke-width", 0.2);

        if (cells.fl[i] < MIN_FLUX_TO_FORM_RIVER) {
          // flux is too small to operate as a river
          if (h[min] >= 20) cells.fl[min] += cells.fl[i];
          continue;
        }

        // proclaim a new river
        if (!cells.r[i]) {
          cells.r[i] = riverNext;
          addCellToRiver(i, riverNext);
          riverNext++;
        }

        flowDown(min, cells.fl[i], cells.r[i]);
      }
    };

    const flowDown = (toCell: number, fromFlux: number, river: number) => {
      const toFlux = cells.fl[toCell] - cells.conf[toCell];
      const toRiver = cells.r[toCell];

      if (toRiver) {
        // downhill cell already has river assigned
        if (fromFlux > toFlux) {
          cells.conf[toCell] += cells.fl[toCell]; // mark confluence
          if (h[toCell] >= 20) riverParents[toRiver] = river; // min river is a tributary of current river
          cells.r[toCell] = river; // re-assign river if downhill part has less flux
        } else {
          cells.conf[toCell] += fromFlux; // mark confluence
          if (h[toCell] >= 20) riverParents[river] = toRiver; // current river is a tributary of min river
        }
      } else cells.r[toCell] = river; // assign the river to the downhill cell

      if (h[toCell] < 20) {
        // pour water to the water body
        const waterBody = features[cells.f[toCell]];
        if (waterBody.type === "lake") {
          if (!waterBody.river || fromFlux > (waterBody.enteringFlux as number)) {
            waterBody.river = river;
            waterBody.enteringFlux = fromFlux;
          }
          waterBody.flux = waterBody.flux + fromFlux;
          if (!waterBody.inlets) waterBody.inlets = [river];
          else waterBody.inlets.push(river);
        }
      } else {
        // propagate flux and add next river segment
        cells.fl[toCell] += fromFlux;
      }

      addCellToRiver(toCell, river);
    };

    const defineRivers = () => {
      // re-initialize rivers and confluence arrays
      cells.r = new Uint16Array(cells.i.length);
      cells.conf = new Uint16Array(cells.i.length);
      pack.rivers = [];

      const pointsVal = useOptionsState.getState().points;
      const defaultWidthFactor = rn(1 / ((pointsVal === 4 ? 10000 : pointsVal * 2500) / 10000) ** 0.25, 2);
      const mainStemWidthFactor = defaultWidthFactor * 1.2;

      for (const key in riversData) {
        const riverCells = riversData[key];
        if (riverCells.length < RiverConstants.MIN_RIVER_CELLS) continue; // exclude tiny rivers

        const riverId = +key;
        for (const cell of riverCells) {
          if (cell < 0 || cells.h[cell] < 20) continue;

          // mark real confluences and assign river to cells
          if (cells.r[cell]) cells.conf[cell] = 1;
          else cells.r[cell] = riverId;
        }

        const source = riverCells[0];
        const mouth = riverCells[riverCells.length - 2];
        const parent = riverParents[key] || 0;

        const widthFactor = !parent || parent === riverId ? mainStemWidthFactor : defaultWidthFactor;
        const meanderedPoints = this.addMeandering(riverCells);
        const discharge = cells.fl[mouth]; // m3 in second
        const length = this.getApproximateLength(meanderedPoints.map(([x, y]) => [x, y]));
        const sourceWidth = this.getSourceWidth(cells.fl[source]);
        const width = this.getWidth(
          this.getOffset({
            flux: discharge,
            pointIndex: meanderedPoints.length,
            widthFactor,
            startingWidth: sourceWidth
          })
        );

        pack.rivers.push({
          i: riverId,
          source,
          mouth,
          discharge,
          length,
          width,
          widthFactor,
          sourceWidth,
          parent,
          cells: riverCells
        } as River);
      }
    };

    const downcutRivers = () => {
      const MAX_DOWNCUT = RiverConstants.MAX_DOWNCUT;

      for (const i of pack.cells.i) {
        if (cells.h[i] < HeightThreshold.SHALLOW_WATER_MIN) continue; // don't downcut lowlands
        if (!cells.fl[i]) continue;

        const higherCells = cells.c[i].filter((c: number) => cells.h[c] > cells.h[i]);
        const higherFlux = higherCells.reduce((acc: number, c: number) => acc + cells.fl[c], 0) / higherCells.length;
        if (!higherFlux) continue;

        const downcut = Math.floor(cells.fl[i] / higherFlux);
        if (downcut) cells.h[i] -= Math.min(downcut, MAX_DOWNCUT);
      }
    };

    const calculateConfluenceFlux = () => {
      for (const i of cells.i) {
        if (!cells.conf[i]) continue;

        const sortedInflux = cells.c[i]
          .filter((c: number) => cells.r[c] && h[c] > h[i])
          .map((c: number) => cells.fl[c])
          .sort((a: number, b: number) => b - a);
        cells.conf[i] = sortedInflux.reduce(
          (acc: number, flux: number, index: number) => (index ? acc + flux : acc),
          0
        );
      }
    };

    cells.fl = new Uint16Array(cells.i.length); // water flux array
    cells.r = new Uint16Array(cells.i.length); // rivers array
    cells.conf = new Uint8Array(cells.i.length); // confluences array
    let riverNext = 1; // first river id is 1

    const h = this.alterHeights();
    Lakes.detectCloseLakes(h);
    this.resolveDepressions(h);
    drainWater();
    defineRivers();

    calculateConfluenceFlux();
    Lakes.cleanupLakeData();

    if (allowErosion) {
      cells.h = Uint8Array.from(h); // apply gradient
      downcutRivers(); // downcut river beds
    }

    TIME && console.timeEnd("generateRivers");
  }

  alterHeights(): number[] {
    const { pack } = this.worldContext;
    const { h, c, t } = pack.cells as {
      h: Uint8Array;
      c: number[][];
      t: Uint8Array;
    };
    return Array.from(h).map((h, i) => {
      if (h < 20 || t[i] < 1) return h;
      return h + t[i] / 100 + (mean(c[i].map(c => t[c])) as number) / 10000;
    });
  }

  // depression filling algorithm (for a correct water flux modeling)
  resolveDepressions(h: number[]) {
    const { pack } = this.worldContext;
    const { cells, features } = pack;
    const maxIterations = useOptionsState.getState().resolveDepressionsSteps;
    const checkLakeMaxIteration = maxIterations * 0.85;
    const elevateLakeMaxIteration = maxIterations * 0.75;

    const height = (i: number) => features[cells.f[i]].height || h[i]; // height of lake or specific cell

    const lakes = features.filter(feature => feature.type === "lake");
    const land = cells.i.filter((i: number) => h[i] >= 20 && !cells.b[i]); // exclude near-border cells
    land.sort((a: number, b: number) => h[a] - h[b]); // lowest cells go first

    const progress = [];
    let depressions = Infinity;
    let prevDepressions = null;
    for (let iteration = 0; depressions && iteration < maxIterations; iteration++) {
      if (progress.length > 5 && sum(progress) > 0) {
        // bad progress, abort and set heights back
        h = this.alterHeights();
        depressions = progress[0];
        break;
      }

      depressions = 0;

      if (iteration < checkLakeMaxIteration) {
        for (const l of lakes) {
          if (l.closed) continue;
          const minHeight = min(l.shoreline.map((s: number) => h[s])) as number;
          if (minHeight >= HeightThreshold.HEIGHT_MAX || l.height > minHeight) continue;

          if (iteration > elevateLakeMaxIteration) {
            l.shoreline.forEach((i: number) => {
              h[i] = cells.h[i];
            });
            l.height = (min(l.shoreline.map((s: number) => h[s])) as number) - 1;
            l.closed = true;
            continue;
          }

          depressions++;
          l.height = (minHeight as number) + HeightmapConstants.LAKE_HEIGHT_INCREMENT;
        }
      }

      for (const i of land) {
        const minHeight = min(cells.c[i].map((c: number) => height(c))) as number;
        if (minHeight >= HeightThreshold.HEIGHT_MAX || h[i] > minHeight) continue;

        depressions++;
        h[i] = minHeight + HeightmapConstants.DEPRESSION_FILL_STEP;
      }

      prevDepressions !== null && progress.push(depressions - prevDepressions);
      prevDepressions = depressions;
    }

    depressions && WARN && console.warn(`Unresolved depressions: ${depressions}. Edit heightmap to fix`);
  }

  addMeandering(
    riverCells: number[],
    riverPoints: Point[] | null = null,
    meandering = 0.5
  ): [number, number, number][] {
    const { pack } = this.worldContext;
    const { fl, h } = pack.cells;
    const meandered = [];
    const points = this.getRiverPoints(riverCells, riverPoints);
    const lastStep = points.length - 1;
    let step = h[riverCells[0]] < 20 ? 1 : 10;

    for (let i = 0; i <= lastStep; i++, step++) {
      const cell = riverCells[i];
      const isLastCell = i === lastStep;

      const [x1, y1] = points[i];

      meandered.push([x1, y1, fl[cell]]);
      if (isLastCell) break;

      const nextCell = riverCells[i + 1];
      const [x2, y2] = points[i + 1];

      if (nextCell === -1) {
        meandered.push([x2, y2, fl[cell]]);
        break;
      }

      const dist2 = (x2 - x1) ** 2 + (y2 - y1) ** 2; // square distance between cells
      if (dist2 <= 25 && riverCells.length >= 6) continue;

      const meander = meandering + 1 / step + Math.max(meandering - step / 100, 0);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const sinMeander = Math.sin(angle) * meander;
      const cosMeander = Math.cos(angle) * meander;

      if (step < 20 && (dist2 > 64 || (dist2 > 36 && riverCells.length < 5))) {
        // if dist2 is big or river is small add extra points at 1/3 and 2/3 of segment
        const p1x = (x1 * 2 + x2) / 3 + -sinMeander;
        const p1y = (y1 * 2 + y2) / 3 + cosMeander;
        const p2x = (x1 + x2 * 2) / 3 + sinMeander / 2;
        const p2y = (y1 + y2 * 2) / 3 - cosMeander / 2;
        meandered.push([p1x, p1y, 0], [p2x, p2y, 0]);
      } else if (dist2 > 25 || riverCells.length < 6) {
        // if dist is medium or river is small add 1 extra middlepoint
        const p1x = (x1 + x2) / 2 + -sinMeander;
        const p1y = (y1 + y2) / 2 + cosMeander;
        meandered.push([p1x, p1y, 0]);
      }
    }

    return meandered as [number, number, number][];
  }

  getRiverPoints(riverCells: number[], riverPoints: [number, number][] | null) {
    const { pack } = this.worldContext;
    if (riverPoints) return riverPoints;

    const { p } = pack.cells;
    return riverCells.map((cell, i) => {
      if (cell === -1) return this.getBorderPoint(riverCells[i - 1]);
      return p[cell];
    });
  }

  getBorderPoint(i: number) {
    const { pack } = this.worldContext;
    const [x, y] = pack.cells.p[i];
    const min = Math.min(y, worldContext.graphHeight - y, x, worldContext.graphWidth - x);
    if (min === y) return [x, 0];
    else if (min === worldContext.graphHeight - y) return [x, worldContext.graphHeight];
    else if (min === x) return [0, y];
    return [worldContext.graphWidth, y];
  }

  getOffset({
    flux,
    pointIndex,
    widthFactor,
    startingWidth
  }: {
    flux: number;
    pointIndex: number;
    widthFactor: number;
    startingWidth: number;
  }) {
    if (pointIndex === 0) return startingWidth;

    const fluxWidth = Math.min(flux ** 0.7 / this.FLUX_FACTOR, this.MAX_FLUX_WIDTH);
    const lengthWidth =
      pointIndex * this.LENGTH_STEP_WIDTH +
      (this.LENGTH_PROGRESSION[pointIndex] || (this.LENGTH_PROGRESSION.at(-1) as number));
    return widthFactor * (lengthWidth + fluxWidth) + startingWidth;
  }

  getSourceWidth(flux: number) {
    return rn(Math.min(flux ** 0.9 / this.FLUX_FACTOR, this.MAX_FLUX_WIDTH), 2);
  }

  /** Build the variable-width river banks shared by SVG and WebGL renderers. */
  getRiverBanks(points: [number, number, number][], widthFactor: number, startingWidth: number): RiverBankGeometry {
    const riverPointsLeft: [number, number][] = [];
    const riverPointsRight: [number, number][] = [];
    const widths: number[] = [];
    const fluxes: number[] = [];
    let flux = 0;

    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      const [x0, y0] = points[pointIndex - 1] || points[pointIndex];
      const [x1, y1, pointFlux] = points[pointIndex];
      const [x2, y2] = points[pointIndex + 1] || points[pointIndex];
      if (pointFlux > flux) flux = pointFlux;

      const offset = this.getOffset({
        flux,
        pointIndex,
        widthFactor,
        startingWidth
      });
      const angle = Math.atan2(y0 - y2, x0 - x2);
      const sinOffset = Math.sin(angle) * offset;
      const cosOffset = Math.cos(angle) * offset;

      riverPointsLeft.push([x1 - sinOffset, y1 + cosOffset]);
      riverPointsRight.push([x1 + sinOffset, y1 - cosOffset]);
      widths.push(offset * 2);
      fluxes.push(flux);
    }

    return { left: riverPointsLeft, right: riverPointsRight, widths, fluxes };
  }

  // build SVG polygon from the shared variable-width river banks
  getRiverPath(points: [number, number, number][], widthFactor: number, startingWidth: number) {
    this.lineGen.curve(curveCatmullRom.alpha(0.1));
    const { left: riverPointsLeft, right: riverPointsRight } = this.getRiverBanks(points, widthFactor, startingWidth);

    const right = this.lineGen([...riverPointsRight].reverse());
    let left = this.lineGen(riverPointsLeft) || "";
    left = left.substring(left.indexOf("C"));

    return round(right + left, 1);
  }

  specify(worldContext: WorldContext, viewContext: Readonly<ViewContext>, appServices: AppServices, state: WorldState) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack } = state;
    const rivers = pack.rivers;
    if (!rivers.length) return;

    for (const river of rivers) {
      river.parent = this.getParent(river.i);
      river.basin = this.getBasin(river.i);
      river.name = this.getName(river.mouth);
      river.type = this.getType(river);
    }
  }

  getName(cell: number) {
    const { pack } = this.worldContext;
    return Names.getCulture(pack.cells.culture[cell]);
  }

  getType({ i, length, parent }: Pick<River, "i" | "length" | "parent">) {
    const { pack } = this.worldContext;
    if (this.smallLength === null) {
      const threshold = Math.ceil(pack.rivers.length * RiverConstants.SMALL_RIVER_LENGTH_PERCENTILE);
      this.smallLength = pack.rivers.map(r => r.length || 0).sort((a: number, b: number) => a - b)[threshold];
    }

    const isSmall: boolean = length < (this.smallLength as number);
    const isFork = each(3)(i) && parent && parent !== i;
    return rw(this.riverTypes[isFork ? "fork" : "main"][isSmall ? "small" : "big"]);
  }

  getApproximateLength(points: Point[] = []) {
    const length = points.reduce((s, v, i, p) => s + (i ? Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]) : 0), 0);
    return rn(length, 2);
  }

  // Real mouth width examples: Amazon 6000m, Volga 6000m, Dniepr 3000m, Mississippi 1300m, Themes 900m,
  // Danube 800m, Daugava 600m, Neva 500m, Nile 450m, Don 400m, Wisla 300m, Pripyat 150m, Bug 140m, Muchavets 40m
  getWidth(offset: number) {
    return rn((offset / 1.5) ** 1.8, 2); // mouth width in km
  }

  // remove river and all its tributaries; returns IDs of removed rivers for SVG cleanup
  remove(id: number): number[] {
    const { pack, grid } = this.worldContext;
    const cells = pack.cells;
    const riversToRemove = pack.rivers.filter(r => r.i === id || r.parent === id || r.basin === id).map(r => r.i);
    cells.r.forEach((r, i) => {
      if (!r || !riversToRemove.includes(r)) return;
      cells.r[i] = 0;
      cells.fl[i] = grid.cells.prec[cells.g[i]];
      cells.conf[i] = 0;
    });
    pack.rivers = pack.rivers.filter(r => !riversToRemove.includes(r.i));
    return riversToRemove;
  }

  getParent(r: number): number {
    const { pack } = this.worldContext;
    const parent = pack.rivers.find(river => river.i === r)?.parent;
    if (!parent || parent === r) return r;
    if (!pack.rivers.some(river => river.i === parent)) return r;
    return parent;
  }

  getBasin(r: number): number {
    const visited = new Set<number>();
    let current = r;
    while (true) {
      if (visited.has(current)) return current; // cycle detected — treat as root
      visited.add(current);
      const parent = this.getParent(current);
      if (parent === current) return current;
      current = parent;
    }
  }

  getNextId(rivers: { i: number }[]) {
    return rivers.length ? Math.max(...rivers.map(r => r.i)) + 1 : 1;
  }

  isNavigable(cellId: number): boolean {
    const { cells } = this.worldContext.pack;
    return Boolean(cells.r[cellId]) && cells.fl[cellId] >= MIN_NAVIGABLE_FLUX;
  }

  // Walk an outlet chain starting from a lake feature; returns the ultimate receiving feature id.
  resolveLakeDrainFeature(lakeFeatureId: number): number | null {
    const { features, rivers, cells } = this.worldContext.pack;
    const lake = features[lakeFeatureId];
    if (lake?.type !== "lake") return null;
    if (!lake.outlet) return lakeFeatureId; // closed lake: return itself

    const riverById = new Map(rivers.map(r => [r.i, r]));
    const visited = new Set<number>();
    let river = riverById.get(lake.outlet);
    while (river && !visited.has(river.i)) {
      visited.add(river.i);
      const lastCell = river.cells[river.cells.length - 1];
      if (lastCell < 0) return null; // outlet exits the map

      const feature = features[cells.f[lastCell]];
      if (!feature) return null;
      if (feature.type === "ocean") return feature.i;
      if (feature.type !== "lake") return null;
      if (!feature.outlet) return feature.i; // closed downstream lake
      river = riverById.get(feature.outlet);
    }
    return null;
  }

  // Walk a river chain downstream through lakes until we reach the final receiving body.
  resolveDrainFeature(cellId: number): number | null {
    const { cells, features, rivers } = this.worldContext.pack;
    const startRiver = cells.r[cellId];
    if (!startRiver) return null;

    const riverById = new Map(rivers.map(r => [r.i, r]));
    let river = riverById.get(startRiver);
    const visited = new Set<number>();
    while (river && !visited.has(river.i)) {
      visited.add(river.i);
      const lastCell = river.cells[river.cells.length - 1];
      if (lastCell < 0) return null; // off-map exit

      const feature = features[cells.f[lastCell]];
      if (!feature) return null;
      if (feature.type === "ocean") return feature.i;
      if (feature.type !== "lake") return null;
      if (!feature.outlet) return feature.i; // closed lake terminus
      river = riverById.get(feature.outlet);
    }
    return null;
  }
}

export const MIN_NAVIGABLE_FLUX = 100;
export const Rivers = new RiverModule();
