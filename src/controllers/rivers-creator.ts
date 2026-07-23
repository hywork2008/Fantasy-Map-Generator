import { pointer } from "d3";
import type { WorldContext } from "../context/worldContext";
import { createRiverCommand, setRiverFlux } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { useRiverCreatorStore } from "../store/riverCreatorStore";
import { closeDialog, closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { findCell, last, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { interactionManager } from "./interactionManager";
import { toggleCells, toggleRivers } from "./layers";
import { cellsDensityMap } from "./options";

let worldContext: WorldContext;
let cellsWasForced = false;

export function createRiver(): void {
  if (view.customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRivers")) toggleRivers();

  cellsWasForced = !layerIsOn("toggleCells");
  if (cellsWasForced) toggleCells();

  tip("Click to add river point, click again to remove", true);
  view.debug.append("g").attr("id", "controlCells");
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(onCellClick);

  const { setRiverCells } = useRiverCreatorStore.getState();
  setRiverCells([]);

  openDialog("riverCreator", {
    title: "Create River",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    onClose: closeRiverCreator
  });

  if (modules.createRiver) return;
  modules.createRiver = true;

  function onCellClick(this: SVGElement, event: MouseEvent): void {
    const [px, py] = pointer(event, this);
    const cell = findCell(px, py);

    const { riverCells, removeCell, addCell } = useRiverCreatorStore.getState();
    if (riverCells.includes(cell)) {
      removeCell(cell);
      drawCells(useRiverCreatorStore.getState().riverCells);
    } else {
      addCell(cell);
      drawCells(useRiverCreatorStore.getState().riverCells);
    }
  }

  function drawCells(cells: number[]): void {
    view.debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(cells)
      .join("polygon")
      .attr("points", d => getPackPolygon(d, worldContext.pack).join(" "))
      .attr("class", "current");
  }
}

export function addRiver(): void {
  const riverCells = useRiverCreatorStore.getState().riverCells;
  const { rivers, cells } = worldContext.pack;
  if (riverCells.length < 2) {
    tip("Add at least 2 cells", false, "error");
    return;
  }

  const riverId = GenerationPipeline.Rivers.getNextId(rivers);
  const parent = cells.r[last(riverCells)] || riverId;

  const source = riverCells[0];
  const mouth = parent === riverId ? last(riverCells) : riverCells[riverCells.length - 2];
  const sourceWidth = GenerationPipeline.Rivers.getSourceWidth(cells.fl[source]);
  const defaultWidthFactor = rn(1 / ((cellsDensityMap[useOptionsState.getState().points] ?? 10000) / 10000) ** 0.25, 2);
  const widthFactor = 1.2 * defaultWidthFactor;

  const meanderedPoints = GenerationPipeline.Rivers.addMeandering(riverCells);

  const discharge = cells.fl[mouth];
  const length = GenerationPipeline.Rivers.getApproximateLength(
    meanderedPoints.map(([x, y]): [number, number] => [x, y])
  );
  const width = GenerationPipeline.Rivers.getWidth(
    GenerationPipeline.Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );
  const name = GenerationPipeline.Rivers.getName(mouth);
  const basin = GenerationPipeline.Rivers.getBasin(parent);

  const commit = createRiverCommand({
    river: {
      i: riverId,
      source,
      mouth,
      discharge,
      length,
      width,
      widthFactor,
      sourceWidth,
      parent,
      cells: [...riverCells],
      basin,
      name,
      type: "River"
    }
  });
  if (!commit) return;
  const id = `river${riverId}`;

  view.viewbox
    .select("#rivers")
    .append("path")
    .attr("id", id)
    .attr("d", GenerationPipeline.Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth));

  EditorBus.editRiver(id);
  closeRiverCreator();
}

export function closeRiverCreator(): void {
  view.debug.select("#controlCells").remove();
  EditorBus.restoreDefaultEvents();
  clearMainTip();

  if (cellsWasForced && layerIsOn("toggleCells")) toggleCells();
  cellsWasForced = false;
  closeDialog("riverCreator");
  modules.createRiver = false;
}

export function getCellFlux(cell: number): number {
  return worldContext.pack.cells.fl[cell] ?? 0;
}

export function setCellFlux(cell: number, value: number): void {
  setRiverFlux({ cellId: cell, value });
}

export function initRiversCreator(wc: WorldContext) {
  worldContext = wc;
}
