import type { AppServices } from "../context/appServices";
import type { FocusFields, SettlementLayers, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const PopulationRenderer: IRenderer = {
  id: "population",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack, urbanization } = worldContext;
    const { population, focusScope } = viewContext;
    const { cells, burgs } = pack;

    population.selectAll("line").remove();

    const rural = Array.from(
      cells.i.filter(i => (cells.pop[i] as number) > 0 && isCellInScope(focusScope, i)),
      i => [...cells.p[i], cells.p[i][1] - (cells.pop[i] as number) / 5] as [number, number, number]
    );

    population
      .select("#rural")
      .selectAll("line")
      .data(rural)
      .enter()
      .append("line")
      .attr("x1", d => d[0])
      .attr("y1", d => d[1])
      .attr("x2", d => d[0])
      .attr("y2", d => d[2]);

    const urban = burgs
      .filter(b => b.i && !b.removed && isCellInScope(focusScope, b.cell))
      .map(b => [b.x, b.y, b.y! - ((b.population ?? 0) / 5) * urbanization] as [number, number, number]);

    population
      .select("#urban")
      .selectAll("line")
      .data(urban)
      .enter()
      .append("line")
      .attr("x1", d => d[0])
      .attr("y1", d => d[1])
      .attr("x2", d => d[0])
      .attr("y2", d => d[2]);
  },

  clear(viewContext: Readonly<SettlementLayers>): void {
    viewContext.population.selectAll("*").remove();
  }
};

export function animatePopulationTurnOn(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  onEnd: () => void
): void {
  const { population } = viewContext;
  const priorRuralY2 = new Map<string, number>();
  const priorUrbanY2 = new Map<string, number>();
  population
    .select("#rural")
    .selectAll<SVGLineElement, unknown>("line")
    .each(function () {
      priorRuralY2.set(
        `${this.getAttribute("x1")}_${this.getAttribute("y1")}`,
        parseFloat(this.getAttribute("y2") ?? "0")
      );
    });
  population
    .select("#urban")
    .selectAll<SVGLineElement, unknown>("line")
    .each(function () {
      priorUrbanY2.set(
        `${this.getAttribute("x1")}_${this.getAttribute("y1")}`,
        parseFloat(this.getAttribute("y2") ?? "0")
      );
    });

  population.interrupt();
  population.selectAll("*").interrupt();

  PopulationRenderer.render(worldContext, viewContext, appServices);

  import("d3").then(d3 => {
    population
      .select("#rural")
      .selectAll<SVGLineElement, unknown>("line")
      .each(function () {
        const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
        const startY2 =
          priorRuralY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`) ??
          parseFloat(this.getAttribute("y1") ?? "0");
        d3.select(this).attr("y2", startY2).transition().duration(2000).ease(d3.easeSinIn).attr("y2", finalY2);
      });
    population
      .select("#urban")
      .selectAll<SVGLineElement, unknown>("line")
      .each(function () {
        const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
        const startY2 =
          priorUrbanY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`) ??
          parseFloat(this.getAttribute("y1") ?? "0");
        d3.select(this)
          .attr("y2", startY2)
          .transition()
          .delay(500)
          .duration(2000)
          .ease(d3.easeSinIn)
          .attr("y2", finalY2);
      });

    population.transition().delay(2500).on("end.pop-state", onEnd);
  });
}

export function animatePopulationTurnOff(viewContext: Readonly<SettlementLayers>, onEnd: () => void): void {
  const { population } = viewContext;
  population.interrupt();
  population.selectAll("*").interrupt();

  const isD3data = population.select("line").datum();
  if (!isD3data) {
    population.selectAll("line").remove();
    onEnd();
    return;
  }

  import("d3").then(d3 => {
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    population
      .select("#rural")
      .selectAll<SVGLineElement, [number, number, number]>("line")
      .transition(hide)
      .attr("y2", d => d[1])
      .remove();
    population
      .select("#urban")
      .selectAll<SVGLineElement, [number, number, number]>("line")
      .transition(hide)
      .delay(1000)
      .attr("y2", d => d[1])
      .remove();
    population.transition().delay(2000).on("end.pop-state", onEnd);
  });
}
