import * as d3 from "d3";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import { Burgs } from "../modules/burgs-generator";
import type { Culture } from "../modules/cultures-generator";
import { Cultures } from "../modules/cultures-generator";
import { Features } from "../modules/features";
import type { IceGlacier, IceIceberg } from "../modules/ice";
import { Lakes } from "../modules/lakes";
import type { Marker } from "../modules/markers-generator";
import { Markers } from "../modules/markers-generator";
import type { MilitaryRegiment } from "../modules/military-generator";
import { Military } from "../modules/military-generator";
import type { Province } from "../modules/provinces-generator";
import { Provinces } from "../modules/provinces-generator";
import type { Religion } from "../modules/religions-generator";
import { Religions } from "../modules/religions-generator";
import type { River } from "../modules/river-generator";
import { Rivers } from "../modules/river-generator";
import type { State } from "../modules/states-generator";
import { States } from "../modules/states-generator";
import { Zones } from "../modules/zones-generator";
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
import { ensureEl, findCell, rand, rn, unique } from "../utils";

// update old map file to the current version
export function resolveVersionConflicts(mapVersion: string): void {
  const isOlderThan = (tagVersion: string) => compareVersions(mapVersion, tagVersion).isOlder;

  if (isOlderThan("1.0.0")) {
    // v1.0 added a new religions layer
    relig = viewbox.insert("g", "#terrain").attr("id", "relig");
    Religions.generate(worldContext, viewContext, appServices, getWorldState());

    // v1.0 added a legend box
    legend = svg.append("g").attr("id", "legend");
    legend
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
    stateBorders = borders.append("g").attr("id", "stateBorders");
    provinceBorders = borders.append("g").attr("id", "provinceBorders");
    borders
      .attr("opacity", null)
      .attr("stroke", null)
      .attr("stroke-width", null)
      .attr("stroke-dasharray", null)
      .attr("stroke-linecap", null)
      .attr("filter", null);
    stateBorders
      .attr("opacity", 0.8)
      .attr("stroke", "#56566d")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2")
      .attr("stroke-linecap", "butt");
    provinceBorders
      .attr("opacity", 0.8)
      .attr("stroke", "#56566d")
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "1")
      .attr("stroke-linecap", "butt");

    // v1.0 added state relations, provinces, forms and full names
    provs = viewbox.insert("g", "#borders").attr("id", "provs").attr("opacity", 0.6);
    const state = getWorldState();
    States.collectStatistics(state);
    States.generateCampaigns();
    States.generateDiplomacy();
    States.defineStateForms(state);
    Provinces.generate(worldContext, viewContext, appServices, state);
    Provinces.getPoles(state);
    if (!layerIsOn("toggleBorders")) d3.select("#borders").style("display", "none");
    if (!layerIsOn("toggleStates")) regions.attr("display", "none").selectAll("path").remove();

    // v1.0 added zones layer
    zones = viewbox.insert("g", "#borders").attr("id", "zones").attr("display", "none");
    zones
      .attr("opacity", 0.6)
      .attr("stroke", null)
      .attr("stroke-width", 0)
      .attr("stroke-dasharray", null)
      .attr("stroke-linecap", "butt");
    Zones.generate(worldContext, viewContext, appServices, state);
    if (!markers.selectAll("*").size()) {
      Markers.generate(worldContext, viewContext, appServices, state);
      turnButtonOn("toggleMarkers");
    }

    // v1.0 add fogging layer (state focus)
    fogging = viewbox
      .insert("g", "#ruler")
      .attr("id", "fogging-cont")
      .attr("mask", "url(#fog)")
      .append("g")
      .attr("id", "fogging")
      .style("display", "none");
    fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
    defs
      .append("mask")
      .attr("id", "fog")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "white");

    // v1.0 changes states opacity back to regions level
    if (statesBody.attr("opacity")) {
      regions.attr("opacity", statesBody.attr("opacity"));
      statesBody.attr("opacity", null);
    }

    // v1.0 changed labels to multi-lined
    labels.selectAll<SVGTextPathElement, unknown>("textPath").each(function () {
      const text = this.textContent ?? "";
      const shift = this.getComputedTextLength() / -1.5;
      this.innerHTML = `<tspan x="${shift}">${text}</tspan>`;
    });

    // v1.0 added new biome - Wetland
    biomesData.name.push("Wetland");
    biomesData.color.push("#0b9131");
    biomesData.habitability.push(12);
  }

  if (isOlderThan("1.1.0")) {
    // v1.0 code had a bug with religion layer id
    if (!relig.size()) relig = viewbox.insert("g", "#terrain").attr("id", "relig");

    // v1.0 had Sympathy status then replaced with Friendly
    for (const s of pack.states) {
      if (!s.diplomacy) continue;
      s.diplomacy = s.diplomacy.map((r: string) => (r === "Sympathy" ? "Friendly" : r));
    }

    // labels should be toggled via style attribute, so remove display attribute
    labels.attr("display", null);

    // v1.0 added religions hierarchy tree
    if (pack.religions[1] && !(pack.religions[1] as Religion).code) {
      pack.religions
        .filter(r => r.i)
        .forEach(r => {
          (r as Religion & { origin: number }).origin = 0;
          (r as Religion).code = r.name.slice(0, 2);
        });
    }

    if (!document.getElementById("freshwater")) {
      lakes.append("g").attr("id", "freshwater");
      lakes
        .select("#freshwater")
        .attr("opacity", 0.5)
        .attr("fill", "#a6c1fd")
        .attr("stroke", "#5f799d")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    if (!document.getElementById("salt")) {
      lakes.append("g").attr("id", "salt");
      lakes
        .select("#salt")
        .attr("opacity", 0.5)
        .attr("fill", "#409b8a")
        .attr("stroke", "#388985")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    // v1.1 added new lake and coast groups
    if (!document.getElementById("sinkhole")) {
      lakes.append("g").attr("id", "sinkhole");
      lakes.append("g").attr("id", "frozen");
      lakes.append("g").attr("id", "lava");
      lakes
        .select("#sinkhole")
        .attr("opacity", 1)
        .attr("fill", "#5bc9fd")
        .attr("stroke", "#53a3b0")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
      lakes
        .select("#frozen")
        .attr("opacity", 0.95)
        .attr("fill", "#cdd4e7")
        .attr("stroke", "#cfe0eb")
        .attr("stroke-width", 0)
        .attr("filter", null);
      lakes
        .select("#lava")
        .attr("opacity", 0.7)
        .attr("fill", "#90270d")
        .attr("stroke", "#f93e0c")
        .attr("stroke-width", 2)
        .attr("filter", "url(#crumpled)");

      coastline.append("g").attr("id", "sea_island");
      coastline.append("g").attr("id", "lake_island");
      coastline
        .select("#sea_island")
        .attr("opacity", 0.5)
        .attr("stroke", "#1f3846")
        .attr("stroke-width", 0.7)
        .attr("filter", "url(#dropShadow)");
      coastline
        .select("#lake_island")
        .attr("opacity", 1)
        .attr("stroke", "#7c8eaf")
        .attr("stroke-width", 0.35)
        .attr("filter", null);
    }

    // v1.1 features stores more data
    defs.select("#land").selectAll("path").remove();
    defs.select("#water").selectAll("path").remove();
    coastline.selectAll("path").remove();
    lakes.selectAll("path").remove();

    Features.markupPack();
    createDefaultRuler();
  }

  if (isOlderThan("1.11.0")) {
    // v1.11 added new attributes
    terrs.attr("scheme", "bright").attr("terracing", 0).attr("skip", 5).attr("relax", 0).attr("curve", 0);
    svg.select("#oceanic > *").attr("id", "oceanicPattern");
    oceanLayers.attr("layers", "-6,-3,-1");
    gridOverlay.attr("type", "pointyHex").attr("size", 10);

    // v1.11 added cultures hierarchy tree
    if (pack.cultures[1] && !(pack.cultures[1] as Culture).code) {
      pack.cultures
        .filter(c => c.i)
        .forEach(c => {
          (c as Culture & { origin: number }).origin = 0;
          (c as Culture).code = c.name.slice(0, 2);
        });
    }

    // v1.11 had an issue with fogging being displayed on load
    unfog();

    // v1.2 added new terrain attributes
    if (!terrain.attr("set")) terrain.attr("set", "simple");
    if (!terrain.attr("size")) terrain.attr("size", 1);
    if (!terrain.attr("density")) terrain.attr("density", 0.4);
  }

  if (isOlderThan("1.21.0")) {
    // v1.11 replaced "display" attribute by "display" style
    viewbox.selectAll<SVGGElement, unknown>("g").each(function () {
      if (this.hasAttribute("display")) {
        this.removeAttribute("display");
        this.style.display = "none";
      }
    });

    // v1.21 added rivers data to pack
    pack.rivers = [];
    rivers.selectAll<SVGPathElement, unknown>("path").each(function () {
      const i = +this.id.slice(5);
      const length = this.getTotalLength() / 2;
      if (!length) return;

      const s = this.getPointAtLength(length);
      const e = this.getPointAtLength(0);
      const source = findCell(s.x, s.y);
      const mouth = findCell(e.x, e.y);
      const name = Rivers.getName(mouth);
      const type = length < 25 ? rw({ Creek: 9, River: 3, Brook: 3, Stream: 1 }) : "River";
      pack.rivers.push({ i, parent: 0, length, source, mouth, basin: i, name, type } as unknown as River);
    });
  }

  if (isOlderThan("1.22.0")) {
    // v1.22 changed state neighbors from Set object to array
    States.collectStatistics(getWorldState());
  }

  if (isOlderThan("1.3.0")) {
    // v1.3 added global options object
    const winds = (options as unknown as number[]).slice();
    const year = rand(100, 2000);
    const era = `${Names.getBaseShort(P(0.7) ? 1 : rand(nameBases.length))} Era`;
    const eraShort = `${era[0]}E`;
    const military = Military.getDefaultOptions();
    options = { winds, year, era, eraShort, military } as unknown as typeof options;

    // v1.3 added campaigns data for all states
    States.generateCampaigns();

    // v1.3 added military layer
    armies = viewbox.insert("g", "#icons").attr("id", "armies");
    armies
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
    if (!lakes.select("#dry").size()) {
      lakes.append("g").attr("id", "dry");
      lakes
        .select("#dry")
        .attr("opacity", 1)
        .attr("fill", "#c9bfa7")
        .attr("stroke", "#8e816f")
        .attr("stroke-width", 0.7)
        .attr("filter", null);
    }

    // v1.4 added ice layer
    ice = viewbox.insert("g", "#coastline").attr("id", "ice").style("display", "none");
    ice
      .attr("opacity", null)
      .attr("fill", "#e8f0f6")
      .attr("stroke", "#e8f0f6")
      .attr("stroke-width", 1)
      .attr("filter", "url(#dropShadow05)");
    IceRenderer.render(worldContext, viewContext, appServices);

    // v1.4 added icon and power attributes for units
    for (const unit of options.military!) {
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
    pack.states
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
    (pack.cultures as Culture[]).forEach(culture => {
      if (culture.removed) return;
      culture.shield = Cultures.getRandomShield();
    });

    // v1.5 added burg type value
    (pack.burgs as Burg[]).forEach(burg => {
      if (!burg.i || burg.removed) return;
      burg.type = Burgs.getType(burg.cell, burg.port);
    });

    // v1.5 added emblems
    defs.append("g").attr("id", "defs-emblems");
    emblems = viewbox
      .insert("g", "#population")
      .attr("id", "emblems")
      .style("display", "none") as unknown as typeof emblems;
    emblems.append("g").attr("id", "burgEmblems");
    emblems.append("g").attr("id", "provinceEmblems");
    emblems.append("g").attr("id", "stateEmblems");
    regenerateEmblems();
    toggleEmblems();

    // v1.5 changed relief icons data
    terrain.selectAll<SVGUseElement, unknown>("use").each(function () {
      const type = this.getAttribute("data-type") || this.getAttribute("xlink:href");
      this.removeAttribute("xlink:href");
      this.removeAttribute("data-type");
      this.removeAttribute("data-size");
      this.setAttribute("href", type ?? "");
    });
  }

  if (isOlderThan("1.6.0")) {
    // v1.6 changed rivers data
    for (const river of pack.rivers) {
      const el = document.getElementById(`river${river.i}`);
      if (el) {
        river.widthFactor = +el.getAttribute("data-width")!;
        el.removeAttribute("data-width");
        el.removeAttribute("data-increment");
        river.discharge = pack.cells.fl[river.mouth] || 1;
        river.width = rn(river.length / 100, 2);
        river.sourceWidth = 0.1;
      } else {
        Rivers.remove(river.i);
      }
    }

    // v1.6 changed lakes data
    for (const f of pack.features) {
      if (f.type !== "lake") continue;
      if (f.evaporation) continue;

      f.flux = f.flux || f.cells * 3;
      f.temp = grid.cells.temp[pack.cells.g[f.firstCell]];
      f.height =
        (f.height ||
          d3.min(pack.cells.c[f.firstCell].map((c: number) => pack.cells.h[c]).filter((h: number) => h >= 20))) ??
        f.height;
      const height = (f.height - 18) ** +heightExponentInput.value;
      const evaporation = ((700 * (f.temp + 0.006 * height)) / 50 + 75) / (80 - f.temp);
      f.evaporation = rn(evaporation * f.cells);
      if (!f.shoreline) {
        f.shoreline = unique(
          f.vertices.flatMap((v: number) => pack.vertices.c[v].filter((c: number) => pack.cells.h[c] >= 20))
        );
      }
      f.name = f.name || Lakes.getName(f);
      delete f.river;
    }
  }

  if (isOlderThan("1.61.0")) {
    // v1.61 changed rulers data
    ruler.style("display", null);
    rulers = new Rulers();

    ruler.selectAll<SVGLineElement, unknown>(".ruler > .white").each(function () {
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

    ruler.selectAll<SVGGElement, unknown>("g.opisometer").each(function () {
      const pointsString = this.dataset.points;
      if (!pointsString) return;
      const points = JSON.parse(pointsString);
      rulers.create(Opisometer, points);
    });

    ruler.selectAll<SVGPathElement, unknown>("path.planimeter").each(function () {
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

    ruler.selectAll("*").remove();

    if (rulers.data.length) {
      turnButtonOn("toggleRulers");
      rulers.draw();
    } else turnButtonOff("toggleRulers");

    // 1.61 changed oceanicPattern from rect to image
    const pattern = document.getElementById("oceanic")!;
    const filter = pattern.firstElementChild?.getAttribute("filter");
    const href = filter ? `./images/${filter.replace("url(#", "").replace(")", "")}.png` : "";
    pattern.innerHTML = `<image id="oceanicPattern" href=${href} width="100" height="100" opacity="0.2"></image>`;
  }

  if (isOlderThan("1.62.0")) {
    gridOverlay.attr("size", null);
  }

  if (isOlderThan("1.63.0")) {
    const oceanPattern = document.getElementById("oceanPattern");
    if (oceanPattern) oceanPattern.removeAttribute("opacity");
    const oceanicPattern = document.getElementById("oceanicPattern");
    if (oceanicPattern && !oceanicPattern.getAttribute("opacity")) oceanicPattern.setAttribute("opacity", "0.2");
  }

  if (isOlderThan("1.64.0")) {
    const opacity = regions.attr("opacity");
    const filter = regions.attr("filter");
    statesBody.attr("opacity", opacity).attr("filter", filter);
    statesHalo.attr("opacity", opacity).attr("filter", "blur(5px)");
    regions.attr("opacity", null).attr("filter", null);
  }

  if (isOlderThan("1.65.0")) {
    d3.select("#rivers").attr("style", null);
    const { cells, rivers: packRivers } = pack;
    const defaultWidthFactor = rn(
      1 / ((pointsInput.dataset.cells ? +pointsInput.dataset.cells : 10000) / 10000) ** 0.25,
      2
    );

    for (const river of packRivers) {
      const node = document.getElementById(`river${river.i}`);
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
    rivers.attr("style", null);
    borders.attr("style", null);
  }

  if (isOlderThan("1.7.0")) {
    const defsMarkers = document.getElementById("defs-markers");
    const markersGroup = document.getElementById("markers");

    if (defsMarkers && markersGroup) {
      const markerElements = markersGroup.querySelectorAll("use");
      const rescale = +markersGroup.getAttribute("rescale")!;

      pack.markers = Array.from(markerElements).map((el, i) => {
        const id = el.getAttribute("id")!;
        const note = notes.find(note => note.id === id);
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
        const symbol = defsMarkers?.querySelector(`symbol${href}`);
        const text = symbol?.querySelector("text");
        const circle = symbol?.querySelector("circle");

        const icon = text?.innerHTML;
        const px = text ? Number(text.getAttribute("font-size")?.replace("px", "")) : undefined;
        const dx = text ? Number(text.getAttribute("x")?.replace("%", "")) : undefined;
        const dy = text ? Number(text.getAttribute("y")?.replace("%", "")) : undefined;
        const fill = circle?.getAttribute("fill");
        const stroke = circle?.getAttribute("stroke");

        const marker: Marker = { i, icon: icon ?? "", type, x, y, size, cell };
        if (size && size !== 30) marker.size = size;
        if (px !== undefined && !Number.isNaN(px) && px !== 12) marker.px = px;
        if (dx !== undefined && !Number.isNaN(dx) && dx !== 50) marker.dx = dx;
        if (dy !== undefined && !Number.isNaN(dy) && dy !== 50) marker.dy = dy;
        if (fill && fill !== "#ffffff") marker.fill = fill;
        if (stroke && stroke !== "#000000") marker.stroke = stroke;
        if (circle?.getAttribute("opacity") === "0") marker.pin = "no";

        return marker;
      });

      markersGroup.style.display = "";
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
    document.getElementById("hatching")?.remove();
    const zoneLayers = Array.from(document.querySelectorAll<HTMLElement>("#zones > g"));
    zoneLayers.forEach(zone => {
      if (!zone.dataset.type) zone.dataset.type = "Unknown";
    });
  }

  if (isOlderThan("1.84.0")) {
    if (!grid.cellsDesired) grid.cellsDesired = rn((graphWidth * graphHeight) / grid.spacing ** 2, -3);
  }

  if (isOlderThan("1.85.0")) {
    svg.select("#initial").remove();
  }

  if (isOlderThan("1.86.0")) {
    for (const culture of pack.cultures as (Culture & { origin?: number })[]) {
      culture.origins = [culture.origin ?? null];
      delete culture.origin;
    }
    for (const religion of pack.religions as (Religion & { origin?: number })[]) {
      if (religion.origin !== undefined) religion.origins = [religion.origin];
      delete religion.origin;
    }
  }

  if (isOlderThan("1.88.0")) {
    pack.states.forEach(s => {
      if (s.coa?.shield === "state") delete s.coa.shield;
    });
  }

  if (isOlderThan("1.91.0")) {
    pack.states.forEach(state => {
      if ((state.coa as unknown as string) === "custom")
        state.coa = { custom: true } as import("../modules/emblem/generator").Emblem;
    });
    (pack.provinces as Province[]).forEach(province => {
      if ((province.coa as unknown as string) === "custom")
        province.coa = { custom: true } as import("../modules/emblem/generator").Emblem;
    });
    (pack.burgs as Burg[]).forEach(burg => {
      if ((burg.coa as unknown as string) === "custom")
        burg.coa = { custom: true } as import("../modules/emblem/generator").Emblem;
    });

    emblems.selectAll<SVGUseElement, unknown>("use").each(function () {
      const transform = this.getAttribute("transform");
      if (!transform) return;
      const [dx, dy] = parseTransform(transform);
      const x = Number(this.getAttribute("x")) + Number(dx);
      const y = Number(this.getAttribute("y")) + Number(dy);
      this.setAttribute("x", String(x));
      this.setAttribute("y", String(y));
      this.removeAttribute("transform");
    });

    pack.states.forEach(state => {
      const s = state as State & { coaSize?: number };
      if (s.coaSize && s.coa) {
        s.coa.size = s.coaSize;
        delete s.coaSize;
      }
    });
    (pack.provinces as (Province & { coaSize?: number })[]).forEach(province => {
      if (province.coaSize && province.coa) {
        province.coa.size = province.coaSize;
        delete province.coaSize;
      }
    });
    (pack.burgs as (Burg & { coaSize?: number })[]).forEach(burg => {
      if (burg.coaSize && burg.coa) {
        burg.coa.size = burg.coaSize;
        delete burg.coaSize;
      }
    });
  }

  if (isOlderThan("1.92.0")) {
    labels.selectAll<SVGTSpanElement, unknown>("tspan").each(function () {
      this.setAttribute("x", "0");
    });
  }

  if (isOlderThan("1.94.0")) {
    texture.style("display", null);
    const textureImage = texture.select("image");
    if (textureImage.size()) {
      const x = Number(textureImage.attr("x") || 0);
      const y = Number(textureImage.attr("y") || 0);
      const href = textureImage.attr("xlink:href") || textureImage.attr("href") || textureImage.attr("src");
      texture.attr("data-href", href).attr("data-x", x).attr("data-y", y);
      textureImage.remove();
      TextureRenderer.render(worldContext, viewContext, appServices);
    }
  }

  if (isOlderThan("1.95.0")) {
    const mask = defs.append("mask").attr("id", "vignette-mask");
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

    const vignette = svg
      .append("g")
      .attr("id", "vignette")
      .attr("mask", "url(#vignette-mask)")
      .attr("opacity", 0.3)
      .attr("fill", "#000000")
      .style("display", "none");
    vignette.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
  }

  if (isOlderThan("1.96.0")) {
    terrs.selectAll("*").remove();
    const opacity = terrs.attr("opacity");
    const filter = terrs.attr("filter");
    const scheme = terrs.attr("scheme") || "bright";
    const terracing = terrs.attr("terracing");
    const skip = terrs.attr("skip");
    const relax = terrs.attr("relax");
    const curveTypes: Record<string, string> = { 0: "curveBasisClosed", 1: "curveLinear", 2: "curveStep" };
    const curve = curveTypes[terrs.attr("curve") ?? "0"] || "curveBasisClosed";

    terrs
      .attr("opacity", null)
      .attr("filter", null)
      .attr("mask", null)
      .attr("scheme", null)
      .attr("terracing", null)
      .attr("skip", null)
      .attr("relax", null)
      .attr("curve", null);

    terrs
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
    terrs
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

    d3.select("#scaleBar").remove();
    scaleBar = svg
      .insert("g", "#viewbox + *")
      .attr("id", "scaleBar")
      .attr("opacity", 1)
      .attr("fill", "#353540")
      .attr("data-bar-size", 2)
      .attr("font-size", 10)
      .attr("data-x", 99)
      .attr("data-y", 99)
      .attr("data-label", "");
    scaleBar
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
    drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
    fitScaleBar(worldContext, viewContext, appServices, scaleBar, svgWidth, svgHeight);
    if (!layerIsOn("toggleScaleBar")) scaleBar.style("display", "none");

    armies.selectAll<SVGGElement, unknown>(":scope > g").each(function () {
      const fill = this.getAttribute("fill");
      if (!fill) return;
      const darkerColor = (d3.color(fill) as d3.RGBColor).darker().formatHex();
      this.setAttribute("color", darkerColor);
      this.querySelectorAll("g > rect:nth-child(2)").forEach((rect: Element) => {
        rect.setAttribute("fill", "currentColor");
      });
    });
  }

  if (isOlderThan("1.98.0")) {
    const rose = compass.select("use");
    rose.attr("xlink:href", "#defs-compass-rose");
    if (!compass.selectAll("*").size()) {
      compass.style("display", "none");
      compass.append("use").attr("xlink:href", "#defs-compass-rose");
      shiftCompass();
    }
  }

  if (isOlderThan("1.99.0")) {
    routes.attr("display", null).attr("style", null);
    const legacyCells = pack.cells as unknown as Record<string, unknown>;
    delete legacyCells.road;
    delete legacyCells.crossroad;

    pack.routes = [];
    const POINT_DISTANCE = grid.spacing * 0.75;

    for (const g of document.querySelectorAll<SVGGElement>("#viewbox > #routes > g")) {
      const group = g.id;
      if (!group) continue;

      for (const node of g.querySelectorAll("path")) {
        const totalLength = (node as SVGPathElement).getTotalLength();
        if (!totalLength) {
          ERROR && console.error("Route path has zero length", node);
          continue;
        }

        const increment = totalLength / Math.ceil(totalLength / POINT_DISTANCE);
        const points: [number, number, number][] = [];

        for (let i = 0; i <= totalLength + 0.1; i += increment) {
          const point = (node as SVGPathElement).getPointAtLength(i);
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
        const feature = pack.cells.f[secondCellId];
        pack.routes.push({ i: pack.routes.length, group, feature, points });
      }
    }
    routes.selectAll("path").remove();
    if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);

    pack.cells.routes = {};
    const links: Record<number, Record<number, number>> = pack.cells.routes;
    for (const route of pack.routes) {
      for (let i = 0; i < route.points.length - 1; i++) {
        const cellId = route.points[i][2];
        const nextCellId = route.points[i + 1][2];
        if (cellId !== nextCellId) {
          if (!links[cellId]) links[cellId] = {};
          links[cellId][nextCellId] = route.i;
          if (!links[nextCellId]) links[nextCellId] = {};
          links[nextCellId][cellId] = route.i;
        }
      }
    }
  }

  if (isOlderThan("1.100.0")) {
    pack.zones = [];
    zones.selectAll<SVGGElement, unknown>("g").each(function () {
      const i = pack.zones.length;
      const name = this.dataset.description ?? "";
      const type = this.dataset.type ?? "";
      const color = this.getAttribute("fill") ?? "";
      const cells = this.dataset.cells?.split(",").map(Number) ?? [];
      pack.zones.push({ i, name, type, cells, color });
    });
    zones.style("display", null).selectAll("*").remove();
    if (layerIsOn("toggleZones")) ZonesRenderer.render(worldContext, viewContext, appServices);
  }

  if (isOlderThan("1.104.0")) {
    const state = getWorldState();
    States.getPoles(state);
    Provinces.getPoles(state);
  }

  if (isOlderThan("1.105.0")) {
    viewbox.select("#icons").style("display", null);
    viewbox.select("#ice").style("display", null);
    viewbox.select("#regions").style("display", null);
    viewbox.select("#armies").style("display", null);
  }

  if (isOlderThan("1.106.0")) {
    defs.select("#featurePaths").remove();
    defs.append("g").attr("id", "featurePaths");
    defs.select("#land").selectAll("path, use").remove();
    defs.select("#water").selectAll("path, use").remove();
    viewbox.select("#coastline").selectAll("path, use").remove();
    regions
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
    pack.features.forEach(f => {
      if (f?.type === "lake" && !f.group) f.group = "freshwater";
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
    viewbox.selectAll("#heights").remove();
  }

  if (isOlderThan("1.109.0")) {
    options.burgs = { groups: [] };

    burgIcons.selectAll<SVGElement, unknown>("circle, use").each(function () {
      const group = (this.parentNode as SVGGElement).id;
      const id = this.id.replace(/^burg/, "");
      const burg = pack.burgs[+id] as Burg & { group?: string };
      if (group && burg) burg.group = group;
    });

    burgIcons.selectAll<SVGGElement, unknown>("g").each(function (_el, index) {
      const name = this.id;
      const isDefault = name === "towns";
      options.burgs!.groups.push({ name, active: true, order: index + 1, isDefault, preview: "watabou-city" });
      if (!this.dataset.icon) this.dataset.icon = "#icon-circle";

      const size = Number(this.getAttribute("size") || 2) * 2;
      this.removeAttribute("size");
      this.setAttribute("font-size", String(size));
      this.setAttribute("stroke-width", "1");
    });

    if (options.burgs!.groups.filter(g => g.isDefault).length === 0) {
      options.burgs!.groups[0].isDefault = true;
    }

    anchors.selectAll<SVGGElement, unknown>("g").each(function () {
      const size = Number(this.getAttribute("size") || 1);
      this.removeAttribute("size");
      this.setAttribute("font-size", String(size));
    });

    burgLabels.selectAll<SVGGElement, unknown>("g").each(function () {
      if (!this.dataset.dy) this.dataset.dy = "-0.4";
    });

    const anchorSymbol = ensureEl("icon-anchor");
    if (anchorSymbol) {
      anchorSymbol.outerHTML = `<symbol id="icon-anchor" viewBox="0 0 30 30" width="1em" height="1em" overflow="visible"><path d="m 1.003,-9.873 c 0,-0.547 -0.453,-1 -1,-1 -0.547,0 -1,0.453 -1,1 0,0.547 0.453,1 1,1 0.547,0 1,-0.453 1,-1 z m 13,14.5 v 5.5 c 0,0.203 -0.125,0.391 -0.313,0.469 -0.063,0.016 -0.125,0.031 -0.187,0.031 -0.125,0 -0.25,-0.047 -0.359,-0.141 L 11.691,9.033 c -2.453,2.953 -6.859,4.844 -11.688,4.844 -4.829,0 -9.234,-1.891 -11.688,-4.844 l -1.453,1.453 c -0.094,0.094 -0.234,0.141 -0.359,0.141 -0.063,0 -0.125,-0.016 -0.187,-0.031 -0.187,-0.078 -0.313,-0.266 -0.313,-0.469 v -5.5 c 0,-0.281 0.219,-0.5 0.5,-0.5 h 5.5 c 0.203,0 0.391,0.125 0.469,0.313 0.078,0.188 0.031,0.391 -0.109,0.547 L -9.2,6.55 c 1.406,1.891 4.109,3.266 7.203,3.687 V 0.128 h -3 c -0.547,0 -1,-0.453 -1,-1 v -2 c 0,-0.547 0.453,-1 1,-1 h 3 v -2.547 c -1.188,-0.688 -2,-1.969 -2,-3.453 0,-2.203 1.797,-4 4,-4 2.203,0 4,1.797 4,4 0,1.484 -0.812,2.766 -2,3.453 v 2.547 h 3 c 0.547,0 1,0.453 1,1 v 2 c 0,0.547 -0.453,1 -1,1 h -3 V 10.237 C 5.097,9.815 7.8,8.44 9.206,6.55 L 7.643,4.987 C 7.502,4.831 7.456,4.628 7.534,4.44 7.612,4.252 7.8,4.127 8.003,4.127 h 5.5 c 0.281,0 0.5,0.219 0.5,0.5 z"/></symbol>`;
    }

    const validBurgs = (pack.burgs as (Burg & { group?: string; MFCG?: unknown })[]).filter(b => b.i && !b.removed);
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

    const legacyOptions = options as unknown as Record<string, unknown>;
    delete legacyOptions.showBurgPreview;
    delete legacyOptions.showMFCGMap;
    delete legacyOptions.villageMaxPopulation;
  }

  if (isOlderThan("1.111.0")) {
    if (!pack.ice.length) {
      pack.ice = [];
      let iceId = 0;

      const iceLayer = document.getElementById("ice");
      if (iceLayer) {
        iceLayer.querySelectorAll("polygon[type='iceShield']").forEach((polygon: Element) => {
          const svgPolygon = polygon as SVGPolygonElement;
          const points = [...svgPolygon.points].map(svgPoint => [svgPoint.x, svgPoint.y] as [number, number]);
          const transform = polygon.getAttribute("transform");
          const iceElement: IceGlacier = { i: iceId++, points, type: "glacier" };
          if (transform) iceElement.offset = parseTransform(transform) as [number, number];
          pack.ice.push(iceElement);
        });

        iceLayer.querySelectorAll("polygon:not([type])").forEach((polygon: Element) => {
          const svgPolygon = polygon as SVGPolygonElement;
          const cellId = +polygon.getAttribute("cell")!;
          const size = +polygon.getAttribute("size")!;
          if (polygon.getAttribute("cell") === null || !size) return;
          const points = [...svgPolygon.points].map(svgPoint => [svgPoint.x, svgPoint.y] as [number, number]);
          const transform = polygon.getAttribute("transform");
          const iceElement: IceIceberg = { i: iceId++, points, type: "iceberg", cellId, size };
          if (transform) iceElement.offset = parseTransform(transform) as [number, number];
          pack.ice.push(iceElement);
        });

        iceLayer.querySelectorAll("*").forEach(el => {
          el.remove();
        });
      } else {
        ice = viewbox.insert("g", "#coastline").attr("id", "ice");
        ice
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
    pack.zones.forEach(zone => {
      zone.cells = unique(zone.cells);
    });
  }
}

declare global {
  var rw: (weights: Record<string, number>) => string;
  var shiftCompass: () => void;
  var customPresetPrefix: string;
  var parseTransform: (string: string) => (string | number)[];
  var statesHalo: import("d3").Selection<SVGGElement, unknown, null, undefined>;
}
