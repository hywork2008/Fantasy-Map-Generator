import { COORDINATE_SYSTEM, type Color, type LayersList } from "@deck.gl/core";
import { IconLayer, PathLayer, PolygonLayer, SolidPolygonLayer, TextLayer } from "@deck.gl/layers";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { useLayerState } from "../../store/layerState";
import {
  buildBackgroundPolygons,
  buildBiomesPolygons,
  buildBorderPaths,
  buildBurgIconSymbols,
  buildCellOutlinePaths,
  buildCoastlinePaths,
  buildCulturePolygons,
  buildDangerPolygons,
  buildDivisionBoundaryPaths,
  buildEmblemIcons,
  buildGridPaths,
  buildHeightPolygons,
  buildIcePolygons,
  buildLabelSymbols,
  buildLakeOutlinePaths,
  buildLakePolygons,
  buildLandPolygonsBase,
  buildMarkerSymbols,
  buildMilitaryBoxPolygons,
  buildMilitaryRegimentSymbols,
  buildPopulationPolygons,
  buildPrecipitationPolygons,
  buildProvincePolygons,
  buildReligionPolygons,
  buildRiverPaths,
  buildRoutePaths,
  buildStatePolygons,
  buildTemperaturePolygons,
  buildZonePolygons,
  colorToRgba,
  type DeckBurgIconStyle,
  type DeckBurgIconSymbol,
  type DeckBurgIconType,
  type DeckCellPolygon,
  type DeckDivisionBoundaryKind,
  type DeckEmblemIcon,
  type DeckEmblemType,
  type DeckFeaturePolygon,
  type DeckHeightStyle,
  type DeckIcePolygon,
  type DeckLabelStyle,
  type DeckLabelSymbol,
  type DeckMarkerStyle,
  type DeckMarkerSymbol,
  type DeckMilitaryBoxPolygon,
  type DeckMilitaryRegimentSymbol,
  type DeckPath,
  type DeckPosition
} from "./adapters/deckDataAdapters";

type PolygonBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckCellPolygon[];
type PathBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckPath[];
type CachedDeckData =
  | DeckBurgIconSymbol[]
  | DeckCellPolygon[]
  | DeckEmblemIcon[]
  | DeckIcePolygon[]
  | DeckLabelSymbol[]
  | DeckMarkerSymbol[]
  | DeckMilitaryBoxPolygon[]
  | DeckMilitaryRegimentSymbol[]
  | DeckPath[];

interface CachedDeckDataEntry<T extends CachedDeckData> {
  signature: string;
  data: T;
}

interface LayerStyleSelection {
  empty(): boolean;
  attr(name: string): string | null;
  style(name: string): string;
}

const deckLayerDataCache = new Map<string, CachedDeckDataEntry<CachedDeckData>>();

const WEBGL_POLYGON_LAYERS: Array<{
  toggle: string;
  id: string;
  build: PolygonBuilder;
  boundary?: DeckDivisionBoundaryKind;
}> = [
  {
    toggle: "toggleHeight",
    id: "height",
    build: (world, view) => buildHeightPolygons(world, view.focusScope, getHeightStyle(view))
  },
  { toggle: "toggleBiomes", id: "biomes", build: (world, view) => buildBiomesPolygons(world, view.focusScope) },
  {
    toggle: "toggleReligions",
    id: "religions",
    build: (world, view) => buildReligionPolygons(world, view.focusScope),
    boundary: "religion"
  },
  {
    toggle: "toggleCultures",
    id: "cultures",
    build: (world, view) => buildCulturePolygons(world, view.focusScope),
    boundary: "culture"
  },
  {
    toggle: "toggleStates",
    id: "states",
    build: (world, view) => buildStatePolygons(world, view.focusScope),
    boundary: "state"
  },
  {
    toggle: "toggleProvinces",
    id: "provinces",
    build: (world, view) => buildProvincePolygons(world, view.focusScope),
    boundary: "province"
  },
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
  ...WEBGL_PATH_LAYERS.map(layer => layer.toggle),
  "toggleBurgIcons",
  "toggleIce",
  "toggleEmblems",
  "toggleMarkers",
  "toggleMilitary",
  "toggleLabels"
]);

const EMBLEM_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="white" d="M64 6l46 16v35c0 31-19 53-46 65-27-12-46-34-46-65V22z"/></svg>'
)}`;
const BURG_ICON_URLS: Record<DeckBurgIconType, string> = {
  burg: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle fill="white" cx="64" cy="64" r="54"/></svg>'
  )}`,
  anchor: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="white" d="M58 14h12v16h24v12H70v49c12-3 22-11 29-23l10 6c-10 21-26 33-45 39-19-6-35-18-45-39l10-6c7 12 17 20 29 23V42H34V30h24z"/></svg>'
  )}`
};
const EMPTY_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"></svg>'
)}`;

export function clearDeckLayerDataCache(): void {
  deckLayerDataCache.clear();
}

export function getDeckLayerDataCacheSize(): number {
  return deckLayerDataCache.size;
}

