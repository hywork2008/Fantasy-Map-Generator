import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { TIME } from "../utils/debug";

interface IceElement {
  i: number;
  points: [number, number][];
  type: "glacier" | "iceberg";
  offset?: [number, number];
}

import type { IRenderer } from "./core/IRenderer";

export const IceRenderer: IRenderer = {
  id: "ice",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("IceRenderer");
    const { pack } = worldContext;
    const { ice } = viewContext;

    ice.selectAll("*").remove();

    let html = "";

    pack.ice.forEach((iceElement: IceElement) => {
      if (iceElement.type === "glacier") {
        html += getGlacierHtml(iceElement);
      } else if (iceElement.type === "iceberg") {
        html += getIcebergHtml(iceElement);
      }
    });

    ice.html(html);

    TIME && console.timeEnd("IceRenderer");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.ice.selectAll("*").remove();
  }
};

export const redrawIceberg = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
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
  viewContext: Readonly<ViewContext>,
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
