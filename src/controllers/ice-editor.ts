import { type D3DragEvent, drag, pointer, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Ice } from "../generators/ice";
import { redrawGlacier, redrawIceberg } from "../renderers/index";
import { viewLayerService as view } from "../services/viewLayerService";
import { elSelected, setElSelected } from "../store/editorState";
import { getIceEditorState, setIceEditorState } from "../store/iceEditorState";
import type { IceIceberg } from "../types/models";
import { closeDialog, openConfirm } from "../ui/dialogs/dialogService";
import { findGridCell, parseTransform } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";
import { interactionManager } from "./interactionManager";
import { toggleIce } from "./layers";
import { editStyle } from "./style";

let worldContext: WorldContext;
let appServices: AppServices;

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

function randomizeShape(): void {
  const { selectedId } = getIceEditorState();
  if (selectedId === null) return;
  Ice.randomizeIcebergShape(selectedId);
  redrawIceberg(worldContext, viewContext, appServices, selectedId);
}

function changeSize(newSize: number): void {
  const { selectedId } = getIceEditorState();
  if (selectedId === null) return;
  setIceEditorState({ size: newSize });
  Ice.changeIcebergSize(selectedId, newSize);
  redrawIceberg(worldContext, viewContext, appServices, selectedId);
}

function addIcebergOnClick(this: SVGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const i = findGridCell(x, y, worldContext.grid);
  const { size } = getIceEditorState();

  const id = Ice.addIceberg(i, size);
  redrawIceberg(worldContext, viewContext, appServices, id);

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
      const removedType = Ice.removeIce(selectedId);
      if (removedType === "glacier") redrawGlacier(worldContext, viewContext, appServices, selectedId);
      else if (removedType === "iceberg") redrawIceberg(worldContext, viewContext, appServices, selectedId);
      closeIceEditor();
    }
  });
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