export function buildDeckLayers(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): LayersList {
  const { activeLayers } = useLayerState.getState();
  const oceanFill = viewContext.oceanLayers?.select<SVGRectElement>("#oceanBase").attr("fill") || "#466eab";
  const landFill = viewContext.landmass?.attr("fill") || "#eef6fb";
  const oceanColor = colorToRgba(oceanFill, "#466eab");
  const signatures = buildLayerSignatures(worldContext, viewContext, oceanFill, landFill);
  const lakePaint = getLakePaint(viewContext);
  const coastlinePaint = getCoastlinePaint(viewContext);
  const icePaint = getIcePaint(viewContext);
  const emblemStyle = getEmblemStyle(viewContext);
  const burgIconStyle = getBurgIconStyle(worldContext, viewContext);
  const markerStyle = getMarkerStyle(viewContext);
  const labelStyle = getLabelStyle(worldContext, viewContext);
  const layers: LayersList = [
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-background",
      data: getCachedDeckData("background", signatures.background, () => buildBackgroundPolygons(worldContext)),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: () => oceanColor,
      pickable: false
    }),
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-land",
      data: getCachedDeckData("land", signatures.land, () =>
        buildLandPolygonsBase(worldContext, viewContext.focusScope, landFill)
      ),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: datum => datum.fillColor,
      pickable: true
    })
  ];

  if (activeLayers.toggleLakes) {
    layers.push(
      new SolidPolygonLayer<DeckFeaturePolygon>({
        id: "fmg-webgl-lakes",
        data: getCachedDeckData("features:lakes", signatures.byLayer.lakes, () =>
          buildLakePolygons(
            worldContext,
            viewContext.focusScope,
            appServices,
            group => lakePaint[group]?.fill ?? lakePaint.freshwater.fill
          )
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      }),
      new PathLayer<DeckPath>({
        id: "fmg-webgl-lakes-outlines",
        data: getCachedDeckData("features:lakes-outlines", signatures.byLayer["lakes-outlines"], () =>
          buildLakeOutlinePaths(
            worldContext,
            viewContext.focusScope,
            appServices,
            group => lakePaint[group]?.stroke ?? lakePaint.freshwater.stroke,
            group => lakePaint[group]?.strokeWidth ?? lakePaint.freshwater.strokeWidth
          )
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: datum => datum.path,
        getColor: datum => datum.color,
        getWidth: datum => datum.width,
        widthUnits: "pixels",
        widthMinPixels: 0,
        widthMaxPixels: 6,
        jointRounded: true,
        capRounded: true,
        pickable: false
      })
    );
  }

  for (const layer of WEBGL_POLYGON_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new SolidPolygonLayer<DeckCellPolygon>({
        id: `fmg-webgl-${layer.id}`,
        data: getCachedDeckData(`polygon:${layer.id}`, signatures.byLayer[layer.id], () =>
          layer.build(worldContext, viewContext)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      })
    );
    if (layer.boundary) {
      const boundary = layer.boundary;
      layers.push(
        new PathLayer<DeckPath>({
          id: `fmg-webgl-${layer.id}-boundaries`,
          data: getCachedDeckData(`boundary:${layer.boundary}`, signatures.byLayer[`${layer.id}-boundaries`], () =>
            buildDivisionBoundaryPaths(worldContext, viewContext.focusScope, boundary)
          ),
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPath: datum => datum.path,
          getColor: datum => datum.color,
          getWidth: datum => datum.width,
          widthUnits: "pixels",
          widthMinPixels: 0.35,
          widthMaxPixels: 2.5,
          jointRounded: true,
          capRounded: true,
          pickable: false
        })
      );
    }
  }

  if (activeLayers.toggleIce) {
    layers.push(
      new PolygonLayer<DeckIcePolygon>({
        id: "fmg-webgl-ice",
        data: getCachedDeckData("polygon:ice", signatures.byLayer.ice, () =>
          buildIcePolygons(worldContext, viewContext.focusScope, icePaint.fill, icePaint.stroke, icePaint.strokeWidth)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        getLineColor: datum => datum.lineColor,
        getLineWidth: datum => datum.lineWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 0,
        lineWidthMaxPixels: 2,
        stroked: true,
        pickable: true
      })
    );
  }

  if (activeLayers.toggleEmblems) {
    layers.push(
      new IconLayer<DeckEmblemIcon>({
        id: "fmg-webgl-emblems",
        data: getCachedDeckData("icons:emblems", signatures.byLayer.emblems, () =>
          buildEmblemIcons(worldContext, viewContext.focusScope, emblemStyle.sizes, emblemStyle.opacity)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getIcon: () => ({
          id: "shield",
          url: EMBLEM_ICON_URL,
          width: 128,
          height: 128,
          anchorX: 64,
          anchorY: 64,
          mask: true
        }),
        getColor: datum => datum.color,
        getSize: datum => datum.size,
        sizeUnits: "common",
        sizeBasis: "width",
        billboard: false,
        pickable: true
      })
    );
  }

  if (activeLayers.toggleBurgIcons) {
    layers.push(
      new IconLayer<DeckBurgIconSymbol>({
        id: "fmg-webgl-burg-icons",
        data: getCachedDeckData("icons:burgs", signatures.byLayer.burgIcons, () =>
          buildBurgIconSymbols(worldContext, viewContext.focusScope, burgIconStyle)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getIcon: datum => ({
          id: datum.type,
          url: BURG_ICON_URLS[datum.type],
          width: 128,
          height: 128,
          anchorX: 64,
          anchorY: 64,
          mask: true
        }),
        getColor: datum => datum.color,
        getSize: datum => datum.size,
        sizeUnits: "common",
        sizeBasis: "width",
        billboard: false,
        pickable: true
      })
    );
  }

  if (activeLayers.toggleMarkers) {
    const markerData = getCachedDeckData("icons:markers", signatures.byLayer.markers, () =>
      buildMarkerSymbols(worldContext, viewContext.focusScope, markerStyle)
    );
    layers.push(
      new IconLayer<DeckMarkerSymbol>({
        id: "fmg-webgl-markers",
        data: markerData,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getIcon: datum => ({
          id: `pin:${datum.pin}:${datum.fillColor}:${datum.strokeColor}`,
          url: getMarkerPinUrl(datum.pin, datum.fillColor, datum.strokeColor),
          width: 30,
          height: 30,
          anchorX: 15,
          anchorY: 30,
          mask: false
        }),
        getSize: datum => datum.size,
        sizeUnits: "common",
        sizeBasis: "width",
        billboard: false,
        pickable: true
      }),
      new TextLayer<DeckMarkerSymbol>({
        id: "fmg-webgl-marker-icons",
        data: markerData.filter(marker => !marker.isExternalIcon && marker.icon),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.textPosition,
        getText: datum => datum.icon,
        getSize: datum => datum.iconSize,
        getColor: () => [0, 0, 0, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        sizeUnits: "pixels",
        billboard: false,
        pickable: false
      }),
      new IconLayer<DeckMarkerSymbol>({
        id: "fmg-webgl-marker-images",
        data: markerData.filter(marker => marker.isExternalIcon),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.imagePosition,
        getIcon: datum => ({
          id: datum.icon,
          url: datum.icon || EMPTY_ICON_URL,
          width: Math.max(datum.iconSize, 1),
          height: Math.max(datum.iconSize, 1),
          anchorX: Math.max(datum.iconSize, 1) / 2,
          anchorY: Math.max(datum.iconSize, 1) / 2,
          mask: false
        }),
        getSize: datum => datum.iconSize,
        sizeUnits: "pixels",
        sizeBasis: "width",
        billboard: false,
        pickable: false
      })
    );
  }

  if (activeLayers.toggleMilitary) {
    const militarySize = getMilitaryBoxSize(viewContext);
    const militarySymbols = getCachedDeckData("military:symbols", signatures.byLayer.military, () =>
      buildMilitaryRegimentSymbols(worldContext, viewContext.focusScope, militarySize)
    );
    layers.push(
      new SolidPolygonLayer<DeckMilitaryBoxPolygon>({
        id: "fmg-webgl-military",
        data: getCachedDeckData("military:boxes", signatures.byLayer.military, () =>
          buildMilitaryBoxPolygons(worldContext, viewContext.focusScope, militarySize)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      }),
      new TextLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-totals",
        data: militarySymbols,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.totalPosition,
        getText: datum => datum.total,
        getSize: datum => datum.size * 2,
        getColor: () => [0, 0, 0, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        billboard: false,
        pickable: false
      }),
      new TextLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-icons",
        data: militarySymbols.filter(regiment => !regiment.isExternalIcon),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.unitIconPosition,
        getText: datum => datum.unitIcon,
        getSize: datum => datum.size * 2,
        getColor: () => [0, 0, 0, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        billboard: false,
        pickable: false
      }),
      new IconLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-images",
        data: militarySymbols.filter(regiment => regiment.isExternalIcon),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.unitImagePosition,
        getIcon: datum => ({
          id: datum.unitIcon,
          url: datum.unitIcon || EMPTY_ICON_URL,
          width: Math.max(datum.height, 1),
          height: Math.max(datum.height, 1),
          anchorX: Math.max(datum.height, 1) / 2,
          anchorY: Math.max(datum.height, 1) / 2,
          mask: false
        }),
        getSize: datum => datum.height,
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        sizeBasis: "width",
        billboard: false,
        pickable: false
      }),
      new TextLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-actions",
        data: militarySymbols,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.actionIconPosition,
        getText: datum => datum.actionIcon,
        getSize: datum => datum.size * 2,
        getColor: () => [0, 0, 0, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        billboard: false,
        pickable: false
      })
    );
  }

  for (const layer of WEBGL_PATH_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new PathLayer<DeckPath>({
        id: `fmg-webgl-${layer.id}`,
        data: getCachedDeckData(`path:${layer.id}`, signatures.byLayer[layer.id], () =>
          layer.build(worldContext, viewContext)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: datum => datum.path,
        getColor: datum => datum.color,
        getWidth: datum => datum.width,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
        widthMaxPixels: layer.id === "rivers" ? 10 : 4,
        jointRounded: true,
        capRounded: true,
        pickable: true
      })
    );
  }

  layers.push(
    new PathLayer<DeckPath>({
      id: "fmg-webgl-coastline",
      data: getCachedDeckData("features:coastline", signatures.byLayer.coastline, () =>
        buildCoastlinePaths(
          worldContext,
          viewContext.focusScope,
          appServices,
          group => coastlinePaint[group]?.stroke ?? coastlinePaint.sea_island.stroke,
          group => coastlinePaint[group]?.strokeWidth ?? coastlinePaint.sea_island.strokeWidth
        )
      ),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPath: datum => datum.path,
      getColor: datum => datum.color,
      getWidth: datum => datum.width,
      widthUnits: "pixels",
      widthMinPixels: 0.25,
      widthMaxPixels: 4,
      jointRounded: true,
      capRounded: true,
      pickable: true
    })
  );

  if (activeLayers.toggleLabels) {
    layers.push(
      new TextLayer<DeckLabelSymbol>({
        id: "fmg-webgl-labels",
        data: getCachedDeckData("text:labels", signatures.byLayer.labels, () =>
          buildLabelSymbols(worldContext, viewContext.focusScope, labelStyle)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getText: datum => datum.text,
        getSize: datum => datum.size,
        getColor: datum => datum.color,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        sizeUnits: "common",
        billboard: false,
        pickable: true
      })
    );
  }

  return layers;
}

function getCachedDeckData<T extends CachedDeckData>(key: string, signature: string, build: () => T): T {
  const cached = deckLayerDataCache.get(key);
  if (cached?.signature === signature) return cached.data as T;
  const data = build();
  deckLayerDataCache.set(key, { signature, data });
  return data;
}

function buildLayerSignatures(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  oceanFill: string,
  landFill: string
): { background: string; land: string; byLayer: Record<string, string> } {
  const { pack, grid, biomesData, mapId, graphWidth, graphHeight } = worldContext;
  const scope = getFocusScopeSignature(viewContext);
  const geometry = `${mapId}|${scope}|${pointListSignature(pack.vertices?.p)}|${nestedNumberListSignature(pack.cells?.v)}`;
  const gridGeometry = `${mapId}|${scope}|${pointListSignature(grid.vertices?.p)}|${nestedNumberListSignature(grid.cells?.v)}`;
  const gridHeights = numberListSignature(grid.cells?.h);
  const cellHeights = numberListSignature(pack.cells?.h);
  const landGeometry = `${geometry}|h:${cellHeights}`;
  const states = `${numberListSignature(pack.cells?.state)}|${colorListSignature(pack.states)}`;
  const provinces = `${numberListSignature(pack.cells?.province)}|${colorListSignature(pack.provinces)}`;
  const cultures = `${numberListSignature(pack.cells?.culture)}|${colorListSignature(pack.cultures)}`;
  const religions = `${numberListSignature(pack.cells?.religion)}|${colorListSignature(pack.religions)}`;

  return {
    background: `${mapId}|${graphWidth}x${graphHeight}|${oceanFill}`,
    land: `${landGeometry}|${landFill}`,
    byLayer: {
      height: `${gridGeometry}|${gridHeights}|${heightStyleSignature(getHeightStyle(viewContext))}`,
      biomes: `${landGeometry}|${numberListSignature(pack.cells?.biome)}|${stringListSignature(biomesData.color)}`,
      religions: `${landGeometry}|${religions}`,
      "religions-boundaries": `${landGeometry}|${religions}`,
      cultures: `${landGeometry}|${cultures}`,
      "cultures-boundaries": `${landGeometry}|${cultures}`,
      states: `${landGeometry}|${states}`,
      "states-boundaries": `${landGeometry}|${states}`,
      provinces: `${landGeometry}|${provinces}`,
      "provinces-boundaries": `${landGeometry}|${provinces}`,
      zones: `${landGeometry}|${zonesSignature(pack.zones)}`,
      temperature: `${geometry}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.temp)}`,
      population: `${landGeometry}|${numberListSignature(pack.cells?.pop)}`,
      precipitation: `${landGeometry}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.prec)}`,
      danger: `${landGeometry}|${numberListSignature(pack.cells?.danger)}`,
      lakes: `${geometry}|${featuresSignature(pack.features, "lake")}|${paintSignature(getLakePaint(viewContext))}`,
      "lakes-outlines": `${geometry}|${featuresSignature(pack.features, "lake")}|${paintSignature(getLakePaint(viewContext))}`,
      coastline: `${geometry}|${featuresSignature(pack.features, "island")}|${paintSignature(getCoastlinePaint(viewContext))}`,
      ice: `${scope}|${iceSignature(pack.ice)}|${paintSignature({ ice: getIcePaint(viewContext) })}`,
      emblems: `${scope}|${emblemsSignature(pack.states, pack.provinces, pack.burgs)}|${emblemStyleSignature(getEmblemStyle(viewContext))}`,
      burgIcons: `${scope}|${burgIconsSignature(pack.burgs)}|${burgIconStyleSignature(getBurgIconStyle(worldContext, viewContext))}`,
      markers: `${scope}|${markersSignature(pack.markers)}|${markerStyleSignature(getMarkerStyle(viewContext))}`,
      military: `${scope}|${militarySignature(pack.states)}|size:${getMilitaryBoxSize(viewContext)}`,
      labels: `${scope}|${labelsSignature(pack.states, pack.burgs)}|${labelStyleSignature(getLabelStyle(worldContext, viewContext))}`,
      cells: geometry,
      grid: `${geometry}|${nestedNumberListSignature(pack.cells?.c)}`,
      rivers: `${mapId}|${scope}|${riversSignature(pack.rivers)}`,
      borders: `${landGeometry}|${states}|${provinces}|${nestedNumberListSignature(pack.cells?.c)}`,
      routes: `${mapId}|${scope}|${routesSignature(pack.routes)}`
    }
  };
}

interface LayerPaint {
  fill: Color;
  stroke: Color;
  strokeWidth: number;
}

function getLakePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    freshwater: getLayerPaint(viewContext, "lakes", "freshwater", "#a6c1fd", "#5f799d", 0.7, 0.5),
    salt: getLayerPaint(viewContext, "lakes", "salt", "#409b8a", "#388985", 0.7, 0.5),
    sinkhole: getLayerPaint(viewContext, "lakes", "sinkhole", "#5bc9fd", "#53a3b0", 0.7, 1),
    frozen: getLayerPaint(viewContext, "lakes", "frozen", "#cdd4e7", "#cfe0eb", 0, 0.95),
    lava: getLayerPaint(viewContext, "lakes", "lava", "#90270d", "#f93e0c", 2, 0.7),
    dry: getLayerPaint(viewContext, "lakes", "dry", "#c9bfa7", "#8e816f", 0.7, 1)
  };
}

function getCoastlinePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    sea_island: getLayerPaint(viewContext, "coastline", "sea_island", "transparent", "#1f3846", 0.5, 0.5),
    lake_island: getLayerPaint(viewContext, "coastline", "lake_island", "transparent", "#7c8eaf", 0.35, 1)
  };
}

function getIcePaint(viewContext: Readonly<ViewContext>): LayerPaint {
  const fallback = {
    fill: colorToRgba("#f1f8fe", "#f1f8fe", 0.9),
    stroke: colorToRgba("#e8f0f6", "#e8f0f6", 0.9),
    strokeWidth: 0.5
  };
  if (!viewContext.ice) return fallback;

  const opacity = parseOptionalNumber(viewContext.ice.attr("opacity") ?? viewContext.ice.style("opacity")) ?? 0.9;
  return {
    fill: colorToRgba(viewContext.ice.attr("fill") ?? viewContext.ice.style("fill"), "#f1f8fe", opacity),
    stroke: colorToRgba(viewContext.ice.attr("stroke") ?? viewContext.ice.style("stroke"), "#e8f0f6", opacity),
    strokeWidth:
      parseOptionalNumber(viewContext.ice.attr("stroke-width") ?? viewContext.ice.style("stroke-width")) ?? 0.5
  };
}

function getHeightStyle(viewContext: Readonly<ViewContext>): DeckHeightStyle {
  const land = viewContext.terrs?.select<SVGGElement>("#landHeights");
  const ocean = viewContext.terrs?.select<SVGGElement>("#oceanHeights");
  return {
    scheme: land?.attr("scheme") ?? "bright",
    opacity: parseOptionalNumber(land?.attr("opacity") ?? land?.style("opacity")) ?? 1,
    includeOcean: Boolean(Number(ocean?.attr("data-render") ?? 0))
  };
}

