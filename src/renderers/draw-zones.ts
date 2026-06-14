import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Zone } from "../modules/zones-generator";
import { ensureEl, getVertexPath } from "../utils";

const drawZone = (pack: WorldContext["pack"], { i, cells: zoneCells, type, color }: Zone): string => {
  const path = getVertexPath(zoneCells, pack);
  return `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
};

export const drawZones = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  _appServices: AppServices
): void => {
  const { pack } = worldContext;
  const { zones } = viewContext;
  const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = pack.zones.filter(
    ({ hidden, cells: zoneCells, type }) => !hidden && zoneCells.length && (!isFiltered || type === filterBy)
  );
  zones.html(visibleZones.map(z => drawZone(pack, z)).join(""));
};
