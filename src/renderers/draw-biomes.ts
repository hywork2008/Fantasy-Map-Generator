import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import { getScopedGraph, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const BiomesRenderer: IRenderer = {
  id: "biomes",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("drawBiomes");

    const { pack, biomesData } = worldContext;
    const { focusScope } = viewContext;
    const cells = pack.cells;
    const bodyPaths = new Array(biomesData.i.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      getScopedGraph(pack, focusScope),
      scopedGetType(focusScope, cellId => cells.biomeCode[cellId]),
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const color = biomesData.color[+index];
      bodyPaths.push(getGappedFillPaths("biome", fill, waterGap, color, +index));
    });

    viewContext.biomes.html(bodyPaths.join(""));

    TIME && console.timeEnd("drawBiomes");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.biomes.html("");
  }
};
