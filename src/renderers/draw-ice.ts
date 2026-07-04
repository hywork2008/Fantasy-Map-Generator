import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { IceElement } from "../types/models";
import { TIME } from "../utils/debug";
import { isGridCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const IceRenderer: IRenderer = {
  id: "ice",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("IceRenderer");
    const { pack } = worldContext;
    const { ice, focusScope } = viewContext;

    ice.selectAll("*").remove();

    let html = "";

    pack.ice.forEach((iceElement: IceElement) => {
      if (iceElement.type === "glacier") {
        // Glaciers are large polar features not owned by a single cell/state — always drawn.
        html += getGlacierHtml(iceElement);
      } else if (iceElement.type === "iceberg" && isGridCellInScope(focusScope, iceElement.cellId)) {
        html += getIcebergHtml(iceElement);
      }
    });

    ice.html(html);

    TIME && console.timeEnd("IceRenderer");
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.ice.selectAll("*").remove();
  }
};

export const redrawIceberg = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<EnvironmentLayers>,
  _appServices: AppServices,
  id: number
): void => {
  TIME && console.time("redrawIceberg");
  const { pack } = worldContext;
  const { ice } = viewContext;
  const iceberg = pack.ice.find((element: IceElement) => element.i === id);
  let el = ice.selectAll<SVGPolygonElement, unknown>(`polygon[data-id="${id}"]:not([type="glacier"])`);
  if (!iceberg && !el.empty()) {
    el.remove();
  } else if (iceberg) {
    if (el.empty()) {
      const polygon = getIcebergHtml(iceberg);
      (ice.node() as SVGGElement).insertAdjacentHTML("beforeend", polygon);
      el = ice.selectAll<SVGPolygonElement, unknown>(`polygon[data-id="${id}"]:not([type="glacier"])`);
    }
    el.attr("points", iceberg.points.join(" "));
    el.attr("transform", iceberg.offset ? `translate(${iceberg.offset[0]},${iceberg.offset[1]})` : null);
  }
  TIME && console.timeEnd("redrawIceberg");
};

export const redrawGlacier = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<EnvironmentLayers>,
  _appServices: AppServices,
  id: number
): void => {
  TIME && console.time("redrawGlacier");
  const { pack } = worldContext;
  const { ice } = viewContext;
  const glacier = pack.ice.find((element: IceElement) => element.i === id);
  let el = ice.selectAll<SVGPolygonElement, unknown>(`polygon[data-id="${id}"][type="glacier"]`);
  if (!glacier && !el.empty()) {
    el.remove();
  } else if (glacier) {
    if (el.empty()) {
      const polygon = getGlacierHtml(glacier);
      (ice.node() as SVGGElement).insertAdjacentHTML("beforeend", polygon);
      el = ice.selectAll<SVGPolygonElement, unknown>(`polygon[data-id="${id}"][type="glacier"]`);
    }
    el.attr("points", glacier.points.join(" "));
    el.attr("transform", glacier.offset ? `translate(${glacier.offset[0]},${glacier.offset[1]})` : null);
  }
  TIME && console.timeEnd("redrawGlacier");
};

function getGlacierHtml(glacier: IceElement): string {
  return `<polygon points="${glacier.points}" type="glacier" data-id="${glacier.i}" ${glacier.offset ? `transform="translate(${glacier.offset[0]},${glacier.offset[1]})"` : ""}/>`;
}

function getIcebergHtml(iceberg: IceElement): string {
  return `<polygon points="${iceberg.points}" data-id="${iceberg.i}" ${iceberg.offset ? `transform="translate(${iceberg.offset[0]},${iceberg.offset[1]})"` : ""}/>`;
}
