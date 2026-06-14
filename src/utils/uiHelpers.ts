import * as d3 from "d3";
import { fitMapToScreen } from "../controllers/options";
import type { PackedGraphFeature } from "../modules/features";
import {
  convertTemperature,
  debounce,
  ensureEl,
  findCell,
  findGridCell,
  getComposedPath,
  getLatitude,
  getLongitude,
  link,
  rn,
  si
} from "./index";

// ─── Resize handler ───────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
  if (stored("mapWidth") && stored("mapHeight")) return;
  mapWidthInput.value = String(window.innerWidth);
  mapHeightInput.value = String(window.innerHeight);
  fitMapToScreen?.();
});

if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  window.onbeforeunload = () => "Are you sure you want to navigate away?";
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

const tooltip = document.getElementById("tooltip")!;
const onDataTipMove = debounce(showDataTip, 50);

document.getElementById("dialogs")!.addEventListener("mousemove", onDataTipMove);
document.getElementById("optionsContainer")!.addEventListener("mousemove", onDataTipMove);
document.getElementById("exitCustomization")!.addEventListener("mousemove", onDataTipMove);

const tipBackgroundMap: Record<string, string> = {
  info: "linear-gradient(0.1turn, #ffffff00, #5e5c5c80, #ffffff00)",
  success: "linear-gradient(0.1turn, #ffffff00, #127912cc, #ffffff00)",
  warn: "linear-gradient(0.1turn, #ffffff00, #be5d08cc, #ffffff00)",
  error: "linear-gradient(0.1turn, #ffffff00, #e11d1dcc, #ffffff00)"
};

function tip(message: string, main = false, type: "info" | "warn" | "error" | "success" = "info", time = 0): void {
  tooltip.innerHTML = message;
  tooltip.style.background = tipBackgroundMap[type];

  if (main) {
    tooltip.dataset.main = message;
    tooltip.dataset.color = tooltip.style.background;
  }
  if (time) setTimeout(clearMainTip, time);
}

function showMainTip(): void {
  tooltip.style.background = tooltip.dataset.color ?? "";
  tooltip.innerHTML = tooltip.dataset.main ?? "";
}

function clearMainTip(): void {
  tooltip.dataset.color = "";
  tooltip.dataset.main = "";
  tooltip.innerHTML = "";
}

function showDataTip(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target) return;

  let dataTip = target.dataset.tip;
  if (!dataTip && (target.parentNode as HTMLElement)?.dataset?.tip)
    dataTip = (target.parentNode as HTMLElement).dataset.tip;
  if (!dataTip) return;

  const shortcut = target.dataset.shortcut;
  if (shortcut && !MOBILE) dataTip += `. Shortcut: ${shortcut}`;

  tip(dataTip);
}

function showElementLockTip(event: MouseEvent): void {
  const locked = (event?.target as HTMLElement)?.classList?.contains("icon-lock");
  if (locked) {
    tip("Locked. Click to unlock the element and allow it to be changed by regeneration tools");
  } else {
    tip("Unlocked. Click to lock the element and prevent changes to it by regeneration tools");
  }
}

// ─── Mouse move handler ───────────────────────────────────────────────────────

const onMouseMove = debounce(handleMouseMove as (event: MouseEvent) => void, 100);

function handleMouseMove(this: Element, event: MouseEvent): void {
  const point = d3.pointer(event, this) as [number, number];
  const i = findCell(point[0], point[1]);
  if (i === undefined) return;

  showNotes(event);
  const gridCell = findGridCell(point[0], point[1], grid);
  if (tooltip.dataset.main) showMainTip();
  else showMapTooltip(point, event, i, gridCell);
  if ((ensureEl("cellInfo") as HTMLElement)?.offsetParent) updateCellInfo(point, i, gridCell);
}

let currentNoteId: string | null = null;

