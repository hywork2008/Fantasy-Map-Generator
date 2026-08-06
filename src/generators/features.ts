import Alea from "alea";
import { median, polygonArea } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import {
  FeatureSizeRatio,
  HeightmapConstants,
  HeightThreshold,
  OceanCurrentConstants,
  TemperatureThreshold
} from "../data/constants";
import { useOptionsState } from "../store/optionsState";
import type { GridFeature, PackedGraphFeature } from "../types/models";
import {
  clipPoly,
  connectVertices,
  createTypedArray,
  distanceSquared,
  isWater,
  minmax,
  rn,
  TYPED_ARRAY_MAX_VALUES,
  unique
} from "../utils";
import { TIME } from "../utils/debug";
import { isLand } from "../utils/graphUtils";
import { Lakes } from "./lakes";

class FeatureModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  private DEEPER_LAND = 3;
  private LANDLOCKED = 2;
  private LAND_COAST = 1;
  private UNMARKED = 0;
  private WATER_COAST = -1;
  private DEEP_WATER = -2;
  /** BFS hop radius used by calculateEnclosure() to score how landlocked a water cell is. */
  private ENCLOSURE_BFS_RADIUS = 6;
  /**
   * Water cells larger than the map's typical (median) cell area by this factor are skipped
   * by calculateEnclosure() and left at 0. reGraph() (main.ts) drops most sample points beyond
   * the immediate coastline, so open-ocean cells far from any shore balloon in size — a few BFS
   * hops through cells that large can span enough real distance to spuriously reach land.
   */
  private ENCLOSURE_AREA_LIMIT_RATIO = 3;

  /**
   * calculate distance to coast for every cell
   */
  private markup({
    distanceField,
    neighbors,
    start,
    increment,
    limit = TYPED_ARRAY_MAX_VALUES.INT8_MAX
  }: {
    distanceField: Int8Array;
    neighbors: number[][];
    start: number;
    increment: number;
    limit?: number;
  }) {
    for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
      marked = 0;
      const prevDistance = distance - increment;
      for (let cellId = 0; cellId < neighbors.length; cellId++) {
        if (distanceField[cellId] !== prevDistance) continue;

        for (const neighborId of neighbors[cellId]) {
          if (distanceField[neighborId] !== this.UNMARKED) continue;
          distanceField[neighborId] = distance;
          marked++;
        }
      }
    }
  }

  /**
   * mark Grid features (ocean, lakes, islands) and calculate distance field
   */
  markupGrid() {
    const { seed, grid } = this.worldContext;
    TIME && console.time("markupGrid");
    Math.random = Alea(seed); // get the same result on heightmap edit in Erase mode

    const { h: heights, c: neighbors, b: borderCells, i } = grid.cells;
    const cellsNumber = i.length;
    const distanceField = new Int8Array(cellsNumber); // gird.cells.t
    const featureIds = new Uint16Array(cellsNumber); // gird.cells.f
    const features: GridFeature[] = [];

    const queue = [0];
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      featureIds[firstCell] = featureId;

      const land = heights[firstCell] >= 20;
      let border = false; // set true if feature touches map edge

      while (queue.length) {
        const cellId = queue.pop() as number;
        if (!border && borderCells[cellId]) border = true;

        for (const neighborId of neighbors[cellId]) {
          const isNeibLand = heights[neighborId] >= 20;

          if (land === isNeibLand && featureIds[neighborId] === this.UNMARKED) {
            featureIds[neighborId] = featureId;
            queue.push(neighborId);
          } else if (land && !isNeibLand) {
            distanceField[cellId] = this.LAND_COAST;
            distanceField[neighborId] = this.WATER_COAST;
          }
        }
      }

      const type = land ? "island" : border ? "ocean" : "lake";
      features.push({ i: featureId, land, border, type });

      queue[0] = featureIds.indexOf(this.UNMARKED); // find unmarked cell
    }

    // markup deep ocean cells
    this.markup({
      distanceField,
      neighbors,
      start: this.DEEP_WATER,
      increment: -1,
      limit: HeightmapConstants.DEEP_WATER_LIMIT
    });
    grid.cells.t = distanceField;
    grid.cells.f = featureIds;
    grid.features = [0 as unknown as GridFeature, ...features];

    TIME && console.timeEnd("markupGrid");
  }

  /**
   * mark PackedGraph features (oceans, lakes, islands) and calculate distance field
   */
  markupPack() {
    const { pack } = this.worldContext;
    const defineHaven = (cellId: number) => {
      const waterCells = neighbors[cellId].filter((index: number) => isWater(index, pack));
      const distances = waterCells.map((neibCellId: number) => distanceSquared(cells.p[cellId], cells.p[neibCellId]));
      const closest = distances.indexOf(Math.min.apply(Math, distances));

      haven[cellId] = waterCells[closest];
      harbor[cellId] = waterCells.length;
    };

    const getCellsData = (featureType: string, firstCell: number): [number, number[]] => {
      if (featureType === "ocean") return [firstCell, []];

      const getType = (cellId: number) => featureIds[cellId];
      const type = getType(firstCell);
      const ofSameType = (cellId: number) => getType(cellId) === type;
      const ofDifferentType = (cellId: number) => getType(cellId) !== type;

      const startCell = findOnBorderCell(firstCell);
      const featureVertices = getFeatureVertices(startCell);
      return [startCell, featureVertices];

      function findOnBorderCell(firstCell: number) {
        const isOnBorder = (cellId: number) => Boolean(borderCells[cellId]) || neighbors[cellId].some(ofDifferentType);
        if (isOnBorder(firstCell)) return firstCell;

        const startCell = cells.i.filter(ofSameType).find(isOnBorder);
        if (startCell === undefined)
          throw new Error(`Markup: firstCell ${firstCell} is not on the feature or map border`);

        return startCell;
      }

      function getFeatureVertices(startCell: number) {
        const startingVertex = cells.v[startCell].find((v: number) => vertices.c[v].some(ofDifferentType));
        if (startingVertex === undefined) throw new Error(`Markup: startingVertex for cell ${startCell} is not found`);

        return connectVertices({
          vertices,
          startingVertex,
          ofSameType,
          closeRing: false
        });
      }
    };

    const addFeature = ({
      firstCell,
      land,
      border,
      featureId,
      totalCells
    }: {
      firstCell: number;
      land: boolean;
      border: boolean;
      featureId: number;
      totalCells: number;
    }): PackedGraphFeature => {
      const type = land ? "island" : border ? "ocean" : "lake";
      const [startCell, featureVertices] = getCellsData(type, firstCell);
      const points = clipPoly(
        featureVertices.map((vertex: number) => vertices.p[vertex]),
        worldContext.graphWidth,
        worldContext.graphHeight
      );
      const area = polygonArea(points); // feature perimiter area
      const absArea = Math.abs(rn(area));

      const feature: Partial<PackedGraphFeature> = {
        i: featureId,
        type,
        land,
        border,
        cells: totalCells,
        firstCell: startCell,
        vertices: featureVertices,
        area: absArea,
        shoreline: [],
        height: 0
      };

      if (type === "lake") {
        if (area > 0) feature.vertices = (feature.vertices as number[]).reverse();
        feature.shoreline = unique(
          (feature.vertices as number[]).flatMap(vertexIndex =>
            vertices.c[vertexIndex].filter(index => isLand(index, pack))
          )
        );
        feature.height = Lakes.getHeight(feature as PackedGraphFeature);
      }

      return {
        ...feature
      } as PackedGraphFeature;
    };

    TIME && console.time("markupPack");

    const { cells, vertices } = pack;
    const { c: neighbors, b: borderCells, i } = cells;
    const packCellsNumber = i.length;
    if (!packCellsNumber) return; // no cells -> there is nothing to do

    const distanceField = new Int8Array(packCellsNumber); // pack.cells.t
    const featureIds = new Uint16Array(packCellsNumber); // pack.cells.f
    const haven = createTypedArray({
      maxValue: packCellsNumber,
      length: packCellsNumber
    }); // haven: opposite water cell
    const harbor = new Uint8Array(packCellsNumber); // harbor: number of adjacent water cells
    const features: PackedGraphFeature[] = [];

    const queue = [0];
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      featureIds[firstCell] = featureId;

      const land = isLand(firstCell, pack);
      let border = Boolean(borderCells[firstCell]); // true if feature touches map border
      let totalCells = 1; // count cells in a feature

      while (queue.length) {
        const cellId = queue.pop() as number;
        if (borderCells[cellId]) border = true;

        for (const neighborId of neighbors[cellId]) {
          const isNeibLand = isLand(neighborId, pack);

          if (land && !isNeibLand) {
            distanceField[cellId] = this.LAND_COAST;
            distanceField[neighborId] = this.WATER_COAST;
            if (!haven[cellId]) defineHaven(cellId);
          } else if (land && isNeibLand) {
            if (distanceField[neighborId] === this.UNMARKED && distanceField[cellId] === this.LAND_COAST)
              distanceField[neighborId] = this.LANDLOCKED;
            else if (distanceField[cellId] === this.UNMARKED && distanceField[neighborId] === this.LAND_COAST)
              distanceField[cellId] = this.LANDLOCKED;
          }

          if (!featureIds[neighborId] && land === isNeibLand) {
            queue.push(neighborId);
            featureIds[neighborId] = featureId;
            totalCells++;
          }
        }
      }

      features.push(addFeature({ firstCell, land, border, featureId, totalCells }));
      queue[0] = featureIds.indexOf(this.UNMARKED); // find unmarked cell
    }

    this.markup({
      distanceField,
      neighbors,
      start: this.DEEPER_LAND,
      increment: 1
    }); // markup pack land
    this.markup({
      distanceField,
      neighbors,
      start: this.DEEP_WATER,
      increment: -1,
      limit: HeightmapConstants.DEEP_WATER_LIMIT
    }); // markup pack water

    pack.cells.t = distanceField;
    pack.cells.f = featureIds;
    pack.cells.haven = haven;
    pack.cells.harbor = harbor;
    pack.cells.enclosure = this.calculateEnclosure(packCellsNumber);
    pack.features = [0 as unknown as PackedGraphFeature, ...features];
    TIME && console.timeEnd("markupPack");
  }

  /**
   * Score how enclosed/landlocked each water cell is (0 = open ocean, 100 = fully enclosed).
   * For every water cell, flood-fills outward through water-only neighbors up to a fixed hop
   * radius and tracks the fraction of neighbor lookups that were blocked by land. A narrow
   * strait or bay quickly runs out of open water to expand into, so most lookups near its
   * shoreline hit land and the ratio climbs; open ocean keeps discovering new water cells, so
   * the ratio stays low. Land cells and oversized deep-ocean cells (see ENCLOSURE_AREA_LIMIT_RATIO)
   * are always 0. O(waterCells * radius * avgDegree).
   *
   * This is the legacy, mode-independent baseline — always computed first in `markupPack()`
   * regardless of `enclosureCalculationMode`, and left completely untouched (including its known
   * blind spot for large lakes, whose interior can fall outside the fixed BFS radius and read as
   * if it were open ocean) so `"radius"` mode keeps behaving exactly as it always has, as a true
   * point of comparison against `"oceanCurrents"` mode. The lake-specific fix lives in
   * `applyOceanCurrentEnclosure()` below, which only runs under `"oceanCurrents"` mode.
   */
  private calculateEnclosure(packCellsNumber: number): Uint8Array {
    const { pack } = this.worldContext;
    const { c: neighbors, area } = pack.cells;
    const enclosure = new Uint8Array(packCellsNumber);
    const visitedStamp = new Int32Array(packCellsNumber).fill(-1);
    const maxCellArea = (median(area) || 1) * this.ENCLOSURE_AREA_LIMIT_RATIO;

    for (let cellId = 0; cellId < packCellsNumber; cellId++) {
      if (!isWater(cellId, pack)) continue;
      if (area[cellId] > maxCellArea) continue;

      let frontier = [cellId];
      visitedStamp[cellId] = cellId;
      let blocked = 0;
      let total = 0;

      for (let depth = 0; depth < this.ENCLOSURE_BFS_RADIUS && frontier.length; depth++) {
        const nextFrontier: number[] = [];

        for (const currentId of frontier) {
          for (const neighborId of neighbors[currentId]) {
            total++;
            if (isLand(neighborId, pack)) {
              blocked++;
            } else if (visitedStamp[neighborId] !== cellId) {
              visitedStamp[neighborId] = cellId;
              nextFrontier.push(neighborId);
            }
          }
        }

        frontier = nextFrontier;
      }

      enclosure[cellId] = total > 0 ? Math.round((blocked / total) * 100) : 0;
    }

    return enclosure;
  }

  /**
   * Overrides `pack.cells.enclosure` for ocean-connected water cells using resolved current data
   * from `OceanCurrentsModule` instead of the fixed-radius land-blocked-ratio heuristic in
   * `calculateEnclosure()`. Two modes share this method, differing only in *which* current-speed
   * array they sample:
   * - `"oceanCurrents"`: `grid.cells.currentSpeed`, the speed at the cell's own position. Land is
   *   a real bounce-back obstacle in the LBM fluid solve (`src/generators/fluidSolver.ts`), so
   *   this reflects coastline shape — but almost every cell touching land reads near-zero speed
   *   regardless of whether the shore is a sheltered bay or an exposed open coastline (the
   *   solve's no-slip boundary layer), so scores saturate toward 100 right at the shoreline.
   * - `"oceanCurrentsAmbient"`: `grid.cells.ambientCurrentSpeed`, the same field smoothed across
   *   nearby ocean cells (`OceanCurrentsModule.computeAmbientCurrentSpeed()`). Reflects the speed
   *   a short distance offshore instead, distinguishing a genuinely enclosed bay (still slow a
   *   few hops out) from an exposed coastline (picks up real open-water speed nearby) — the mode
   *   intended for shoreline siting decisions such as harbor placement.
   *
   * Both are a closer physical match for "how calm/sheltered is this water for mooring/
   * shipbuilding" than the legacy heuristic, computed on the denser, uniform-density `grid`
   * rather than the sparser, irregular `pack` graph (see `OceanCurrentsModule`'s doc comment).
   *
   * Lake cells are always overridden to a full 100 (fully enclosed) here — deliberately *not* by
   * changing the mode-independent `calculateEnclosure()` baseline itself, which must stay exactly
   * as it's always behaved (including its known blind spot: a lake's interior can fall outside
   * the fixed BFS radius and read as if it were open ocean) so `"radius"` mode remains a true,
   * unmodified point of comparison against these modes. `OceanCurrentsModule` never models lake
   * current at all (both `currentSpeed` and `ambientCurrentSpeed` are always 0 there), so there's
   * no physical current data to derive a lake's calmness from the way ocean cells get it below —
   * but there's also nothing physical for a lake cell's distance from its own shore to be a proxy
   * *for* (no current, no wind-driven roughness), so a flat 100 is the physically-motivated
   * score, the same way these modes already treat ocean cells' speed-derived calmness as more
   * physically grounded than the legacy heuristic.
   *
   * No-op if `OceanCurrents.generate()` has not run yet (the relevant array missing) or the user
   * has selected the legacy "Radius (shape only)" mode in Options → Generation. Callers:
   * `main.ts`'s generation pipeline (right after `OceanCurrents.generate()`), the
   * `fmg:world-recalculate` handler when `currents` is recalculated, and the Generation Settings
   * "Enclosure calculation" select so switching modes updates the map without a full regenerate.
   */
  applyOceanCurrentEnclosure(): void {
    const mode = useOptionsState.getState().enclosureCalculationMode;
    if (mode !== "oceanCurrents" && mode !== "oceanCurrentsAmbient") return;

    const { pack, grid } = this.worldContext;
    const { cells, features } = pack;
    const currentSpeed = mode === "oceanCurrentsAmbient" ? grid.cells.ambientCurrentSpeed : grid.cells.currentSpeed;
    if (!currentSpeed) return;

    const n = cells.i.length;
    for (let cellId = 0; cellId < n; cellId++) {
      if (!isWater(cellId, pack)) continue;

      const feature = features[cells.f[cellId]];
      if (feature?.type === "lake") {
        cells.enclosure[cellId] = 100;
        continue;
      }
      if (feature?.type !== "ocean") continue;

      const speed = currentSpeed[cells.g[cellId]] ?? 0;
      const calmness = 1 - minmax(speed / OceanCurrentConstants.BASE_SPEED, 0, 1);
      cells.enclosure[cellId] = Math.round(calmness * 100);
    }
  }

  /**
   * Recomputes `pack.cells.enclosure` from scratch for whichever Options → Generation
   * "Enclosure calculation" mode is currently selected: the radius heuristic baseline, then the
   * current-speed overlay if `applyOceanCurrentEnclosure()` applies. Unlike that method (called
   * once, mid-pipeline, right after `OceanCurrents.generate()`, when `markupPack()` has already
   * set the baseline), this is for re-deriving the whole field on demand — the live "Enclosure
   * calculation" mode toggle (`react-change-enclosure-calculation`) so switching back to
   * "Radius" restores the legacy values instead of leaving the last current-speed result in
   * place.
   */
  recalculateEnclosure(): void {
    const { pack } = this.worldContext;
    pack.cells.enclosure = this.calculateEnclosure(pack.cells.i.length);
    this.applyOceanCurrentEnclosure();
  }

  /**
   * define feature groups (ocean, sea, gulf, continent, island, isle, freshwater lake, salt lake, etc.)
   */
  defineGroups() {
    const { grid, pack } = this.worldContext;
    const gridCellsNumber = grid.cells.i.length;
    const OCEAN_MIN_SIZE = gridCellsNumber * FeatureSizeRatio.OCEAN_MIN;
    const SEA_MIN_SIZE = gridCellsNumber * FeatureSizeRatio.SEA_MIN;
    const CONTINENT_MIN_SIZE = gridCellsNumber * FeatureSizeRatio.CONTINENT_MIN;
    const ISLAND_MIN_SIZE = gridCellsNumber * FeatureSizeRatio.ISLAND_MIN;

    const defineIslandGroup = (feature: PackedGraphFeature) => {
      const prevFeature = pack.features[pack.cells.f[feature.firstCell - 1]];
      if (prevFeature && prevFeature.type === "lake") return "lake_island";
      if (feature.cells > CONTINENT_MIN_SIZE) return "continent";
      if (feature.cells > ISLAND_MIN_SIZE) return "island";
      return "isle";
    };

    const defineOceanGroup = (feature: PackedGraphFeature) => {
      if (feature.cells > OCEAN_MIN_SIZE) return "ocean";
      if (feature.cells > SEA_MIN_SIZE) return "sea";
      return "gulf";
    };

    const defineLakeGroup = (feature: PackedGraphFeature) => {
      if (feature.temp < TemperatureThreshold.FROZEN_LAKE_TEMP) return "frozen";
      if (feature.height > HeightThreshold.LAVA_LAKE_HEIGHT && feature.cells < 10 && feature.firstCell % 10 === 0)
        return "lava";

      if (!feature.inlets && !feature.outlet) {
        if (feature.evaporation > feature.flux * 4) return "dry";
        if (feature.cells < 3 && feature.firstCell % 10 === 0) return "sinkhole";
      }

      if (!feature.outlet && feature.evaporation > feature.flux) return "salt";

      return "freshwater";
    };

    const defineGroup = (feature: PackedGraphFeature) => {
      if (feature.type === "island") return defineIslandGroup(feature);
      if (feature.type === "ocean") return defineOceanGroup(feature);
      if (feature.type === "lake") return defineLakeGroup(feature);
      throw new Error(`Markup: unknown feature type ${feature.type}`);
    };

    for (const feature of pack.features) {
      if (!feature || feature.type === "ocean") continue;

      if (feature.type === "lake") feature.height = Lakes.getHeight(feature);
      feature.group = defineGroup(feature);
    }
  }
}

export const Features = new FeatureModule();

export const NON_NAVIGABLE_LAKE_GROUPS = new Set(["dry", "frozen", "lava"]);