function getEmblemStyle(viewContext: Readonly<ViewContext>): {
  opacity: number;
  sizes: Record<DeckEmblemType, number>;
} {
  const emblems = viewContext.emblems;
  return {
    opacity: parseOptionalNumber(emblems?.attr("opacity") ?? emblems?.style("opacity")) ?? 0.9,
    sizes: {
      state: parseOptionalNumber(emblems?.select<SVGGElement>("#stateEmblems").attr("data-size")) ?? 1,
      province: parseOptionalNumber(emblems?.select<SVGGElement>("#provinceEmblems").attr("data-size")) ?? 1,
      burg: parseOptionalNumber(emblems?.select<SVGGElement>("#burgEmblems").attr("data-size")) ?? 1
    }
  };
}

function getBurgIconStyle(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>
): {
  burgIcons: Record<string, DeckBurgIconStyle>;
  anchors: Record<string, DeckBurgIconStyle>;
  visibleGroups: ReadonlySet<string>;
} {
  const groups = worldContext.options.burgs?.groups ?? [];
  const burgIcons: Record<string, DeckBurgIconStyle> = {};
  const anchors: Record<string, DeckBurgIconStyle> = {};
  const visibleGroups = new Set<string>();

  for (const group of groups) {
    visibleGroups.add(group.name);
    burgIcons[group.name] = readBurgIconGroupStyle(
      viewContext.burgIcons?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.burgIcons, group.name),
      { fill: "#3e3e4b", opacity: 1, size: getDefaultBurgIconSize(group.name) }
    );
    anchors[group.name] = readBurgIconGroupStyle(
      viewContext.anchors?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.anchors, group.name),
      { fill: "#ffffff", opacity: 1, size: getDefaultAnchorSize(group.name) }
    );
  }

  burgIcons.town ??= { fill: "#3e3e4b", opacity: 1, size: 4 };
  anchors.town ??= { fill: "#ffffff", opacity: 1, size: 1 };
  if (!visibleGroups.size) visibleGroups.add("town");
  return { burgIcons, anchors, visibleGroups };
}

