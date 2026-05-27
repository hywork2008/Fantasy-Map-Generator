import { Rivers } from "./generator";

export function drawRiversRenderer() {
  TIME && console.time("drawRivers");
  rivers.selectAll("*").remove();

  const riverPaths = pack.rivers.map(({cells, points, i, widthFactor, sourceWidth}) => {
    if (!cells || cells.length < 2) return;

    if (points && points.length !== cells.length) {
      console.error(
        `River ${i} has ${cells.length} cells, but only ${points.length} points defined. Resetting points data`
      );
      points = undefined;
    }

    const meanderedPoints = Rivers.addMeandering(cells, points);
    const path = Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth);
    return `<path id="river${i}" d="${path}"/>`;
  });

  rivers.html(riverPaths.join(""));
  TIME && console.timeEnd("drawRivers");
}
