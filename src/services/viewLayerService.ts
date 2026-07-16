/**
 * ViewLayerService — stable typed facade over ViewContext.
 *
 * Controllers and utilities should import SVG layer references through this
 * service instead of directly from viewContext, so that any structural change
 * to ViewContext only needs to be updated in this one file.
 *
 * Renderers receive the full ViewContext as a function parameter (their
 * established calling convention) and are exempt from this rule.
 */
import type { SvgGroup } from "../context/viewContext";
import { viewContext } from "../context/viewContext";

class ViewLayerServiceImpl {
  // ── Root / Infrastructure ─────────────────────────────────────────────────
  get svg() {
    return viewContext.svg;
  }
  get defs() {
    return viewContext.defs;
  }
  get viewbox() {
    return viewContext.viewbox;
  }
  get scaleBar() {
    return viewContext.scaleBar;
  }
  get legend() {
    return viewContext.legend;
  }
  get ruler() {
    return viewContext.ruler;
  }
  get debug() {
    return viewContext.debug;
  }
  get fogging() {
    return viewContext.fogging;
  }

  // ── Environment ───────────────────────────────────────────────────────────
  get ocean() {
    return viewContext.ocean;
  }
  get oceanLayers() {
    return viewContext.oceanLayers;
  }
  get oceanPattern() {
    return viewContext.oceanPattern;
  }
  get landmass() {
    return viewContext.landmass;
  }
  get texture() {
    return viewContext.texture;
  }
  get terrs() {
    return viewContext.terrs;
  }
  get lakes() {
    return viewContext.lakes;
  }
  get biomes() {
    return viewContext.biomes;
  }
  get rivers() {
    return viewContext.rivers;
  }
  get terrain() {
    return viewContext.terrain;
  }
  get coastline() {
    return viewContext.coastline;
  }
  get ice() {
    return viewContext.ice;
  }
  get prec() {
    return viewContext.prec;
  }
  get temperature() {
    return viewContext.temperature;
  }
  get danger() {
    return viewContext.danger;
  }

  // ── Political ─────────────────────────────────────────────────────────────
  get relig() {
    return viewContext.relig;
  }
  get cults() {
    return viewContext.cults;
  }
  get regions() {
    return viewContext.regions;
  }
  get statesBody() {
    return viewContext.statesBody;
  }
  get statesHalo() {
    return viewContext.statesHalo;
  }
  get provs() {
    return viewContext.provs;
  }
  get zones() {
    return viewContext.zones;
  }
  get borders() {
    return viewContext.borders;
  }
  get stateBorders() {
    return viewContext.stateBorders;
  }
  get provinceBorders() {
    return viewContext.provinceBorders;
  }

  // ── Infrastructure ────────────────────────────────────────────────────────
  get routes() {
    return viewContext.routes;
  }
  get roads() {
    return viewContext.roads;
  }
  get trails() {
    return viewContext.trails;
  }
  get searoutes() {
    return viewContext.searoutes;
  }

  // ── Settlement ────────────────────────────────────────────────────────────
  get icons() {
    return viewContext.icons;
  }
  get labels() {
    return viewContext.labels;
  }
  get burgLabels() {
    return viewContext.burgLabels;
  }
  get burgIcons() {
    return viewContext.burgIcons;
  }
  get anchors() {
    return viewContext.anchors;
  }
  get armies() {
    return viewContext.armies;
  }
  get markers() {
    return viewContext.markers;
  }
  get emblems() {
    return viewContext.emblems;
  }
  get population() {
    return viewContext.population;
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  get cells() {
    return viewContext.cells;
  }
  get gridOverlay() {
    return viewContext.gridOverlay;
  }
  get coordinates() {
    return viewContext.coordinates;
  }
  get compass() {
    return viewContext.compass;
  }

  // ── View State (read) ─────────────────────────────────────────────────────
  get zoom() {
    return viewContext.zoom;
  }
  get viewX() {
    return viewContext.viewX;
  }
  get viewY() {
    return viewContext.viewY;
  }
  get scale() {
    return viewContext.scale;
  }
  get customization() {
    return viewContext.customization;
  }
  get svgWidth() {
    return viewContext.svgWidth;
  }
  get svgHeight() {
    return viewContext.svgHeight;
  }
  get lineGen() {
    return viewContext.lineGen;
  }

  // ── View State (write) ────────────────────────────────────────────────────
  setCustomization(value: number): void {
    viewContext.customization = value;
  }

  /**
   * Returns the DOM node for a standard layer toggle button ID,
   * or null if the ID is not a core ViewContext layer (e.g. extension layers
   * or the HTML #vignette element).
   *
   * Callers are responsible for handling extension-registered layers and
   * HTML elements (like #vignette) that fall outside ViewContext.
   */
  getLayerNodeByToggleId(toggleId: string): SVGGElement | null {
    const layerMap: Partial<Record<string, SvgGroup>> = {
      toggleLakes: viewContext.lakes,
      toggleHeight: viewContext.terrs,
      toggleBiomes: viewContext.biomes,
      toggleCells: viewContext.cells,
      toggleGrid: viewContext.gridOverlay,
      toggleCoordinates: viewContext.coordinates,
      toggleCompass: viewContext.compass,
      toggleRivers: viewContext.rivers,
      toggleRelief: viewContext.terrain,
      toggleReligions: viewContext.relig,
      toggleCultures: viewContext.cults,
      toggleStates: viewContext.regions,
      toggleProvinces: viewContext.provs,
      toggleBorders: viewContext.borders,
      toggleRoutes: viewContext.routes,
      toggleTemperature: viewContext.temperature,
      toggleDanger: viewContext.danger,
      toggleCombatDeaths: viewContext.combatDeaths,
      togglePrecipitation: viewContext.prec,
      togglePopulation: viewContext.population,
      toggleIce: viewContext.ice,
      toggleTexture: viewContext.texture,
      toggleEmblems: viewContext.emblems,
      toggleLabels: viewContext.labels,
      toggleBurgIcons: viewContext.icons,
      toggleMarkers: viewContext.markers,
      toggleMilitary: viewContext.armies,
      toggleRulers: viewContext.ruler,
      toggleScaleBar: viewContext.scaleBar,
      toggleEnclosure: viewContext.enclosure
    };
    return layerMap[toggleId]?.node() ?? null;
  }
}

export const viewLayerService = new ViewLayerServiceImpl();