function showNotes(e: MouseEvent): void {
  if (window.notesEditor?.offsetParent) return;
  const target = e.target as HTMLElement;
  let id = target.id || (target.parentNode as HTMLElement)?.id || (target.parentNode?.parentNode as HTMLElement)?.id;
  if ((target.parentNode?.parentNode as HTMLElement)?.id === "burgLabels") id = `burg${target.dataset.id}`;
  else if ((target.parentNode?.parentNode as HTMLElement)?.id === "burgIcons") id = `burg${target.dataset.id}`;

  const note = notes.find(note => note.id === id);
  if (note !== undefined && note.legend !== "") {
    if (currentNoteId === id) return;
    currentNoteId = id;

    document.getElementById("notes")!.style.display = "block";
    document.getElementById("notesHeader")!.innerHTML = note.name;
    document.getElementById("notesBody")!.innerHTML = note.legend;
  } else if (!options.pinNotes && !window.markerEditor?.offsetParent && !(e as KeyboardEvent & MouseEvent).shiftKey) {
    document.getElementById("notes")!.style.display = "none";
    document.getElementById("notesHeader")!.innerHTML = "";
    document.getElementById("notesBody")!.innerHTML = "";
    currentNoteId = null;
  }
}

function showMapTooltip(point: [number, number], e: MouseEvent, i: number, g: number): void {
  tip("");
  if (!pack?.cells) return;
  const path = e.composedPath ? e.composedPath() : getComposedPath((e.target as Node | null) ?? window);
  if (!path[path.length - 8]) return;
  const group = (path[path.length - 7] as HTMLElement).id;
  const subgroup = (path[path.length - 8] as HTMLElement).id;
  const land = pack.cells.h[i] >= 20;

  if (group === "armies") {
    tip(`${(e.target as HTMLElement).parentElement!.dataset.name}. Click to edit`);
    return;
  }

  if (group === "emblems" && (e.target as SVGElement).tagName === "use") {
    const parent = (e.target as SVGElement).parentElement!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [g2, type]: [EmblemEl[], string] =
      parent.id === "burgEmblems"
        ? [pack.burgs as EmblemEl[], "burg"]
        : parent.id === "provinceEmblems"
          ? [pack.provinces as EmblemEl[], "province"]
          : [pack.states as EmblemEl[], "state"];
    const idx = +(e.target as SVGElement).dataset.i!;
    if (e.shiftKey) highlightEmblemElement(type, g2[idx]);

    d3.select(e.target as Element).raise();
    d3.select(parent).raise();

    const name = g2[idx].fullName || g2[idx].name;
    tip(`${name} ${type} emblem. Click to edit. Hold Shift to show associated area or place`);
    return;
  }

  if (group === "rivers") {
    const river = +(e.target as HTMLElement).id.slice(5);
    const r = pack.rivers.find(r => r.i === river);
    const name = r ? `${r.name} ${r.type}` : "";
    tip(`${name}. Click to edit`);
    if (window.riversOverview?.offsetParent) highlightEditorLine(window.riversOverview, river, 5000);
    return;
  }

  if (group === "routes") {
    const routeId = +(e.target as HTMLElement).id.slice(5);
    const route = pack.routes.find(route => route.i === routeId);
    if (route) {
      if (route.name) {
        tip(`${route.name}. Click to edit the Route`);
        return;
      }
      tip("Click to edit the Route");
      return;
    }
  }

  if (group === "terrain") {
    tip("Click to edit the Relief Icon");
    return;
  }

  if (subgroup === "burgLabels" || subgroup === "burgIcons") {
    const burgId = +(path[path.length - 10] as HTMLElement).dataset.id!;
    if (burgId) {
      const burg = pack.burgs[burgId];
      const population = si((burg.population ?? 0) * populationRate * urbanization);
      tip(`${burg.name} ${burg.group}. Population: ${population}. Click to edit`);
      if (window.burgsOverview?.offsetParent) highlightEditorLine(window.burgsOverview, burgId, 5000);
      return;
    }
  }

  if (group === "labels") {
    tip("Click to edit the Label");
    return;
  }
  if (group === "markers") {
    tip("Click to edit the Marker. Hold Shift to not close the assosiated note");
    return;
  }

  if (group === "ruler") {
    const tag = (e.target as SVGElement).tagName;
    const className = (e.target as SVGElement).getAttribute("class");
    if (tag === "circle" && className === "edge") {
      tip("Drag to adjust. Hold Ctrl and drag to add a point. Click to remove the point");
      return;
    }
    if (tag === "circle" && className === "control") {
      tip("Drag to adjust. Hold Shift and drag to keep axial direction. Click to remove the point");
      return;
    }
    if (tag === "circle") {
      tip("Drag to adjust the measurer");
      return;
    }
    if (tag === "polyline") {
      tip("Click on drag to add a control point");
      return;
    }
    if (tag === "path") {
      tip("Drag to move the measurer");
      return;
    }
    if (tag === "text") {
      tip("Drag to move, click to remove the measurer");
      return;
    }
  }

  if (subgroup === "burgIcons") {
    tip("Click to edit the Burg");
    return;
  }
  if (subgroup === "burgLabels") {
    tip("Click to edit the Burg");
    return;
  }

  if (group === "lakes" && !land) {
    const lakeId = +(e.target as HTMLElement).dataset.f!;
    const name = pack.features[lakeId]?.name;
    const fullName = subgroup === "freshwater" ? name : `${name} ${subgroup}`;
    tip(`${fullName} lake. Click to edit`);
    return;
  }
  if (group === "coastline") {
    tip("Click to edit the coastline");
    return;
  }

  if (group === "zones") {
    const zoneEl = path[path.length - 8] as HTMLElement;
    const zoneId = +zoneEl.dataset.id!;
    const zone = pack.zones.find(zone => zone.i === zoneId);
    if (zone) tip(zone.name);
    if (window.zonesEditor?.offsetParent) highlightEditorLine(window.zonesEditor, zoneId, 5000);
    return;
  }

  if (group === "ice") {
    tip("Click to edit the Ice");
    return;
  }

  if (layerIsOn("togglePrecipitation") && land) tip(`Annual Precipitation: ${getFriendlyPrecipitation(i)}`);
  else if (layerIsOn("togglePopulation")) tip(getPopulationTip(i));
  else if (layerIsOn("toggleTemperature")) tip(`Temperature: ${convertTemperature(grid.cells.temp[g])}`);
  else if (layerIsOn("toggleBiomes") && pack.cells.biome[i]) {
    const biome = pack.cells.biome[i];
    tip(`Biome: ${biomesData.name[biome]}`);
    if (window.biomesEditor?.offsetParent) highlightEditorLine(window.biomesEditor!, biome);
  } else if (layerIsOn("toggleReligions") && pack.cells.religion[i]) {
    const religion = pack.cells.religion[i];
    const r = pack.religions[religion];
    const type = r.type === "Cult" || r.type === "Heresy" ? r.type : `${r.type} religion`;
    tip(`${type}: ${r.name}`);
    if (document.getElementById("religionsEditor")?.offsetParent)
      highlightEditorLine(window.religionsEditor!, religion);
  } else if (pack.cells.state[i] && (layerIsOn("toggleProvinces") || layerIsOn("toggleStates"))) {
    const state = pack.cells.state[i];
    const stateName = pack.states[state].fullName;
    const province = pack.cells.province[i];
    const prov = province ? `${pack.provinces[province].fullName}, ` : "";
    tip(prov + stateName);
    if (document.getElementById("statesEditor")?.offsetParent) highlightEditorLine(window.statesEditor!, state);
    if (document.getElementById("diplomacyEditor")?.offsetParent) highlightEditorLine(window.diplomacyEditor!, state);
    if (document.getElementById("militaryOverview")?.offsetParent) highlightEditorLine(window.militaryOverview!, state);
    if (document.getElementById("provincesEditor")?.offsetParent)
      highlightEditorLine(window.provincesEditor!, province);
    if (document.getElementById("mergeStatesForm")?.offsetParent)
      highlightEditorLine(ensureEl("mergeStatesForm") as HTMLElement, state);
  } else if (layerIsOn("toggleCultures") && pack.cells.culture[i]) {
    const culture = pack.cells.culture[i];
    tip(`Culture: ${pack.cultures[culture].name}`);
    if (document.getElementById("culturesEditor")?.offsetParent) highlightEditorLine(window.culturesEditor!, culture);
  } else if (layerIsOn("toggleHeight")) tip(`Height: ${getFriendlyHeight(point)}`);
}