function getLabelStyle(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>
): {
  state: DeckLabelStyle;
  burgLabels: Record<string, DeckLabelStyle>;
  visibleBurgGroups: ReadonlySet<string>;
} {
  const stateGroup = viewContext.labels?.select<SVGGElement>("#states");
  const state = readLabelStyle(stateGroup, null, { fill: "#3e3e4b", opacity: 1, size: 22, dx: 0, dy: 0 });
  const burgLabels: Record<string, DeckLabelStyle> = {};
  const visibleBurgGroups = new Set<string>();

  for (const group of worldContext.options.burgs?.groups ?? []) {
    visibleBurgGroups.add(group.name);
    burgLabels[group.name] = readLabelStyle(
      viewContext.burgLabels?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.burgLabels, group.name),
      {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgLabelSize(group.name),
        dx: 0,
        dy: group.name === "capital" ? -0.5 : -0.4
      }
    );
  }

  burgLabels.town ??= { fill: "#3e3e4b", opacity: 1, size: 4, dx: 0, dy: -0.4 };
  if (!visibleBurgGroups.size) visibleBurgGroups.add("town");
  return { state, burgLabels, visibleBurgGroups };
}

function readLabelStyle(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null,
  fallback: DeckLabelStyle
): DeckLabelStyle {
  const fill = getStyleString(selection, stored, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, stored, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, stored, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, stored, "font-size")) ??
    fallback.size;
  const dx = parseOptionalNumber(getStyleString(selection, stored, "data-dx")) ?? fallback.dx;
  const dy = parseOptionalNumber(getStyleString(selection, stored, "data-dy")) ?? fallback.dy;
  return { fill, opacity, size, dx, dy };
}

function getDefaultBurgLabelSize(group: string): number {
  if (group === "capital") return 6;
  if (group === "city") return 5;
  if (group === "town") return 4;
  if (group === "village") return 3;
  return 2;
}

function getMarkerStyle(viewContext: Readonly<ViewContext>): DeckMarkerStyle {
  const markers = viewContext.markers;
  return {
    pinnedOnly: Boolean(Number(markers?.attr("pinned") ?? 0)),
    rescale: (parseOptionalNumber(markers?.attr("rescale")) ?? 1) !== 0,
    scale: viewContext.scale || 1
  };
}

function getMilitaryBoxSize(viewContext: Readonly<ViewContext>): number {
  return parseOptionalNumber(viewContext.armies?.attr("box-size")) ?? 6;
}

