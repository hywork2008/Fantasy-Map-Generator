import { COORDINATE_SYSTEM, type LayersList } from "@deck.gl/core";
import {
  MaskExtension,
  type MaskExtensionProps,
  PathStyleExtension,
  type PathStyleExtensionProps
} from "@deck.gl/extensions";
import {
  BitmapLayer,
  IconLayer,
  PathLayer,
  type PathLayerProps,
  PolygonLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  type SolidPolygonLayerProps,
  TextLayer
} from "@deck.gl/layers";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { getOceanPathsCacheSize, renderOceanDepthToOffscreenCanvas } from "../../renderers/ocean-layers";
import { useLayerState } from "../../store/layerState";
import { EMBLEM_ICON_RASTER_SIZE } from "../emblem-renderer";
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
  buildLandCellGeometry,
  buildLandMaskPolygons,
  buildLandPolygonsBase,
  buildMarkerSymbols,
  buildMilitaryBoxPolygons,
  buildMilitaryRegimentSymbols,
  buildPopulationPolygons,
  buildPrecipitationPolygons,
  buildProvincePolygons,
  buildReligionPolygons,
  buildRiverPolygons,
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
  type DeckLandCellGeometry,
  type DeckLandMaskPolygon,
  type DeckMarkerStyle,
  type DeckMarkerSymbol,
  type DeckMilitaryBoxPolygon,
  type DeckMilitaryRegimentSymbol,
  type DeckPath,
  type DeckPosition,
  type DeckRiverPolygon
} from "./adapters/deckDataAdapters";
import { BURG_ICON_RASTER_SIZE, getBurgIconRasterCacheVersion } from "./burgIconRasterCache";
import { getEmblemIconCacheVersion } from "./emblemIconCache";
import { getCachedEmojiIconUrl, getEmojiIconCacheVersion } from "./emojiIconCache";
import { getExtensionWebglLayers } from "./extensionWebglLayerRegistry";
import { getExternalIconFailureCacheVersion, markExternalIconFailed } from "./externalIconFailureCache";
import {
  getBurgIconStyle,
  getCellLayerOpacities,
  getCoastlinePaint,
  getEmblemStyle,
  getHeightStyle,
  getIcePaint,
  getLabelStyle,
  getLakePaint,
  getMarkerStyle,
  getMilitaryBoxSize,
  getPathDashStyles,
  getPathPaintStyles,
  getRiverPaint,
  type LayerPaint
} from "./webglStyleExtractors";

type PolygonBuilder = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  landCells?: ReadonlyArray<DeckLandCellGeometry>
) => DeckCellPolygon[];
type PathBuilder = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  styles: PathStyles
) => DeckPath[];

interface PathStyles {
  dashStyles: ReturnType<typeof getPathDashStyles>;
  paintStyles: ReturnType<typeof getPathPaintStyles>;
}
type CachedDeckData =
  | DeckBurgIconSymbol[]
  | DeckCellPolygon[]
  | DeckEmblemIcon[]
  | DeckIcePolygon[]
  | DeckLabelSymbol[]
  | DeckLandCellGeometry[]
  | DeckLandMaskPolygon[]
  | DeckMarkerSymbol[]
  | DeckMilitaryBoxPolygon[]
  | DeckMilitaryRegimentSymbol[]
  | DeckPath[]
  | DeckRiverPolygon[];

interface CachedDeckDataEntry<T extends CachedDeckData> {
  signature: string;
  data: T;
}

const deckLayerDataCache = new Map<string, CachedDeckDataEntry<CachedDeckData>>();

/** Module-level cache for the ocean-depth offscreen canvas (not in deckLayerDataCache because HTMLCanvasElement is not CachedDeckData). */
const oceanDepthCanvasCache: { signature: string; canvas: HTMLCanvasElement | null } = { signature: "", canvas: null };

