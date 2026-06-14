import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const CulturesRenderer: IRenderer = {
  id: "cultures",

  render(worldContext: Readonly<WorldContext>, _viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("CulturesRenderer");
    const { pack } = worldContext;
    const { cells, cultures } = pack;

    const bodyPaths = new Array(cultures.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      pack,
      cellId => cells.culture[cellId],
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const color = cultures[+index].color ?? "#999";
      bodyPaths.push(getGappedFillPaths("culture", fill, waterGap, color, +index));
    });

    ensureEl("cults").innerHTML = bodyPaths.join("");

    TIME && console.timeEnd("CulturesRenderer");
  },

  clear(_viewContext: Readonly<ViewContext>): void {
    ensureEl("cults").innerHTML = "";
  }
};
