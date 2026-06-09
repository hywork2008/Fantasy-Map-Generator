declare global {
  var drawRivers: () => void;
}

const riversRenderer = (): void => {
  TIME && console.time("drawRivers");
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

window.drawRivers = riversRenderer;
