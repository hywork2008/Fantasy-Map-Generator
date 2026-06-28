import { pointer } from "d3";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Rivers } from "../generators/river-generator";
import { modules } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { useRiverCreatorStore } from "../store/riverCreatorStore";
import { closeDialog, closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { findCell, last, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";
import { interactionManager } from "./interactionManager";
import { toggleCells, toggleRivers } from "./layers";
import { cellsDensityMap } from "./options";

let worldContext: WorldContext;

export function createRiver(): void {
  if (viewContext.customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRivers")) toggleRivers();

  document.getElementById("toggleCells")!.dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  tip("Click to add river point, click again to remove", true);
  viewContext.debug.append("g").attr("id", "controlCells");
  viewContext.viewbox.style("cursor", "crosshair");
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
    viewContext.debug
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

  const riverId = Rivers.getNextId(rivers);
  const parent = cells.r[last(riverCells)] || riverId;

  riverCells.forEach(cell => {
    if (!cells.r[cell]) cells.r[cell] = riverId;
  });

  const source = riverCells[0];
  const mouth = parent === riverId ? last(riverCells) : riverCells[riverCells.length - 2];
  const sourceWidth = Rivers.getSourceWidth(cells.fl[source]);
  const defaultWidthFactor = rn(1 / ((cellsDensityMap[useOptionsState.getState().points] ?? 10000) / 10000) ** 0.25, 2);
  const widthFactor = 1.2 * defaultWidthFactor;

  const meanderedPoints = Rivers.addMeandering(riverCells);

  const discharge = cells.fl[mouth];
  const length = Rivers.getApproximateLength(meanderedPoints.map(([x, y]): [number, number] => [x, y]));
  const width = Rivers.getWidth(
    Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );
  const name = Rivers.getName(mouth);
  const basin = Rivers.getBasin(parent);

  rivers.push({
    i: riverId,
    source,
    mouth,
    discharge,
    length,
    width,
    widthFactor,
    sourceWidth,
    parent,
    cells: riverCells,
    basin,
    name,
    type: "River"
  });
  const id = `river${riverId}`;

  viewContext.viewbox
    .select("#rivers")
    .append("path")
    .attr("id", id)
    .attr("d", Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth));

  EditorBus.editRiver(id);
  closeRiverCreator();
}

export function closeRiverCreator(): void {
  viewContext.debug.select("#controlCells").remove();
  EditorBus.restoreDefaultEvents();
  clearMainTip();

  const forced = +document.getElementById("toggleCells")!.dataset.forced!;
  document.getElementById("toggleCells")!.dataset.forced = "0";
  if (forced && layerIsOn("toggleCells")) toggleCells();
  closeDialog("riverCreator");
  modules.createRiver = false;
}

export function initRiversCreator(wc: WorldContext) {
  worldContext = wc;
}
