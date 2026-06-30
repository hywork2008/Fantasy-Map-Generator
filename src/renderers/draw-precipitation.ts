import { easeSinIn, transition } from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { rn } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const PrecipitationRenderer: IRenderer = {
  id: "precipitation",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers>,
    _appServices: AppServices
  ): void {
    TIME && console.time("PrecipitationRenderer");
    const { grid } = worldContext;
    const { prec } = viewContext;

    prec.selectAll("circle").remove();
    const { cells, points } = grid;

    const show = transition().duration(800).ease(easeSinIn);
    prec.selectAll("text").attr("opacity", 0).transition(show).attr("opacity", 1);

    const { points: pointsOpt } = useOptionsState.getState();
    const cellsNumberModifier = ((pointsOpt === 4 ? 10000 : pointsOpt * 2500) / 10000) ** 0.25;
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
      .attr("r", d => getRadius(cells.prec[d] as number));

    TIME && console.timeEnd("PrecipitationRenderer");
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.prec.selectAll("circle").remove();
  }
};

export function animatePrecipitationTurnOn(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  onEnd: () => void
): void {
  const { prec } = viewContext;
  const priorR = new Map<string, number>();
  prec.selectAll<SVGCircleElement, unknown>("circle").each(function () {
    priorR.set(`${this.getAttribute("cx")}_${this.getAttribute("cy")}`, parseFloat(this.getAttribute("r") ?? "0"));
  });

  prec.interrupt();
  prec.selectAll("*").interrupt();
  prec.style("display", "block");

  PrecipitationRenderer.render(worldContext, viewContext, appServices);

  import("d3").then(d3 => {
    prec.selectAll<SVGCircleElement, unknown>("circle").each(function () {
      const finalR = parseFloat(this.getAttribute("r") ?? "0");
      const startR = priorR.get(`${this.getAttribute("cx")}_${this.getAttribute("cy")}`) ?? 0;
      d3.select(this).attr("r", startR).transition().duration(800).ease(d3.easeSinIn).attr("r", finalR);
    });

    prec.transition().duration(800).on("end.prec-state", onEnd);
  });
}

export function animatePrecipitationTurnOff(viewContext: Readonly<EnvironmentLayers>, onEnd: () => void): void {
  const { prec } = viewContext;
  prec.selectAll("*").interrupt();
  prec.interrupt();

  import("d3").then(d3 => {
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    prec.transition().delay(1000).style("display", "none").on("end.prec-state", onEnd);
  });
}
