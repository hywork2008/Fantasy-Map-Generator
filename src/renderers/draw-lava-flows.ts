import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { LavaFlows } from "../generators/lavaFlows";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";
import { renderFeatureGroups } from "./draw-features";

const LAVA_FLOW_GROUP = "lava";

export const LavaFlowsRenderer: IRenderer = {
  id: "lavaFlows",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawLavaFlows");
    const { pack } = worldContext;
    const { lakes } = viewContext;
    const existing = lakes.select<SVGGElement>(`#${LAVA_FLOW_GROUP}`);
    if (!existing.empty()) existing.selectAll("path.lava-flow").remove();

    const flows = pack.lavaFlows ?? [];
    if (!flows.length) {
      TIME && console.timeEnd("drawLavaFlows");
      return;
    }

    const paths = flows
      .filter(flow => flow.cells.length >= 2)
      .map(flow => `<path id="lavaFlow${flow.i}" class="lava-flow" d="${LavaFlows.getFlowPath(flow, pack)}"/>`);

    if (existing.empty()) {
      renderFeatureGroups(lakes, { [LAVA_FLOW_GROUP]: paths });
    } else {
      existing.html(`${existing.html()}${paths.join("")}`);
    }

    TIME && console.timeEnd("drawLavaFlows");
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.lakes.selectAll("path.lava-flow").remove();
  }
};
