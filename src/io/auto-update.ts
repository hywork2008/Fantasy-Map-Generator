import * as d3 from "d3";
import { getWorldState } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { Cultures } from "../generators/cultures-generator";
import type { Emblem } from "../generators/emblem/generator";
import { Features } from "../generators/features";
import { Lakes } from "../generators/lakes";
import { Markers } from "../generators/markers-generator";
import { Military } from "../generators/military-generator";
import { Names } from "../generators/names-generator";
import { Provinces } from "../generators/provinces-generator";
import { Religions } from "../generators/religions-generator";
import { Rivers } from "../generators/river-generator";
import { States } from "../generators/states-generator";
import { Zones } from "../generators/zones-generator";
import {
  BurgIconsRenderer,
  BurgLabelsRenderer,
  FeaturesRenderer,
  HeightmapRenderer,
  IceRenderer,
  MarkersRenderer,
  MilitaryRenderer,
  RoutesRenderer,
  TextureRenderer,
  ZonesRenderer
} from "../renderers";
import { drawScaleBar, fitScaleBar } from "../renderers/index";
import { viewLayerService as view } from "../services/viewLayerService";
import { rulers, setRulers } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import type {
  Burg,
  Culture,
  IceGlacier,
  IceIceberg,
  Marker,
  MilitaryRegiment,
  Province,
  Religion,
  River,
  Route,
  State
} from "../types/models";
import { findCell, P, rand, rn, unique } from "../utils";
import { ERROR } from "../utils/debug";
import { layerIsOn } from "../utils/nodeUtils";
import { compareVersions } from "../versioning";

const ANCHOR_SYMBOL_PATH =
  "m 1.003,-9.873 c 0,-0.547 -0.453,-1 -1,-1 -0.547,0 -1,0.453 -1,1 0,0.547 0.453,1 1,1 0.547,0 1,-0.453 1,-1 z m 13,14.5 v 5.5 c 0,0.203 -0.125,0.391 -0.313,0.469 -0.063,0.016 -0.125,0.031 -0.187,0.031 -0.125,0 -0.25,-0.047 -0.359,-0.141 L 11.691,9.033 c -2.453,2.953 -6.859,4.844 -11.688,4.844 -4.829,0 -9.234,-1.891 -11.688,-4.844 l -1.453,1.453 c -0.094,0.094 -0.234,0.141 -0.359,0.141 -0.063,0 -0.125,-0.016 -0.187,-0.031 -0.187,-0.078 -0.313,-0.266 -0.313,-0.469 v -5.5 c 0,-0.281 0.219,-0.5 0.5,-0.5 h 5.5 c 0.203,0 0.391,0.125 0.469,0.313 0.078,0.188 0.031,0.391 -0.109,0.547 L -9.2,6.55 c 1.406,1.891 4.109,3.266 7.203,3.687 V 0.128 h -3 c -0.547,0 -1,-0.453 -1,-1 v -2 c 0,-0.547 0.453,-1 1,-1 h 3 v -2.547 c -1.188,-0.688 -2,-1.969 -2,-3.453 0,-2.203 1.797,-4 4,-4 2.203,0 4,1.797 4,4 0,1.484 -0.812,2.766 -2,3.453 v 2.547 h 3 c 0.547,0 1,0.453 1,1 v 2 c 0,0.547 -0.453,1 -1,1 h -3 V 10.237 C 5.097,9.815 7.8,8.44 9.206,6.55 L 7.643,4.987 C 7.502,4.831 7.456,4.628 7.534,4.44 7.612,4.252 7.8,4.127 8.003,4.127 h 5.5 c 0.281,0 0.5,0.219 0.5,0.5 z";