function getMarkerPinUrl(pin: string, fill: string, stroke: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">${getMarkerPinSvg(pin, fill, stroke)}</svg>`
  )}`;
}

function getMarkerPinSvg(pin: string, fill: string, stroke: string): string {
  switch (pin) {
    case "pin":
      return `<path d="m 15,3 c -5.5,0 -9.7,4.09 -9.7,9.3 0,6.8 9.7,17 9.7,17 0,0 9.7,-10.2 9.7,-17 C 24.7,7.09 20.5,3 15,3 Z" fill="${fill}" stroke="${stroke}"/>`;
    case "square":
      return `<path d="m 20,25 -5,4 -5,-4 z" fill="${stroke}"/><path d="M 5,5 H 25 V 25 H 5 Z" fill="${fill}" stroke="${stroke}"/>`;
    case "squarish":
      return `<path d="m 5,5 h 20 v 20 h -6 l -4,4 -4,-4 H 5 Z" fill="${fill}" stroke="${stroke}" />`;
    case "diamond":
      return `<path d="M 2,15 15,1 28,15 15,29 Z" fill="${fill}" stroke="${stroke}" />`;
    case "hex":
      return `<path d="M 15,29 4.61,21 V 9 L 15,3 25.4,9 v 12 z" fill="${fill}" stroke="${stroke}" />`;
    case "hexy":
      return `<path d="M 15,29 6,21 5,8 15,4 25,8 24,21 Z" fill="${fill}" stroke="${stroke}" />`;
    case "shieldy":
      return `<path d="M 15,29 6,21 5,7 c 0,0 5,-3 10,-3 5,0 10,3 10,3 l -1,14 z" fill="${fill}" stroke="${stroke}" />`;
    case "shield":
      return `<path d="M 4.6,5.2 H 25 v 6.7 A 20.3,20.4 0 0 1 15,29 20.3,20.4 0 0 1 4.6,11.9 Z" fill="${fill}" stroke="${stroke}" />`;
    case "pentagon":
      return `<path d="M 4,16 9,4 h 12 l 5,12 -11,13 z" fill="${fill}" stroke="${stroke}" />`;
    case "heptagon":
      return `<path d="M 15,29 6,22 4,12 10,4 h 10 l 6,8 -2,10 z" fill="${fill}" stroke="${stroke}" />`;
    case "circle":
      return `<circle cx="15" cy="15" r="11" fill="${fill}" stroke="${stroke}" />`;
    case "no":
      return "";
    default:
      return `<path d="M6,19 l9,10 L24,19" fill="${stroke}" stroke="none" /><circle cx="15" cy="15" r="10" fill="${fill}" stroke="${stroke}"/>`;
  }
}

function readBurgIconGroupStyle(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null,
  fallback: DeckBurgIconStyle
): DeckBurgIconStyle {
  const hasSelection = selection && !selection.empty();
  const fill = getStyleString(selection, stored, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, stored, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, stored, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, stored, "font-size")) ??
    fallback.size;

  if (!hasSelection && !stored) return fallback;
  return { fill, opacity, size };
}

function getStyleString(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null,
  key: string
): string | null {
  if (selection && !selection.empty()) {
    const attr = selection.attr(key);
    if (attr) return attr;
    const style = selection.style(key);
    if (style) return style;
  }
  const storedValue = stored?.[key];
  return typeof storedValue === "string" && storedValue ? storedValue : null;
}

function getStyleRecord(source: object | null | undefined, key: string): Record<string, unknown> | null {
  if (!source) return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getDefaultBurgIconSize(group: string): number {
  if (group === "capital") return 6;
  if (group === "city") return 5;
  if (group === "town") return 4;
  if (group === "village") return 3;
  return 2;
}

function getDefaultAnchorSize(group: string): number {
  if (group === "capital") return 1.9;
  if (group === "city") return 1.5;
  if (group === "town") return 1;
  return 0.7;
}

function getLayerPaint(
  viewContext: Readonly<ViewContext>,
  root: "lakes" | "coastline",
  id: string,
  fillFallback: string,
  strokeFallback: string,
  strokeWidthFallback: number,
  opacityFallback: number
): LayerPaint {
  if (!viewContext[root]) {
    return {
      fill: colorToRgba(fillFallback, fillFallback, opacityFallback),
      stroke: colorToRgba(strokeFallback, strokeFallback, opacityFallback),
      strokeWidth: strokeWidthFallback
    };
  }
  const group = viewContext[root].select<SVGGElement>(`#${id}`);
  const opacity = parseOptionalNumber(group.attr("opacity") ?? group.style("opacity")) ?? opacityFallback;
  const fill = colorToRgba(group.attr("fill") ?? group.style("fill"), fillFallback, opacity);
  const stroke = colorToRgba(group.attr("stroke") ?? group.style("stroke"), strokeFallback, opacity);
  return {
    fill,
    stroke,
    strokeWidth: parseOptionalNumber(group.attr("stroke-width") ?? group.style("stroke-width")) ?? strokeWidthFallback
  };
}

function parseOptionalNumber(value: string | null | undefined): number | null {
  if (!value || value === "none" || value === "null") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFocusScopeSignature(viewContext: Readonly<ViewContext>): string {
  const scope = viewContext.focusScope;
  if (!scope) return "all";
  return `${scope.kind}:${scope.id}:${scope.stateId}:${setSignature(scope.cellIds)}:${setSignature(scope.gridCellIds)}`;
}

function setSignature(values: ReadonlySet<number>): string {
  let hash = 2166136261;
  for (const value of values) hash = hashNumber(hash, value);
  return `${values.size}:${hash >>> 0}`;
}

function numberListSignature(values: ArrayLike<number> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) hash = hashNumber(hash, values[index] ?? 0);
  return `${values.length}:${hash >>> 0}`;
}

function nestedNumberListSignature(values: ArrayLike<ArrayLike<number>> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    hash = hashNumber(hash, row?.length ?? 0);
    if (!row) continue;
    for (let innerIndex = 0; innerIndex < row.length; innerIndex++) hash = hashNumber(hash, row[innerIndex] ?? 0);
  }
  return `${values.length}:${hash >>> 0}`;
}

function pointListSignature(values: ArrayLike<DeckPosition> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) {
    const point = values[index];
    hash = hashNumber(hash, point?.[0] ?? 0);
    hash = hashNumber(hash, point?.[1] ?? 0);
  }
  return `${values.length}:${hash >>> 0}`;
}

function stringListSignature(values: ArrayLike<string> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) hash = hashString(hash, values[index] ?? "");
  return `${values.length}:${hash >>> 0}`;
}

function colorListSignature(values: ReadonlyArray<{ color?: string }> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const value of values) hash = hashString(hash, value?.color ?? "");
  return `${values.length}:${hash >>> 0}`;
}

function zonesSignature(
  values: ReadonlyArray<{ cells?: number[]; color?: string; hidden?: boolean }> | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const zone of values) {
    hash = hashString(hash, zone?.color ?? "");
    hash = hashNumber(hash, zone?.hidden ? 1 : 0);
    hash = hashNumber(hash, zone?.cells?.length ?? 0);
    for (const cellId of zone?.cells ?? []) hash = hashNumber(hash, cellId);
  }
  return `${values.length}:${hash >>> 0}`;
}

function featuresSignature(
  values:
    | ReadonlyArray<{ i?: number; type?: string; group?: string; firstCell?: number; vertices?: number[] }>
    | undefined,
  type: "lake" | "island"
): string {
  if (!values) return "0:0";
  let count = 0;
  let hash = 2166136261;
  for (const feature of values) {
    if (!feature || feature.type !== type) continue;
    count++;
    hash = hashNumber(hash, feature.i ?? 0);
    hash = hashString(hash, feature.group ?? "");
    hash = hashNumber(hash, feature.firstCell ?? 0);
    hash = hashNumber(hash, feature.vertices?.length ?? 0);
    for (const vertexId of feature.vertices ?? []) hash = hashNumber(hash, vertexId);
  }
  return `${count}:${hash >>> 0}`;
}

