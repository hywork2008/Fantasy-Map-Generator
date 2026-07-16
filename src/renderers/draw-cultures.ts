import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import { getScopedGraph, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const CulturesRenderer: IRenderer = {
  id: "cultures",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("CulturesRenderer");
    const { pack } = worldContext;
    const { cells, cultures } = pack;
    const { focusScope } = viewContext;

    const bodyPaths = new Array(cultures.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      getScopedGraph(pack, focusScope),
      scopedGetType(focusScope, cellId => cells.culture[cellId]),
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const color = cultures[+index].color ?? "#999";
      bodyPaths.push(getGappedFillPaths("culture", fill, waterGap, color, +index));
    });

    viewContext.cults.html(bodyPaths.join(""));

    TIME && console.timeEnd("CulturesRenderer");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.cults.html("");
  }
};
