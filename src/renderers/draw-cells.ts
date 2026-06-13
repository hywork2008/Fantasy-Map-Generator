import { worldContext } from "../context/worldContext";
import { ensureEl, getGridPolygon, getPackPolygon } from "../utils";

export const drawCells = (): void => {
  const { pack, grid, customization } = worldContext;
  const cellsData = customization === 1 ? Array.from(grid.cells.i) : Array.from(pack.cells.i);
  const polygon = customization === 1 ? (i: number) => getGridPolygon(i, grid) : (i: number) => getPackPolygon(i, pack);
  const paths = cellsData.map(i => `M${polygon(i)}`);
  ensureEl("cells").innerHTML = `<path d="${paths.join("")}" />`;
};
