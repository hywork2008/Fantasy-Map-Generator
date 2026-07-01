import { pointer } from "d3";

import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";

import { drawBurgIcon, drawBurgLabel, drawRoute } from "../renderers";
import { getHeight } from "../services/cellInfoService";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { useBurgsOverviewState } from "../store/burgsOverviewState";
import { burgsRenamingDialogStore } from "../store/burgsRenamingDialogState";

import type { BurgsBubbleChartConfig } from "../ui/dialogs/BurgsBubbleChartDialog";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { convertTemperature, findCell, getLatitude, getLongitude, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { getTemperatureLikeness } from "./burg-editor";
import { interactionManager } from "./interactionManager";
import { toggleBurgIcons, toggleLabels } from "./layers";

export function overviewBurgs(settings: { stateId?: number | null; cultureId?: number | null } = {}): void {
  if (view.customization) return;
  closeDialogs("#burgsOverview, .stable");
  if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  useBurgsOverviewState.getState().open(settings.stateId ?? null, settings.cultureId ?? null);
  useBurgsOverviewState.getState().refresh();
  openDialog("burgsOverview");
}

export function startAddBurgMode(onDone: () => void): void {
  view.setCustomization(3);
  view.viewbox.style("cursor", "crosshair");
  tip("Click on the map to create a new burg. Hold Shift to add multiple", true, "warn");
  interactionManager.setClickHandler(function (this: SVGElement, event: MouseEvent) {
    const point = pointer(event, this) as [number, number];
    const cell = findCell(point[0], point[1]);

    if (worldContext.pack.cells.h[cell] < 20) {
      tip("You cannot place state into the water. Please click on a land cell", false, "error");
      return;
    }
    if (worldContext.pack.cells.burg![cell]) {
      tip("There is already a burg in this cell. Please select a free cell", false, "error");
      return;
    }

    const { burgId, newRoute } = GenerationPipeline.Burgs.add(point);
    const burg = worldContext.pack.burgs[burgId];
    drawBurgIcon(worldContext, viewContext, appServices, burg);
    drawBurgLabel(worldContext, viewContext, appServices, burg);
    if (newRoute && layerIsOn("toggleRoutes")) drawRoute(worldContext, viewContext, appServices, newRoute);

    if (event.shiftKey === false) {
      stopAddBurgMode();
      onDone();
    }
  });
}

export function stopAddBurgMode(): void {
  view.setCustomization(0);
  EditorBus.restoreDefaultEvents();
  clearMainTip();
}

export function regenerateBurgNames(refresh: () => void): void {
  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed && !b.lock);
  for (const burg of validBurgs) {
    const name = GenerationPipeline.Names.getCulture(burg.culture!);
    burg.name = name;
    view.burgLabels.select(`[data-id='${burg.i}']`).text(name);
  }
  refresh();
}

export function downloadBurgsData(): void {
  const heightUnitVal = localStorage.getItem("heightUnit") ?? "m";

  let data = `Id,Burg,Province,Province Full Name,State,State Full Name,Culture,Religion,Group,Population,X,Y,Latitude,Longitude,Elevation (${heightUnitVal}),Temperature,Temperature likeness,Capital,Port,Citadel,Walls,Plaza,Temple,Shanty Town,Emblem,Preview link\n`;
  const valid = worldContext.pack.burgs.filter(b => b.i && !b.removed);

  valid.forEach(b => {
    data += `${b.i},`;
    data += `${b.name},`;
    const province = worldContext.pack.cells.province![b.cell];
    data += province ? `${worldContext.pack.provinces![province].name},` : ",";
    data += province ? `${worldContext.pack.provinces![province].fullName},` : ",";
    data += `${worldContext.pack.states[b.state!].name},`;
    data += `${worldContext.pack.states[b.state!].fullName},`;
    data += `${worldContext.pack.cultures[b.culture!].name},`;
    data += `${worldContext.pack.religions![worldContext.pack.cells.religion![b.cell]].name},`;
    data += `${b.group!},`;
    data += `${rn(b.population! * worldContext.populationRate * worldContext.urbanization)},`;
    data += `${b.x},`;
    data += `${b.y},`;
    data += `${getLatitude(b.y, worldContext.mapCoordinates, worldContext.graphHeight, 2)},`;
    data += `${getLongitude(b.x, worldContext.mapCoordinates, worldContext.graphWidth, 2)},`;
    data += `${parseInt(getHeight(worldContext.pack.cells.h[b.cell]), 10)},`;
    const temperature = worldContext.grid.cells.temp![worldContext.pack.cells.g![b.cell]];
    data += `${convertTemperature(temperature)},`;
    data += `${getTemperatureLikeness(temperature)},`;
    data += b.capital ? "capital," : ",";
    data += b.port ? "port," : ",";
    data += b.citadel ? "citadel," : ",";
    data += b.walls ? "walls," : ",";
    data += b.plaza ? "plaza," : ",";
    data += b.temple ? "temple," : ",";
    data += b.shanty ? "shanty town," : ",";
    data += b.coa ? `${JSON.stringify(b.coa).replace(/"/g, "").replace(/,/g, ";")},` : ",";
    data += GenerationPipeline.Burgs.getPreview(b).link;
    data += "\n";
  });

  const name = `${getFileName("GenerationPipeline.Burgs")}.csv`;
  downloadFile(data, name);
}

