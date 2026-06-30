import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { GenerationPipeline } from "../services/generationPipeline";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { type BrushMode, setHeightmapEditorState, useHeightmapEditorState } from "../store/heightmapEditorState";
import { findGridAll, findGridCell, minmax, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { interactionManager } from "./interactionManager";

export interface HeightmapBrushesCallbacks {
  updateHeightmap: () => void;
  mockHeightmapSelection: (selection: number[]) => void;
}

let localCallbacks: HeightmapBrushesCallbacks;

export function setupBrushes(callbacks: HeightmapBrushesCallbacks): void {
  localCallbacks = callbacks;
}

export function exitBrushMode(): void {
  view.viewbox.style("cursor", "default").on(".drag", null);
  interactionManager.resetClickHandler();
  view.debug.selectAll(".lineCircle").remove();
  EditorBus.removeCircle();
}

export function toggleBrushMode(mode: string): void {
  const currentMode = useHeightmapEditorState.getState().brushMode;
  if (currentMode === mode) {
    exitBrushMode();
    setHeightmapEditorState({ brushMode: null });
    return;
  }
  exitBrushMode();
  setHeightmapEditorState({ brushMode: mode as BrushMode });

  if (mode === "brushLine") {
    view.viewbox.style("cursor", "crosshair");
    interactionManager.setClickHandler(placeLinearFeature);
  } else if (mode === "brushFill") {
    view.viewbox.style("cursor", "crosshair");
    interactionManager.setClickHandler(applyFillBrush);
  } else {
    view.viewbox.style("cursor", "crosshair").call(
      d3
        .drag<SVGGElement, unknown>()
        .on("start", dragBrushStart)
        .on("drag", dragBrushDrag)
        .on("end", () => localCallbacks.updateHeightmap())
    );
  }
}

function placeLinearFeature(this: SVGElement, event: MouseEvent): void {
  const [x, y] = d3.pointer(event, this);
  const toCell = findGridCell(x, y, worldContext.grid);

  const lineCircle = view.debug.selectAll(".lineCircle");
  if (!lineCircle.size()) {
    view.debug.append("line").attr("id", "brushCircle").attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y);
    view.debug
      .append("circle")
      .attr("data-cell", toCell)
      .attr("class", "lineCircle")
      .attr("r", 6)
      .attr("cx", x)
      .attr("cy", y)
      .attr("fill", "yellow")
      .attr("stroke", "#333")
      .attr("stroke-width", 2);
    return;
  }

  const fromCell = +lineCircle.attr("data-cell");
  view.debug.selectAll("*").remove();
  const power = useHeightmapEditorState.getState().linePower;
  if (power === 0) {
    tip("Power should not be zero", false, "error");
    return;
  }

  const heights = worldContext.grid.cells.h as Uint8Array;
  const operation =
    power > 0
      ? GenerationPipeline.HeightmapGenerator.addRange.bind(GenerationPipeline.HeightmapGenerator)
      : GenerationPipeline.HeightmapGenerator.addTrough.bind(GenerationPipeline.HeightmapGenerator);
  GenerationPipeline.HeightmapGenerator.setGraph(worldContext.grid);
  operation("1", String(Math.abs(power)), "", "", fromCell, toCell);
  const changedHeights = GenerationPipeline.HeightmapGenerator.getHeights() as Uint8Array;

  const selection: number[] = [];
  const filter = useHeightmapEditorState.getState().cellTypeFilter;
  for (let i = 0; i < heights.length; i++) {
    if (changedHeights[i] === heights[i]) continue;
    if (filter === "land" && heights[i] < 20) continue;
    if (filter === "water" && heights[i] >= 20) continue;
    heights[i] = changedHeights[i];
    selection.push(i);
  }
  localCallbacks.mockHeightmapSelection(selection);
  localCallbacks.updateHeightmap();
}

function applyFillBrush(this: SVGElement, event: MouseEvent): void {
  const [x, y] = d3.pointer(event, this);
  const start = findGridCell(x, y, worldContext.grid);
  const startHeight = worldContext.grid.cells.h[start];
  const isWaterFill = startHeight < 20;
  const MIN_FILL_CELLS = 3;
  const filter = useHeightmapEditorState.getState().cellTypeFilter;

  if (filter === "water") {
    tip("Fill brush is not available with 'only water cells' filter", false, "error");
    return;
  }
  if (filter === "land" && isWaterFill) {
    tip("Land filter is active, water areas cannot be filled", false, "error");
    return;
  }

  const { selection, reachedBorder } = collectFillSelection(start, isWaterFill, startHeight);
  if (selection.length < MIN_FILL_CELLS) {
    tip("No enclosed area found to fill", false, "error");
    return;
  }
  if (isWaterFill && reachedBorder) {
    tip("Selected water area is open to map border and is not enclosed", false, "error");
    return;
  }

  const changed = applyConeToSelection(selection, isWaterFill, startHeight);
  if (!changed.length) return;
  localCallbacks.mockHeightmapSelection(changed);
  localCallbacks.updateHeightmap();
}

