import type { Zone } from "../modules/zones-generator";
import { ensureEl, getVertexPath } from "../utils";

declare global {
  var drawZones: () => void;
}

const drawZone = ({ i, cells: zoneCells, type, color }: Zone): string => {
  const path = getVertexPath(zoneCells, pack);
  return `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
};

const zonesRenderer = (): void => {
  const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = pack.zones.filter(
    ({ hidden, cells: zoneCells, type }) => !hidden && zoneCells.length && (!isFiltered || type === filterBy)
  );
  zones.html(visibleZones.map(drawZone).join(""));
};

window.drawZones = zonesRenderer;
