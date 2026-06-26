import type { AppServices } from "../context/appServices";
import type { PoliticalLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const ProvincesRenderer: IRenderer = {
  id: "provinces",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<PoliticalLayers>,
    _appServices: AppServices
  ): void {
    TIME && console.time("ProvincesRenderer");
    const { pack } = worldContext;
    const { cells, provinces } = pack;
    const { provs } = viewContext;

    const bodyPaths = new Array(provinces.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      pack,
      cellId => cells.province[cellId],
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const provinceColor = provinces[+index].color;
      bodyPaths.push(getGappedFillPaths("province", fill, waterGap, provinceColor, +index));
    });

    const labels = provinces
      .filter(p => p.i && !p.removed)
      .map(p => {
        const [x, y] = p.pole ?? cells.p[p.center];
        return `<text x="${x}" y="${y}" id="provinceLabel${p.i}">${p.name}</text>`;
      });

    provs.html(`
      <g id='provincesBody'>${bodyPaths.join("")}</g>
      <g id='provinceLabels'>${labels.join("")}</g>
    `);

    provs.select("#provinceLabels").style("display", provs.attr("data-labels") === "1" ? "block" : "none");

    TIME && console.timeEnd("ProvincesRenderer");
  },

  clear(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provs.html("");
  }
};