function collectFillSelection(
  start: number,
  isWaterFill: boolean,
  targetHeight: number
): { selection: number[]; reachedBorder: boolean } {
  const { h: heights, c: neighbors, i: cells } = worldContext.grid.cells;
  const visited = new Uint8Array(cells.length);
  const stack = [start];
  const selection: number[] = [];
  let reachedBorder = false;

  while (stack.length) {
    const cell = stack.pop()!;
    if (visited[cell]) continue;
    visited[cell] = 1;
    if (!matchesFillTarget(heights[cell], isWaterFill, targetHeight)) continue;
    selection.push(cell);
    if (worldContext.grid.cells.b[cell]) reachedBorder = true;
    (neighbors[cell] as number[]).forEach((next: number) => {
      if (!visited[next]) stack.push(next);
    });
  }
  return { selection, reachedBorder };
}

function matchesFillTarget(height: number, isWaterFill: boolean, targetHeight: number): boolean {
  return isWaterFill ? height < 20 : height === targetHeight;
}

function applyConeToSelection(selection: number[], isWaterFill: boolean, targetHeight: number): number[] {
  const power = useHeightmapEditorState.getState().brushPower * 10;
  const { h: heights, c: neighbors, i: cells } = worldContext.grid.cells;
  const inSelection = new Uint8Array(cells.length);
  const edgeDistance = new Uint16Array(cells.length);
  const changed: number[] = [];

  selection.forEach(cell => {
    inSelection[cell] = 1;
  });

  const queue: number[] = [];
  let head = 0;
  selection.forEach(cell => {
    const isEdgeCell = (neighbors[cell] as number[]).some((next: number) => !inSelection[next]);
    if (!isEdgeCell) return;
    inSelection[cell] = 2;
    queue.push(cell);
  });

  while (head < queue.length) {
    const cell = queue[head++];
    const nextDistance = edgeDistance[cell] + 1;
    (neighbors[cell] as number[]).forEach((next: number) => {
      if (inSelection[next] !== 1) return;
      inSelection[next] = 2;
      edgeDistance[next] = nextDistance;
      queue.push(next);
    });
  }

  const maxDist = d3.max(selection, cell => edgeDistance[cell]) ?? 0;
  const baseHeight = isWaterFill ? 20 : targetHeight;

  selection.forEach(cell => {
    const ratio = maxDist ? edgeDistance[cell] / maxDist : 1;
    const rise = Math.max(1, Math.round(power * ratio));
    const nextHeight = minmax(baseHeight + rise, 0, 100);
    if (nextHeight === heights[cell]) return;
    heights[cell] = nextHeight;
    changed.push(cell);
  });
  return changed;
}

let _hbStart = 0;

function dragBrushStart(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  const [x, y] = d3.pointer(event, this);
  _hbStart = findGridCell(x, y, worldContext.grid);
}

function dragBrushDrag(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  const state = useHeightmapEditorState.getState();
  const r = state.brushRadius;
  const p = d3.pointer(event, this);
  EditorBus.moveCircle(p[0], p[1], r);
  if (~~event.sourceEvent.timeStamp % 5 !== 0) return;
  const inRadius = findGridAll(p[0], p[1], r, worldContext.grid);
  let sel = inRadius;
  if (state.cellTypeFilter === "land") sel = inRadius.filter(i => worldContext.grid.cells.h[i] >= 20);
  else if (state.cellTypeFilter === "water") sel = inRadius.filter(i => worldContext.grid.cells.h[i] < 20);
  if (sel?.length) changeHeightForSelection(sel, _hbStart);
}

