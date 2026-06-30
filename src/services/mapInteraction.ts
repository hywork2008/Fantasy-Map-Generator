import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { useToastStore } from "../store/toastStore";
import { debounce } from "../utils/commonUtils";
import { isDialogVisible } from "../utils/domUtils";
import { findCell, findGridCell } from "../utils/graphUtils";
import { updateCellInfo } from "./cellInfoService";
import { showMainTip, showMapTooltip, showNotes } from "./tooltipService";

export const onMouseMove = debounce(handleMouseMove as (event: MouseEvent) => void, 100);
export function handleMouseMove(this: Element, event: MouseEvent): void {
  const point = d3.pointer(event, this) as [number, number];
  const i = findCell(point[0], point[1]);
  if (i === undefined) return;

  showNotes(event);
  const gridCell = findGridCell(point[0], point[1], worldContext.grid);
  const store = useToastStore.getState();
  const hasMainToast = store.getMainToast() !== null;

  if (hasMainToast) showMainTip();
  else showMapTooltip(point, event, i, gridCell);

  if (isDialogVisible("cellInfo")) {
    const cellInfoEl = document.getElementById("cellInfo") as HTMLElement | null;
    if (cellInfoEl) updateCellInfo(point, i, gridCell);
  }
}
