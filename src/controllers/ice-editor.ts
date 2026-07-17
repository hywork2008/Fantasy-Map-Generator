import { type D3DragEvent, drag, pointer, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { redrawGlacier, redrawIceberg } from "../renderers/index";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { elSelected, setElSelected } from "../store/editorState";
import { getIceEditorState, setIceEditorState } from "../store/iceEditorState";
import type { IceIceberg } from "../types/models";
import { closeDialog, openConfirm } from "../ui/dialogs/dialogService";
import { findGridCell, parseTransform } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { layerIsOn } from "../utils/nodeUtils";
import { interactionManager } from "./interactionManager";
import { drawLayers, toggleIce } from "./layers";
import { editStyle } from "./style";

let worldContext: WorldContext;
let appServices: AppServices;

let _webglDragOffsetX = 0;
let _webglDragOffsetY = 0;

/** Opens the Ice Editor from a WebGL pick without requiring a hidden SVG mirror element. */
export function editIceById(id: number, isGlacier: boolean): void {
  if (view.customization) return;
  const iceElement = worldContext.pack.ice.find(element => element.i === id);
  if (!iceElement || iceElement.type !== (isGlacier ? "glacier" : "iceberg")) return;

  if (!layerIsOn("toggleIce")) toggleIce();
  setIceEditorState({
    isOpen: true,
    type: isGlacier ? "Glacier" : "Iceberg",
    selectedId: id,
    size: isGlacier ? 1 : ((iceElement as IceIceberg).size ?? 1),
    isAdding: false
  });
}

export function editIce(element: SVGElement): void {
  if (view.customization) return;
  if (elSelected && element === elSelected.node()) return;

  if (!layerIsOn("toggleIce")) toggleIce();

  setElSelected(select(element as Element));
  const id = +elSelected!.attr("data-id");
  const iceElement = worldContext.pack.ice.find(el => el.i === id);
  const isGlacier = elSelected!.attr("type") === "glacier";
  const type = isGlacier ? "Glacier" : "Iceberg";
  const size = isGlacier ? 1 : ((iceElement as IceIceberg)?.size ?? 1);

  let _idx = 0,
    _idy = 0,
    _iceId = 0;

  function dragElementStart(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    _iceId = +elSelected!.attr("data-id");
    const initialTransform = parseTransform(this.getAttribute("transform") ?? "");
    _idx = +initialTransform[0] - event.x;
    _idy = +initialTransform[1] - event.y;
  }

  function dragElementDrag(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    const x = event.x;
    const y = event.y;
    this.setAttribute("transform", `translate(${_idx + x},${_idy + y})`);
    const iceData = worldContext.pack.ice.find(el => el.i === _iceId);
    if (iceData) iceData.offset = [_idx + x, _idy + y];
  }

  view.ice
    .selectAll<SVGElement, unknown>("*")
    .classed("draggable", true)
    .call(drag<SVGElement, unknown>().on("start", dragElementStart).on("drag", dragElementDrag));

  setIceEditorState({
    isOpen: true,
    type,
    selectedId: id,
    size,
    isAdding: false
  });
}

/** Whether this glacier or iceberg is the one currently open in the Ice Editor. */
export function isDragTarget(iceId: number, isGlacier: boolean): boolean {
  const { isOpen, selectedId } = getIceEditorState();
  const ice = worldContext.pack.ice.find(item => item.i === iceId);
  return isOpen && selectedId === iceId && ice?.type === (isGlacier ? "glacier" : "iceberg");
}

/** Cheap check used before the WebGL renderer performs an additional pick for a drag gesture. */
export function hasDragTarget(): boolean {
  const { isOpen, selectedId } = getIceEditorState();
  return isOpen && selectedId !== null;
}

/** Captures the initial pointer-to-ice offset for a WebGL drag, matching the SVG d3-drag behavior. */
export function beginWebglIceDrag(iceId: number, coordinate: [number, number]): void {
  const ice = worldContext.pack.ice.find(item => item.i === iceId);
  if (!ice) return;
  _webglDragOffsetX = (ice.offset?.[0] ?? 0) - coordinate[0];
  _webglDragOffsetY = (ice.offset?.[1] ?? 0) - coordinate[1];
}

/** Moves an ice feature from a WebGL pointer coordinate and refreshes its deck.gl polygon. */
export function updateWebglIceDrag(iceId: number, coordinate: [number, number]): void {
  const ice = worldContext.pack.ice.find(item => item.i === iceId);
  if (!ice) return;
  ice.offset = [_webglDragOffsetX + coordinate[0], _webglDragOffsetY + coordinate[1]];
  drawLayers();
}

function randomizeShape(): void {
  const { selectedId } = getIceEditorState();
  if (selectedId === null) return;
  GenerationPipeline.Ice.randomizeIcebergShape(selectedId);
  redrawIceberg(worldContext, viewContext, appServices, selectedId);
  refreshWebglIceLayer();
}

function changeSize(newSize: number): void {
  const { selectedId } = getIceEditorState();
  if (selectedId === null) return;
  setIceEditorState({ size: newSize });
  GenerationPipeline.Ice.changeIcebergSize(selectedId, newSize);
  redrawIceberg(worldContext, viewContext, appServices, selectedId);
  refreshWebglIceLayer();
}

function addIcebergOnClick(this: SVGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const i = findGridCell(x, y, worldContext.grid);
  const { size } = getIceEditorState();

  const id = GenerationPipeline.Ice.addIceberg(i, size);
  redrawIceberg(worldContext, viewContext, appServices, id);
  refreshWebglIceLayer();

  if (event.shiftKey === false) toggleAdd();
}

function toggleAdd(): void {
  const { isAdding } = getIceEditorState();
  const nextIsAdding = !isAdding;
  setIceEditorState({ isAdding: nextIsAdding });

  if (nextIsAdding) {
    view.viewbox.style("cursor", "crosshair");
    interactionManager.setClickHandler(addIcebergOnClick);
    tip("Click on map to create an iceberg. Hold Shift to add multiple", true);
  } else {
    clearMainTip();
    interactionManager.resetClickHandler();
    view.viewbox.style("cursor", "default");
  }
}

function removeIce(): void {
  const { type, selectedId } = getIceEditorState();
  if (selectedId === null) return;

  openConfirm(`Are you sure you want to remove the ${type}?`, {
    title: `Remove ${type}`,
    confirm: "Remove",
    onConfirm: () => {
      const removedType = GenerationPipeline.Ice.removeIce(selectedId);
      if (removedType === "glacier") redrawGlacier(worldContext, viewContext, appServices, selectedId);
      else if (removedType === "iceberg") redrawIceberg(worldContext, viewContext, appServices, selectedId);
      refreshWebglIceLayer();
      closeIceEditor();
    }
  });
}

function refreshWebglIceLayer(): void {
  if (viewContext.renderMode === "webglHybrid") drawLayers();
}

export function closeIceEditor(): void {
  setIceEditorState({ isOpen: false, isAdding: false });
  view.ice
    .selectAll<SVGElement, unknown>("*")
    .classed("draggable", false)
    .call(drag<SVGElement, unknown>().on("drag", null));
  clearMainTip();
  EditorBus.unselect();
  closeDialog("iceEditor");
}

export const iceEditorActions = {
  randomizeShape,
  changeSize,
  toggleAdd,
  removeIce,
  openStyleEditor: () => editStyle("ice")
};

export function initIceEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}