const WEBGL_POLYGON_LAYERS: Array<{
  toggle: string;
  id: string;
  build: PolygonBuilder;
  boundary?: DeckDivisionBoundaryKind;
  maskLand?: boolean;
}> = [
  {
    toggle: "toggleHeight",
    id: "height",
    build: (world, view) => buildHeightPolygons(world, view.focusScope, getHeightStyle(view))
  },
  {
    toggle: "toggleBiomes",
    id: "biomes",
    build: (world, view, landCells) =>
      buildBiomesPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).biomes),
    maskLand: true
  },
  {
    toggle: "toggleReligions",
    id: "religions",
    build: (world, view, landCells) =>
      buildReligionPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).religions),
    boundary: "religion",
    maskLand: true
  },
  {
    toggle: "toggleCultures",
    id: "cultures",
    build: (world, view, landCells) =>
      buildCulturePolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).cultures),
    boundary: "culture",
    maskLand: true
  },
  {
    toggle: "toggleStates",
    id: "states",
    build: (world, view, landCells) =>
      buildStatePolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).states),
    boundary: "state",
    maskLand: true
  },
  {
    toggle: "toggleProvinces",
    id: "provinces",
    build: (world, view, landCells) =>
      buildProvincePolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).provinces),
    boundary: "province",
    maskLand: true
  },
  {
    toggle: "toggleZones",
    id: "zones",
    build: (world, view, landCells) =>
      buildZonePolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).zones)
  },
  {
    toggle: "toggleTemperature",
    id: "temperature",
    build: (world, view) => buildTemperaturePolygons(world, view.focusScope, getCellLayerOpacities(view).temperature)
  },
  {
    toggle: "togglePopulation",
    id: "population",
    build: (world, view, landCells) =>
      buildPopulationPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).population)
  },
  {
    toggle: "togglePrecipitation",
    id: "precipitation",
    build: (world, view, landCells) =>
      buildPrecipitationPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).precipitation)
  },
  {
    toggle: "toggleDanger",
    id: "danger",
    build: (world, view, landCells) =>
      buildDangerPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).danger)
  }
];

const WEBGL_PATH_LAYERS: Array<{ toggle: string; id: string; build: PathBuilder }> = [
  { toggle: "toggleCells", id: "cells", build: (world, view) => buildCellOutlinePaths(world, view.focusScope) },
  { toggle: "toggleGrid", id: "grid", build: (world, view) => buildGridPaths(world, view.focusScope) },
  {
    toggle: "toggleBorders",
    id: "borders",
    build: (world, view, styles) =>
      buildBorderPaths(
        world,
        view.focusScope,
        {
          state: styles.dashStyles.stateBorders,
          province: styles.dashStyles.provinceBorders
        },
        {
          state: styles.paintStyles.stateBorders,
          province: styles.paintStyles.provinceBorders
        }
      )
  },
  {
    toggle: "toggleRoutes",
    id: "routes",
    build: (world, view, styles) =>
      buildRoutePaths(
        world,
        view.focusScope,
        {
          roads: styles.dashStyles.roads,
          trails: styles.dashStyles.trails,
          searoutes: styles.dashStyles.searoutes
        },
        {
          roads: styles.paintStyles.roads,
          trails: styles.paintStyles.trails,
          searoutes: styles.paintStyles.searoutes
        }
      )
  }
];

const PATH_STYLE_EXTENSION = new PathStyleExtension({ dash: true, highPrecisionDash: true });
const SOLID_DASH_ARRAY = [0, 0] as const;
const LAND_MASK_ID = "fmg-webgl-land-mask";
const LAND_MASK_EXTENSION = new MaskExtension();

export const WEBGL_LAYER_TOGGLES = new Set([
  ...WEBGL_POLYGON_LAYERS.map(layer => layer.toggle),
  ...WEBGL_PATH_LAYERS.map(layer => layer.toggle),
  "toggleRivers",
  "toggleBurgIcons",
  "toggleIce",
  "toggleEmblems",
  "toggleMarkers",
  "toggleMilitary",
  "toggleLabels"
]);

