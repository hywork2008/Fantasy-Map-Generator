import { viewState } from "../context/viewState";
import { worldContext } from "../context/worldContext";
import type { Zone } from "../modules/zones-generator";
import { ensureEl, getVertexPath } from "../utils";

declare global {
  var drawZones: () => void;
}

const drawZone = (pack: typeof worldContext.pack, { i, cells: zoneCells, type, color }: Zone): string => {
  const path = getVertexPath(zoneCells, pack);
  return `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
};

const zonesRenderer = (): void => {
  const { pack } = worldContext;
  const { zones } = viewState;
  const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = pack.zones.filter(
    ({ hidden, cells: zoneCells, type }) => !hidden && zoneCells.length && (!isFiltered || type === filterBy)
  );
  zones.html(visibleZones.map(z => drawZone(pack, z)).join(""));
};

window.drawZones = zonesRenderer;