function highlightEditorLine(editor: HTMLElement, id: number, timeout = 10000): void {
  for (const el of editor.getElementsByClassName("hovered")) el.classList.remove("hovered");
  const hovered = Array.from(editor.querySelectorAll("div")).find(el => el.dataset.id === String(id));
  if (hovered) hovered.classList.add("hovered");
  if (timeout)
    setTimeout(() => {
      hovered?.classList.remove("hovered");
    }, timeout);
}

// ─── Cell info panel ──────────────────────────────────────────────────────────

function updateCellInfo(point: [number, number], i: number, g: number): void {
  const cells = pack.cells;
  infoX.innerHTML = String(rn(point[0]));
  const x = infoX.innerHTML;
  infoY.innerHTML = String(rn(point[1]));
  const y = infoY.innerHTML;
  const f = cells.f[i];
  infoLat.innerHTML = toDMS(getLatitude(+y, 4), "lat");
  infoLon.innerHTML = toDMS(getLongitude(+x, 4), "lon");
  infoGeozone.innerHTML = getGeozone(getLatitude(+y, 4));

  infoCell.innerHTML = String(i);
  infoArea.innerHTML = cells.area[i] ? `${si(getArea(cells.area[i]))} ${getAreaUnit()}` : "n/a";
  infoElevation.innerHTML = getElevation(pack.features[f], pack.cells.h[i]);
  infoDepth.innerHTML = getDepth(pack.features[f], point);
  infoTemp.innerHTML = convertTemperature(grid.cells.temp[g]);
  infoPrec.innerHTML = cells.h[i] >= 20 ? getFriendlyPrecipitation(i) : "n/a";
  infoRiver.innerHTML = cells.h[i] >= 20 && cells.r[i] ? getRiverInfo(cells.r[i]) : "no";
  infoState.innerHTML =
    cells.h[i] >= 20
      ? cells.state[i]
        ? `${pack.states[cells.state[i]].fullName} (${cells.state[i]})`
        : "neutral lands (0)"
      : "no";
  infoProvince.innerHTML = cells.province[i]
    ? `${pack.provinces[cells.province[i]].fullName} (${cells.province[i]})`
    : "no";
  infoCulture.innerHTML = cells.culture[i] ? `${pack.cultures[cells.culture[i]].name} (${cells.culture[i]})` : "no";
  infoReligion.innerHTML = cells.religion[i]
    ? `${pack.religions[cells.religion[i]].name} (${cells.religion[i]})`
    : "no";
  infoPopulation.innerHTML = getFriendlyPopulation(i);
  infoBurg.innerHTML = cells.burg[i] ? `${pack.burgs[cells.burg[i]].name} (${cells.burg[i]})` : "no";
  infoFeature.innerHTML = f ? `${pack.features[f].group} (${f})` : "n/a";
  infoBiome.innerHTML = biomesData.name[cells.biome[i]];
}

