import type { AppServices } from "../context/appServices";
import type { SettlementLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { IRenderer } from "./core/IRenderer";

export const PopulationRenderer: IRenderer = {
  id: "population",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers>,
    _appServices: AppServices
  ): void {
    const { pack, urbanization } = worldContext;
    const { population } = viewContext;
    const { cells, burgs } = pack;

    population.selectAll("line").remove();

    const rural = Array.from(
      cells.i.filter(i => (cells.pop[i] as number) > 0),
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
      .filter(b => b.i && !b.removed)
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
    viewContext.population.selectAll("line").remove();
  }
};
