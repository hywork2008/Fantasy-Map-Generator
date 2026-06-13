import { geoEquirectangular, geoGraticule, geoPath } from "d3";
import { viewState } from "../context/viewState";
import { worldContext } from "../context/worldContext";
import { ensureEl, rn, round } from "../utils";

export const drawCoordinates = (): void => {
  const { mapCoordinates, graphWidth, graphHeight } = worldContext;
  const { scale } = worldContext;
  const { coordinates } = viewState;

  coordinates.selectAll("*").remove();

  const steps = [0.5, 1, 2, 5, 10, 15, 30];
  const goal = mapCoordinates.lonT! / scale / 10;
  const step = steps.reduce((p, c) => (Math.abs(c - goal) < Math.abs(p - goal) ? c : p));

  const desired = +coordinates.attr("data-size");
  coordinates.attr("font-size", Math.max(rn(desired / scale ** 0.8, 2), 0.1));

  const graticule = geoGraticule()
    .extent([
      [mapCoordinates.lonW!, mapCoordinates.latN!],
      [mapCoordinates.lonE! + 0.1, mapCoordinates.latS! + 0.1]
    ])
    .stepMajor([400, 400])
    .stepMinor([step, step]);

  const projection = geoEquirectangular().fitSize([graphWidth, graphHeight], graticule());

  const gridGroup = coordinates.append("g").attr("id", "coordinateGrid");
  const labelsGroup = coordinates.append("g").attr("id", "coordinateLabels");

  const point = new DOMPoint(scale + desired + 2, scale + desired / 2);
  const p = point.matrixTransform((ensureEl("viewbox") as unknown as SVGGraphicsElement).getScreenCTM()!.inverse());

  const data = graticule.lines().map(d => {
    const isLatitude = d.coordinates[0][1] === d.coordinates[1][1];
    const coordinate = d.coordinates[0];
    const position = projection(coordinate as [number, number])!;
    const [x, y] = isLatitude ? [rn(p.x, 2), rn(position[1], 2)] : [rn(position[0], 2), rn(p.y, 2)];
    const value = isLatitude ? coordinate[1] : coordinate[0];

    let text: string | number = "";
    if (!value) {
      text = value;
    } else if (Number.isInteger(value)) {
      if (isLatitude) {
        text = coordinate[1] < 0 ? `${-coordinate[1]}°S` : `${coordinate[1]}°N`;
      } else {
        text = coordinate[0] < 0 ? `${-coordinate[0]}°W` : `${coordinate[0]}°E`;
      }
    }

    return { x, y, text };
  });

  const path = round(geoPath(projection)(graticule()) ?? "");
  gridGroup.append("path").attr("d", path).attr("vector-effect", "non-scaling-stroke");
  labelsGroup
    .selectAll("text")
    .data(data)
    .enter()
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.text);
};
