import { pointer } from "d3";

import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";

import { drawBurgIcon, drawBurgLabel, drawRoute } from "../renderers";
import { patchBurg } from "../runtime/worldRuntime";
import { getHeight } from "../services/cellInfoService";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { useBurgsOverviewState } from "../store/burgsOverviewState";
import { burgsRenamingDialogStore } from "../store/burgsRenamingDialogState";
import { useExtensionState } from "../store/extensionState";
import type { Burg } from "../types/models";
import type { BurgsBubbleChartConfig } from "../ui/dialogs/BurgsBubbleChartDialog";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { convertTemperature, findCell, getLatitude, getLongitude, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { getTemperatureLikeness } from "./burg-editor";
import { interactionManager } from "./interactionManager";
import { toggleBurgIcons, toggleLabels } from "./layers";

export interface BurgFilterOptions {
  searchText?: string;
  filterStateId?: number; // -1 = all
  filterCultureId?: number; // -1 = all
  filterProvinceId?: number; // -1 = all
  filterGroup?: string; // "" = all
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface BurgRowData {
  b: Burg;
  population: number;
  province: string;
  stateName: string;
  cultureName: string;
  features: string;
}

/**
 * Pure filter/sort logic shared by the standalone Burgs Overview dialog and the embedded
 * Burgs tab of the State/Province Editor — filters are passed as explicit arguments rather
 * than read from the shared burgsOverviewState store, so an embedded caller (fixed to one
 * state/province) never disturbs the standalone dialog's own filters if both are open at once.
 */
export function filterAndSortBurgs(
  burgs: Burg[],
  options: BurgFilterOptions = {}
): {
  rows: BurgRowData[];
  totalPopulation: number;
  /** Sum of each registered burgOverviewColumn's value across the returned rows, keyed by column id. */
  columnTotals: Record<string, number>;
  validCount: number;
} {
  const {
    searchText = "",
    filterStateId = -1,
    filterCultureId = -1,
    filterProvinceId = -1,
    filterGroup = "",
    sortBy = "name",
    sortOrder = "asc"
  } = options;

  const validBurgs = burgs.filter(b => b.i && !b.removed);
  let filtered = validBurgs;

  if (searchText) {
    const lower = searchText.toLowerCase();
    filtered = filtered.filter(b => {
      const state = (worldContext.pack.states[b.state!]?.name ?? "").toLowerCase();
      const prov = worldContext.pack.cells.province![b.cell];
      const province = prov ? (worldContext.pack.provinces![prov]?.name ?? "").toLowerCase() : "";
      const culture = (worldContext.pack.cultures[b.culture!]?.name ?? "").toLowerCase();
      return (
        (b.name ?? "").toLowerCase().includes(lower) ||
        state.includes(lower) ||
        province.includes(lower) ||
        culture.includes(lower) ||
        (b.group ?? "").toLowerCase().includes(lower)
      );
    });
  }
  if (filterStateId !== -1) filtered = filtered.filter(b => b.state === filterStateId);
  if (filterCultureId !== -1) filtered = filtered.filter(b => b.culture === filterCultureId);
  if (filterProvinceId !== -1) {
    filtered = filtered.filter(b => {
      const prov = worldContext.pack.cells.province![b.cell];
      return prov === filterProvinceId;
    });
  }
  if (filterGroup !== "") filtered = filtered.filter(b => b.group === filterGroup);

  const rows: BurgRowData[] = filtered.map(b => {
    const population = (b.population ?? 0) * worldContext.populationRate * worldContext.urbanization;
    const prov = worldContext.pack.cells.province![b.cell];
    const province = prov ? (worldContext.pack.provinces![prov]?.name ?? "") : "";
    const stateName = worldContext.pack.states[b.state!]?.name ?? "";
    const cultureName = worldContext.pack.cultures[b.culture!]?.name ?? "";
    const features = b.capital && b.port ? "a-capital-port" : b.capital ? "c-capital" : b.port ? "p-port" : "z-burg";
    return { b, population, province, stateName, cultureName, features };
  });

  const overviewColumns = useExtensionState.getState().burgOverviewColumns;

  const sorted = [...rows].sort((a, b) => {
    let valA: string | number = 0;
    let valB: string | number = 0;
    if (sortBy === "name") {
      valA = a.b.name ?? "";
      valB = b.b.name ?? "";
    } else if (sortBy === "province") {
      valA = a.province;
      valB = b.province;
    } else if (sortBy === "state") {
      valA = a.stateName;
      valB = b.stateName;
    } else if (sortBy === "culture") {
      valA = a.cultureName;
      valB = b.cultureName;
    } else if (sortBy === "group") {
      valA = a.b.group ?? "";
      valB = b.b.group ?? "";
    } else if (sortBy === "population") {
      valA = a.population;
      valB = b.population;
    } else if (sortBy === "features") {
      valA = a.features;
      valB = b.features;
    } else {
      const column = overviewColumns.find(c => c.id === sortBy);
      if (column) {
        valA = column.getValue(a.b);
        valB = column.getValue(b.b);
      }
    }
    const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : valA - (valB as number);
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const totalPopulation = sorted.reduce((acc, { population }) => acc + population, 0);
  const columnTotals: Record<string, number> = {};
  for (const column of overviewColumns) {
    columnTotals[column.id] = sorted.reduce((acc, { b }) => acc + column.getValue(b), 0);
  }
  return { rows: sorted, totalPopulation, columnTotals, validCount: validBurgs.length };
}

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

/**
 * Downloads the Burgs Overview data as a delimited text file. Defaults to TAB rather than comma
 * because the Emblem column embeds a JSON blob that may itself contain commas.
 */
export function downloadBurgsData(delimiter: string = "\t"): void {
  const heightUnitVal = localStorage.getItem("heightUnit") ?? "m";
  const overviewColumns = useExtensionState.getState().burgOverviewColumns;

  // Fields (names, JSON blobs, etc.) may incidentally contain the chosen delimiter; neutralize it.
  const sanitize = (value: string): string => value.split(delimiter).join(" ");

  const headers = [
    "Id",
    "Burg",
    "Province",
    "Province Full Name",
    "State",
    "State Full Name",
    "Culture",
    "Religion",
    "Group",
    "Population",
    ...overviewColumns.map(column => column.label),
    "X",
    "Y",
    "Latitude",
    "Longitude",
    `Elevation (${heightUnitVal})`,
    "Temperature",
    "Temperature likeness",
    "Capital",
    "Port",
    "Citadel",
    "Walls",
    "Plaza",
    "Temple",
    "Shanty Town",
    "Emblem",
    "Preview link"
  ];
  let data = `${headers.join(delimiter)}\n`;

  const valid = worldContext.pack.burgs.filter(b => b.i && !b.removed);

  valid.forEach(b => {
    const province = worldContext.pack.cells.province![b.cell];
    const temperature = worldContext.grid.cells.temp![worldContext.pack.cells.g![b.cell]];

    const row = [
      `${b.i}`,
      `${b.name}`,
      province ? `${worldContext.pack.provinces![province].name}` : "",
      province ? `${worldContext.pack.provinces![province].fullName}` : "",
      `${worldContext.pack.states[b.state!].name}`,
      `${worldContext.pack.states[b.state!].fullName}`,
      `${worldContext.pack.cultures[b.culture!].name}`,
      `${worldContext.pack.religions![worldContext.pack.cells.religion![b.cell]].name}`,
      `${b.group!}`,
      `${rn(b.population! * worldContext.populationRate * worldContext.urbanization)}`,
      // Extension columns' `format()` is for on-screen display only (may embed decorative
      // icons); CSV must use the raw numeric value instead.
      ...overviewColumns.map(column => `${rn(column.getValue(b), 2)}`),
      `${b.x}`,
      `${b.y}`,
      `${getLatitude(b.y, worldContext.mapCoordinates, worldContext.graphHeight, 2)}`,
      `${getLongitude(b.x, worldContext.mapCoordinates, worldContext.graphWidth, 2)}`,
      `${parseInt(getHeight(worldContext.pack.cells.h[b.cell]), 10)}`,
      `${convertTemperature(temperature)}`,
      `${getTemperatureLikeness(temperature)}`,
      b.capital ? "capital" : "",
      b.port ? "port" : "",
      b.citadel ? "citadel" : "",
      b.walls ? "walls" : "",
      b.plaza ? "plaza" : "",
      b.temple ? "temple" : "",
      b.shanty ? "shanty town" : "",
      b.coa ? JSON.stringify(b.coa).replace(/"/g, "") : "",
      `${GenerationPipeline.Burgs.getPreview(b).link}`
    ];

    data += `${row.map(sanitize).join(delimiter)}\n`;
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
    message += `<tr><td>${validBurgs[i].i}</td><td>${validBurgs[i].name}</td><td>${v}</td></tr>`;
  }
  message += `</tr></table>`;

  if (!change.length) message = "No changes found in the file. Please change some names to get a result";

  confirmationDialog({
    title: "GenerationPipeline.Burgs bulk renaming",
    message,
    confirm: "Rename",
    onConfirm: () => {
      for (const { id, name } of change) {
        if (!patchBurg({ burgId: id, name })) continue;
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
