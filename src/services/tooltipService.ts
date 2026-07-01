import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { viewLayerService as view } from "../services/viewLayerService";
import { setHoverNotesState } from "../store/hoverNotesState";
import { useToastStore } from "../store/toastStore";
import type { EmblemEl } from "../types/models";
import { getVisibleDialogElement, isDialogVisible } from "../utils/domUtils";
import { getComposedPath, layerIsOn } from "../utils/nodeUtils";
import { convertTemperature, si } from "../utils/unitUtils";
import { getFriendlyHeight, getFriendlyPrecipitation, getPopulationTip } from "./cellInfoService";

import { tooltipExtensions } from "./tooltipExtensions";

export { tooltipExtensions };
export function tip(
  message: string,
  main = false,
  type: "info" | "warn" | "error" | "success" = "info",
  time = 0
): void {
  const store = useToastStore.getState();

  if (main) {
    store.setMainToast(message, tipBackgroundMap[type]);
    if (time) setTimeout(clearMainTip, time);
  } else {
    store.addToast(message, type, false, time);
  }
}
export function showMainTip(): void {
  const store = useToastStore.getState();
  const main = store.getMainToast();
  if (main) {
    const tooltip = document.getElementById("tooltip");
    if (tooltip) {
      tooltip.style.background = main.color;
      tooltip.innerHTML = main.message;
    }
  }
}
export function clearMainTip(): void {
  const store = useToastStore.getState();
  store.clearMainToast();
  const tooltip = document.getElementById("tooltip");
  if (tooltip) {
    tooltip.innerHTML = "";
    tooltip.style.background = "";
  }
}
export function showDataTip(event: MouseEvent): void {
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
export function showElementLockTip(event: MouseEvent): void {
  const locked = (event?.target as HTMLElement)?.classList?.contains("icon-lock");
  if (locked) {
    tip("Locked. Click to unlock the element and allow it to be changed by regeneration tools");
  } else {
    tip("Unlocked. Click to lock the element and prevent changes to it by regeneration tools");
  }
}
export function showNotes(e: MouseEvent): void {
  if (isDialogVisible("notesEditor")) return;
  const target = e.target as HTMLElement;
  let id = target.id || (target.parentNode as HTMLElement)?.id || (target.parentNode?.parentNode as HTMLElement)?.id;
  if ((target.parentNode?.parentNode as HTMLElement)?.id === "burgLabels") id = `burg${target.dataset.id}`;
  else if ((target.parentNode?.parentNode as HTMLElement)?.id === "burgIcons") id = `burg${target.dataset.id}`;

  const note = worldContext.notes.find(note => note.id === id);
  if (note !== undefined && note.legend !== "") {
    if (currentNoteId === id) return;
    currentNoteId = id;

    setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
  } else if (
    !worldContext.options.pinNotes &&
    !isDialogVisible("markerEditor") &&
    !(e as KeyboardEvent & MouseEvent).shiftKey
  ) {
    setHoverNotesState({ isVisible: false, name: "", legend: "" });
    currentNoteId = null;
  }
}
export function showMapTooltip(point: [number, number], e: MouseEvent, i: number, g: number): void {
  tip("");
  if (!worldContext.pack?.cells) return;
  const path = e.composedPath ? e.composedPath() : getComposedPath((e.target as Node | null) ?? window);
  if (!path[path.length - 8]) return;
  const group = (path[path.length - 7] as HTMLElement).id;
  const subgroup = (path[path.length - 8] as HTMLElement).id;
  const land = worldContext.pack.cells.h[i] >= 20;

  if (group === "armies") {
    tip(`${(e.target as HTMLElement).parentElement!.dataset.name}. Click to edit`);
    return;
  }

  if (group === "emblems" && (e.target as SVGElement).tagName === "use") {
    const parent = (e.target as SVGElement).parentElement!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [g2, type]: [EmblemEl[], string] =
      parent.id === "burgEmblems"
        ? [worldContext.pack.burgs as EmblemEl[], "burg"]
        : parent.id === "provinceEmblems"
          ? [worldContext.pack.provinces as EmblemEl[], "province"]
          : [worldContext.pack.states as EmblemEl[], "state"];
    const idx = +(e.target as SVGElement).dataset.i!;
    if (e.shiftKey) highlightEmblemElement(type, g2[idx]);

    d3.select(e.target as Element).raise();
    d3.select(parent).raise();

    const entity = g2[idx];
    if (!entity) return;
    const name = entity.fullName || entity.name;
    tip(`${name} ${type} emblem. Click to edit. Hold Shift to show associated area or place`);
    return;
  }

  if (group === "rivers") {
    const river = +(e.target as HTMLElement).id.slice(5);
    const r = worldContext.pack.rivers.find(r => r.i === river);
    const name = r ? `${r.name} ${r.type}` : "";
    tip(`${name}. Click to edit`);
    const riversOverviewEl = getVisibleDialogElement("riversOverview");
    if (riversOverviewEl) highlightEditorLine(riversOverviewEl, river, 5000);
    return;
  }

  if (group === "routes") {
    const routeId = +(e.target as HTMLElement).id.slice(5);
    const route = worldContext.pack.routes.find(route => route.i === routeId);
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
      const burg = worldContext.pack.burgs[burgId];
      const population = si((burg.population ?? 0) * worldContext.populationRate * worldContext.urbanization);
      tip(`${burg.name} ${burg.group}. Population: ${population}. Click to edit`);
      const burgsOverviewEl = getVisibleDialogElement("burgsOverview");
      if (burgsOverviewEl) highlightEditorLine(burgsOverviewEl, burgId, 5000);
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

  if (tooltipExtensions.showMapTooltip?.(point, e, i, g, group, subgroup)) return;

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
    const name = worldContext.pack.features[lakeId]?.name;
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
    const zone = worldContext.pack.zones.find(zone => zone.i === zoneId);
    if (zone) tip(zone.name);
    const zonesEditorEl = getVisibleDialogElement("zonesEditor");
    if (zonesEditorEl) highlightEditorLine(zonesEditorEl, zoneId, 5000);
    return;
  }

  if (group === "ice") {
    tip("Click to edit the Ice");
    return;
  }

  if (layerIsOn("togglePrecipitation") && land) tip(`Annual Precipitation: ${getFriendlyPrecipitation(i)}`);
  else if (layerIsOn("togglePopulation")) tip(getPopulationTip(i));
  else if (layerIsOn("toggleTemperature")) tip(`Temperature: ${convertTemperature(worldContext.grid.cells.temp[g])}`);
  else if (layerIsOn("toggleBiomes") && worldContext.pack.cells.biome[i]) {
    const biome = worldContext.pack.cells.biome[i];
    tip(`Biome: ${worldContext.biomesData.name[biome]}`);
    const biomesEditorEl = getVisibleDialogElement("biomesEditor");
    if (biomesEditorEl) highlightEditorLine(biomesEditorEl, biome);
  } else if (layerIsOn("toggleReligions") && worldContext.pack.cells.religion[i]) {
    const religion = worldContext.pack.cells.religion[i];
    const r = worldContext.pack.religions[religion];
    const type = r.type === "Cult" || r.type === "Heresy" ? r.type : `${r.type} religion`;
    tip(`${type}: ${r.name}`);
    const religionsEditorEl = getVisibleDialogElement("religionsEditor");
    if (religionsEditorEl) highlightEditorLine(religionsEditorEl, religion);
  } else if (worldContext.pack.cells.state[i] && (layerIsOn("toggleProvinces") || layerIsOn("toggleStates"))) {
    const state = worldContext.pack.cells.state[i];
    const stateName = worldContext.pack.states[state].fullName;
    const province = worldContext.pack.cells.province[i];
    const prov = province ? `${worldContext.pack.provinces[province].fullName}, ` : "";
    tip(prov + stateName);
    const statesEditorEl = getVisibleDialogElement("statesEditor");
    if (statesEditorEl) highlightEditorLine(statesEditorEl, state);
    const diplomacyEditorEl = getVisibleDialogElement("diplomacyEditor");
    if (diplomacyEditorEl) highlightEditorLine(diplomacyEditorEl, state);
    const militaryOverviewEl = getVisibleDialogElement("militaryOverview");
    if (militaryOverviewEl) highlightEditorLine(militaryOverviewEl, state);
    const provincesEditorEl = getVisibleDialogElement("provincesEditor");
    if (provincesEditorEl) highlightEditorLine(provincesEditorEl, province);
    const mergeStatesForm = getVisibleDialogElement("mergeStatesForm");
    if (mergeStatesForm) highlightEditorLine(mergeStatesForm, state);
  } else if (layerIsOn("toggleCultures") && worldContext.pack.cells.culture[i]) {
    const culture = worldContext.pack.cells.culture[i];
    tip(`Culture: ${worldContext.pack.cultures[culture].name}`);
    const culturesEditorEl = getVisibleDialogElement("culturesEditor");
    if (culturesEditorEl) highlightEditorLine(culturesEditorEl, culture);
  } else if (layerIsOn("toggleHeight")) tip(`Height: ${getFriendlyHeight(point)}`);
}
export function highlightEditorLine(editor: HTMLElement, id: number, timeout = 10000): void {
  for (const el of editor.getElementsByClassName("hovered")) el.classList.remove("hovered");
  const hovered = Array.from(editor.querySelectorAll("div")).find(el => el.dataset.id === String(id));
  if (hovered) hovered.classList.add("hovered");
  if (timeout)
    setTimeout(() => {
      hovered?.classList.remove("hovered");
    }, timeout);
}
export function highlightEmblemElement(type: string, el: EmblemEl): void {
  const id = el.i;
  const cells = worldContext.pack.cells;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const animation = d3.transition().duration(1000).ease(d3.easeSinIn);

  if (type === "burg") {
    const { x = 0, y = 0 } = el;
    view.debug
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

  const [x, y] = el.pole || worldContext.pack.cells.p[el.center!];
  const obj = type === "state" ? cells.state : cells.province;
  const borderCells = cells.i.filter(
    (cellId: number) => obj[cellId] === id && cells.c[cellId].some((n: number) => obj[n] !== id)
  );
  const data = Array.from(borderCells)
    .filter((_c, idx) => !(idx % 2))
    .map((cellId: number) => cells.p[cellId])
    .map((pt: [number, number]) => [pt[0], pt[1], Math.hypot(pt[0] - x, pt[1] - y)]);

  view.debug
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

const tipBackgroundMap: Record<string, string> = {
  info: "linear-gradient(0.1turn, #ffffff00, #5e5c5c80, #ffffff00)",
  success: "linear-gradient(0.1turn, #ffffff00, #127912cc, #ffffff00)",
  warn: "linear-gradient(0.1turn, #ffffff00, #be5d08cc, #ffffff00)",
  error: "linear-gradient(0.1turn, #ffffff00, #e11d1dcc, #ffffff00)"
};
// @ts-expect-error userAgentData is not strictly in standard TS DOM
const MOBILE: boolean = window.innerWidth < 600 || navigator.userAgentData?.mobile;
let currentNoteId: string | null = null;
