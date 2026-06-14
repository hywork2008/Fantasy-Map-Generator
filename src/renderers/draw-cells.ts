import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { ensureEl, getPackPolygon } from "../utils";
import { getGridPolygon } from "../utils/graphUtils";
import type { IRenderer } from "./core/IRenderer";

export const CellsRenderer: IRenderer = {
  id: "cells",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    const { pack, grid } = worldContext;
    const { customization } = viewContext;
    const cellsData = customization === 1 ? Array.from(grid.cells.i) : Array.from(pack.cells.i);
    const polygon =
      customization === 1 ? (i: number) => getGridPolygon(i, grid) : (i: number) => getPackPolygon(i, pack);
    const paths = cellsData.map(i => `M${polygon(i)}`);
    ensureEl("cells").innerHTML = `<path d="${paths.join("")}" />`;
  },

  clear(_viewContext: Readonly<ViewContext>): void {
    ensureEl("cells").innerHTML = "";
  }
};
