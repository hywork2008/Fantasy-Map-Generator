import { COORDINATE_SYSTEM, type LayersList } from "@deck.gl/core";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { useLayerState } from "../../store/layerState";
import {
  buildBackgroundPolygons,
  buildBiomesPolygons,
  buildBorderPaths,
  buildCellOutlinePaths,
  buildCulturePolygons,
  buildDangerPolygons,
  buildGridPaths,
  buildHeightPolygons,
  buildPopulationPolygons,
  buildPrecipitationPolygons,
  buildProvincePolygons,
  buildReligionPolygons,
  buildRiverPaths,
  buildRoutePaths,
  buildStatePolygons,
  buildTemperaturePolygons,
  buildZonePolygons,
  type DeckCellPolygon,
  type DeckPath
} from "./adapters/deckDataAdapters";

type PolygonBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckCellPolygon[];
type PathBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckPath[];

const WEBGL_POLYGON_LAYERS: Array<{ toggle: string; id: string; build: PolygonBuilder }> = [
  { toggle: "toggleHeight", id: "height", build: (world, view) => buildHeightPolygons(world, view.focusScope) },
  { toggle: "toggleBiomes", id: "biomes", build: (world, view) => buildBiomesPolygons(world, view.focusScope) },
  { toggle: "toggleReligions", id: "religions", build: (world, view) => buildReligionPolygons(world, view.focusScope) },
  { toggle: "toggleCultures", id: "cultures", build: (world, view) => buildCulturePolygons(world, view.focusScope) },
  { toggle: "toggleStates", id: "states", build: (world, view) => buildStatePolygons(world, view.focusScope) },
  { toggle: "toggleProvinces", id: "provinces", build: (world, view) => buildProvincePolygons(world, view.focusScope) },
  { toggle: "toggleZones", id: "zones", build: (world, view) => buildZonePolygons(world, view.focusScope) },
  {
    toggle: "toggleTemperature",
    id: "temperature",
    build: (world, view) => buildTemperaturePolygons(world, view.focusScope)
  },
  {
    toggle: "togglePopulation",
    id: "population",
    build: (world, view) => buildPopulationPolygons(world, view.focusScope)
  },
  {
    toggle: "togglePrecipitation",
    id: "precipitation",
    build: (world, view) => buildPrecipitationPolygons(world, view.focusScope)
  },
  { toggle: "toggleDanger", id: "danger", build: (world, view) => buildDangerPolygons(world, view.focusScope) }
];

const WEBGL_PATH_LAYERS: Array<{ toggle: string; id: string; build: PathBuilder }> = [
  { toggle: "toggleCells", id: "cells", build: (world, view) => buildCellOutlinePaths(world, view.focusScope) },
  { toggle: "toggleGrid", id: "grid", build: (world, view) => buildGridPaths(world, view.focusScope) },
  { toggle: "toggleRivers", id: "rivers", build: (world, view) => buildRiverPaths(world, view.focusScope) },
  { toggle: "toggleBorders", id: "borders", build: (world, view) => buildBorderPaths(world, view.focusScope) },
  { toggle: "toggleRoutes", id: "routes", build: (world, view) => buildRoutePaths(world, view.focusScope) }
];

export const WEBGL_LAYER_TOGGLES = new Set([
  ...WEBGL_POLYGON_LAYERS.map(layer => layer.toggle),
  ...WEBGL_PATH_LAYERS.map(layer => layer.toggle)
]);

export function buildDeckLayers(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>): LayersList {
  const { activeLayers } = useLayerState.getState();
  const layers: LayersList = [
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-background",
      data: buildBackgroundPolygons(worldContext),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: datum => datum.fillColor,
      pickable: false
    })
  ];

  for (const layer of WEBGL_POLYGON_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new SolidPolygonLayer<DeckCellPolygon>({
        id: `fmg-webgl-${layer.id}`,
        data: layer.build(worldContext, viewContext),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      })
    );
  }

  for (const layer of WEBGL_PATH_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new PathLayer<DeckPath>({
        id: `fmg-webgl-${layer.id}`,
        data: layer.build(worldContext, viewContext),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: datum => datum.path,
        getColor: datum => datum.color,
        getWidth: datum => datum.width,
        widthUnits: "common",
        widthMinPixels: 0.5,
        jointRounded: true,
        capRounded: true,
        pickable: true
      })
    );
  }

  return layers;
}
