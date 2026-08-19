import Alea from "alea";
import { range as d3Range, leastIndex, mean } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { heightmapTemplates } from "../data";
import { HeightmapConstants, HeightThreshold, VolcanoConstants } from "../data/constants";
import { type EarthRegion, getEarthRegion } from "../data/earthRegions";
import { useOptionsState } from "../store/optionsState";
import type { Grid } from "../types/Grid";
import { createTypedArray, findGridCell, getNumberInRange, lim, minmax, P, rand } from "../utils";
import { ERROR, TIME } from "../utils/debug";
import { buildEarthRegionHeights } from "./earthRegionHeightmap";

type Tool = "Hill" | "Pit" | "Range" | "Trough" | "Strait" | "Mask" | "Invert" | "Add" | "Multiply" | "Smooth";

/** PNG-precreated path only. Earth regions do not use image lightness. */
export function heightFromImageLightness(lightness: number): number {
  const powered =
    lightness < HeightmapConstants.IMAGE_WATER_THRESHOLD
      ? lightness
      : HeightmapConstants.IMAGE_WATER_THRESHOLD + (lightness - HeightmapConstants.IMAGE_WATER_THRESHOLD) ** 0.8;
  return minmax(
    Math.floor(powered * HeightThreshold.HEIGHT_MAX),
    HeightThreshold.HEIGHT_MIN,
    HeightThreshold.HEIGHT_MAX
  );
}

/** A single-Hill placement tagged as a volcano, awaiting HeightmapModule.finalizeVolcanoes(). */
interface PendingVolcano {
  /** Grid cell id of the hill's seed/summit cell. */
  peakCell: number;
  /** Rolled "active" (magma core) vs. dormant (bare cone / crater lake) — see volcanoActiveChance. */
  active: boolean;
  /** The Hill call's own flood-fill decay field, captured before any later template step
   * (Smooth/Mask/Multiply/further Hills) can blur it — see finalizeVolcanoes(). */
  change: Uint8Array;
}

class HeightmapModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  grid: Grid | null = null;
  heights: Uint8Array | null = null;
  blobPower: number = 0;
  linePower: number = 0;
  /** Options → Generation "Volcanism chance" / "Active volcano chance" (0-100), snapshotted
   * once per setGraph() so a mid-generation options change can't affect an in-flight run. */
  private volcanismChance: number = 0;
  private volcanoActiveChance: number = 0;
  /** Hills tagged as volcanoes during this template run, resolved by finalizeVolcanoes(). */
  private pendingVolcanoes: PendingVolcano[] = [];

  private clearData() {
    this.heights = null;
    this.grid = null;
  }

  private getBlobPower(cells: number): number {
    const blobPowerMap: Record<number, number> = {
      1000: 0.93,
      2000: 0.95,
      5000: 0.97,
      10000: 0.98,
      20000: 0.99,
      30000: 0.991,
      40000: 0.993,
      50000: 0.994,
      60000: 0.995,
      70000: 0.9955,
      80000: 0.996,
      90000: 0.9964,
      100000: 0.9973
    };
    return blobPowerMap[cells] || 0.98;
  }

  private getLinePower(cells: number): number {
    const linePowerMap: Record<number, number> = {
      1000: 0.75,
      2000: 0.77,
      5000: 0.79,
      10000: 0.81,
      20000: 0.82,
      30000: 0.83,
      40000: 0.84,
      50000: 0.86,
      60000: 0.87,
      70000: 0.88,
      80000: 0.91,
      90000: 0.92,
      100000: 0.93
    };

    return linePowerMap[cells] || 0.81;
  }

  private getPointInRange(range: string, length: number): number | undefined {
    if (typeof range !== "string") {
      ERROR && console.error("Range should be a string");
      return;
    }

    const min = parseInt(range.split("-")[0], 10) / 100 || 0;
    const max = parseInt(range.split("-")[1], 10) / 100 || min;
    return rand(min * length, max * length);
  }

  setGraph(graph: Grid) {
    const { cellsDesired, cells, points } = graph;
    this.heights = cells.h
      ? Uint8Array.from(cells.h)
      : (createTypedArray({
          maxValue: 100,
          length: points.length
        }) as Uint8Array);
    this.blobPower = this.getBlobPower(cellsDesired);
    this.linePower = this.getLinePower(cellsDesired);
    this.grid = graph;
    const options = useOptionsState.getState();
    this.volcanismChance = options.volcanismChance;
    this.volcanoActiveChance = options.volcanoActiveChance;
    this.pendingVolcanoes = [];
    // Always start from a clean slate, even when `graph`/`graph.cells` is the SAME object
    // reused from a prior run (main.ts's prepareGenerationStage only deletes `cells.h` when
    // reusing the grid, not cells.volcanic/volcanicActive). Without this, re-rolling with
    // volcanismChance lowered (or 0) left the previous run's volcano tags stranded on cells
    // finalizeVolcanoes() never revisits this time — the old volcano would never disappear.
    cells.volcanic = new Float32Array(this.heights.length);
    cells.volcanicActive = new Uint8Array(this.heights.length);
    graph.volcanoes = [];
  }

  addHill(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOneHill = () => {
      if (!this.heights || !this.grid) return;
      let limit = 0;
      let start: number;
      const h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, worldContext.graphWidth);
        const y = this.getPointInRange(rangeY, worldContext.graphHeight);
        if (x === undefined || y === undefined) return;
        start = findGridCell(x, y, this.grid);
        limit++;
      } while (
        this.heights[start] + h > HeightThreshold.HILL_MAX_HEIGHT &&
        limit < HeightmapConstants.PLACEMENT_ITER_LIMIT
      );

      const change = this.floodFillDecay(start, h);
      this.heights = this.heights.map((hh, i) => lim(hh + change[i]));
      this.registerVolcanoCandidate(desiredHillCount, h, start, change);
    };

    const desiredHillCount = getNumberInRange(count);
    for (let i = 0; i < desiredHillCount; i++) {
      addOneHill();
    }
  }

  /**
   * Radial flood-fill decay from `seedCell`, exactly matching the falloff addOneHill has always
   * used (same blobPower-driven exponential decay + per-cell jitter) — extracted so a synthetic
   * volcano candidate (registerFallbackVolcanoCandidate, not backed by a real Hill call) decays
   * with the same organic shape a real Hill placement would have produced.
   */
  private floodFillDecay(seedCell: number, seedValue: number): Uint8Array {
    if (!this.heights || !this.grid) return new Uint8Array(0);
    const change = new Uint8Array(this.heights.length);
    change[seedCell] = lim(seedValue);
    const queue = [seedCell];
    while (queue.length) {
      const q = queue.shift() as number;
      for (const c of this.grid.cells.c[q]) {
        if (change[c]) continue;
        change[c] =
          change[q] ** this.blobPower *
          (Math.random() * HeightmapConstants.JITTER_RANGE + HeightmapConstants.JITTER_MIN);
        if (change[c] > 1) queue.push(c);
      }
    }
    return change;
  }

  /**
   * A single, dominant Hill placement (count === 1, peak height >= VolcanoConstants.MIN_PEAK_
   * HEIGHT) is the heightmap's own signature for an isolated volcanic cone rather than a
   * stacked mountain range — templates that build ranges from many smaller Hill/Range calls
   * never reach this height in one placement. Deciding this at generation time (from the
   * operation's own parameters) instead of post-hoc from the final absolute height avoids
   * misclassifying an ordinary peak that merely ended up tall after several hills stacked.
   * Only queues the candidate; the actual crater carve / grid.cells.volcanic write happens in
   * finalizeVolcanoes(), after every remaining template step (Smooth/Mask/Multiply/further
   * Hills) has run — otherwise those could blur a sharp crater dip back into its surroundings.
   */
  private registerVolcanoCandidate(hillCount: number, peakHeight: number, peakCell: number, change: Uint8Array): void {
    if (hillCount !== 1 || peakHeight < VolcanoConstants.MIN_PEAK_HEIGHT) return;

    // Both rolls always happen — never short-circuited by the outcome of the first — so a
    // qualifying Hill call consumes exactly the same two Math.random() draws regardless of
    // volcanismChance/volcanoActiveChance's values. Every later template step (further Hills,
    // Smooth, Mask, Range prominences, ...) draws from the same seeded Math.random stream, so
    // if the draw count here depended on the outcome, changing either slider would silently
    // reshuffle all the *other* terrain too (any cell touched after this point in the
    // sequence) — not just where volcanoes are tagged.
    const becomesVolcano = Math.random() * 100 < this.volcanismChance;
    const active = Math.random() * 100 < this.volcanoActiveChance;
    if (!becomesVolcano) return;

    this.pendingVolcanoes.push({ peakCell, active, change });
  }

  /**
   * Called once, after every template step has run, only when registerVolcanoCandidate() never
   * found a single-dominant-Hill peak anywhere in the whole template (the common case — most
   * heightmap templates build their mountains from many stacked Hill/Range calls and never
   * produce that signature; see registerVolcanoCandidate). Without this fallback, "Volcanism
   * chance" silently did nothing on the majority of templates: 100% could still place zero
   * volcanoes depending purely on which template the seed happened to pick, which made the
   * option's behavior look arbitrary from seed to seed. Falls back to the map's single tallest
   * land cell — decayed with the same falloff shape a real Hill placement would have — so every
   * template has exactly one candidate to roll against volcanismChance/volcanoActiveChance, and
   * 0%/100% behave the same (none/one volcano) regardless of template.
   */
  private registerFallbackVolcanoCandidate(): void {
    if (!this.heights || !this.grid) return;

    let peakCell = -1;
    let peakHeight = -1;
    for (let cellId = 0; cellId < this.heights.length; cellId++) {
      if (this.heights[cellId] > peakHeight) {
        peakHeight = this.heights[cellId];
        peakCell = cellId;
      }
    }
    if (peakCell < 0 || peakHeight < VolcanoConstants.FALLBACK_MIN_PEAK_HEIGHT) return;

    // Same fixed-draw-count reasoning as registerVolcanoCandidate — though by this point
    // (after every template step) nothing downstream reads Math.random() anymore, so it no
    // longer matters for reshuffling other terrain; kept identical for consistency.
    const becomesVolcano = Math.random() * 100 < this.volcanismChance;
    const active = Math.random() * 100 < this.volcanoActiveChance;
    if (!becomesVolcano) return;

    const change = this.floodFillDecay(peakCell, peakHeight);
    this.pendingVolcanoes.push({ peakCell, active, change });
  }

  /**
   * Resolves every Hill placement queued by registerVolcanoCandidate() once the whole template
   * has finished running. Writes grid.cells.volcanic/volcanicActive directly (this.grid is the
   * same object as worldContext.grid — see setGraph()), mirroring how biomes.ts/draw-relief-
   * icons.ts already read grid.cells.temp/prec through the pack.cells.g back-reference rather
   * than a pack-local copy.
   *
   * Every tagged volcano gets its summit carved to HeightThreshold.WATER_MAX_HEIGHT - 1: the
   * exact same "gridCells.h[i] = 19" trick main.ts's addLakesInDeepDepressions() uses, so the
   * standard Features.markupGrid() pass that runs right after HeightmapGenerator.generate()
   * discovers it as an ordinary enclosed lake — no separate lake-creation code needed, the same
   * mechanism that already turns a template's Pit depressions into lakes. Active vs dormant is
   * a lake-group / lava-flow distinction (lava lake + downhill ribbon vs freshwater crater),
   * not a difference in how the crater is cut.
   */
  private finalizeVolcanoes(): void {
    if (!this.heights || !this.grid || !this.pendingVolcanoes.length) return;
    // setGraph() always allocates these fresh for the current run — see its comment.
    const volcanic = this.grid.cells.volcanic!;
    const volcanicActive = this.grid.cells.volcanicActive!;
    const volcanoes = this.grid.volcanoes ?? [];

    for (const { peakCell, active, change } of this.pendingVolcanoes) {
      const peakChange = change[peakCell] || 1;
      for (let cellId = 0; cellId < change.length; cellId++) {
        if (!change[cellId]) continue;
        const intensity = Math.min(1, change[cellId] / peakChange);
        if (intensity > volcanic[cellId]) volcanic[cellId] = intensity;
        if (active && intensity >= VolcanoConstants.CORE_MIN_INTENSITY) volcanicActive[cellId] = 1;
      }

      this.heights[peakCell] = HeightThreshold.WATER_MAX_HEIGHT - 1;
      volcanoes.push({ peakCell, active });
    }

    this.grid.volcanoes = volcanoes;
    this.pendingVolcanoes = [];
  }

  addPit(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOnePit = () => {
      if (!this.heights || !this.grid) return;
      const used = new Uint8Array(this.heights.length);
      let limit = 0;
      let start: number;
      let h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, worldContext.graphWidth);
        const y = this.getPointInRange(rangeY, worldContext.graphHeight);
        if (x === undefined || y === undefined) return;
        start = findGridCell(x, y, this.grid);
        limit++;
      } while (
        this.heights[start] < HeightThreshold.WATER_MAX_HEIGHT &&
        limit < HeightmapConstants.PLACEMENT_ITER_LIMIT
      );

      const queue = [start];
      while (queue.length) {
        const q = queue.shift() as number;
        h = h ** this.blobPower * (Math.random() * HeightmapConstants.JITTER_RANGE + HeightmapConstants.JITTER_MIN);
        if (h < 1) return;

        this.grid!.cells.c[q].forEach((c: number) => {
          if (used[c] || this.heights === null) return;
          this.heights[c] = lim(
            this.heights[c] - h * (Math.random() * HeightmapConstants.JITTER_RANGE + HeightmapConstants.JITTER_MIN)
          );
          used[c] = 1;
          queue.push(c);
        });
      }
    };

    const desiredPitCount = getNumberInRange(count);
    for (let i = 0; i < desiredPitCount; i++) {
      addOnePit();
    }
  }

  addRange(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number
  ): void {
    if (!this.heights || !this.grid) return;

    const addOneRange = () => {
      if (!this.heights || !this.grid) return;

      // get main ridge
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = this.grid!.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid!.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            if (Math.random() > 0.85) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        const startX = this.getPointInRange(rangeX, worldContext.graphWidth) as number;
        const startY = this.getPointInRange(rangeY, worldContext.graphHeight) as number;

        let dist = 0;
        let limit = 0;
        let endY: number;
        let endX: number;

        do {
          endX = Math.random() * worldContext.graphWidth * 0.8 + worldContext.graphWidth * 0.1;
          endY = Math.random() * worldContext.graphHeight * 0.7 + worldContext.graphHeight * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while (
          (dist < worldContext.graphWidth / 8 || dist > worldContext.graphWidth / 3) &&
          limit < HeightmapConstants.PLACEMENT_ITER_LIMIT
        );

        startCellId = findGridCell(startX, startY, this.grid);
        endCellId = findGridCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      // add height to ridge and cells around
      let queue = range.slice();
      let i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          if (!this.heights) return;
          this.heights[i] = lim(this.heights[i] + h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          this.grid!.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur: number, d: number) => {
        if (d % HeightmapConstants.PROMINENCE_INTERVAL !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(
            this.grid!.cells.c[cur],
            (a: number, b: number) => this.heights![a] - this.heights![b]
          );
          if (index === undefined) continue;
          const min = this.grid!.cells.c[cur][index]; // downhill cell
          this.heights![min] = (this.heights![cur] * 2 + this.heights![min]) / 3;
          cur = min;
        }
      });
    };

    const desiredRangeCount = getNumberInRange(count);
    for (let i = 0; i < desiredRangeCount; i++) {
      addOneRange();
    }
  }

  addTrough(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number
  ): void {
    const addOneTrough = () => {
      if (!this.heights || !this.grid) return;

      // get main ridge
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = this.grid!.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid!.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            if (Math.random() > 0.8) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        let limit = 0;
        let startX: number;
        let startY: number;
        let dist = 0;
        let endX: number;
        let endY: number;
        do {
          startX = this.getPointInRange(rangeX, worldContext.graphWidth) as number;
          startY = this.getPointInRange(rangeY, worldContext.graphHeight) as number;
          startCellId = findGridCell(startX, startY, this.grid);
          limit++;
        } while (
          this.heights[startCellId] < HeightThreshold.WATER_MAX_HEIGHT &&
          limit < HeightmapConstants.PLACEMENT_ITER_LIMIT
        );

        limit = 0;
        do {
          endX = Math.random() * worldContext.graphWidth * 0.8 + worldContext.graphWidth * 0.1;
          endY = Math.random() * worldContext.graphHeight * 0.7 + worldContext.graphHeight * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while (
          (dist < worldContext.graphWidth / 8 || dist > worldContext.graphWidth / 2) &&
          limit < HeightmapConstants.PLACEMENT_ITER_LIMIT
        );

        endCellId = findGridCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      // add height to ridge and cells around
      let queue = range.slice(),
        i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          this.heights![i] = lim(this.heights![i] - h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          this.grid!.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur: number, d: number) => {
        if (d % HeightmapConstants.PROMINENCE_INTERVAL !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(
            this.grid!.cells.c[cur],
            (a: number, b: number) => this.heights![a] - this.heights![b]
          );
          if (index === undefined) continue;
          const min = this.grid!.cells.c[cur][index]; // downhill cell
          //debug.append("circle").attr("cx", p[min][0]).attr("cy", p[min][1]).attr("r", 1);
          this.heights![min] = (this.heights![cur] * 2 + this.heights![min]) / 3;
          cur = min;
        }
      });
    };

    const desiredTroughCount = getNumberInRange(count);
    for (let i = 0; i < desiredTroughCount; i++) {
      addOneTrough();
    }
  }

  addStrait(width: string, direction = "vertical"): void {
    if (!this.heights || !this.grid) return;
    const desiredWidth = Math.min(getNumberInRange(width), this.grid!.cellsX / 3);
    if (desiredWidth < 1 && P(desiredWidth)) return;
    const used = new Uint8Array(this.heights.length);
    const vert = direction === "vertical";
    const startX = vert ? Math.floor(Math.random() * worldContext.graphWidth * 0.4 + worldContext.graphWidth * 0.3) : 5;
    const startY = vert
      ? 5
      : Math.floor(Math.random() * worldContext.graphHeight * 0.4 + worldContext.graphHeight * 0.3);
    const endX = vert
      ? Math.floor(
          worldContext.graphWidth -
            startX -
            worldContext.graphWidth * 0.1 +
            Math.random() * worldContext.graphWidth * 0.2
        )
      : worldContext.graphWidth - 5;
    const endY = vert
      ? worldContext.graphHeight - 5
      : Math.floor(
          worldContext.graphHeight -
            startY -
            worldContext.graphHeight * 0.1 +
            Math.random() * worldContext.graphHeight * 0.2
        );

    const start = findGridCell(startX, startY, this.grid);
    const end = findGridCell(endX, endY, this.grid);

    const getRange = (cur: number, end: number) => {
      const range = [];
      const p = this.grid!.points;

      while (cur !== end) {
        let min = Infinity;
        this.grid!.cells.c[cur].forEach((e: number) => {
          let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
          if (Math.random() > 0.8) diff = diff / 2;
          if (diff < min) {
            min = diff;
            cur = e;
          }
        });
        range.push(cur);
      }

      return range;
    };
    let range = getRange(start, end);
    const query: number[] = [];

    const step = 0.1 / desiredWidth;

    for (let i = 0; i < desiredWidth; i++) {
      const remainingWidth = desiredWidth - i;
      const exp = 0.9 - step * remainingWidth;
      range.forEach((r: number) => {
        this.grid!.cells.c[r].forEach((e: number) => {
          if (used[e]) return;
          used[e] = 1;
          query.push(e);
          this.heights![e] **= exp;
          if (this.heights![e] > 100) this.heights![e] = 5;
        });
      });
      range = query.slice();
    }
  }

  modify(range: string, add: number, mult: number, power?: number): void {
    if (!this.heights) return;
    const min =
      range === "land"
        ? HeightThreshold.WATER_MAX_HEIGHT
        : range === "all"
          ? HeightThreshold.HEIGHT_MIN
          : +range.split("-")[0];
    const max = range === "land" || range === "all" ? HeightThreshold.HEIGHT_MAX : +range.split("-")[1];
    const isLand = min === HeightThreshold.WATER_MAX_HEIGHT;

    this.heights = this.heights.map(h => {
      if (h < min || h > max) return h;

      if (add) h = isLand ? Math.max(h + add, 20) : h + add;
      if (mult !== 1) h = isLand ? (h - 20) * mult + 20 : h * mult;
      if (power) h = isLand ? (h - 20) ** power + 20 : h ** power;
      return lim(h);
    });
  }

  smooth(fr = 2, add = 0): void {
    if (!this.heights || !this.grid) return;
    this.heights = this.heights.map((h, i) => {
      const a = [h];
      this.grid!.cells.c[i].forEach((c: number) => {
        a.push(this.heights![c]);
      });
      if (fr === 1) return (mean(a) as number) + add;
      return lim((h * (fr - 1) + (mean(a) as number) + add) / fr);
    });
  }

  mask(power = 1): void {
    if (!this.heights || !this.grid) return;
    const fr = power ? Math.abs(power) : 1;

    this.heights = this.heights.map((h, i) => {
      const [x, y] = this.grid!.points[i];
      const nx = (2 * x) / worldContext.graphWidth - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / worldContext.graphHeight - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted, 0 is center, 1 is edge
      const masked = h * distance;
      return lim((h * (fr - 1) + masked) / fr);
    });
  }

  invert(count: number, axes: string): void {
    if (!P(count) || !this.heights || !this.grid) return;

    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = this.grid;

    const inverted = this.heights.map((_h: number, i: number) => {
      if (!this.heights) return 0;
      const x = i % cellsX;
      const y = Math.floor(i / cellsX);

      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedI = nx + ny * cellsX;
      return this.heights[invertedI];
    });

    this.heights = inverted;
  }

  addStep(tool: Tool, a2: string, a3: string, a4: string, a5: string): void {
    if (tool === "Hill") {
      this.addHill(a2, a3, a4, a5);
      return;
    }
    if (tool === "Pit") {
      this.addPit(a2, a3, a4, a5);
      return;
    }
    if (tool === "Range") {
      this.addRange(a2, a3, a4, a5);
      return;
    }
    if (tool === "Trough") {
      this.addTrough(a2, a3, a4, a5);
      return;
    }
    if (tool === "Strait") {
      this.addStrait(a2, a3);
      return;
    }
    if (tool === "Mask") {
      this.mask(+a2);
      return;
    }
    if (tool === "Invert") {
      this.invert(+a2, a3);
      return;
    }
    if (tool === "Add") {
      this.modify(a3, +a2, 1);
      return;
    }
    if (tool === "Multiply") {
      this.modify(a3, 0, +a2);
      return;
    }
    if (tool === "Smooth") {
      this.smooth(+a2);
      return;
    }
  }

  async generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    graph: Grid
  ): Promise<Uint8Array> {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { seed } = this.worldContext;
    TIME && console.time("defineHeightmap");
    const id = useOptionsState.getState().template;
    Math.random = Alea(seed);
    const isTemplate = id in heightmapTemplates;
    const earthRegion = getEarthRegion(id);

    const heights = isTemplate
      ? this.fromTemplate(graph, id)
      : earthRegion
        ? await this.fromEarthRegion(graph, earthRegion)
        : await this.fromPrecreated(graph, id);
    TIME && console.timeEnd("defineHeightmap");

    this.clearData();
    return heights as Uint8Array;
  }

  fromTemplate(graph: Grid, id: string): Uint8Array | null {
    const templateString = heightmapTemplates[id]?.template || "";
    const steps = templateString.split("\n");

    if (!steps.length) throw new Error(`Heightmap template: no steps. Template: ${id}. Steps: ${steps}`);
    this.setGraph(graph);

    for (const step of steps) {
      const elements = step.trim().split(" ");
      if (elements.length < 2) throw new Error(`Heightmap template: steps < 2. Template: ${id}. Step: ${elements}`);
      this.addStep(...(elements as [Tool, string, string, string, string]));
    }

    if (!this.pendingVolcanoes.length) this.registerFallbackVolcanoCandidate();
    this.finalizeVolcanoes();
    return this.heights;
  }

  private getHeightsFromImageData(imageData: Uint8ClampedArray): void {
    if (!this.heights) return;
    for (let i = 0; i < this.heights.length; i++) {
      this.heights[i] = heightFromImageLightness(imageData[i * 4] / 255);
    }
  }

  async fromEarthRegion(
    graph: Grid,
    region: EarthRegion,
    graphSize?: { width: number; height: number }
  ): Promise<Uint8Array> {
    this.setGraph(graph);
    const exponent = useOptionsState.getState().heightExponent;
    this.heights = await buildEarthRegionHeights(
      graph,
      region,
      graphSize?.width ?? this.worldContext.graphWidth,
      graphSize?.height ?? this.worldContext.graphHeight,
      exponent
    );
    return this.heights;
  }

  fromPrecreated(graph: Grid, id: string): Promise<Uint8Array> {
    return new Promise(resolve => {
      // create canvas where 1px corresponds to a cell
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      const { cellsX, cellsY } = graph;
      canvas.width = cellsX;
      canvas.height = cellsY;

      // load heightmap into image and render to canvas
      const img = new Image();
      img.src = `./heightmaps/${id}.png`;
      img.onload = () => {
        if (!ctx) {
          throw new Error("Could not get canvas context");
        }
        this.heights = this.heights || new Uint8Array(cellsX * cellsY);
        ctx.drawImage(img, 0, 0, cellsX, cellsY);
        const imageData = ctx.getImageData(0, 0, cellsX, cellsY);
        this.setGraph(graph);
        this.getHeightsFromImageData(imageData.data);
        canvas.remove();
        img.remove();
        resolve(this.heights);
      };
    });
  }

  getHeights() {
    return this.heights;
  }
}

export type { HeightmapModule };
export const HeightmapGenerator = new HeightmapModule();