// update old map file to the current version
export function resolveVersionConflicts(mapVersion: string): void {
  const isOlderThan = (tagVersion: string) => compareVersions(mapVersion, tagVersion).isOlder;

  if (isOlderThan("1.0.0")) {
    // v1.0 added a new religions layer
    viewContext.relig = view.viewbox.insert("g", "#terrain").attr("id", "relig");
    Religions.generate(worldContext, viewContext, appServices, getWorldState());

    // v1.0 added a legend box
    viewContext.legend = view.svg.append("g").attr("id", "legend");
    view.legend
      .attr("font-family", "Almendra SC")
      .attr("font-size", 13)
      .attr("data-size", 13)
      .attr("data-x", 99)
      .attr("data-y", 93)
      .attr("stroke-width", 2.5)
      .attr("stroke", "#812929")
      .attr("stroke-dasharray", "0 4 10 4")
      .attr("stroke-linecap", "round");

    // v1.0 separated BordersRenderer from StatesRenderer()
    viewContext.stateBorders = view.borders.append("g").attr("id", "stateBorders");
    viewContext.provinceBorders = view.borders.append("g").attr("id", "provinceBorders");
    view.borders
      .attr("opacity", null)
      .attr("stroke", null)
      .attr("stroke-width", null)
      .attr("stroke-dasharray", null)
      .attr("stroke-linecap", null)
      .attr("filter", null);
    view.stateBorders
      .attr("opacity", 0.8)
      .attr("stroke", "#56566d")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2")
      .attr("stroke-linecap", "butt");
    view.provinceBorders
      .attr("opacity", 0.8)
      .attr("stroke", "#56566d")
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "1")
      .attr("stroke-linecap", "butt");

    // v1.0 added state relations, provinces, forms and full names
    viewContext.provs = view.viewbox.insert("g", "#borders").attr("id", "provs").attr("opacity", 0.6);
    const state = getWorldState();
    States.collectStatistics(state);
    States.generateCampaigns();
    States.generateDiplomacy();
    States.defineStateForms(state);
    Provinces.generate(worldContext, viewContext, appServices, state);
    Provinces.getPoles(state);
    if (!layerIsOn("toggleBorders")) view.borders.style("display", "none");
    if (!layerIsOn("toggleStates")) view.regions.attr("display", "none").selectAll("path").remove();

    // v1.0 added zones layer
    viewContext.zones = view.viewbox.insert("g", "#borders").attr("id", "zones").attr("display", "none");
    view.zones
      .attr("opacity", 0.6)
      .attr("stroke", null)
      .attr("stroke-width", 0)
      .attr("stroke-dasharray", null)
      .attr("stroke-linecap", "butt");
    Zones.generate(worldContext, viewContext, appServices, state);
    if (!view.markers.selectAll("*").size()) {
      Markers.generate(worldContext, viewContext, appServices, state);
      turnButtonOn("toggleMarkers");
    }

    // v1.0 add fogging layer (state focus)
    viewContext.fogging = view.viewbox
      .insert("g", "#ruler")
      .attr("id", "fogging-cont")
      .attr("mask", "url(#fog)")
      .append("g")
      .attr("id", "fogging")
      .style("display", "none");
    view.fogging!.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
    view.defs
      .append("mask")
      .attr("id", "fog")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "white");

    // v1.0 changes states opacity back to regions level
    if (view.statesBody.attr("opacity")) {
      view.regions.attr("opacity", view.statesBody.attr("opacity"));
      view.statesBody.attr("opacity", null);
    }

    // v1.0 changed labels to multi-lined
    view.labels.selectAll<SVGTextPathElement, unknown>("textPath").each(function () {
      const text = this.textContent ?? "";
      const shift = this.getComputedTextLength() / -1.5;
      replaceTextPathContent(this, text, shift);
    });

    // v1.0 added new biome - Wetland
    worldContext.biomesData.name.push("Wetland");
    worldContext.biomesData.color.push("#0b9131");
    worldContext.biomesData.habitability.push(12);
  }

  if (isOlderThan("1.1.0")) {
    // v1.0 code had a bug with religion layer id
    if (!view.relig.size()) viewContext.relig = view.viewbox.insert("g", "#terrain").attr("id", "relig");

    // v1.0 had Sympathy status then replaced with Friendly
    for (const s of worldContext.pack.states) {
      if (!s.diplomacy) continue;
      s.diplomacy = s.diplomacy.map(r => (typeof r === "string" && r === "Sympathy" ? "Friendly" : r));
    }

    // labels should be toggled via style attribute, so remove display attribute
    view.labels.attr("display", null);

    // v1.0 added religions hierarchy tree
    if (worldContext.pack.religions[1] && !(worldContext.pack.religions[1] as Religion).code) {
      worldContext.pack.religions
        .filter(r => r.i)
        .forEach(r => {
          (r as Religion & { origin: number }).origin = 0;
          (r as Religion).code = r.name.slice(0, 2);
        });
    }

    if (!view.lakes.select("#freshwater").size()) {
      view.lakes.append("g").attr("id", "freshwater");
      view.lakes
        .select("#freshwater")
        .attr("opacity", 0.5)
        .attr("fill", "#a6c1fd")
        .attr("stroke", "#5f799d")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    if (!view.lakes.select("#salt").size()) {
      view.lakes.append("g").attr("id", "salt");
      view.lakes
        .select("#salt")
        .attr("opacity", 0.5)
        .attr("fill", "#409b8a")
        .attr("stroke", "#388985")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    // v1.1 added new lake and coast groups
    if (!view.lakes.select("#sinkhole").size()) {
      view.lakes.append("g").attr("id", "sinkhole");
      view.lakes.append("g").attr("id", "frozen");
      view.lakes.append("g").attr("id", "lava");
      view.lakes
        .select("#sinkhole")
        .attr("opacity", 1)
        .attr("fill", "#5bc9fd")
        .attr("stroke", "#53a3b0")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
      view.lakes
        .select("#frozen")
        .attr("opacity", 0.95)
        .attr("fill", "#cdd4e7")
        .attr("stroke", "#cfe0eb")
        .attr("stroke-width", 0)
        .attr("filter", null);
      view.lakes
        .select("#lava")
        .attr("opacity", 0.7)
        .attr("fill", "#90270d")
        .attr("stroke", "#f93e0c")
        .attr("stroke-width", 2)
        .attr("filter", "url(#crumpled)");

      view.coastline.append("g").attr("id", "sea_island");
      view.coastline.append("g").attr("id", "lake_island");
      view.coastline
        .select("#sea_island")
        .attr("opacity", 0.5)
        .attr("stroke", "#1f3846")
        .attr("stroke-width", 0.7)
        .attr("filter", "url(#dropShadow)");
      view.coastline
        .select("#lake_island")
        .attr("opacity", 1)
        .attr("stroke", "#7c8eaf")
        .attr("stroke-width", 0.35)
        .attr("filter", null);
    }

    // v1.1 features stores more data
    view.defs.select("#land").selectAll("path").remove();
    view.defs.select("#water").selectAll("path").remove();
    view.coastline.selectAll("path").remove();
    view.lakes.selectAll("path").remove();

    Features.markupPack();
    emitEvent("fmg:create-default-ruler");
  }

  if (isOlderThan("1.11.0")) {
    // v1.11 added new attributes
    view.terrs.attr("scheme", "bright").attr("terracing", 0).attr("skip", 5).attr("relax", 0).attr("curve", 0);
    view.svg.select("#oceanic > *").attr("id", "oceanicPattern");
    view.oceanLayers.attr("layers", "-6,-3,-1");
    view.gridOverlay.attr("type", "pointyHex").attr("size", 10);

    // v1.11 added cultures hierarchy tree
    if (worldContext.pack.cultures[1] && !(worldContext.pack.cultures[1] as Culture).code) {
      worldContext.pack.cultures
        .filter(c => c.i)
        .forEach(c => {
          (c as Culture & { origin: number }).origin = 0;
          (c as Culture).code = c.name.slice(0, 2);
        });
    }

    // v1.11 had an issue with fogging being displayed on load
    emitEvent("fmg:unfog");

    // v1.2 added new terrain attributes
    if (!view.terrain.attr("set")) view.terrain.attr("set", "simple");
    if (!view.terrain.attr("size")) view.terrain.attr("size", 1);
    if (!view.terrain.attr("density")) view.terrain.attr("density", 0.4);
  }

  if (isOlderThan("1.21.0")) {
    // v1.11 replaced "display" attribute by "display" style
    const hiddenLayers: SVGGElement[] = [];
    view.viewbox.selectAll<SVGGElement, unknown>("g").each(function () {
      if (this.hasAttribute("display")) {
        this.removeAttribute("display");
        hiddenLayers.push(this);
      }
    });
    d3.selectAll(hiddenLayers).style("display", "none");

    // v1.21 added rivers data to pack
    worldContext.pack.rivers = [];
    view.rivers.selectAll<SVGPathElement, unknown>("path").each(function () {
      const i = +this.id.slice(5);
      const length = this.getTotalLength() / 2;
      if (!length) return;

      const s = this.getPointAtLength(length);
      const e = this.getPointAtLength(0);
      const source = findCell(s.x, s.y);
      const mouth = findCell(e.x, e.y);
      const name = Rivers.getName(mouth);
      const type = length < 25 ? rw({ Creek: 9, River: 3, Brook: 3, Stream: 1 }) : "River";
      worldContext.pack.rivers.push({ i, parent: 0, length, source, mouth, basin: i, name, type } as River);
    });
  }

  if (isOlderThan("1.22.0")) {
    // v1.22 changed state neighbors from Set object to array
    States.collectStatistics(getWorldState());
  }

  if (isOlderThan("1.3.0")) {
    // v1.3 added global options object
    const winds = (worldContext.options as unknown as number[]).slice();
    const year = rand(100, 2000);
    const era = `${Names.getBaseShort(P(0.7) ? 1 : rand(worldContext.nameBases.length))} Era`;
    const eraShort = `${era[0]}E`;
    const military = Military.getDefaultOptions();
    Object.assign(worldContext.options, { winds, year, era, eraShort, military });

    // v1.3 added campaigns data for all states
    States.generateCampaigns();

    // v1.3 added military layer
    viewContext.armies = view.viewbox.insert("g", "#icons").attr("id", "armies");
    view.armies
      .attr("opacity", 1)
      .attr("fill-opacity", 1)
      .attr("font-size", 6)
      .attr("box-size", 3)
      .attr("stroke", "#000")
      .attr("stroke-width", 0.3);
    turnButtonOn("toggleMilitary");
    Military.generate(worldContext, viewContext, appServices, getWorldState());
  }

  if (isOlderThan("1.4.0")) {
    // v1.35 added dry lakes
    if (!view.lakes.select("#dry").size()) {
      view.lakes.append("g").attr("id", "dry");
      view.lakes
        .select("#dry")
        .attr("opacity", 1)
        .attr("fill", "#c9bfa7")
        .attr("stroke", "#8e816f")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    // v1.4 added ice layer
    viewContext.ice = view.viewbox.insert("g", "#coastline").attr("id", "ice").style("display", "none");
    view.ice
      .attr("opacity", null)
      .attr("fill", "#e8f0f6")
      .attr("stroke", "#e8f0f6")
      .attr("stroke-width", 1)
      .attr("filter", "url(#dropShadow05)");
    IceRenderer.render(worldContext, viewContext, appServices);

    // v1.4 added icon and power attributes for units
    for (const unit of worldContext.options.military!) {
      if (!unit.icon) unit.icon = getUnitIcon(unit.type);
      if (!unit.power) unit.power = unit.crew;
    }

    function getUnitIcon(type: string): string {
      if (type === "naval") return "🌊";
      if (type === "ranged") return "🏹";
      if (type === "mounted") return "🐴";
      if (type === "machinery") return "💣";
      if (type === "armored") return "🐢";
      if (type === "aviation") return "🦅";
      if (type === "magical") return "🔮";
      return "⚔️";
    }

    // v1.4 added state reference for regiments
    worldContext.pack.states
      .filter(s => s.military)
      .forEach(s => {
        (s.military as MilitaryRegiment[]).forEach(r => {
          r.state = s.i;
        });
      });
  }

  if (isOlderThan("1.5.0")) {
    // not need to store default styles from v 1.5
    localStorage.removeItem("styleClean");
    localStorage.removeItem("styleGloom");
    localStorage.removeItem("styleAncient");
    localStorage.removeItem("styleMonochrome");

    // v1.5 cultures has shield attribute
    (worldContext.pack.cultures as Culture[]).forEach(culture => {
      if (culture.removed) return;
      culture.shield = Cultures.getRandomShield();
    });

    // v1.5 added burg type value
    (worldContext.pack.burgs as Burg[]).forEach(burg => {
      if (!burg.i || burg.removed) return;
      burg.type = Burgs.getType(burg.cell, burg.port);
    });

    // v1.5 added emblems
    view.defs.append("g").attr("id", "defs-emblems");
    viewContext.emblems = view.viewbox
      .insert("g", "#population")
      .attr("id", "emblems")
      .style("display", "none") as typeof view.emblems;
    view.emblems.append("g").attr("id", "burgEmblems");
    view.emblems.append("g").attr("id", "provinceEmblems");
    view.emblems.append("g").attr("id", "stateEmblems");
    emitEvent("fmg:regenerate-emblems");
    emitEvent("fmg:toggle-emblems");

    // v1.5 changed relief icons data
    view.terrain.selectAll<SVGUseElement, unknown>("use").each(function () {
      const type = this.getAttribute("data-type") || this.getAttribute("xlink:href");
      this.removeAttribute("xlink:href");
      this.removeAttribute("data-type");
      this.removeAttribute("data-size");
      this.setAttribute("href", type ?? "");
    });
  }

  if (isOlderThan("1.6.0")) {
    // v1.6 changed rivers data
    for (const river of worldContext.pack.rivers) {
      const el = view.rivers.select<SVGPathElement>(`#river${river.i}`).node();
      if (el) {
        river.widthFactor = +el.getAttribute("data-width")!;
        el.removeAttribute("data-width");
        el.removeAttribute("data-increment");
        river.discharge = worldContext.pack.cells.fl[river.mouth] || 1;
        river.width = rn(river.length / 100, 2);
        river.sourceWidth = 0.1;
      } else {
        Rivers.remove(river.i);
      }
    }

    // v1.6 changed lakes data
    for (const f of worldContext.pack.features) {
      if (f.type !== "lake") continue;
      if (f.evaporation) continue;

      f.flux = f.flux || f.cells * 3;
      f.temp = worldContext.grid.cells.temp[worldContext.pack.cells.g[f.firstCell]];
      f.height =
        (f.height ||
          d3.min(
            worldContext.pack.cells.c[f.firstCell]
              .map((c: number) => worldContext.pack.cells.h[c])
              .filter((h: number) => h >= 20)
          )) ??
        f.height;
      const height = (f.height - 18) ** useOptionsState.getState().heightExponent;
      const evaporation = ((700 * (f.temp + 0.006 * height)) / 50 + 75) / (80 - f.temp);
      f.evaporation = rn(evaporation * f.cells);
      if (!f.shoreline) {
        f.shoreline = unique(
          f.vertices.flatMap((v: number) =>
            worldContext.pack.vertices.c[v].filter((c: number) => worldContext.pack.cells.h[c] >= 20)
          )
        );
      }
      f.name = f.name || Lakes.getName(f);
      delete f.river;
    }
  }

  if (isOlderThan("1.61.0")) {
    // v1.61 changed rulers data
    view.ruler.style("display", null);
    setRulers(new Rulers());

    view.ruler.selectAll<SVGLineElement, unknown>(".ruler > .white").each(function () {
      const x1 = +this.getAttribute("x1")!;
      const y1 = +this.getAttribute("y1")!;
      const x2 = +this.getAttribute("x2")!;
      const y2 = +this.getAttribute("y2")!;
      if (Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)) return;
      rulers.create(Ruler, [
        [x1, y1],
        [x2, y2]
      ]);
    });

    view.ruler.selectAll<SVGGElement, unknown>("g.opisometer").each(function () {
      const pointsString = this.dataset.points;
      if (!pointsString) return;
      const points = JSON.parse(pointsString);
      rulers.create(Opisometer, points);
    });

    view.ruler.selectAll<SVGPathElement, unknown>("path.planimeter").each(function () {
      const length = this.getTotalLength();
      if (length < 30) return;

      const step = length > 1000 ? 40 : length > 400 ? 20 : 10;
      const increment = length / Math.ceil(length / step);
      const points: [number, number][] = [];
      for (let i = 0; i <= length; i += increment) {
        const point = this.getPointAtLength(i);
        points.push([point.x | 0, point.y | 0]);
      }
      rulers.create(Planimeter, points);
    });

    view.ruler.selectAll("*").remove();

    if (rulers.data.length) {
      turnButtonOn("toggleRulers");
      rulers.draw();
    } else turnButtonOff("toggleRulers");

    // 1.61 changed oceanicPattern from rect to image
    const oceanicPatternContainer = view.svg.select<SVGElement>("#oceanic");
    const pattern = oceanicPatternContainer.node();
    if (pattern) {
      const filter = pattern.firstElementChild?.getAttribute("filter");
      const href = filter ? `./images/${filter.replace("url(#", "").replace(")", "")}.png` : "";
      oceanicPatternContainer.selectAll("*").remove();
      oceanicPatternContainer
        .append("image")
        .attr("id", "oceanicPattern")
        .attr("href", href)
        .attr("width", 100)
        .attr("height", 100)
        .attr("opacity", 0.2);
    }
  }

  if (isOlderThan("1.62.0")) {
    view.gridOverlay.attr("size", null);
  }

  if (isOlderThan("1.63.0")) {
    view.oceanPattern.attr("opacity", null);
    const oceanicPattern = view.svg.select<SVGImageElement>("#oceanicPattern");
    if (oceanicPattern.size() && !oceanicPattern.attr("opacity")) oceanicPattern.attr("opacity", "0.2");
  }

  if (isOlderThan("1.64.0")) {
    const opacity = view.regions.attr("opacity");
    const filter = view.regions.attr("filter");
    view.statesBody.attr("opacity", opacity).attr("filter", filter);
    view.statesHalo.attr("opacity", opacity).attr("filter", "blur(5px)");
    view.regions.attr("opacity", null).attr("filter", null);
  }

  if (isOlderThan("1.65.0")) {
    view.rivers.attr("style", null);
    const { cells, rivers: packRivers } = worldContext.pack;
    const defaultWidthFactor = rn(1 / ((useOptionsState.getState().points ?? 10000) / 10000) ** 0.25, 2);

    for (const river of packRivers) {
      const node = view.rivers.select<SVGPathElement>(`#river${river.i}`).node();
      if (node && !river.cells) {
        const riverCells: number[] = [];
        const riverPoints: [number, number][] = [];

        const svgNode = node as unknown as SVGPathElement;
        const length = svgNode.getTotalLength() / 2;
        if (!length) continue;
        const segments = Math.ceil(length / 6);
        const increment = length / segments;

        for (let i = 0; i <= segments; i++) {
          const shift = increment * i;
          const { x: x1, y: y1 } = svgNode.getPointAtLength(length + shift);
          const { x: x2, y: y2 } = svgNode.getPointAtLength(length - shift);
          const x = rn((x1 + x2) / 2, 1);
          const y = rn((y1 + y2) / 2, 1);
          const cell = findCell(x, y);
          riverPoints.push([x, y]);
          riverCells.push(cell);
        }

        river.cells = riverCells;
        river.points = riverPoints;
      }

      river.widthFactor = defaultWidthFactor;

      cells.i.forEach((i: number) => {
        const riverInWater = cells.r[i] && cells.h[i] < 20;
        if (riverInWater) cells.r[i] = 0;
      });
    }
  }

  if (isOlderThan("1.652.0")) {
    view.rivers.attr("style", null);
    view.borders.attr("style", null);
  }

  if (isOlderThan("1.7.0")) {
    const defsMarkers = view.defs.select<SVGGElement>("#defs-markers").node();
    const markersGroup = view.markers.node();

    if (defsMarkers && markersGroup) {
      const markerElements = markersGroup.querySelectorAll<SVGUseElement>("use");
      worldContext.pack.markers = migrateLegacyMarkers(defsMarkers, markerElements);

      view.markers.style("display", null);
      defsMarkers?.remove();
      markerElements.forEach(el => {
        el.remove();
      });
      if (layerIsOn("markers")) MarkersRenderer.render(worldContext, viewContext, appServices);
    }
  }

  if (isOlderThan("1.72.0")) {
    const storedStyles = Object.keys(localStorage).filter(key => key.startsWith("style"));
    storedStyles.forEach(styleName => {
      const style = localStorage.getItem(styleName)!;
      const newStyleName = styleName.replace(/^style/, customPresetPrefix);
      localStorage.setItem(newStyleName, style);
      localStorage.removeItem(styleName);
    });
  }

  if (isOlderThan("1.73.0")) {
    view.defs.select("#hatching").remove();
    const zoneLayers = view.zones.selectAll<SVGGElement, unknown>("g").nodes();
    zoneLayers.forEach(zone => {
      if (!zone.dataset.type) zone.dataset.type = "Unknown";
    });
  }

  if (isOlderThan("1.84.0")) {
    if (!worldContext.grid.cellsDesired)
      worldContext.grid.cellsDesired = rn(
        (worldContext.graphWidth * worldContext.graphHeight) / worldContext.grid.spacing ** 2,
        -3
      );
  }

  if (isOlderThan("1.85.0")) {
    view.svg.select("#initial").remove();
  }

  if (isOlderThan("1.86.0")) {
    for (const culture of worldContext.pack.cultures as (Culture & { origin?: number })[]) {
      culture.origins = [culture.origin ?? null];
      delete culture.origin;
    }
    for (const religion of worldContext.pack.religions as (Religion & { origin?: number })[]) {
      if (religion.origin !== undefined) religion.origins = [religion.origin];
      delete religion.origin;
    }
  }

  if (isOlderThan("1.88.0")) {
    worldContext.pack.states.forEach(s => {
      if (s.coa?.shield === "state") delete s.coa.shield;
    });
  }

  if (isOlderThan("1.91.0")) {
    worldContext.pack.states.forEach(state => {
      if ((state.coa as unknown as string) === "custom") state.coa = { custom: true } as Emblem;
    });
    (worldContext.pack.provinces as Province[]).forEach(province => {
      if ((province.coa as unknown as string) === "custom") province.coa = { custom: true } as Emblem;
    });
    (worldContext.pack.burgs as Burg[]).forEach(burg => {
      if ((burg.coa as unknown as string) === "custom") burg.coa = { custom: true } as Emblem;
    });

    view.emblems.selectAll<SVGUseElement, unknown>("use").each(function () {
      const transform = this.getAttribute("transform");
      if (!transform) return;
      const [dx, dy] = parseTransform(transform);
      const x = Number(this.getAttribute("x")) + Number(dx);
      const y = Number(this.getAttribute("y")) + Number(dy);
      this.setAttribute("x", String(x));
      this.setAttribute("y", String(y));
      this.removeAttribute("transform");
    });

    worldContext.pack.states.forEach(state => {
      const s = state as State & { coaSize?: number };
      if (s.coaSize && s.coa) {
        s.coa.size = s.coaSize;
        delete s.coaSize;
      }
    });
    (worldContext.pack.provinces as (Province & { coaSize?: number })[]).forEach(province => {
      if (province.coaSize && province.coa) {
        province.coa.size = province.coaSize;
        delete province.coaSize;
      }
    });
    (worldContext.pack.burgs as (Burg & { coaSize?: number })[]).forEach(burg => {
      if (burg.coaSize && burg.coa) {
        burg.coa.size = burg.coaSize;
        delete burg.coaSize;
      }
    });
  }

  if (isOlderThan("1.92.0")) {
    view.labels.selectAll<SVGTSpanElement, unknown>("tspan").each(function () {
      this.setAttribute("x", "0");
    });
  }

  if (isOlderThan("1.94.0")) {
    view.texture.style("display", null);
    const textureImage = view.texture.select("image");
    if (textureImage.size()) {
      const x = Number(textureImage.attr("x") || 0);
      const y = Number(textureImage.attr("y") || 0);
      const href = textureImage.attr("xlink:href") || textureImage.attr("href") || textureImage.attr("src");
      view.texture.attr("data-href", href).attr("data-x", x).attr("data-y", y);
      textureImage.remove();
      TextureRenderer.render(worldContext, viewContext, appServices);
    }
  }

  if (isOlderThan("1.95.0")) {
    const mask = view.defs.append("mask").attr("id", "vignette-mask");
    mask.append("rect").attr("fill", "white").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
    mask
      .append("rect")
      .attr("id", "vignette-rect")
      .attr("fill", "black")
      .attr("x", "0.3%")
      .attr("y", "0.4%")
      .attr("width", "99.4%")
      .attr("height", "99.2%")
      .attr("rx", "5%")
      .attr("ry", "5%")
      .attr("filter", "blur(20px)");

    const vignette = view.svg
      .append("g")
      .attr("id", "vignette")
      .attr("mask", "url(#vignette-mask)")
      .attr("opacity", 0.3)
      .attr("fill", "#000000")
      .style("display", "none");
    vignette.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
  }

  if (isOlderThan("1.96.0")) {
    view.terrs.selectAll("*").remove();
    const opacity = view.terrs.attr("opacity");
    const filter = view.terrs.attr("filter");
    const scheme = view.terrs.attr("scheme") || "bright";
    const terracing = view.terrs.attr("terracing");
    const skip = view.terrs.attr("skip");
    const relax = view.terrs.attr("relax");
    const curveTypes: Record<string, string> = { 0: "curveBasisClosed", 1: "curveLinear", 2: "curveStep" };
    const curve = curveTypes[view.terrs.attr("curve") ?? "0"] || "curveBasisClosed";

    view.terrs
      .attr("opacity", null)
      .attr("filter", null)
      .attr("mask", null)
      .attr("scheme", null)
      .attr("terracing", null)
      .attr("skip", null)
      .attr("relax", null)
      .attr("curve", null);

    view.terrs
      .append("g")
      .attr("id", "oceanHeights")
      .attr("data-render", 0)
      .attr("opacity", opacity)
      .attr("filter", filter)
      .attr("scheme", scheme)
      .attr("terracing", 0)
      .attr("skip", 0)
      .attr("relax", 1)
      .attr("curve", curve);
    view.terrs
      .append("g")
      .attr("id", "landHeights")
      .attr("opacity", opacity)
      .attr("scheme", scheme)
      .attr("filter", filter)
      .attr("terracing", terracing)
      .attr("skip", skip)
      .attr("relax", relax)
      .attr("curve", curve)
      .attr("mask", "url(#land)");

    if (layerIsOn("toggleHeight")) HeightmapRenderer.render(worldContext, viewContext, appServices);

    view.scaleBar.remove();
    viewContext.scaleBar = view.svg
      .insert("g", "#viewbox + *")
      .attr("id", "scaleBar")
      .attr("opacity", 1)
      .attr("fill", "#353540")
      .attr("data-bar-size", 2)
      .attr("font-size", 10)
      .attr("data-x", 99)
      .attr("data-y", 99)
      .attr("data-label", "");
    view.scaleBar
      .append("rect")
      .attr("id", "scaleBarBack")
      .attr("opacity", 0.2)
      .attr("fill", "#ffffff")
      .attr("stroke", "#000000")
      .attr("stroke-width", 1)
      .attr("filter", "url(#blur5)")
      .attr("data-top", 20)
      .attr("data-right", 15)
      .attr("data-bottom", 15)
      .attr("data-left", 10);
    drawScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.scale);
    fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.svgWidth, view.svgHeight);
    if (!layerIsOn("toggleScaleBar")) view.scaleBar.style("display", "none");

    view.armies.selectAll<SVGGElement, unknown>(":scope > g").each(function () {
      applyLegacyArmyColor(this);
    });
  }

  if (isOlderThan("1.98.0")) {
    const rose = view.compass.select("use");
    rose.attr("xlink:href", "#defs-compass-rose");
    if (!view.compass.selectAll("*").size()) {
      view.compass.style("display", "none");
      view.compass.append("use").attr("xlink:href", "#defs-compass-rose");
      shiftCompass();
    }
  }

  if (isOlderThan("1.99.0")) {
    view.routes.attr("display", null).attr("style", null);
    const legacyCells = worldContext.pack.cells as unknown as Record<string, unknown>;
    delete legacyCells.road;
    delete legacyCells.crossroad;

    worldContext.pack.routes = [];
    const POINT_DISTANCE = worldContext.grid.spacing * 0.75;

    for (const g of view.routes.selectAll<SVGGElement, unknown>(":scope > g").nodes()) {
      const legacyRoutes = extractLegacyRoutesFromGroup(g, POINT_DISTANCE, worldContext.pack.routes.length);
      worldContext.pack.routes.push(...legacyRoutes);
    }
    view.routes.selectAll("path").remove();
    if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);

    worldContext.pack.cells.routes = rebuildRouteLinks(worldContext.pack.routes);
  }

  if (isOlderThan("1.100.0")) {
    worldContext.pack.zones = [];
    view.zones.selectAll<SVGGElement, unknown>("g").each(function () {
      const i = worldContext.pack.zones.length;
      const name = this.dataset.description ?? "";
      const type = this.dataset.type ?? "";
      const color = this.getAttribute("fill") ?? "";
      const cells = this.dataset.cells?.split(",").map(Number) ?? [];
      worldContext.pack.zones.push({ i, name, type, cells, color });
    });
    view.zones.style("display", null).selectAll("*").remove();
    if (layerIsOn("toggleZones")) ZonesRenderer.render(worldContext, viewContext, appServices);
  }

  if (isOlderThan("1.104.0")) {
    const state = getWorldState();
    States.getPoles(state);
    Provinces.getPoles(state);
  }

  if (isOlderThan("1.105.0")) {
    view.viewbox.select("#icons").style("display", null);
    view.viewbox.select("#ice").style("display", null);
    view.viewbox.select("#regions").style("display", null);
    view.viewbox.select("#armies").style("display", null);
  }

  if (isOlderThan("1.106.0")) {
    view.defs.select("#featurePaths").remove();
    view.defs.append("g").attr("id", "featurePaths");
    view.defs.select("#land").selectAll("path, use").remove();
    view.defs.select("#water").selectAll("path, use").remove();
    view.viewbox.select("#coastline").selectAll("path, use").remove();
    view.regions
      .attr("opacity", null)
      .attr("stroke-width", null)
      .attr("letter-spacing", null)
      .attr("fill", null)
      .attr("stroke", null);
    const state = getWorldState();
    States.getPoles(state);
    Provinces.getPoles(state);
  }

  if (isOlderThan("1.107.0")) {
    if (layerIsOn("toggleMarkers")) MarkersRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
  }

  if (isOlderThan("1.108.0")) {
    worldContext.pack.features.forEach(f => {
      if (f?.type === "lake" && !f.group) f.group = "freshwater";
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
    view.viewbox.selectAll("#heights").remove();
  }

  if (isOlderThan("1.109.0")) {
    worldContext.options.burgs = { groups: [] };

    view.burgIcons.selectAll<SVGElement, unknown>("circle, use").each(function () {
      const group = (this.parentNode as SVGGElement).id;
      const id = this.id.replace(/^burg/, "");
      const burg = worldContext.pack.burgs[+id] as Burg & { group?: string };
      if (group && burg) burg.group = group;
    });

    view.burgIcons.selectAll<SVGGElement, unknown>("g").each(function (_el, index) {
      const name = this.id;
      const isDefault = name === "towns";
      worldContext.options.burgs!.groups.push({
        name,
        active: true,
        order: index + 1,
        isDefault,
        preview: "watabou-city"
      });
      if (!this.dataset.icon) this.dataset.icon = "#icon-circle";

      const size = Number(this.getAttribute("size") || 2) * 2;
      this.removeAttribute("size");
      this.setAttribute("font-size", String(size));
      this.setAttribute("stroke-width", "1");
    });

    if (worldContext.options.burgs!.groups.filter(g => g.isDefault).length === 0) {
      worldContext.options.burgs!.groups[0].isDefault = true;
    }

    view.anchors.selectAll<SVGGElement, unknown>("g").each(function () {
      const size = Number(this.getAttribute("size") || 1);
      this.removeAttribute("size");
      this.setAttribute("font-size", String(size));
    });

    view.burgLabels.selectAll<SVGGElement, unknown>("g").each(function () {
      if (!this.dataset.dy) this.dataset.dy = "-0.4";
    });

    const anchorSymbol = view.defs.select<Element>("#icon-anchor").node();
    if (anchorSymbol) {
      replaceAnchorSymbol(anchorSymbol);
    }

    const validBurgs = (worldContext.pack.burgs as (Burg & { group?: string; MFCG?: unknown })[]).filter(
      b => b.i && !b.removed
    );
    const populations = validBurgs.map(b => b.population ?? 0).sort((a, b) => a - b);
    validBurgs.forEach(burg => {
      if (!burg.group) Burgs.defineGroup(burg, populations);
      if (burg.MFCG) {
        burg.link = Burgs.getPreview(burg)?.link ?? undefined;
        delete burg.MFCG;
      }
    });

    layerIsOn("toggleBurgIcons") && BurgIconsRenderer.render(worldContext, viewContext, appServices);
    layerIsOn("toggleLabels") && BurgLabelsRenderer.render(worldContext, viewContext, appServices);

    const legacyOptions = worldContext.options as unknown as Record<string, unknown>;
    delete legacyOptions.showBurgPreview;
    delete legacyOptions.showMFCGMap;
    delete legacyOptions.villageMaxPopulation;
  }

  if (isOlderThan("1.111.0")) {
    if (!worldContext.pack.ice.length) {
      worldContext.pack.ice = [];
      const iceLayer = view.ice.node();
      if (iceLayer) {
        worldContext.pack.ice = migrateLegacyIce(iceLayer);
        clearElementChildren(iceLayer);
      } else {
        viewContext.ice = view.viewbox.insert("g", "#coastline").attr("id", "ice");
        view.ice
          .attr("opacity", null)
          .attr("fill", "#e8f0f6")
          .attr("stroke", "#e8f0f6")
          .attr("stroke-width", 1)
          .attr("filter", "url(#dropShadow05)");
      }

      if (layerIsOn("toggleIce")) IceRenderer.render(worldContext, viewContext, appServices);
    }
  }

  if (isOlderThan("1.113.0")) {
    worldContext.pack.zones.forEach(zone => {
      zone.cells = unique(zone.cells);
    });
  }

  if (isOlderThan("1.124.0")) {
    // v1.124.0 added economy state tax fields and SVG layers.
    // SVG layer creation is delegated to the economy extension if installed.
    for (const state of worldContext.pack.states) {
      if (!state) continue;
      if (!state.i || state.removed) {
        if (state.i === 0) {
          state.salesTax = 0;
          state.pollTax = 0;
          state.treasury = 0;
        }
        continue;
      }
      state.salesTax = rn(rand(5, 15) / 100, 2);
      state.pollTax = rn(rand(1, 5) / 100, 2);
      state.treasury = 0;
    }

    // Signal the economy extension (if installed) to set up SVG layers and generate data
    emitEconomyAutoUpdate("v1.124.0");
  }

  if (isOlderThan("1.125.0")) {
    // Signal the economy extension to regenerate if data is missing. Economy's `goods` no
    // longer augments PackedGraph's type (see src/extensions/economy/types.ts) — it is only
    // mirrored onto `pack` at runtime via extensionStateSlices.ts's compatibility projection.
    const goods = (worldContext.pack as unknown as Record<string, unknown>).goods;
    if (!Array.isArray(goods) || !goods.length) {
      emitEconomyAutoUpdate("v1.125.0");
    }
  }
}

function emitEvent<TDetail = undefined>(eventName: string, detail?: TDetail): void {
  if (detail === undefined) {
    document.dispatchEvent(new CustomEvent(eventName));
    return;
  }
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function turnButtonOn(layerId: string): void {
  emitEvent("fmg:turn-button-on", layerId);
}

function turnButtonOff(layerId: string): void {
  emitEvent("fmg:turn-button-off", layerId);
}

function emitEconomyAutoUpdate(trigger: "v1.124.0" | "v1.125.0"): void {
  emitEvent("fmg:economy:auto-update", { trigger });
}

function replaceTextPathContent(textPath: SVGTextPathElement, text: string, shift: number): void {
  while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
  const tspan = textPath.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "tspan");
  tspan.setAttribute("x", String(shift));
  tspan.textContent = text;
  textPath.appendChild(tspan);
}

function applyLegacyArmyColor(armyGroup: SVGGElement): void {
  const fill = armyGroup.getAttribute("fill");
  if (!fill) return;
  const darkerColor = (d3.color(fill) as d3.RGBColor).darker().formatHex();
  armyGroup.setAttribute("color", darkerColor);
  armyGroup.querySelectorAll("g > rect:nth-child(2)").forEach((rect: Element) => {
    rect.setAttribute("fill", "currentColor");
  });
}

function extractLegacyRoutesFromGroup(routeGroup: SVGGElement, pointDistance: number, startIndex: number): Route[] {
  const group = routeGroup.id;
  if (!group) return [];
  const routes: Route[] = [];

  for (const node of routeGroup.querySelectorAll<SVGPathElement>("path")) {
    const totalLength = node.getTotalLength();
    if (!totalLength) {
      ERROR && console.error("Route path has zero length", node);
      continue;
    }

    const increment = totalLength / Math.ceil(totalLength / pointDistance);
    const points: [number, number, number][] = [];

    for (let i = 0; i <= totalLength + 0.1; i += increment) {
      const point = node.getPointAtLength(i);
      const x = rn(point.x, 2);
      const y = rn(point.y, 2);
      const cellId = findCell(x, y);
      points.push([x, y, cellId]);
    }

    if (points.length < 2) {
      ERROR && console.error("Route path has less than 2 points", node);
      continue;
    }

    const secondCellId = points[1][2];
    const feature = worldContext.pack.cells.f[secondCellId];
    routes.push({ i: startIndex + routes.length, group, feature, points });
  }

  return routes;
}

function rebuildRouteLinks(routes: Route[]): Record<number, Record<number, number>> {
  const links: Record<number, Record<number, number>> = {};
  for (const route of routes) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const cellId = route.points[i][2];
      const nextCellId = route.points[i + 1][2];
      if (cellId === nextCellId) continue;

      if (!links[cellId]) links[cellId] = {};
      links[cellId][nextCellId] = route.i;

      if (!links[nextCellId]) links[nextCellId] = {};
      links[nextCellId][cellId] = route.i;
    }
  }
  return links;
}