function changeHeightForSelection(selection: number[], start: number): void {
  const state = useHeightmapEditorState.getState();
  const power = state.brushPower;
  const interp = d3.interpolateRound(power, 1);
  const land = state.cellTypeFilter === "land";
  const ocean = state.cellTypeFilter === "water";
  const lim = (v: number) => minmax(v, land ? 20 : 0, ocean ? 19 : 100);
  const heights = worldContext.grid.cells.h as Uint8Array;
  const brush = state.brushMode;

  if (brush === "brushRaise")
    selection.forEach(i => {
      heights[i] = !ocean && heights[i] < 20 ? 20 : lim(heights[i] + power);
    });
  else if (brush === "brushElevate")
    selection.forEach((i, d) => {
      heights[i] = lim(heights[i] + interp(d / Math.max(selection.length - 1, 1)));
    });
  else if (brush === "brushLower")
    selection.forEach(i => {
      heights[i] = lim(heights[i] - power);
    });
  else if (brush === "brushDepress")
    selection.forEach((i, d) => {
      heights[i] = lim(heights[i] - interp(d / Math.max(selection.length - 1, 1)));
    });
  else if (brush === "brushAlign")
    selection.forEach(i => {
      heights[i] = lim(heights[start]);
    });
  else if (brush === "brushSmooth")
    selection.forEach(i => {
      heights[i] = rn(
        ((d3.mean(
          (worldContext.grid.cells.c[i] as number[])
            .filter(c => (land ? heights[c] >= 20 : ocean ? heights[c] < 20 : true))
            .map(c => heights[c])
        ) ?? heights[i]) +
          heights[i] * (10 - power) +
          0.6) /
          (11 - power),
        1
      );
    });
  else if (brush === "brushDisrupt")
    selection.forEach(i => {
      heights[i] = heights[i] < 15 ? heights[i] : lim(heights[i] + power / 1.6 - Math.random() * power);
    });

  localCallbacks.mockHeightmapSelection(selection);
}

export function rescale(v: number): void {
  const state = useHeightmapEditorState.getState();
  const land = state.cellTypeFilter === "land";
  const ocean = state.cellTypeFilter === "water";
  const lim = (val: number) => minmax(val, 0, 100);
  worldContext.grid.cells.h = (worldContext.grid.cells.h as Uint8Array).map(h => {
    if (land && (h < 20 || h + v < 20)) return h;
    if (ocean && h >= 20) return h;
    const newH = lim(h + v);
    return ocean ? Math.min(newH, 19) : newH;
  });
  localCallbacks.updateHeightmap();
  setHeightmapEditorState({ rescaleValue: 0 });
}

export function rescaleWithCondition(): void {
  const state = useHeightmapEditorState.getState();
  const range_ = `${state.rescaleLower}-${state.rescaleHigher}`;
  const operator = state.rescaleSign;
  const operand = state.rescaleModifier;
  if (Number.isNaN(operand)) {
    tip("Operand should be a number", false, "error");
    return;
  }
  if ((operator === "add" || operator === "subtract") && !Number.isInteger(operand)) {
    tip("Operand should be an integer", false, "error");
    return;
  }

  GenerationPipeline.HeightmapGenerator.setGraph(worldContext.grid);
  if (operator === "multiply") GenerationPipeline.HeightmapGenerator.modify(range_, 0, operand, 0);
  else if (operator === "divide") GenerationPipeline.HeightmapGenerator.modify(range_, 0, 1 / operand, 0);
  else if (operator === "add") GenerationPipeline.HeightmapGenerator.modify(range_, operand, 1, 0);
  else if (operator === "subtract") GenerationPipeline.HeightmapGenerator.modify(range_, -1 * operand, 1, 0);
  else if (operator === "exponent") GenerationPipeline.HeightmapGenerator.modify(range_, 0, 1, operand);

  worldContext.grid.cells.h = GenerationPipeline.HeightmapGenerator.getHeights()!;
  localCallbacks.updateHeightmap();
}

export function smoothAllHeights(): void {
  GenerationPipeline.HeightmapGenerator.setGraph(worldContext.grid);
  GenerationPipeline.HeightmapGenerator.smooth(4, 1.5);
  worldContext.grid.cells.h = GenerationPipeline.HeightmapGenerator.getHeights()!;
  localCallbacks.updateHeightmap();
}

export function disruptAllHeights(): void {
  worldContext.grid.cells.h = (worldContext.grid.cells.h as Uint8Array).map(h =>
    h < 15 ? h : minmax(h + 2.5 - Math.random() * 4, 0, 100)
  );
  localCallbacks.updateHeightmap();
}

export function startFromScratch(): void {
  const state = useHeightmapEditorState.getState();
  if (state.cellTypeFilter === "land") {
    tip("Not allowed when 'only land cells' filter is set", false, "error");
    return;
  }
  if (state.cellTypeFilter === "water") {
    tip("Not allowed when 'only water cells' filter is set", false, "error");
    return;
  }
  const someHeights = (worldContext.grid.cells.h as Uint8Array).some(h => h);
  if (!someHeights) {
    tip("Heightmap is already cleared, please do not click twice if not required", false, "error");
    return;
  }
  worldContext.grid.cells.h = new Uint8Array(worldContext.grid.cells.i.length);
  view.viewbox.select("#heights").selectAll("*").remove();
  localCallbacks.updateHeightmap();
}
