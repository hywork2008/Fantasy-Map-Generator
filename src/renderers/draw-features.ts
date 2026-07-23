import { select } from "d3";
import _simplify from "simplify-js";
import type { AppServices } from "../context/appServices";
import type { SvgGroup, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { PackedGraphFeature } from "../types/models";
import { clipPoly, round } from "../utils";
import { ERROR, TIME } from "../utils/debug";
import { buildCoastlinePath, fractalizeCoastline } from "./coastline-fractal";
import type { IRenderer } from "./core/IRenderer";

function simplify(points: [number, number][], tolerance: number, highestQuality?: boolean): [number, number][] {
  return _simplify(
    points.map(([x, y]) => ({ x, y })),
    tolerance,
    highestQuality
  ).map(({ x, y }) => [x, y] as [number, number]);
}

interface FeaturesHtml {
  paths: string[];
  landMask: string[];
  waterMask: string[];
  coastline: { [key: string]: string[] };
  lakes: { [key: string]: string[] };
}

export const FeaturesRenderer: IRenderer = {
  id: "features",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, appServices: AppServices): void {
    TIME && console.time("FeaturesRenderer");
    const { pack } = worldContext;
    const { defs, coastline, lakes } = viewContext;

    const html: FeaturesHtml = {
      paths: [],
      landMask: [],
      waterMask: ['<rect x="0" y="0" width="100%" height="100%" fill="white" />'],
      coastline: {},
      lakes: {}
    };

    const featuresList = (
      Array.isArray(pack.features) ? pack.features : Object.values(pack.features || {})
    ) as PackedGraphFeature[];
    for (const feature of featuresList) {
      if (!feature || feature.type === "ocean") continue;

      html.paths.push(
        `<path d="${featurePathRenderer(worldContext, viewContext, appServices, feature)}" id="feature_${feature.i}" data-f="${feature.i}"></path>`
      );

      if (feature.type === "lake") {
        html.landMask.push(`<use href="#feature_${feature.i}" data-f="${feature.i}" fill="black"></use>`);
        html.waterMask.push(`<use href="#feature_${feature.i}" data-f="${feature.i}" fill="white"></use>`);

        const lakeGroup = feature.group || "freshwater";
        if (!html.lakes[lakeGroup]) html.lakes[lakeGroup] = [];
        html.lakes[lakeGroup].push(`<use href="#feature_${feature.i}" data-f="${feature.i}"></use>`);
      } else {
        html.landMask.push(`<use href="#feature_${feature.i}" data-f="${feature.i}" fill="white"></use>`);
        html.waterMask.push(`<use href="#feature_${feature.i}" data-f="${feature.i}" fill="black"></use>`);

        const coastlineGroup = feature.group || "sea_island";
        if (!html.coastline[coastlineGroup]) html.coastline[coastlineGroup] = [];
        html.coastline[coastlineGroup].push(`<use href="#feature_${feature.i}" data-f="${feature.i}"></use>`);
      }
    }

    defs.select("#featurePaths").html(html.paths.join(""));
    defs.select("#land").html(html.landMask.join(""));
    defs.select("#water").html(html.waterMask.join(""));

    renderFeatureGroups(coastline, html.coastline);
    renderFeatureGroups(lakes, html.lakes);

    TIME && console.timeEnd("FeaturesRenderer");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    const { defs, coastline, lakes } = viewContext;
    defs.select("#featurePaths").html("");
    defs.select("#land").html("");
    defs.select("#water").html('<rect x="0" y="0" width="100%" height="100%" fill="white" />');
    coastline.selectAll<SVGGElement, unknown>("g").each(function () {
      select(this).html("");
    });
    lakes.selectAll<SVGGElement, unknown>("g").each(function () {
      select(this).html("");
    });
  }
};

export function renderFeatureGroups(layer: SvgGroup, pathsByGroup: Record<string, string[]>): void {
  const existing = new Set<string>();
  layer.selectAll<SVGGElement, unknown>("g").each(function () {
    existing.add(this.id);
  });
  for (const groupId of Object.keys(pathsByGroup)) {
    if (!existing.has(groupId)) layer.append("g").attr("id", groupId);
  }

  layer.selectAll<SVGGElement, unknown>("g").each(function () {
    select(this).html((pathsByGroup[this.id] || []).join(""));
  });
}

function featurePathRenderer(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  feature: PackedGraphFeature
): string {
  const { pack, graphWidth, graphHeight } = worldContext;
  const points = feature.vertices.map(vertex => pack.vertices.p[vertex]);
  if (points.some(point => point === undefined)) {
    ERROR && console.error("Undefined point in getFeaturePath");
    return "";
  }

  const simplifiedPoints = simplify(points, 0.3);
  const clippedPoints = clipPoly(simplifiedPoints, graphWidth, graphHeight, 1);
  const shape = fractalizeCoastline(worldContext, viewContext, appServices, clippedPoints, feature.i, feature.type);
  return `${round(buildCoastlinePath(worldContext, viewContext, appServices, shape))}Z`;
}

export const getFeaturePath = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  feature: PackedGraphFeature
): string => featurePathRenderer(worldContext, viewContext, appServices, feature);
