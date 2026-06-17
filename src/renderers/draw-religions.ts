import type { AppServices } from "../context/appServices";
import type { PoliticalLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const ReligionsRenderer: IRenderer = {
  id: "religions",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<PoliticalLayers>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawReligions");
    const { pack } = worldContext;
    const { cells, religions } = pack;
    const { relig } = viewContext;

    const bodyPaths = new Array(religions.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      pack,
      cellId => cells.religion[cellId],
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const color = religions[+index].color;
      bodyPaths.push(getGappedFillPaths("religion", fill, waterGap, color, +index));
    });

    relig.html(bodyPaths.join(""));

    TIME && console.timeEnd("drawReligions");
  },

  clear(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.relig.html("");
  }
};