export function renameBurgsInBulk(onUpload?: () => void): void {
  burgsRenamingDialogStore.getState().open({
    onDownload: () => {
      const data = worldContext.pack.burgs
        .filter(b => b.i && !b.removed)
        .map(b => b.name)
        .join("\r\n");
      const name = `${getFileName("Burg names")}.txt`;
      downloadFile(data, name);
    },
    onUpload: onUpload ?? (() => getElementById<HTMLInputElement>("burgsListToLoad")?.click())
  });
}

export function importBurgNames(dataLoaded: string, refresh: () => void): void {
  if (!dataLoaded) {
    tip("Cannot load the file, please check the format", false, "error");
    return;
  }
  const data = dataLoaded
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .filter(Boolean);
  if (!data.length) {
    tip("Cannot parse the list, please check the file format", false, "error");
    return;
  }

  const change: { id: number; name: string }[] = [];
  let message = `GenerationPipeline.Burgs to be renamed as below:`;
  message += `<table class="overflow-table"><tr><th>Id</th><th>Current name</th><th>New Name</th></tr>`;

  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed);
  for (let i = 0; i < data.length && i <= validBurgs.length; i++) {
    const v = data[i];
    if (!v || !validBurgs[i] || v === validBurgs[i].name) continue;
    change.push({ id: validBurgs[i].i!, name: v });
    message += `<tr><td style="width:20%">${validBurgs[i].i}</td><td style="width:40%">${validBurgs[i].name}</td><td style="width:40%">${v}</td></tr>`;
  }
  message += `</tr></table>`;

  if (!change.length) message = "No changes found in the file. Please change some names to get a result";

  confirmationDialog({
    title: "GenerationPipeline.Burgs bulk renaming",
    message,
    confirm: "Rename",
    onConfirm: () => {
      for (const { id, name } of change) {
        worldContext.pack.burgs[id].name = name;
        view.burgLabels.select(`[data-id='${id}']`).text(name);
      }
      refresh();
    }
  });
}

export function showBurgsChart(): void {
  interface ChartDatum {
    id: number;
    color?: string;
    name?: string;
    i?: number | null;
    state?: number | null;
    culture?: number | null;
    province?: number | null;
    parent?: number | null;
    population?: number;
    x?: number;
    y?: number;
    capital?: number | boolean;
  }

  const states: ChartDatum[] = worldContext.pack.states.map(s => ({
    id: s.i,
    state: s.i ? 0 : null,
    color: s.color ?? "#ccc",
    name: s.fullName ?? s.name
  }));

  const burgs: ChartDatum[] = worldContext.pack.burgs
    .filter(b => b.i && !b.removed)
    .map(b => {
      const province = worldContext.pack.cells.province![b.cell];
      const parent = province ? province + states.length - 1 : b.state;
      return {
        id: b.i! + states.length - 1,
        i: b.i,
        state: b.state,
        culture: b.culture,
        province,
        parent,
        name: b.name,
        population: b.population,
        capital: b.capital,
        x: b.x,
        y: b.y,
        color: "#ccc"
      };
    });

  const data: ChartDatum[] = [...states, ...burgs];
  if (data.length < 2) {
    tip("No burgs to show", false, "error");
    return;
  }

  const config: BurgsBubbleChartConfig = {
    burgs,
    statesCount: states.length
  };
  openDialog("burgsBubbleChart", config);
}
