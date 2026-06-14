import { color } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const StatesRenderer: IRenderer = {
  id: "states",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("drawStates");
    const { pack } = worldContext;
    const { cells, states } = pack;

    const maxLength = states.length - 1;
    const bodyPaths = new Array(maxLength);
    const clipPaths = new Array(maxLength);
    const haloPaths = new Array(maxLength);

    const renderHalo = shapeRendering.value === "geometricPrecision";
    const isolines: Record<string, { fill?: string; waterGap?: string; halo?: string }> = getIsolines(
      pack,
      cellId => cells.state[cellId],
      { fill: true, waterGap: true, halo: renderHalo }
    );

    Object.entries(isolines).forEach(([index, { fill, waterGap, halo }]) => {
      const stateColor = states[+index].color ?? "#999";
      bodyPaths.push(getGappedFillPaths("state", fill, waterGap, stateColor, +index));

      if (renderHalo) {
        const haloColor = color(stateColor)?.darker().hex() ?? "#666666";
        clipPaths.push(`<clipPath id="state-clip${index}"><use href="#state${index}"/></clipPath>`);
        haloPaths.push(
          `<path id="state-border${index}" d="${halo}" clip-path="url(#state-clip${index})" stroke="${haloColor}"/>`
        );
      }
    });

    viewContext.svg.select<SVGGElement>("#statesBody").html(bodyPaths.join(""));
    viewContext.defs.select<SVGGElement>("#statePaths").html(renderHalo ? clipPaths.join("") : "");
    viewContext.svg.select<SVGGElement>("#statesHalo").html(renderHalo ? haloPaths.join("") : "");

    TIME && console.timeEnd("drawStates");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.svg.select<SVGGElement>("#statesBody").html("");
    viewContext.defs.select<SVGGElement>("#statePaths").html("");
    viewContext.svg.select<SVGGElement>("#statesHalo").html("");
  }
};
