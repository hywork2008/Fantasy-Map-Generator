import type { AppServices } from "../context/appServices";
import type { FocusFields, PoliticalLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Zone } from "../types/models";
import { getVertexPath } from "../utils";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

const drawZone = (pack: WorldContext["pack"], { i, cells: zoneCells, type, color }: Zone): string => {
  const path = getVertexPath(zoneCells, pack);
  return `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
};

export const ZonesRenderer: IRenderer = {
  id: "zones",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<PoliticalLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack } = worldContext;
    const { zones, focusScope } = viewContext;
    const filterEl = document.getElementById("zonesFilterType") as HTMLSelectElement | null;
    const filterBy = filterEl?.value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter(
      ({ hidden, cells: zoneCells, type }) =>
        !hidden &&
        zoneCells.length &&
        (!isFiltered || type === filterBy) &&
        (!focusScope || zoneCells.some(c => isCellInScope(focusScope, c)))
    );
    zones.html(visibleZones.map(z => drawZone(pack, z)).join(""));
  },

  clear(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.zones.html("");
  }
};
