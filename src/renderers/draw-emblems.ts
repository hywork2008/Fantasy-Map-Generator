import { forceCollide, forceSimulation, timeout } from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, RootLayers, SettlementLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { minmax, rn } from "../utils";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";

interface EmblemNode {
  type: "burg" | "province" | "state";
  i: number;
  x: number;
  y: number;
  size: number;
  shift: number;
  group?: string;
}

import type { Burg, Province, State } from "../types/models";
import type { IRenderer } from "./core/IRenderer";

export const EmblemsRenderer = {
  id: "emblems",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("EmblemsRenderer");
    const { pack, graphHeight, graphWidth } = worldContext;
    const { emblems, focusScope } = viewContext;
    const { states, provinces, burgs } = pack;

    const validStates = states.filter(
      s => s.i && !s.removed && s.coa && s.coa.size !== 0 && (!focusScope || s.i === focusScope.stateId)
    );
    const validProvinces = (provinces as Province[]).filter(
      p => p.i && !p.removed && p.coa && p.coa.size !== 0 && isCellInScope(focusScope, p.center)
    );
    const validBurgs = burgs.filter(
      b => b.i && !b.removed && b.coa && b.coa.size !== 0 && isCellInScope(focusScope, b.cell)
    );

    const getStateEmblemsSize = (): number => {
      const startSize = minmax((graphHeight + graphWidth) / 40, 10, 100);
      const statesMod = 1 + validStates.length / 100 - (15 - validStates.length) / 200; // states number modifier
      const sizeMod = +emblems.select<SVGGElement>("#stateEmblems").attr("data-size") || 1;
      return rn((startSize / statesMod) * sizeMod); // target size ~50px on 1536x754 map with 15 states
    };

    const getProvinceEmblemsSize = (): number => {
      const startSize = minmax((graphHeight + graphWidth) / 100, 5, 70);
      const provincesMod = 1 + validProvinces.length / 1000 - (115 - validProvinces.length) / 1000; // states number modifier
      const sizeMod = +emblems.select<SVGGElement>("#provinceEmblems").attr("data-size") || 1;
      return rn((startSize / provincesMod) * sizeMod); // target size ~20px on 1536x754 map with 115 provinces
    };

    const getBurgEmblemSize = (): number => {
      const startSize = minmax((graphHeight + graphWidth) / 185, 2, 50);
      const burgsMod = 1 + validBurgs.length / 1000 - (450 - validBurgs.length) / 1000; // states number modifier
      const sizeMod = +emblems.select<SVGGElement>("#burgEmblems").attr("data-size") || 1;
      return rn((startSize / burgsMod) * sizeMod); // target size ~8.5px on 1536x754 map with 450 burgs
    };

    const sizeBurgs = getBurgEmblemSize();
    const burgCOAs: EmblemNode[] = validBurgs.map(burg => {
      const { x, y } = burg;
      const size = burg.coa!.size || 1;
      const shift = (sizeBurgs * size) / 2;
      return {
        type: "burg",
        i: burg.i!,
        x: burg.coa!.x || x,
        y: burg.coa!.y || y,
        size,
        shift,
        group: burg.group
      };
    });

    const sizeProvinces = getProvinceEmblemsSize();
    const provinceCOAs: EmblemNode[] = validProvinces.map(province => {
      const [x, y] = province.pole || pack.cells.p[province.center];
      const size = province.coa!.size || 1;
      const shift = (sizeProvinces * size) / 2;
      return {
        type: "province",
        i: province.i,
        x: province.coa!.x || x,
        y: province.coa!.y || y,
        size,
        shift
      };
    });

    const sizeStates = getStateEmblemsSize();
    const stateCOAs: EmblemNode[] = validStates.map(state => {
      const [x, y] = state.pole || pack.cells.p[state.center!];
      const size = state.coa!.size || 1;
      const shift = (sizeStates * size) / 2;
      return {
        type: "state",
        i: state.i,
        x: state.coa!.x || x,
        y: state.coa!.y || y,
        size,
        shift
      };
    });

    const nodes = burgCOAs.concat(provinceCOAs).concat(stateCOAs);
    const simulation = forceSimulation(nodes)
      .alphaMin(0.6)
      .alphaDecay(0.2)
      .velocityDecay(0.6)
      .force(
        "collision",
        forceCollide<EmblemNode>().radius(d => d.shift)
      )
      .stop();

    timeout(() => {
      const n = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()));
      for (let i = 0; i < n; ++i) {
        simulation.tick();
      }

      const burgNodes = nodes.filter(node => node.type === "burg");

      const burgGroups = new Set(burgNodes.map(n => n.group).filter(Boolean));
      let burgHtml = "";
      for (const g of burgGroups) {
        const groupNodes = burgNodes.filter(n => n.group === g);
        const groupString = groupNodes
          .map(
            d =>
              `<use data-i="${d.i}" x="${rn(d.x - d.shift)}" y="${rn(d.y - d.shift)}" width="${d.size}em" height="${
                d.size
              }em"/>`
          )
          .join("");
        burgHtml += `<g id="${g}">${groupString}</g>`;
      }

      emblems
        .select<SVGGElement>("#burgEmblems")
        .attr("font-size", sizeBurgs)
        .attr("data-zoom-size", sizeBurgs)
        .html(burgHtml);

      const provinceNodes = nodes.filter(node => node.type === "province");
      const provinceString = provinceNodes
        .map(
          d =>
            `<use data-i="${d.i}" x="${rn(d.x - d.shift)}" y="${rn(d.y - d.shift)}" width="${d.size}em" height="${
              d.size
            }em"/>`
        )
        .join("");
      emblems
        .select<SVGGElement>("#provinceEmblems")
        .attr("font-size", sizeProvinces)
        .attr("data-zoom-size", sizeProvinces)
        .html(provinceString);

      const stateNodes = nodes.filter(node => node.type === "state");
      const stateString = stateNodes
        .map(
          d =>
            `<use data-i="${d.i}" x="${rn(d.x - d.shift)}" y="${rn(d.y - d.shift)}" width="${d.size}em" height="${
              d.size
            }em"/>`
        )
        .join("");
      emblems
        .select<SVGGElement>("#stateEmblems")
        .attr("font-size", sizeStates)
        .attr("data-zoom-size", sizeStates)
        .html(stateString);

      document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
    });

    TIME && console.timeEnd("EmblemsRenderer");
  },

  clear(viewContext: Readonly<SettlementLayers>): void {
    viewContext.emblems.selectAll("use").remove();
  },

  removeStateEmblems(viewContext: Readonly<SettlementLayers>, stateId: number): void {
    viewContext.emblems.select(`#stateEmblems > use[data-i='${stateId}']`).remove();
  },

  removeProvinceEmblems(viewContext: Readonly<SettlementLayers>, provinceId: number): void {
    viewContext.emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();
  },

  clearProvinceEmblems(viewContext: Readonly<SettlementLayers>): void {
    viewContext.emblems.select("#provinceEmblems").selectAll("*").remove();
  }
} satisfies IRenderer;

