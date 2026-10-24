import { editorText } from "../../i18n/editorMessages";
import { getUrbanDwellings } from "../../utils/urbanDwellings";
import { reservedCastleFaces } from "../generators/fortifications";
import { type GenerationObserver, generationTimer } from "../generators/generationDiagnostics";
import { polygonCentroid } from "../generators/geom";
import { faceNeighbors, facePoints, faceVertices } from "../generators/mesh";
import { regionalCoastalWaterPolygons, regionalSurfaceLayers } from "../generators/regionalCoast";
import { townExtentMeters } from "../generators/settlementExtent";
import { waterPolygons } from "../generators/waterGeometry";
import type { CityDocument, Tool } from "../types/document";
import type { Id, Point } from "../types/primitives";
import type { RenderSelection, SvgPickInfo } from "../types/selection";
import { renderCastles } from "./castleLayerSvg";
import { renderCellReliefOverlay } from "./cellElevationSvg";
import { renderCemeteries } from "./cemeterySvg";
import { renderCityElements } from "./cityElementsSvg";
import { renderCoastalShore } from "./coastalShoreSvg";
import { renderEditHandles } from "./editHandlesSvg";
import { renderFeatureLayer } from "./featureLayerSvg";
import { renderFixedCrossingLayers } from "./fixedCrossingLayerSvg";
import { fixedDocumentGeometry, fixedDocumentLayers } from "./fixedDocumentGeometry";
import { renderFortSiteGround, renderFortSiteObjects } from "./fortSiteSvg";
import { appendFrameRoads } from "./frameRoadSvg";
import { renderGateLayer } from "./gateLayerSvg";
import { faceClassName, renderFaceWardLandmark } from "./landmarkSvg";
import {
  getLandscapeGroundColor,
  getLandscapeSuburbFaceColor,
  type LandscapeKeepOut,
  renderLandscapeLayer
} from "./landscape";
import { renderMoats } from "./moatSvg";
import { appendFaceSelectionLabels, type GridOverlay, renderGridOverlay } from "./overlays/editorOverlays";
import { renderPreviewSymbols } from "./previewSymbols";
import { renderRegionalSettlements } from "./regionalSvg";
import type { RenderContext } from "./renderContext";
import type { RenderQuality } from "./renderQuality";
import { renderRiverWallSvg } from "./riverWallSvg";
import { frameScene } from "./sceneFrameSvg";
import { element, line, polygon } from "./svgPrimitives";
import { renderTerrainFieldOverlay } from "./terrainFieldSvg";
import { renderTerrainEarthworks } from "./terrainSvg";
import { renderTownFabric, type TownLayerPlans } from "./townFabricSvg";
import { renderTownStructures } from "./townStructuresSvg";

