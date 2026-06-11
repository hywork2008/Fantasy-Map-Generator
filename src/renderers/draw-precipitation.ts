import { easeSinIn, transition } from "d3";
import { viewState } from "../context/viewState";
import { worldContext } from "../context/worldContext";
import { rn } from "../utils";
import { TIME } from "../utils/debug";

declare global {
  var drawPrecipitation: () => void;
}

const precipitationRenderer = (): void => {
  TIME && console.time("drawPrecipitation");
  const { grid } = worldContext;
  const { prec } = viewState;

  prec.selectAll("circle").remove();
  const { cells, points } = grid;

  const show = transition().duration(800).ease(easeSinIn);
  prec.selectAll("text").attr("opacity", 0).transition(show).attr("opacity", 1);

  const cellsNumberModifier = (+(pointsInput.dataset.cells ?? 10000) / 10000) ** 0.25;
  const data = Array.from(cells.i).filter(i => (cells.h[i] as number) >= 20 && cells.prec[i]);
  const getRadius = (p: number) => rn(Math.sqrt(p / 4) / cellsNumberModifier, 2);

  prec
    .style("display", "block")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => points[d][0])
    .attr("cy", d => points[d][1])
    .attr("r", 0)
    .transition(show)
    .attr("r", d => getRadius(cells.prec[d] as number));

  TIME && console.timeEnd("drawPrecipitation");
};

window.drawPrecipitation = precipitationRenderer;