function getGeozone(latitude: number): string {
  if (latitude > 66.5) return "Arctic";
  if (latitude > 35) return "Temperate North";
  if (latitude > 23.5) return "Subtropical North";
  if (latitude > 1) return "Tropical North";
  if (latitude > -1) return "Equatorial";
  if (latitude > -23.5) return "Tropical South";
  if (latitude > -35) return "Subtropical South";
  if (latitude > -66.5) return "Temperate South";
  return "Antarctic";
}

function toDMS(coord: number, c: "lat" | "lon"): string {
  const degrees = Math.floor(Math.abs(coord));
  const minutesNotTruncated = (Math.abs(coord) - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.floor((minutesNotTruncated - minutes) * 60);
  const cardinal = c === "lat" ? (coord >= 0 ? "N" : "S") : coord >= 0 ? "E" : "W";
  return `${degrees}°${minutes}′${seconds}″${cardinal}`;
}

function getElevation(f: PackedGraphFeature, h: number): string {
  if (f.land) return `${getHeight(h)} (${h})`;
  if (f.border) return `0 ${heightUnit.value}`;
  if (f.type === "lake") return `${getHeight(f.height)} (${f.height})`;
  return "";
}

function getDepth(f: PackedGraphFeature, p: [number, number]): string {
  if (f.land) return `0 ${heightUnit.value}`;

  const gridH = grid.cells.h[findGridCell(p[0], p[1], grid)];
  if (f.type === "lake") {
    const depth = gridH === 19 ? f.height / 2 : gridH;
    return getHeight(depth, "abs");
  }

  return getHeight(gridH, "abs");
}

function getFriendlyHeight([x, y]: [number, number]): string {
  const packH = pack.cells.h[findCell(x, y)];
  const gridH = grid.cells.h[findGridCell(x, y, grid)];
  const h = packH < 20 ? gridH : packH;
  return getHeight(h);
}

function getHeight(h: number, abs?: string): string {
  const unit = heightUnit.value;
  let unitRatio = 3.281;
  if (unit === "m") unitRatio = 1;
  else if (unit === "f") unitRatio = 0.5468;

  let height = -990;
  if (h >= 20) height = (h - 18) ** +heightExponentInput.value;
  else if (h < 20 && h > 0) height = ((h - 20) / h) * 50;

  if (abs) height = Math.abs(height);
  return `${rn(height * unitRatio)} ${unit}`;
}

function getPrecipitation(prec: number): string {
  return `${prec * 100} mm`;
}

function getFriendlyPrecipitation(i: number): string {
  const prec = grid.cells.prec[pack.cells.g[i]];
  return getPrecipitation(prec);
}

function getRiverInfo(id: number): string {
  const r = pack.rivers.find(r => r.i === id);
  return r ? `${r.name} ${r.type} (${id})` : "n/a";
}

function getCellPopulation(i: number): [number, number] {
  const rural = pack.cells.pop[i] * populationRate;
  const urban = pack.cells.burg[i]
    ? (pack.burgs[pack.cells.burg[i]].population ?? 0) * populationRate * urbanization
    : 0;
  return [rural, urban];
}

function getFriendlyPopulation(i: number): string {
  const [rural, urban] = getCellPopulation(i);
  return `${si(rural + urban)} (${si(rural)} rural, urban ${si(urban)})`;
}

function getPopulationTip(i: number): string {
  const [rural, urban] = getCellPopulation(i);
  return `Cell population: ${si(rural + urban)}; Rural: ${si(rural)}; Urban: ${si(urban)}`;
}

interface EmblemEl {
  i: number;
  x?: number;
  y?: number;
  pole?: [number, number];
  center?: number;
  fullName?: string;
  name?: string;
}

export function highlightEmblemElement(type: string, el: EmblemEl): void {
  const id = el.i;
  const cells = pack.cells;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const animation = d3.transition().duration(1000).ease(d3.easeSinIn);

  if (type === "burg") {
    const { x = 0, y = 0 } = el;
    debug
      .append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", 0)
      .attr("fill", "none")
      .attr("stroke", "#d0240f")
      .attr("stroke-width", 1)
      .attr("opacity", 1)
      .transition(animation)
      .attr("r", 20)
      .attr("opacity", 0.1)
      .attr("stroke-width", 0)
      .remove();
    return;
  }

  const [x, y] = el.pole || pack.cells.p[el.center!];
  const obj = type === "state" ? cells.state : cells.province;
  const borderCells = cells.i.filter(
    (cellId: number) => obj[cellId] === id && cells.c[cellId].some((n: number) => obj[n] !== id)
  );
  const data = Array.from(borderCells)
    .filter((_c, idx) => !(idx % 2))
    .map((cellId: number) => cells.p[cellId])
    .map((pt: [number, number]) => [pt[0], pt[1], Math.hypot(pt[0] - x, pt[1] - y)]);

  debug
    .selectAll("line")
    .data(data)
    .enter()
    .append("line")
    .attr("x1", x)
    .attr("y1", y)
    .attr("x2", (d: number[]) => d[0])
    .attr("y2", (d: number[]) => d[1])
    .attr("stroke", "#d0240f")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.2)
    .attr("stroke-dashoffset", (d: number[]) => d[2])
    .attr("stroke-dasharray", (d: number[]) => d[2])
    .transition(animation)
    .attr("stroke-dashoffset", 0)
    .attr("opacity", 1)
    .transition()
    .delay(1000)
    .attr("stroke-dashoffset", (d: number[]) => d[2])
    .attr("opacity", 0)
    .remove();
}