export function renderEditorSvg(
  document: CityDocument,
  tool: Tool,
  selection: RenderSelection,
  viewBox: string,
  zoom: number,
  showSelectionLabels = false,
  /** The MFCG backdrop is held outside `document` so it never enters history;
   * fall back to the document field for a freshly parsed file. */
  referenceImage: CityDocument["referenceImage"] | null = null,
  /** Face ids to tint as the ③ urban-core debug highlight — the exact cells the
   * Generate panel's nPatches step-through / stage just marked buildable, so the
   * flood-fill is visible on the mesh (docs/city-generator/towngen-comparison.md
   * §2.1). Not part of the document — a transient view of the current step. */
  urbanCoreHighlight: ReadonlySet<Id> | null = null,
  /** Raw graph-walk polylines (one per river for ②; a single one for ①) to draw
   * as a growing dotted trail — the ①/② step-by-step debug view
   * (docs/city-generator/towngen-comparison.md): those two processes are a
   * walk, not a set of cells, so there is nothing on the document itself to
   * highlight while scrubbing partway through one. Each entry is its own SVG
   * subpath so unrelated walks never draw a connecting line between them. */
  stepWalkPaths: readonly (readonly Point[])[] | null = null,
  /** Document panel "Grid evolution" scrub overlay (Phase G1). */
  gridOverlay: GridOverlay | null = null,
  showBlockMesh = false,
  showGridLines = false,
  observer?: GenerationObserver,
  hideBuildings = false,
  /** Stage ⑩. Drop roads inside the outer wall, and the lanes that divide blocks. */
  hideStreetLines = false,
  quality: RenderQuality = "detailed",
  preview = false,
  sceneVisibility: { core: boolean; regional: boolean } = { core: true, regional: true }
): SVGSVGElement {
  const fixedMode = document.importedFixedCrossings !== undefined;
  const fixedGeometry = fixedDocumentGeometry(document);
  const fixedLayers = fixedGeometry ? fixedDocumentLayers(fixedGeometry) : null;
  const fixedEpoch = JSON.stringify([document.importedFixedCrossings, document.frame]);
  const mark = generationTimer(observer);
  const town =
    document.appearance === "town" && tool === "select" && !showBlockMesh && !gridOverlay && !showSelectionLabels;
  const importedBurg = document.fabric?.generation?.settings.descriptor?.burg;
  const importedDwellings = importedBurg ? (importedBurg.dwellings ?? getUrbanDwellings(importedBurg.population)) : 0;
  const effectiveQuality =
    quality === "auto"
      ? townExtentMeters(document.frame) >= 3600 || importedDwellings >= 1000
        ? "light"
        : "detailed"
      : quality;
  // Mesh editing always keeps individual handles and full picking metadata.
  const lightweight = town && effectiveQuality !== "detailed";
  const minimal = lightweight && effectiveQuality === "minimal";
  const classes = ["ce-svg"];
  if (town) classes.push("ce-svg--town");
  if (showGridLines) classes.push("ce-svg--show-grid");
  const svg = element("svg", {
    viewBox,
    class: classes.join(" "),
    "aria-label": "City editor canvas",
    "data-render-quality": town ? effectiveQuality : "detailed",
    ...(fixedMode ? { "data-fixed-geometry-status": fixedGeometry ? "ready" : "invalid" } : {})
  }) as SVGSVGElement;
  const ctx: RenderContext = {
    document,
    tool,
    selection,
    zoom,
    town,
    fixedMode,
    fixedGeometry,
    lightweight,
    minimal,
    hideBuildings,
    hideStreetLines,
    preview
  };
  const groundColor = getLandscapeGroundColor(document);
  const suburbColor = getLandscapeSuburbFaceColor(document);
  if (town) {
    const biomeStyle = element(
      "style",
      { type: "text/css" },
      `.ce-svg.ce-svg--town .ce-face--land, .ce-face--land.ce-face--ward-unassigned, .ce-face--land.ce-face--ward-empty { fill: ${suburbColor}; }`
    );
    svg.appendChild(biomeStyle);
  }
  const backdrop = referenceImage ?? document.referenceImage;
  if (backdrop) {
    const { href, width, height } = backdrop;
    svg.appendChild(
      element("image", {
        href,
        x: String(-width / 2),
        y: String(-height / 2),
        width: String(width),
        height: String(height),
        class: "ce-reference-image",
        "pointer-events": "none"
      })
    );
  }
  const cells = element("g", { class: "ce-cells" });
  for (const face of Object.values(document.mesh.faces)) {
    const isSelected = selection.faceId === face.id;
    const isPickSelected = selection.inspectedId === face.id || selection.inspectedId === `cell-${face.id}`;
    const pickInfo: SvgPickInfo = {
      layer: "cells",
      kind: "cell",
      id: face.id,
      label: editorText("cityEditor.messages.cellIdentifier", { value0: face.id }),
      water: face.properties.water,
      elevation: face.properties.elevation,
      ward: face.properties.ward ?? null,
      site: face.site,
      center: polygonCentroid(facePoints(document.mesh, face)),
      neighbors: faceNeighbors(document.mesh, face.id),
      vertices: faceVertices(document.mesh, face)
    };
    const pathAttrs: Record<string, string> = {
      d: polygon(facePoints(document.mesh, face)),
      class: `${faceClassName(face, isSelected, urbanCoreHighlight?.has(face.id) ?? false)}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
      "data-face": face.id,
      "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
    };
    if (town && face.properties.water === "land" && (!face.properties.ward || face.properties.ward === "empty")) {
      pathAttrs.style = `fill: ${suburbColor};`;
    }
    cells.appendChild(element("path", pathAttrs));
  }
  if (document.sceneRegions) {
    const waterCells = element("g", { class: "ce-regional-water-cells", "data-scene-region": "shared" });
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water === "land") continue;
      const path = cells.querySelector(`[data-face="${face.id}"]`);
      if (path) waterCells.appendChild(path);
    }
    svg.appendChild(waterCells);
  }
  svg.appendChild(cells);
  const relief = document.showElevationTint === false ? null : renderCellReliefOverlay(document.mesh);
  if (relief) svg.appendChild(relief);
  const continuousWater = element("g", { class: "ce-continuous-water", "pointer-events": "none" });
  for (const [index, ring] of (fixedMode ? [] : waterPolygons(document)).entries()) {
    continuousWater.appendChild(
      element("path", { d: polygon(ring), class: "ce-face ce-face--sea", "data-water-area": String(index) })
    );
  }
  svg.appendChild(continuousWater);
  if (fixedLayers) svg.appendChild(fixedLayers.water);
  // The town mesh's sea ends at its small rectangular boundary. Continue its
  // actual coast across the regional frame, over any coarse FMG water overlay.
  const regionalSea = regionalCoastalWaterPolygons(document);
  if (regionalSea.length) {
    const layer = element("g", { class: "ce-regional-coastal-water", "pointer-events": "none" });
    layer.appendChild(
      element("path", {
        d: [
          ...regionalSea,
          ...(document.coastalOceanFaceIds ?? []).flatMap(id => {
            const face = document.mesh.faces[id];
            return face?.properties.water === "sea" ? [facePoints(document.mesh, face)] : [];
          })
        ]
          .map(polygon)
          .join(" "),
        class: "ce-face ce-face--sea"
      })
    );
    svg.appendChild(layer);
  }

  // Beyond the mesh, paint only what FMG knows: its islands and lakes over
  // the regional sea, and a neutral "no data" fill past the FMG map edge
  // instead of the burg's biome continuing into nowhere.
  const surfaceLayers = regionalSurfaceLayers(document);
  if (surfaceLayers.length) {
    const layer = element("g", { class: "ce-regional-surface", "pointer-events": "none" });
    for (const surface of surfaceLayers) {
      const d = surface.parts.map(polygon).join(" ");
      layer.appendChild(
        surface.kind === "water"
          ? element("path", { d, class: "ce-face ce-face--sea", "data-regional-surface": "water" })
          : element("path", {
              d,
              fill: surface.kind === "land" ? (document.appearance === "town" ? groundColor : "#e1dfd4") : "#cfcdc6",
              stroke: surface.kind === "land" ? "none" : "#cfcdc6",
              "stroke-width": "0.5",
              "data-regional-surface": surface.kind
            })
      );
    }
    svg.appendChild(layer);
  }

  const landscapeKeepOut: LandscapeKeepOut = { polygons: [], discs: [] };
  renderCoastalShore(ctx, svg, landscapeKeepOut);

  // Scenery is drawn here but filled in once the town's facilities are known.
  const landscapeSlot = town ? element("g", { class: "ce-landscape-slot" }) : null;
  if (landscapeSlot) svg.appendChild(landscapeSlot);

  if (document.sceneRegions) {
    const regional = element("g", { class: "ce-regional-layer", "data-scene-region": "regional" });
    appendFrameRoads(regional, document, town);
    regional.appendChild(renderRegionalSettlements(document));
    svg.appendChild(regional);
  }

  if (preview && town) svg.appendChild(renderPreviewSymbols(document));

  const townPlans: TownLayerPlans =
    town && !preview
      ? renderTownFabric(ctx, svg, mark)
      : { harbor: undefined, parks: [], watermills: undefined, aerial: undefined, plannedPiers: [], fallbackPiers: [] };
  if (landscapeSlot) {
    // Facilities drawn on open ground keep it: no trees through a mill, yard or kiln.
    const keep = landscapeKeepOut;
    for (const cemetery of document.cemeteries ?? []) keep.polygons.push(cemetery.boundary);
    for (const mill of townPlans.watermills?.mills ?? []) keep.polygons.push(mill.millhousePolygon);
    if (townPlans.aerial) {
      for (const mill of townPlans.aerial.windmills)
        keep.discs.push({ center: mill.center, radius: Math.max(mill.baseRadius, mill.sailLength) });
      for (const point of townPlans.aerial.domesticWater) keep.polygons.push(point.footprint);
      for (const monastery of townPlans.aerial.monasteries) keep.polygons.push(monastery.precinct);
      for (const tannery of townPlans.aerial.tanneries) keep.polygons.push(tannery.yard, tannery.washStrip);
      for (const gallows of townPlans.aerial.gallows)
        keep.discs.push({ center: gallows.center, radius: gallows.moundRadius });
      for (const hall of townPlans.aerial.guildHalls) keep.polygons.push(hall.footprint);
      for (const yard of townPlans.aerial.guildYards) keep.polygons.push(yard.polygon);
      for (const yard of townPlans.aerial.storageYards) keep.polygons.push(yard.polygon);
      for (const warehouse of townPlans.aerial.quayWarehouses ?? []) {
        keep.polygons.push(warehouse.footprint);
        if (warehouse.cut) keep.polygons.push(warehouse.cut);
      }
      for (const inn of townPlans.aerial.gateInns) keep.polygons.push(inn.footprint, inn.court);
    }
    landscapeSlot.replaceWith(renderLandscapeLayer(document, town, effectiveQuality, keep));
  }

  if (document.fortSite) svg.appendChild(renderFortSiteGround(document));
  const edges = element("g", { class: "ce-edges" });
  for (const edge of Object.values(document.mesh.edges)) {
    // In town view these strokes are transparent; route picking uses the mesh index.
    if (
      lightweight &&
      !showGridLines &&
      selection.edgeId !== edge.id &&
      selection.inspectedId !== edge.id &&
      selection.inspectedId !== `edge-${edge.id}`
    )
      continue;
    const [a, b] = [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point];
    const isSelected = selection.edgeId === edge.id;
    const isPickSelected = selection.inspectedId === edge.id || selection.inspectedId === `edge-${edge.id}`;
    const pickInfo: SvgPickInfo = {
      layer: "edges",
      kind: "edge",
      id: edge.id,
      label: editorText("cityEditor.messages.edgeIdentifier", { value0: edge.id }),
      a: edge.a,
      b: edge.b,
      faces: [edge.leftFace, edge.rightFace].filter((f): f is Id => f != null)
    };
    edges.appendChild(
      element("path", {
        d: line([a, b]),
        class: `ce-edge${isSelected ? " ce-selected" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        "data-edge": edge.id,
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
      })
    );
  }
  svg.appendChild(edges);

  svg.appendChild(renderMoats(document));
  svg.appendChild(renderCemeteries(document, selection.inspectedId));
  const features = renderFeatureLayer(ctx, svg);
  if (fixedLayers) renderFixedCrossingLayers(ctx, svg, fixedLayers, fixedEpoch);
  svg.appendChild(renderRiverWallSvg(document));
  if (document.terrain?.field) svg.appendChild(renderTerrainFieldOverlay(document));
  if (document.terrain) svg.appendChild(renderTerrainEarthworks(document));
  if (town) renderTownStructures(ctx, svg, townPlans, features);
  // Castle curtains and towers cover town walls that meet or overlap them.
  // SVG stacking follows paint order, including the raised town-wall layer.
  svg.appendChild(renderCastles(document, selection.inspectedId));
  if (document.fortSite) svg.appendChild(renderFortSiteObjects(document));
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const castleFaces = !town ? reservedCastleFaces(document) : new Set<Id>();
  const wardLandmarks = element("g", { class: "ce-ward-landmarks", "pointer-events": "none" });
  if (!town) {
    for (const face of Object.values(document.mesh.faces)) {
      if (castleFaces.has(face.id)) continue;
      const marker = renderFaceWardLandmark(document.mesh, face, document);
      if (marker) wardLandmarks.appendChild(marker);
    }
  }
  svg.appendChild(wardLandmarks);

  renderGateLayer(ctx, svg);

  renderCityElements(ctx, svg, castleFaces, townPlans.aerial?.domesticWater);

  if (showSelectionLabels && selection.faceId) appendFaceSelectionLabels(svg, document, selection.faceId, zoom);

  renderEditHandles(ctx, svg, stepWalkPaths);

  if (gridOverlay) svg.appendChild(renderGridOverlay(gridOverlay));

  // Hover feedback lives in its own thin layer so the editor can repaint it on
  // pointermove without rebuilding every cell/edge/vertex node. Populated by
  // renderHoverOverlay(); see the ce-route-preview-layer for the same pattern.
  svg.appendChild(element("g", { class: "ce-hover-layer", "pointer-events": "none" }));
  svg.appendChild(element("g", { class: "ce-measure-layer", "pointer-events": "none" }));
  frameScene(ctx, svg, features, groundColor, sceneVisibility);
  mark("svg-details");
  return svg;
}

export type { RenderQuality } from "./renderQuality";