const EMBLEM_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><path fill="white" d="M64 6l46 16v35c0 31-19 53-46 65-27-12-46-34-46-65V22z"/></svg>'
)}`;
const BURG_ICON_URLS: Record<DeckBurgIconType, string> = {
  burg: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><circle fill="white" cx="64" cy="64" r="54"/></svg>'
  )}`,
  anchor: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><path fill="white" d="M58 14h12v16h24v12H70v49c12-3 22-11 29-23l10 6c-10 21-26 33-45 39-19-6-35-18-45-39l10-6c7 12 17 20 29 23V42H34V30h24z"/></svg>'
  )}`
};
// A 1×1 transparent PNG used as a placeholder while real icon images are being loaded/rasterized.
// Must NOT be an SVG data URL: createImageBitmap() rejects SVGs without explicit natural dimensions
// (width/height attributes), which crashes the WebGL renderer and triggers SVG mode fallback.
const EMPTY_ICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

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
  const lakePaint = getLakePaint(viewContext);
  const coastlinePaint = getCoastlinePaint(viewContext);
  const icePaint = getIcePaint(viewContext);
  const emblemStyle = getEmblemStyle(viewContext);
  const burgIconStyle = getBurgIconStyle(worldContext, viewContext);
  const markerStyle = getMarkerStyle(viewContext);
  const labelStyle = getLabelStyle(worldContext, viewContext);
  const pathDashStyles = getPathDashStyles(viewContext);
  const pathPaintStyles = getPathPaintStyles(viewContext);
  const riverPaint = getRiverPaint(viewContext);
  const cellLayerOpacities = getCellLayerOpacities(viewContext);
  const signatures = buildLayerSignatures(worldContext, viewContext, oceanFill, landFill, activeLayers, {
    lakePaint,
    coastlinePaint,
    icePaint,
    emblemStyle,
    burgIconStyle,
    markerStyle,
    labelStyle,
    pathDashStyles,
    pathPaintStyles,
    riverPaint,
    cellLayerOpacities
  });
  // Shared land-cell vertex geometry: the "land" layer always needs it, and every simultaneously
  // active land-based overlay (biomes/cultures/religions/states/provinces/zones/precipitation/
  // danger/population) reuses this same array instead of repeating the per-cell vertex lookup.
  const landCells = getCachedDeckData("land-geometry", signatures.landGeometrySignature, () =>
    buildLandCellGeometry(worldContext, viewContext.focusScope)
  );
  const landMaskPolygons = getCachedDeckData("land-mask", signatures.landMask, () =>
    buildLandMaskPolygons(worldContext, viewContext.focusScope, appServices)
  );
  const hasLandMask = landMaskPolygons.length > 0;
  const layers: LayersList = [
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-background",
      data: getCachedDeckData("background", signatures.background, () => buildBackgroundPolygons(worldContext)),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: () => oceanColor,
      pickable: false
    }),
    // Ocean depth gradient rendered as a BitmapLayer from the same offscreen canvas that SVG mode
    // uses (same curveBasisClosed paths, same #ecf2f9 overlay, same cumulative opacity stacking).
    // This gives pixel-identical appearance to the SVG canvas effect.
    // The canvas is cached in oceanDepthCanvasCache (separate from deckLayerDataCache because
    // HTMLCanvasElement is not a CachedDeckData array type) and is only re-generated — and
    // re-uploaded to the GPU as a WebGL texture — when the ocean path data actually changes.
    ...(() => {
      const oceanPathSignature = `ocean-depth|${worldContext.mapId}|paths:${getOceanPathsCacheSize()}|${worldContext.graphWidth}x${worldContext.graphHeight}`;
      if (oceanDepthCanvasCache.signature !== oceanPathSignature) {
        oceanDepthCanvasCache.canvas = renderOceanDepthToOffscreenCanvas(
          worldContext.graphWidth,
          worldContext.graphHeight
        );
        oceanDepthCanvasCache.signature = oceanPathSignature;
      }
      const oceanDepthCanvas = oceanDepthCanvasCache.canvas;
      if (!oceanDepthCanvas) return [];
      return [
        new BitmapLayer({
          id: "fmg-webgl-ocean-depth",
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          image: oceanDepthCanvas,
          // bounds = [left, bottom, right, top] in CARTESIAN space (Y increases downward).
          // The OffscreenCanvas is drawn with Y=0 at the top (standard Canvas convention), so
          // swapping the Y values (bottom=graphHeight, top=0) un-flips the image.
          bounds: [0, worldContext.graphHeight, worldContext.graphWidth, 0],
          pickable: false
        })
      ];
    })(),
    ...(hasLandMask
      ? [
          new SolidPolygonLayer<DeckLandMaskPolygon>({
            id: LAND_MASK_ID,
            data: landMaskPolygons,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: datum => datum.polygon,
            getFillColor: datum => datum.fillColor,
            operation: "mask",
            pickable: false
          })
        ]
      : []),
    ...(hasLandMask
      ? [
          createLandMaskedPolygonLayer({
            id: "fmg-webgl-land",
            data: getCachedDeckData("land", signatures.land, () =>
              buildLandPolygonsBase(worldContext, viewContext.focusScope, landFill, landCells)
            ),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: datum => datum.polygon,
            getFillColor: datum => datum.fillColor,
            pickable: true
          })
        ]
      : [
          new SolidPolygonLayer<DeckCellPolygon>({
            id: "fmg-webgl-land",
            data: getCachedDeckData("land", signatures.land, () =>
              buildLandPolygonsBase(worldContext, viewContext.focusScope, landFill, landCells)
            ),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: datum => datum.polygon,
            getFillColor: datum => datum.fillColor,
            pickable: true
          })
        ])
  ];

  for (const layer of WEBGL_POLYGON_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      layer.maskLand && hasLandMask
        ? createLandMaskedPolygonLayer({
            id: `fmg-webgl-${layer.id}`,
            data: getCachedDeckData(`polygon:${layer.id}`, signatures.byLayer[layer.id], () =>
              layer.build(worldContext, viewContext, landCells)
            ),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: datum => datum.polygon,
            getFillColor: datum => datum.fillColor,
            pickable: true
          })
        : new SolidPolygonLayer<DeckCellPolygon>({
            id: `fmg-webgl-${layer.id}`,
            data: getCachedDeckData(`polygon:${layer.id}`, signatures.byLayer[layer.id], () =>
              layer.build(worldContext, viewContext, landCells)
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
        createDashedPathLayer({
          id: `fmg-webgl-${layer.id}-boundaries`,
          data: getCachedDeckData(`boundary:${layer.boundary}`, signatures.byLayer[`${layer.id}-boundaries`], () =>
            buildDivisionBoundaryPaths(
              worldContext,
              viewContext.focusScope,
              boundary,
              boundary === "state"
                ? pathDashStyles.stateBorders
                : boundary === "province"
                  ? pathDashStyles.provinceBorders
                  : undefined,
              boundary === "state"
                ? pathPaintStyles.stateBorders
                : boundary === "province"
                  ? pathPaintStyles.provinceBorders
                  : undefined
            )
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
          extensions: [PATH_STYLE_EXTENSION],
          getDashArray: datum => datum.dashArray ?? SOLID_DASH_ARRAY,
          pickable: false
        })
      );
    }
  }

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

  for (const layer of getExtensionWebglLayers(activeLayers)) {
    if (layer.type === "polygon") {
      layers.push(
        new SolidPolygonLayer({
          id: `fmg-webgl-extension-${layer.id}`,
          data: layer.data,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPolygon: datum => datum.polygon,
          getFillColor: datum => datum.fillColor,
          pickable: false
        })
      );
      continue;
    }

    layers.push(
      new ScatterplotLayer({
        id: `fmg-webgl-extension-${layer.id}`,
        data: layer.data,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getFillColor: datum => datum.fillColor,
        getLineColor: datum => datum.lineColor ?? datum.fillColor,
        getRadius: datum => datum.radius,
        getLineWidth: datum => datum.lineWidth ?? 0,
        radiusUnits: layer.radiusUnits ?? "common",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: false
      })
    );
  }

  if (activeLayers.toggleEmblems) {
    layers.push(
      new IconLayer<DeckEmblemIcon>({
        id: "fmg-webgl-emblems",
        data: getCachedDeckData("icons:emblems", signatures.byLayer.emblems, () =>
          buildEmblemIcons(worldContext, viewContext.focusScope, emblemStyle.sizes, emblemStyle.opacity, appServices)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.position,
        getIcon: datum =>
          datum.iconUrl
            ? {
                id: datum.id,
                url: datum.iconUrl,
                width: EMBLEM_ICON_RASTER_SIZE,
                height: EMBLEM_ICON_RASTER_SIZE,
                anchorX: EMBLEM_ICON_RASTER_SIZE / 2,
                anchorY: EMBLEM_ICON_RASTER_SIZE / 2,
                mask: false
              }
            : { id: "shield", url: EMBLEM_ICON_URL, width: 128, height: 128, anchorX: 64, anchorY: 64, mask: true },
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
        getIcon: datum =>
          datum.iconUrl
            ? {
                id: datum.iconUrl,
                url: datum.iconUrl,
                width: BURG_ICON_RASTER_SIZE,
                height: BURG_ICON_RASTER_SIZE,
                anchorX: BURG_ICON_RASTER_SIZE / 2,
                anchorY: BURG_ICON_RASTER_SIZE / 2,
                mask: datum.mask
              }
            : {
                id: datum.type,
                url: BURG_ICON_URLS[datum.type],
                width: 128,
                height: 128,
                anchorX: 64,
                anchorY: 64,
                mask: true
              },
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
        pickable: false,
        onIconError: context => markExternalIconFailed(context.url)
      })
    );
  }

  if (activeLayers.toggleRivers) {
    layers.push(
      hasLandMask
        ? createLandMaskedPolygonLayer<DeckRiverPolygon>({
            id: "fmg-webgl-rivers",
            data: getCachedDeckData("polygon:rivers", signatures.byLayer.rivers, () =>
              buildRiverPolygons(worldContext, viewContext.focusScope, riverPaint.color)
            ),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: datum => datum.polygon,
            getFillColor: datum => datum.fillColor,
            pickable: true
          })
        : new SolidPolygonLayer<DeckRiverPolygon>({
            id: "fmg-webgl-rivers",
            data: getCachedDeckData("polygon:rivers", signatures.byLayer.rivers, () =>
              buildRiverPolygons(worldContext, viewContext.focusScope, riverPaint.color)
            ),
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
      createDashedPathLayer({
        id: `fmg-webgl-${layer.id}`,
        data: getCachedDeckData(`path:${layer.id}`, signatures.byLayer[layer.id], () =>
          layer.build(worldContext, viewContext, {
            dashStyles: pathDashStyles,
            paintStyles: pathPaintStyles
          })
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
        extensions: [PATH_STYLE_EXTENSION],
        getDashArray: datum => datum.dashArray ?? SOLID_DASH_ARRAY,
        // Keep picking behavior unchanged: a route or border remains selectable inside a visual gap.
        dashGapPickable: true,
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
        getAngle: datum => datum.angle,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        sizeUnits: "common",
        billboard: false,
        pickable: true,
        // fontFamily/outlineColor are layer-wide (deck.gl's TextLayer has no per-datum equivalent
        // for either), so the state label's style stands in for burg labels too — every built-in
        // style preset already keeps these consistent across all label groups.
        fontFamily: labelStyle.state.fontFamily,
        fontSettings: { sdf: true },
        outlineWidth: 1,
        outlineColor: colorToRgba(labelStyle.state.haloColor, "#ffffff"),
        // TextLayer's font atlas defaults to ASCII 32-127 only, which silently drops CJK (and any
        // other non-ASCII) glyphs instead of falling back — "auto" makes it scan the actual label
        // text and include whatever characters are really used, matching the SVG renderer (a plain
        // <text> element has no such restriction).
        characterSet: "auto"
      })
    );
  }

  // Pushed after rivers/borders/routes/coastline/labels (and before nothing else) to match the SVG
  // renderer's stacking order, where the #armies <g> is appended after #rivers/#borders/#routes/
  // #coastline/#icons/#labels in initViewLayers.ts — armies must render on top of all of them.
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
        getColor: () => [255, 255, 255, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        billboard: false,
        pickable: false
      }),
      // Unit icon (emoji): rendered as a full-color IconLayer via Canvas 2D rasterization.
      // TextLayer uses a monochrome font atlas that flattens emoji to black silhouettes.
      // Filter out data whose emoji URL is not yet ready to avoid "Icon url is missing" errors;
      // fmg:webgl-emoji-icon-ready will trigger a rebuild once the raster is available.
      new IconLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-icons",
        data: militarySymbols.filter(
          regiment => !regiment.isExternalIcon && !!getCachedEmojiIconUrl(regiment.unitIcon)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.unitIconPosition,
        getIcon: datum => {
          const url = getCachedEmojiIconUrl(datum.unitIcon) || EMPTY_ICON_URL;
          return {
            id: `emoji-unit-${datum.unitIcon}`,
            url,
            width: 64,
            height: 64,
            anchorX: 32,
            anchorY: 32,
            mask: false
          };
        },
        getSize: datum => datum.size * 2,
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
      // Action status icon (emoji): same canvas-rasterized IconLayer approach.
      // Filter out records not yet ready (see fmg:webgl-emoji-icon-ready for rebuild trigger).
      new IconLayer<DeckMilitaryRegimentSymbol>({
        id: "fmg-webgl-military-actions",
        data: militarySymbols.filter(regiment => !!getCachedEmojiIconUrl(regiment.actionIcon)),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: datum => datum.actionIconPosition,
        getIcon: datum => {
          const url = getCachedEmojiIconUrl(datum.actionIcon) || EMPTY_ICON_URL;
          return {
            id: `emoji-action-${datum.actionIcon}`,
            url,
            width: 64,
            height: 64,
            anchorX: 32,
            anchorY: 32,
            mask: false
          };
        },
        getSize: datum => datum.size * 2,
        getAngle: datum => datum.angle,
        sizeUnits: "common",
        billboard: false,
        pickable: false
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

/**
 * PathLayer's constructor type does not infer extension props, so accept the combined props here
 * and retain the extension's typed getDashArray accessor at the call site.
 */
function createDashedPathLayer(
  props: PathLayerProps<DeckPath> & PathStyleExtensionProps<DeckPath>
): PathLayer<DeckPath, PathStyleExtensionProps<DeckPath>> {
  return new PathLayer<DeckPath, PathStyleExtensionProps<DeckPath>>(props);
}

/** Applies the curved island mask to a land-derived polygon layer. */
function createLandMaskedPolygonLayer<T extends DeckCellPolygon | DeckRiverPolygon>(
  props: SolidPolygonLayerProps<T>
): SolidPolygonLayer<T, MaskExtensionProps> {
  const maskedProps: SolidPolygonLayerProps<T> & MaskExtensionProps = {
    ...props,
    extensions: [LAND_MASK_EXTENSION],
    maskId: LAND_MASK_ID,
    // A land cell may cross the coastline. Clip its fragments rather than only testing its anchor.
    maskByInstance: false
  };
  return new SolidPolygonLayer<T, MaskExtensionProps>(maskedProps);
}

/** Wraps a computation so it runs at most once per `buildLayerSignatures()` call, on first use. */
function memo<T>(compute: () => T): () => T {
  let cached: T | undefined;
  let computed = false;
  return () => {
    if (!computed) {
      cached = compute();
      computed = true;
    }
    return cached as T;
  };
}

interface SignatureStyles {
  lakePaint: Record<string, LayerPaint>;
  coastlinePaint: Record<string, LayerPaint>;
  icePaint: LayerPaint;
  emblemStyle: ReturnType<typeof getEmblemStyle>;
  burgIconStyle: ReturnType<typeof getBurgIconStyle>;
  markerStyle: DeckMarkerStyle;
  labelStyle: ReturnType<typeof getLabelStyle>;
  pathDashStyles: ReturnType<typeof getPathDashStyles>;
  pathPaintStyles: ReturnType<typeof getPathPaintStyles>;
  riverPaint: ReturnType<typeof getRiverPaint>;
  cellLayerOpacities: ReturnType<typeof getCellLayerOpacities>;
}

/**
 * Only computes a `byLayer` signature (each an O(cells) hash) for currently active layers, and
 * reuses the paint/style objects `buildDeckLayers()` already computed instead of recalling the
 * webglStyleExtractors.ts getters a second time — toggling one layer used to re-hash all ~24 keys.
 */
function buildLayerSignatures(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  oceanFill: string,
  landFill: string,
  activeLayers: Record<string, boolean>,
  styles: SignatureStyles
): {
  background: string;
  land: string;
  landGeometrySignature: string;
  landMask: string;
  byLayer: Record<string, string>;
} {
  const { pack, grid, biomesData, mapId, graphWidth, graphHeight } = worldContext;
  const scope = getFocusScopeSignature(viewContext);

  const geometry = memo(
    () => `${mapId}|${scope}|${pointListSignature(pack.vertices?.p)}|${nestedNumberListSignature(pack.cells?.v)}`
  );
  const cellHeights = memo(() => numberListSignature(pack.cells?.h));
  const landGeometry = memo(() => `${geometry()}|h:${cellHeights()}`);
  const gridGeometry = memo(
    () => `${mapId}|${scope}|${pointListSignature(grid.vertices?.p)}|${nestedNumberListSignature(grid.cells?.v)}`
  );
  const gridHeights = memo(() => numberListSignature(grid.cells?.h));
  const states = memo(() => `${numberListSignature(pack.cells?.state)}|${colorListSignature(pack.states)}`);
  const provinces = memo(() => `${numberListSignature(pack.cells?.province)}|${colorListSignature(pack.provinces)}`);
  const cultures = memo(() => `${numberListSignature(pack.cells?.culture)}|${colorListSignature(pack.cultures)}`);
  const religions = memo(() => `${numberListSignature(pack.cells?.religion)}|${colorListSignature(pack.religions)}`);

  const byLayer: Record<string, string> = {};
  const setIfActive = (key: string, toggle: string, compute: () => string) => {
    if (activeLayers[toggle]) byLayer[key] = compute();
  };

  setIfActive(
    "height",
    "toggleHeight",
    () => `${gridGeometry()}|${gridHeights()}|${heightStyleSignature(getHeightStyle(viewContext))}`
  );
  setIfActive(
    "biomes",
    "toggleBiomes",
    () =>
      `${landGeometry()}|${numberListSignature(pack.cells?.biome)}|${stringListSignature(biomesData.color)}|op:${styles.cellLayerOpacities.biomes}`
  );
  setIfActive(
    "religions",
    "toggleReligions",
    () => `${landGeometry()}|${religions()}|op:${styles.cellLayerOpacities.religions}`
  );
  setIfActive("religions-boundaries", "toggleReligions", () => `${landGeometry()}|${religions()}`);
  setIfActive(
    "cultures",
    "toggleCultures",
    () => `${landGeometry()}|${cultures()}|op:${styles.cellLayerOpacities.cultures}`
  );
  setIfActive("cultures-boundaries", "toggleCultures", () => `${landGeometry()}|${cultures()}`);
  setIfActive("states", "toggleStates", () => `${landGeometry()}|${states()}|op:${styles.cellLayerOpacities.states}`);
  setIfActive(
    "states-boundaries",
    "toggleStates",
    () =>
      `${landGeometry()}|${states()}|${pathDashStyleSignature(styles.pathDashStyles, ["stateBorders"])}|${pathPaintStyleSignature(styles.pathPaintStyles, ["stateBorders"])}`
  );
  setIfActive(
    "provinces",
    "toggleProvinces",
    () => `${landGeometry()}|${provinces()}|op:${styles.cellLayerOpacities.provinces}`
  );
  setIfActive(
    "provinces-boundaries",
    "toggleProvinces",
    () =>
      `${landGeometry()}|${provinces()}|${pathDashStyleSignature(styles.pathDashStyles, ["provinceBorders"])}|${pathPaintStyleSignature(styles.pathPaintStyles, ["provinceBorders"])}`
  );
  setIfActive(
    "zones",
    "toggleZones",
    () => `${landGeometry()}|${zonesSignature(pack.zones)}|op:${styles.cellLayerOpacities.zones}`
  );
  setIfActive(
    "temperature",
    "toggleTemperature",
    () =>
      `${geometry()}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.temp)}|op:${styles.cellLayerOpacities.temperature}`
  );
  setIfActive(
    "population",
    "togglePopulation",
    () => `${landGeometry()}|${numberListSignature(pack.cells?.pop)}|op:${styles.cellLayerOpacities.population}`
  );
  setIfActive(
    "precipitation",
    "togglePrecipitation",
    () =>
      `${landGeometry()}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.prec)}|op:${styles.cellLayerOpacities.precipitation}`
  );
  setIfActive(
    "danger",
    "toggleDanger",
    () => `${landGeometry()}|${numberListSignature(pack.cells?.danger)}|op:${styles.cellLayerOpacities.danger}`
  );
  setIfActive(
    "lakes",
    "toggleLakes",
    () => `${geometry()}|${featuresSignature(pack.features, "lake")}|${paintSignature(styles.lakePaint)}`
  );
  setIfActive(
    "lakes-outlines",
    "toggleLakes",
    () => `${geometry()}|${featuresSignature(pack.features, "lake")}|${paintSignature(styles.lakePaint)}`
  );
  setIfActive(
    "ice",
    "toggleIce",
    () => `${scope}|${iceSignature(pack.ice)}|${paintSignature({ ice: styles.icePaint })}`
  );
  setIfActive(
    "emblems",
    "toggleEmblems",
    () =>
      `${scope}|${emblemsSignature(pack.states, pack.provinces, pack.burgs)}|${emblemStyleSignature(styles.emblemStyle)}|icons:${getEmblemIconCacheVersion()}`
  );
  setIfActive(
    "burgIcons",
    "toggleBurgIcons",
    () =>
      `${scope}|${burgIconsSignature(pack.burgs)}|${burgIconStyleSignature(styles.burgIconStyle)}|icons:${getBurgIconRasterCacheVersion()}`
  );
  setIfActive(
    "markers",
    "toggleMarkers",
    () =>
      `${scope}|${markersSignature(pack.markers)}|${markerStyleSignature(styles.markerStyle)}|failed:${getExternalIconFailureCacheVersion()}`
  );
  setIfActive(
    "military",
    "toggleMilitary",
    () =>
      `${scope}|${militarySignature(pack.states)}|size:${getMilitaryBoxSize(viewContext)}|emoji:${getEmojiIconCacheVersion()}`
  );
  setIfActive(
    "labels",
    "toggleLabels",
    // states() (cell membership + color) is included because state label rotation is approximated
    // from each state's cell geometry (computeStateOrientationAngles in deckDataAdapters.ts) — a
    // border edit that doesn't move `state.pole`/`center` would otherwise leave a stale angle.
    () => `${scope}|${labelsSignature(pack.states, pack.burgs)}|${states()}|${labelStyleSignature(styles.labelStyle)}`
  );
  setIfActive("cells", "toggleCells", () => geometry());
  setIfActive("grid", "toggleGrid", () => `${geometry()}|${nestedNumberListSignature(pack.cells?.c)}`);
  setIfActive(
    "rivers",
    "toggleRivers",
    () => `${mapId}|${scope}|${riversSignature(pack.rivers)}|${colorSignature(styles.riverPaint.color)}`
  );
  setIfActive(
    "borders",
    "toggleBorders",
    () =>
      `${landGeometry()}|${states()}|${provinces()}|${nestedNumberListSignature(pack.cells?.c)}|${pathDashStyleSignature(styles.pathDashStyles, ["stateBorders", "provinceBorders"])}|${pathPaintStyleSignature(styles.pathPaintStyles, ["stateBorders", "provinceBorders"])}`
  );
  setIfActive(
    "routes",
    "toggleRoutes",
    () =>
      `${mapId}|${scope}|${routesSignature(pack.routes)}|${pathDashStyleSignature(styles.pathDashStyles, ["roads", "trails", "searoutes"])}|${pathPaintStyleSignature(styles.pathPaintStyles, ["roads", "trails", "searoutes"])}`
  );

  // The coastline layer always renders (not toggle-gated), so its signature is always needed.
  byLayer.coastline = `${geometry()}|${featuresSignature(pack.features, "island")}|${paintSignature(styles.coastlinePaint)}`;

  return {
    background: `${mapId}|${graphWidth}x${graphHeight}|${oceanFill}`,
    land: `${landGeometry()}|${landFill}`,
    landGeometrySignature: landGeometry(),
    // geometry() is included so coastline/lake vertex edits (which move pack.vertices.p without
    // changing feature.vertices membership, so featuresSignature alone is unaffected) invalidate
    // the cached land mask polygon, matching the `land`/`byLayer.coastline` signatures above.
    landMask: `${geometry()}|${scope}|${featuresSignature(pack.features, "island")}|lakes:${featuresSignature(pack.features, "lake")}`,
    byLayer
  };
}

function getMarkerPinUrl(pin: string, fill: string, stroke: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="30" height="30">${getMarkerPinSvg(pin, fill, stroke)}</svg>`
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
  next = hashString(next, style.fontFamily);
  next = hashString(next, style.haloColor);
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
    next = hashString(next, style.icon);
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

function colorSignature(color: ArrayLike<number>): string {
  return Array.from(color).join(",");
}

function pathDashStyleSignature(
  styles: ReturnType<typeof getPathDashStyles>,
  keys: ReadonlyArray<keyof ReturnType<typeof getPathDashStyles>>
): string {
  return keys.map(key => `${key}:${styles[key][0]},${styles[key][1]}`).join("|");
}

function pathPaintStyleSignature(
  styles: ReturnType<typeof getPathPaintStyles>,
  keys: ReadonlyArray<keyof ReturnType<typeof getPathPaintStyles>>
): string {
  return keys.map(key => `${key}:${colorSignature(styles[key])}`).join("|");
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