function replaceAnchorSymbol(anchorSymbol: Element): void {
  const defs = anchorSymbol.parentNode;
  if (!defs) return;
  const symbol = anchorSymbol.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "symbol");
  symbol.setAttribute("id", "icon-anchor");
  symbol.setAttribute("viewBox", "0 0 30 30");
  symbol.setAttribute("width", "1em");
  symbol.setAttribute("height", "1em");
  symbol.setAttribute("overflow", "visible");

  const path = anchorSymbol.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ANCHOR_SYMBOL_PATH);
  symbol.appendChild(path);

  defs.replaceChild(symbol, anchorSymbol);
}

function clearElementChildren(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function migrateLegacyMarkers(defsMarkers: SVGGElement, markerElements: NodeListOf<SVGUseElement>): Marker[] {
  const rescale = +view.markers.attr("rescale")!;

  return Array.from(markerElements).map((el, i) => {
    const id = el.getAttribute("id")!;
    const note = worldContext.notes.find(note => note.id === id);
    if (note) note.id = `marker${i}`;

    let x = +el.dataset.x!;
    let y = +el.dataset.y!;

    const transform = el.getAttribute("transform");
    if (transform) {
      const [dx, dy] = parseTransform(transform);
      if (dx) x += +dx;
      if (dy) y += +dy;
    }
    const cell = findCell(x, y);
    const size = rn(rescale ? +el.dataset.size! * 30 : +(el.getAttribute("width") ?? 0), 1);

    const href = el.href.baseVal;
    const type = href.replace("#marker_", "");
    const symbol = defsMarkers.querySelector(`symbol${href}`);
    const text = symbol?.querySelector("text");
    const circle = symbol?.querySelector("circle");

    const icon = text?.textContent ?? "";
    const px = text ? Number(text.getAttribute("font-size")?.replace("px", "")) : undefined;
    const dx = text ? Number(text.getAttribute("x")?.replace("%", "")) : undefined;
    const dy = text ? Number(text.getAttribute("y")?.replace("%", "")) : undefined;
    const fill = circle?.getAttribute("fill");
    const stroke = circle?.getAttribute("stroke");

    const marker: Marker = { i, icon, type, x, y, size, cell };
    if (size && size !== 30) marker.size = size;
    if (px !== undefined && !Number.isNaN(px) && px !== 12) marker.px = px;
    if (dx !== undefined && !Number.isNaN(dx) && dx !== 50) marker.dx = dx;
    if (dy !== undefined && !Number.isNaN(dy) && dy !== 50) marker.dy = dy;
    if (fill && fill !== "#ffffff") marker.fill = fill;
    if (stroke && stroke !== "#000000") marker.stroke = stroke;
    if (circle?.getAttribute("opacity") === "0") marker.pin = "no";

    return marker;
  });
}

function migrateLegacyIce(iceLayer: SVGGElement): (IceGlacier | IceIceberg)[] {
  const ice: (IceGlacier | IceIceberg)[] = [];
  let iceId = 0;

  iceLayer.querySelectorAll<SVGPolygonElement>("polygon[type='iceShield']").forEach(polygon => {
    const points = Array.from(polygon.points).map(svgPoint => [svgPoint.x, svgPoint.y] as [number, number]);
    const transform = polygon.getAttribute("transform");
    const iceElement: IceGlacier = { i: iceId++, points, type: "glacier" };
    if (transform) iceElement.offset = parseTransform(transform) as [number, number];
    ice.push(iceElement);
  });

  iceLayer.querySelectorAll<SVGPolygonElement>("polygon:not([type])").forEach(polygon => {
    const cell = polygon.getAttribute("cell");
    const size = Number(polygon.getAttribute("size"));
    if (!cell || !size) return;

    const points = Array.from(polygon.points).map(svgPoint => [svgPoint.x, svgPoint.y] as [number, number]);
    const transform = polygon.getAttribute("transform");
    const iceElement: IceIceberg = { i: iceId++, points, type: "iceberg", cellId: +cell, size };
    if (transform) iceElement.offset = parseTransform(transform) as [number, number];
    ice.push(iceElement);
  });

  return ice;
}

declare global {
  var rw: (weights: Record<string, number>) => string;
  var shiftCompass: () => void;
  var customPresetPrefix: string;
  var parseTransform: (string: string) => (string | number)[];
}