// ─── Lock / unlock options ────────────────────────────────────────────────────

document.querySelectorAll("[data-locked]").forEach(e => {
  const el = e as HTMLElement;
  el.addEventListener("mouseover", function (evt) {
    evt.stopPropagation();
    if ((this as HTMLElement).className === "icon-lock")
      tip("Click to unlock the option and allow it to be randomized on new map generation");
    else tip("Click to lock the option and always use the current value on new map generation");
  });

  el.addEventListener("click", function () {
    const self = this as HTMLElement;
    const ids = self.dataset.ids ? self.dataset.ids.split(",") : [self.id.slice(5)];
    const fn = self.className === "icon-lock" ? unlock : lock;
    ids.forEach(fn);
  });
});

function lock(id: string): void {
  const input = document.querySelector<HTMLInputElement>(`[data-stored="${id}"]`);
  if (input) store(id, input.value);
  const el = document.getElementById(`lock_${id}`);
  if (!el) return;
  el.dataset.locked = "1";
  el.className = "icon-lock";
}

function unlock(id: string): void {
  localStorage.removeItem(id);
  const el = document.getElementById(`lock_${id}`);
  if (!el) return;
  el.dataset.locked = "0";
  el.className = "icon-lock-open";
}

function locked(id: string): boolean {
  const lockEl = document.getElementById(`lock_${id}`) as HTMLElement;
  return lockEl.dataset.locked === "1";
}

