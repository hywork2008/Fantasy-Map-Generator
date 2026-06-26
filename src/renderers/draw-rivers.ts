import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Rivers } from "../generators/river-generator";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const RiversRenderer: IRenderer = {
  id: "rivers",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawRivers");
    const { pack } = worldContext;
    const { rivers } = viewContext;

    rivers.selectAll("*").remove();

    const riverPaths = pack.rivers
      .filter(river => river.cells && river.cells.length >= 2)
      .map(river => {
        const { cells: riverCells, points, i, widthFactor, sourceWidth } = river;

        let resolvedPoints = points;
        if (resolvedPoints && resolvedPoints.length !== riverCells!.length) {
          console.error(
            `River ${i} has ${riverCells!.length} cells, but only ${resolvedPoints.length} points defined. Resetting points data`
          );
          resolvedPoints = undefined;
        }

        const meanderedPoints = Rivers.addMeandering(riverCells!, resolvedPoints ?? null);
        const path = Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth);
        return `<path id="river${i}" d="${path}"/>`;
      });

    rivers.html(riverPaths.join(""));

    TIME && console.timeEnd("drawRivers");
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.rivers.selectAll("*").remove();
  }
};
