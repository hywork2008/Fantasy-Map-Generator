import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getCoastalHabitatDefinition, getNearshoreHabitatDefinition } from "../data/coastalHabitatCatalog";
import { getPackPolygon } from "../utils";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

/**
 * Draws coastalHabitat (land) and nearshoreHabitat (shallow water) as translucent
 * cell fills. Climate biomes stay unchanged underneath.
 */
export const CoastalHabitatsRenderer: IRenderer = {
  id: "coastalHabitats",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & ViewState & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawCoastalHabitats");
    const { pack } = worldContext;
    const layer = viewContext.coastalHabitats;
    if (!layer || !pack.cells?.i) {
      TIME && console.timeEnd("drawCoastalHabitats");
      return;
    }

    layer.selectAll("*").remove();
    const { cells } = pack;
    const coastal = cells.coastalHabitat;
    const nearshore = cells.nearshoreHabitat;
    if (!coastal && !nearshore) {
      TIME && console.timeEnd("drawCoastalHabitats");
      return;
    }

    const paths: string[] = [];
    for (const i of cells.i) {
      if (!isCellInScope(viewContext.focusScope, i)) continue;
      const isLand = cells.h[i] >= 20;
      const code = isLand ? (coastal?.[i] ?? 0) : (nearshore?.[i] ?? 0);
      if (!code) continue;
      const def = isLand ? getCoastalHabitatDefinition(code) : getNearshoreHabitatDefinition(code);
      if (def.key === "none") continue;
      const points = getPackPolygon(i, pack);
      if (!points?.length) continue;
      paths.push(
        `<path data-cell="${i}" data-habitat="${def.key}" d="M${points.join("L")}Z" fill="${def.color}" stroke="${def.color}" stroke-width="0.4" opacity="0.65"/>`
      );
    }
    layer.html(paths.join(""));
    TIME && console.timeEnd("drawCoastalHabitats");
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.coastalHabitats?.html("");
  }
};