function stored(key: string): string | null {
  return localStorage.getItem(key) || null;
}

function store(key: string, value: string): void {
  localStorage.setItem(key, value);
}

// ─── Speaker ─────────────────────────────────────────────────────────────────

Array.from(document.getElementsByClassName("speaker")).forEach(el => {
  const input = (el as HTMLElement).previousElementSibling as HTMLInputElement;
  el.addEventListener("click", () => speak(input.value));
});

function speak(text: string): void {
  const speaker = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  if (voices.length) {
    const voiceId = +(document.getElementById("speakerVoice") as HTMLSelectElement).value;
    speaker.voice = voices[voiceId];
  }
  speechSynthesis.speak(speaker);
}

// ─── Dropdown utility ─────────────────────────────────────────────────────────

function applyOption($select: HTMLSelectElement | HTMLInputElement, value: string, name = value): void {
  const select = $select as HTMLSelectElement;
  const isExisting = Array.from(select.options ?? []).some(o => o.value === value);
  if (!isExisting) select.options?.add(new Option(name, value));
  select.value = value;
}

// ─── Info dialog ──────────────────────────────────────────────────────────────

function showInfo(): void {
  const Discord = link("https://discordapp.com/invite/X7E84HU", "Discord");
  const Reddit = link("https://www.reddit.com/r/FantasyMapGenerator", "Reddit");
  const Patreon = link("https://www.patreon.com/azgaar", "Patreon");
  const Armoria = link("https://azgaar.github.io/Armoria", "Armoria");
  const Deorum = link("https://deorum.vercel.app", "Deorum");

  const QuickStart = link(
    "https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Quick-Start-Tutorial",
    "Quick start tutorial"
  );
  const QAA = link("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Q&A", "Q&A page");
  const VideoTutorial = link("https://youtube.com/playlist?list=PLtgiuDC8iVR2gIG8zMTRn7T_L0arl9h1C", "Video tutorial");

  alertMessage.innerHTML = /* html */ `<b>Fantasy Map Generator</b> (FMG) is a free open-source application. It means that you own all created maps and can use them as
    you wish.

    <p>
      The development is community-backed, you can donate on ${Patreon}. You can also help creating overviews, tutorials and spreding the word about the
      Generator.
    </p>

    <p>
      The best way to get help is to contact the community on ${Discord} and ${Reddit}. Before asking questions, please check out the ${QuickStart}, the ${QAA},
      and ${VideoTutorial}.
    </p>

    <ul style="columns:2">
      <li>${link("https://github.com/Azgaar/Fantasy-Map-Generator", "GitHub repository")}</li>
      <li>${link("https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE", "License")}</li>
      <li>${link("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog", "Changelog")}</li>
      <li>${link("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Hotkeys", "Hotkeys")}</li>
      <li>${link("https://trello.com/b/7x832DG4/fantasy-map-generator", "Devboard")}</li>
      <li><a href="mailto:azgaar.fmg@yandex.by" target="_blank">Contact Azgaar</a></li>
    </ul>

    <p>Check out our other projects:
      <ul>
        <li>${Armoria}: a tool for creating heraldic coats of arms</li>
        <li>${Deorum}: a vast gallery of customizable fantasy characters</li>
      </ul>
    </p>

    <p>Chinese localization: <a href="https://www.8desk.top" target="_blank">8desk.top</a></p>`;

  $("#alert").dialog({
    resizable: false,
    title: document.title,
    width: "28em",
    buttons: {
      OK: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.tip = tip;
window.clearMainTip = clearMainTip;
window.showMainTip = showMainTip;
window.showElementLockTip = showElementLockTip;
window.highlightEditorLine = highlightEditorLine;
window.onMouseMove = onMouseMove;
window.lock = lock;
window.unlock = unlock;
window.locked = locked;
window.stored = stored;
window.store = store;
window.speak = speak;
window.applyOption = applyOption;
window.showInfo = showInfo;
window.getCellPopulation = getCellPopulation;
window.getFriendlyHeight = getFriendlyHeight;
window.getFriendlyPrecipitation = getFriendlyPrecipitation;
window.getPopulationTip = getPopulationTip;
window.getHeight = getHeight;
window.toDMS = toDMS;
window.getRiverInfo = getRiverInfo;

// ─── Table sorting ────────────────────────────────────────────────────────────

export function applySortingByHeader(headerContainer: string): void {
  document
    .getElementById(headerContainer)!
    .querySelectorAll<HTMLElement>(".sortable")
    .forEach(el => {
      el.addEventListener("click", () => sortLines(el));
    });
}

export function sortLines(headerElement: HTMLElement): void {
  const type = headerElement.classList.contains("alphabetically") ? "name" : "number";
  let order = headerElement.className.includes("-down") ? "-up" : "-down";
  if (!headerElement.className.includes("icon-sort") && type === "name") order = "-up";

  const headers = headerElement.parentNode as Element;
  headers.querySelectorAll<HTMLElement>("div.sortable").forEach(e => {
    e.classList.forEach(c => {
      if (c.includes("icon-sort")) e.classList.remove(c);
    });
  });
  headerElement.classList.add(`icon-sort-${type}${order}`);
  applySorting(headers as HTMLElement);
}

export function applySorting(headers: HTMLElement): void {
  const header = headers.querySelector<HTMLElement>("div[class*='icon-sort']");
  if (!header) return;
  const sortby = header.dataset.sortby!;
  const name = header.classList.contains("alphabetically");
  const desc = header.className.includes("-down") ? -1 : 1;
  const list = headers.nextElementSibling as Element;
  const lines = Array.from(list.children) as HTMLElement[];

  lines
    .sort((a, b) => {
      const an = name ? a.dataset[sortby] : +a.dataset[sortby]!;
      const bn = name ? b.dataset[sortby] : +b.dataset[sortby]!;
      return (
        ((an as string | number) > (bn as string | number)
          ? 1
          : (an as string | number) < (bn as string | number)
            ? -1
            : 0) * desc
      );
    })
    .forEach(line => {
      list.appendChild(line);
    });
}

window.applySortingByHeader = applySortingByHeader;
window.applySorting = applySorting;
window.sortLines = sortLines;
window.highlightEmblemElement = highlightEmblemElement;

// ─── Legacy globals (from non-migrated JS files) ──────────────────────────────

declare const MOBILE: boolean;
declare const getArea: (area: number) => number;
declare const getAreaUnit: () => string;

// Info DOM elements
declare const infoX: HTMLElement;
declare const infoY: HTMLElement;
declare const infoLat: HTMLElement;
declare const infoLon: HTMLElement;
declare const infoGeozone: HTMLElement;
declare const infoCell: HTMLElement;
declare const infoArea: HTMLElement;
declare const infoElevation: HTMLElement;
declare const infoDepth: HTMLElement;
declare const infoTemp: HTMLElement;
declare const infoPrec: HTMLElement;
declare const infoRiver: HTMLElement;
declare const infoState: HTMLElement;
declare const infoProvince: HTMLElement;
declare const infoCulture: HTMLElement;
declare const infoReligion: HTMLElement;
declare const infoPopulation: HTMLElement;
declare const infoBurg: HTMLElement;
declare const infoFeature: HTMLElement;
declare const infoBiome: HTMLElement;