function iceSignature(
  values:
    | ReadonlyArray<{
        i?: number;
        type?: string;
        cellId?: number;
        points?: [number, number][];
        offset?: [number, number];
      }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const ice of values) {
    hash = hashNumber(hash, ice?.i ?? 0);
    hash = hashString(hash, ice?.type ?? "");
    hash = hashNumber(hash, ice?.cellId ?? -1);
    hash = hashNumber(hash, ice?.offset?.[0] ?? 0);
    hash = hashNumber(hash, ice?.offset?.[1] ?? 0);
    hash = hashNumber(hash, ice?.points?.length ?? 0);
    for (const point of ice?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function heightStyleSignature(style: DeckHeightStyle): string {
  return `${style.scheme ?? ""}:${style.opacity}:${style.includeOcean ? 1 : 0}`;
}

function emblemStyleSignature(style: { opacity: number; sizes: Record<DeckEmblemType, number> }): string {
  return `${style.opacity}:${style.sizes.state}:${style.sizes.province}:${style.sizes.burg}`;
}

function emblemsSignature(
  states: ReadonlyArray<{
    i?: number;
    removed?: boolean;
    center?: number;
    pole?: [number, number];
    color?: string;
    coa?: { size?: number; x?: number; y?: number } | null;
  }>,
  provinces: ReadonlyArray<{
    i?: number;
    removed?: boolean;
    center?: number;
    pole?: [number, number];
    color?: string;
    coa?: { size?: number; x?: number; y?: number } | null;
  }>,
  burgs: ReadonlyArray<{
    i?: number;
    removed?: boolean;
    cell?: number;
    state?: number;
    x?: number;
    y?: number;
    group?: string;
    coa?: { size?: number; x?: number; y?: number } | null;
  }>
): string {
  let count = 0;
  let hash = 2166136261;
  for (const item of states) {
    if (!item.i || item.removed || !item.coa || item.coa.size === 0) continue;
    count++;
    hash = hashEmblemItem(hash, "state", item);
  }
  for (const item of provinces) {
    if (!item.i || item.removed || !item.coa || item.coa.size === 0) continue;
    count++;
    hash = hashEmblemItem(hash, "province", item);
  }
  for (const item of burgs) {
    if (!item.i || item.removed || !item.coa || item.coa.size === 0) continue;
    count++;
    hash = hashEmblemItem(hash, "burg", item);
  }
  return `${count}:${hash >>> 0}`;
}

function burgIconsSignature(
  burgs: ReadonlyArray<{
    i?: number;
    removed?: boolean;
    cell?: number;
    x?: number;
    y?: number;
    group?: string;
    port?: number;
  }>
): string {
  let count = 0;
  let hash = 2166136261;
  for (const burg of burgs) {
    if (!burg.i || burg.removed) continue;
    count++;
    hash = hashNumber(hash, burg.i);
    hash = hashNumber(hash, burg.cell ?? 0);
    hash = hashNumber(hash, burg.x ?? 0);
    hash = hashNumber(hash, burg.y ?? 0);
    hash = hashString(hash, burg.group ?? "");
    hash = hashNumber(hash, burg.port ?? 0);
  }
  return `${count}:${hash >>> 0}`;
}

function markersSignature(
  markers:
    | ReadonlyArray<{
        i?: number;
        type?: string;
        icon?: string;
        dx?: number;
        dy?: number;
        px?: number;
        cell?: number;
        x?: number;
        y?: number;
        size?: number;
        pin?: string;
        fill?: string;
        stroke?: string;
        pinned?: boolean;
        hidden?: boolean;
      }>
    | undefined
): string {
  if (!markers) return "0:0";
  let count = 0;
  let hash = 2166136261;
  for (const marker of markers) {
    if (!marker.i || marker.hidden) continue;
    count++;
    hash = hashNumber(hash, marker.i);
    hash = hashString(hash, marker.type ?? "");
    hash = hashString(hash, marker.icon ?? "");
    hash = hashNumber(hash, marker.dx ?? 50);
    hash = hashNumber(hash, marker.dy ?? 50);
    hash = hashNumber(hash, marker.px ?? 12);
    hash = hashNumber(hash, marker.cell ?? 0);
    hash = hashNumber(hash, marker.x ?? 0);
    hash = hashNumber(hash, marker.y ?? 0);
    hash = hashNumber(hash, marker.size ?? 30);
    hash = hashString(hash, marker.pin ?? "bubble");
    hash = hashString(hash, marker.fill ?? "#ffffff");
    hash = hashString(hash, marker.stroke ?? "#000000");
    hash = hashNumber(hash, marker.pinned ? 1 : 0);
  }
  return `${count}:${hash >>> 0}`;
}

function militarySignature(
  states:
    | ReadonlyArray<{
        i?: number;
        removed?: boolean;
        color?: string;
        military?: ReadonlyArray<{
          i?: number;
          name?: string;
          a?: number;
          cell?: number;
          x?: number;
          y?: number;
          n?: number;
          icon?: string;
          angle?: number;
          actionStatus?: string;
          isCapitalGuard?: boolean;
          u?: Record<string, number>;
        }>;
      }>
    | undefined
): string {
  if (!states) return "0:0";
  let count = 0;
  let hash = 2166136261;
  for (const state of states) {
    if (!state.i || state.removed) continue;
    hash = hashNumber(hash, state.i);
    hash = hashString(hash, state.color ?? "");
    for (const regiment of state.military ?? []) {
      if (!regiment.i && regiment.i !== 0) continue;
      count++;
      hash = hashNumber(hash, regiment.i);
      hash = hashString(hash, regiment.name ?? "");
      hash = hashNumber(hash, regiment.a ?? 0);
      hash = hashNumber(hash, regiment.cell ?? 0);
      hash = hashNumber(hash, regiment.x ?? 0);
      hash = hashNumber(hash, regiment.y ?? 0);
      hash = hashNumber(hash, regiment.n ?? 0);
      hash = hashString(hash, regiment.icon ?? "");
      hash = hashNumber(hash, regiment.angle ?? 0);
      hash = hashString(hash, regiment.actionStatus ?? "");
      hash = hashNumber(hash, regiment.isCapitalGuard ? 1 : 0);
      for (const [unit, amount] of Object.entries(regiment.u ?? {}).sort()) {
        hash = hashString(hash, unit);
        hash = hashNumber(hash, amount);
      }
    }
  }
  return `${count}:${hash >>> 0}`;
}

function labelsSignature(
  states:
    | ReadonlyArray<{
        i?: number;
        removed?: boolean;
        lock?: boolean;
        center?: number;
        name?: string;
        fullName?: string;
        pole?: [number, number];
      }>
    | undefined,
  burgs:
    | ReadonlyArray<{
        i?: number;
        removed?: boolean;
        cell?: number;
        x?: number;
        y?: number;
        name?: string;
        group?: string;
      }>
    | undefined
): string {
  let count = 0;
  let hash = 2166136261;
  for (const state of states ?? []) {
    if (!state.i || state.removed || state.lock) continue;
    count++;
    hash = hashString(hash, "state");
    hash = hashNumber(hash, state.i);
    hash = hashNumber(hash, state.center ?? 0);
    hash = hashString(hash, state.name ?? "");
    hash = hashString(hash, state.fullName ?? "");
    hash = hashNumber(hash, state.pole?.[0] ?? 0);
    hash = hashNumber(hash, state.pole?.[1] ?? 0);
  }
  for (const burg of burgs ?? []) {
    if (!burg.i || burg.removed) continue;
    count++;
    hash = hashString(hash, "burg");
    hash = hashNumber(hash, burg.i);
    hash = hashNumber(hash, burg.cell ?? 0);
    hash = hashNumber(hash, burg.x ?? 0);
    hash = hashNumber(hash, burg.y ?? 0);
    hash = hashString(hash, burg.name ?? "");
    hash = hashString(hash, burg.group ?? "");
  }
  return `${count}:${hash >>> 0}`;
}

function markerStyleSignature(style: DeckMarkerStyle): string {
  return `${style.pinnedOnly ? 1 : 0}:${style.rescale ? 1 : 0}:${style.scale}`;
}

function labelStyleSignature(style: {
  state: DeckLabelStyle;
  burgLabels: Record<string, DeckLabelStyle>;
  visibleBurgGroups: ReadonlySet<string>;
}): string {
  let hash = 2166136261;
  hash = hashLabelStyle(hash, "states", style.state);
  for (const group of [...style.visibleBurgGroups].sort()) hash = hashString(hash, group);
  for (const group of Object.keys(style.burgLabels).sort()) {
    hash = hashLabelStyle(hash, group, style.burgLabels[group]);
  }
  return hash.toString();
}

function hashLabelStyle(hash: number, key: string, style: DeckLabelStyle): number {
  let next = hashString(hash, key);
  next = hashString(next, style.fill);
  next = hashNumber(next, style.opacity);
  next = hashNumber(next, style.size);
  next = hashNumber(next, style.dx);
  next = hashNumber(next, style.dy);
  return next;
}

function burgIconStyleSignature(style: {
  burgIcons: Record<string, DeckBurgIconStyle>;
  anchors: Record<string, DeckBurgIconStyle>;
  visibleGroups: ReadonlySet<string>;
}): string {
  let hash = 2166136261;
  for (const group of [...style.visibleGroups].sort()) hash = hashString(hash, group);
  hash = hashBurgIconStyleMap(hash, style.burgIcons);
  hash = hashBurgIconStyleMap(hash, style.anchors);
  return hash.toString();
}

function hashBurgIconStyleMap(hash: number, styles: Record<string, DeckBurgIconStyle>): number {
  let next = hash;
  for (const key of Object.keys(styles).sort()) {
    const style = styles[key];
    next = hashString(next, key);
    next = hashString(next, style.fill);
    next = hashNumber(next, style.opacity);
    next = hashNumber(next, style.size);
  }
  return next;
}

function hashEmblemItem(
  hash: number,
  type: string,
  item: {
    i?: number;
    center?: number;
    cell?: number;
    state?: number;
    x?: number;
    y?: number;
    pole?: [number, number];
    color?: string;
    group?: string;
    coa?: { size?: number; x?: number; y?: number } | null;
  }
): number {
  let next = hashString(hash, type);
  next = hashNumber(next, item.i ?? 0);
  next = hashNumber(next, item.center ?? item.cell ?? 0);
  next = hashNumber(next, item.state ?? 0);
  next = hashNumber(next, item.x ?? 0);
  next = hashNumber(next, item.y ?? 0);
  next = hashNumber(next, item.pole?.[0] ?? 0);
  next = hashNumber(next, item.pole?.[1] ?? 0);
  next = hashString(next, item.color ?? "");
  next = hashString(next, item.group ?? "");
  next = hashNumber(next, item.coa?.size ?? 1);
  next = hashNumber(next, item.coa?.x ?? 0);
  next = hashNumber(next, item.coa?.y ?? 0);
  return next;
}

function paintSignature(values: Record<string, LayerPaint>): string {
  let hash = 2166136261;
  for (const key of Object.keys(values).sort()) {
    const paint = values[key];
    hash = hashString(hash, key);
    for (const value of paint.fill) hash = hashNumber(hash, value);
    for (const value of paint.stroke) hash = hashNumber(hash, value);
    hash = hashNumber(hash, paint.strokeWidth);
  }
  return hash.toString();
}

function riversSignature(
  values:
    | ReadonlyArray<{
        i?: number;
        cells?: number[];
        points?: [number, number][];
        sourceWidth?: number;
        widthFactor?: number;
      }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const river of values) {
    hash = hashNumber(hash, river?.i ?? 0);
    hash = hashNumber(hash, river?.sourceWidth ?? 0);
    hash = hashNumber(hash, river?.widthFactor ?? 0);
    hash = hashNumber(hash, river?.cells?.length ?? 0);
    for (const cellId of river?.cells ?? []) hash = hashNumber(hash, cellId);
    hash = hashNumber(hash, river?.points?.length ?? 0);
    for (const point of river?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function routesSignature(
  values:
    | ReadonlyArray<{ i?: number; group?: string; cells?: number[]; points?: [number, number, number?][] }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const route of values) {
    hash = hashNumber(hash, route?.i ?? 0);
    hash = hashString(hash, route?.group ?? "");
    hash = hashNumber(hash, route?.cells?.length ?? 0);
    for (const cellId of route?.cells ?? []) hash = hashNumber(hash, cellId);
    hash = hashNumber(hash, route?.points?.length ?? 0);
    for (const point of route?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function hashString(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index++) next = hashNumber(next, value.charCodeAt(index));
  return next;
}

function hashNumber(hash: number, value: number): number {
  let next = hash;
  next ^= Math.round(value * 1000);
  return Math.imul(next, 16777619);
}
