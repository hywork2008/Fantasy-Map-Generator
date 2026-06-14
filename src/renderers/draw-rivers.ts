import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Rivers } from "../modules/river-generator";
import { TIME } from "../utils/debug";

export const drawRivers = (): void => {
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
};
