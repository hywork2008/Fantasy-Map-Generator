import type { FocusScope } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { getFocusViewState } from "../store/focusViewState";
import type { Province, State } from "../types/models";
import { highlightElement } from "./editors";
import { drawLayers } from "./layers";

/**
 * Narrows rendering to a single state or province: builds the cell-id scope, points every
 * renderer at it via viewContext.focusScope, redraws, and zooms to the entity's bounds.
 * The rest of pack/grid is left untouched — this is a view-only restriction.
 */
export function enterFocus(kind: "state" | "province", id: number): void {
  const { pack } = worldContext;
  const { cells } = pack;

  const cellIds = new Set<number>();
  const gridCellIds = new Set<number>();
  for (const i of cells.i) {
    const matches = kind === "state" ? cells.state[i] === id : cells.province[i] === id;
    if (!matches) continue;
    cellIds.add(i);
    gridCellIds.add(cells.g[i]);
  }

  const stateId = kind === "state" ? id : (pack.provinces[id] as Province).state;
  const label = kind === "state" ? (pack.states[id] as State).name : (pack.provinces[id] as Province).name;

  const focusScope: FocusScope = { kind, id, stateId, cellIds, gridCellIds, label };
  viewContext.focusScope = focusScope;
  getFocusViewState().setFocus(kind, id, label);

  drawLayers();

  const element = document.getElementById(kind === "state" ? `state${id}` : `province${id}`);
  if (element) highlightElement(element, 4);
}

/** Clears the focus scope and redraws the full map. */
export function exitFocus(): void {
  viewContext.focusScope = null;
  getFocusViewState().clearFocus();
  drawLayers();
}

// Focus is view-only session state — never carried over into a freshly loaded map.
document.addEventListener("fmg:map-layers-reinitialized", () => {
  viewContext.focusScope = null;
  getFocusViewState().clearFocus();
});