export const removeBurgCOA = (
  viewContext: Readonly<Pick<RootLayers, "defs"> & Pick<SettlementLayers, "emblems">>,
  burgId: number
): void => {
  viewContext.defs.select(`#burgCOA${burgId}`).remove();
  viewContext.emblems.select(`#burgEmblems > use[data-i='${burgId}']`).remove();
};

const getDataAndType = (worldContext: Readonly<WorldContext>, id: string): [Burg[] | Province[] | State[], string] => {
  const { pack } = worldContext;
  if (id === "burgEmblems") return [pack.burgs, "burg"];
  if (id === "provinceEmblems") return [pack.provinces as Province[], "province"];
  if (id === "stateEmblems") return [pack.states, "state"];
  throw new Error(`Unknown emblem type: ${id}`);
};

export const renderGroupCOAs = async (
  worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<SettlementLayers>,
  appServices: AppServices,
  g: SVGGElement
): Promise<void> => {
  const { COArenderer } = appServices;
  if (!COArenderer) return;
  const [data, type] = getDataAndType(worldContext, g.id);

  // Note: For burgEmblems, `g` might be the `#burgEmblems` containing `<g id="capitals">` etc.
  // We need to recursively find all `<use>` elements.
  const uses = g.querySelectorAll("use");
  for (const use of Array.from(uses)) {
    const i = +(use as SVGUseElement).dataset.i!;
    const id = `${type}COA${i}`;
    COArenderer.trigger(id, (data[i] as { coa: unknown }).coa);
    use.setAttribute("href", `#${id}`);
  }
};
