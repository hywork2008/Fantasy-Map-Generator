import { pointer } from "d3";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Military } from "../modules/military-generator";
import { drawRegiment } from "../renderers/index";
import { useRegimentsOverviewState } from "../store/regimentsOverviewState";
import type { MilitaryRegiment, MilitaryUnit } from "../types/models";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { capitalize, findCell, getLatitude, getLongitude, last } from "../utils";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";
import { interactionManager } from "./interactionManager";
import { toggleMilitary } from "./layers";

export function overviewRegiments(stateId = -1): void {
  if (viewContext.customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  useRegimentsOverviewState.getState().setFilterStateId(stateId);
  useRegimentsOverviewState.getState().refresh();
  openDialog("regimentsOverview");
}

export function regimentHighlightOn(stateId: number, regimentId: number): void {
  if (viewContext.customization) return;
  viewContext.armies
    .select(`g > g#regiment${stateId}-${regimentId}`)
    .transition()
    .duration(2000)
    .style("fill", "#ff0000");
}

export function regimentHighlightOff(stateId: number, regimentId: number): void {
  viewContext.armies.select(`g > g#regiment${stateId}-${regimentId}`).transition().duration(1000).style("fill", null);
}

export function addRegimentOnMap(filterStateId: number, onDone: () => void): void {
  if (filterStateId === -1) {
    tip("Please select state from the list", false, "error");
    return;
  }

  viewContext.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(function (this: SVGElement, event: MouseEvent) {
    const [px, py] = pointer(event, this);
    const cell = findCell(px, py);
    const x = worldContext.pack.cells.p[cell][0];
    const y = worldContext.pack.cells.p[cell][1];
    const military = worldContext.pack.states[filterStateId].military!;
    const i = military.length ? last(military).i + 1 : 0;
    const n = +(worldContext.pack.cells.h[cell] < 20);
    const reg = {
      a: 0,
      cell,
      i,
      n,
      u: {} as Record<string, number>,
      x,
      y,
      bx: x,
      by: y,
      state: filterStateId,
      icon: "🛡️"
    } as MilitaryRegiment;
    reg.name = Military.getName(reg, military);
    military.push(reg);
    Military.generateNote(reg, worldContext.pack.states[filterStateId]);
    drawRegiment(worldContext, viewContext, appServices, reg, filterStateId);
    clearAddRegimentClickHandler();
    onDone();
  });
  tip("Click on map to create new regiment or fleet", true);
}

export function clearAddRegimentClickHandler(): void {
  clearMainTip();
  interactionManager.resetClickHandler();
  viewContext.viewbox.style("cursor", "default");
}

export function downloadRegimentsData(): void {
  const units = worldContext.options.military!.map((u: MilitaryUnit) => u.name);
  let data =
    "State,Id,Icon,Name," +
    units.map((u: string) => capitalize(u)).join(",") +
    ",X,Y,Latitude,Longitude,Base X,Base Y,Base Latitude,Base Longitude\n";

  for (const s of worldContext.pack.states) {
    if (!s.i || s.removed || !s.military?.length) continue;

    for (const r of s.military) {
      data += `${s.name},`;
      data += `${r.i},`;
      data += `${r.icon},`;
      data += `${r.name},`;
      data += `${units.map((unit: string) => r.u[unit]).join(",")},`;

      data += `${r.x},`;
      data += `${r.y},`;
      data += `${getLatitude(r.y, worldContext.mapCoordinates, worldContext.graphHeight, 2)},`;
      data += `${getLongitude(r.x, worldContext.mapCoordinates, worldContext.graphWidth, 2)},`;

      data += `${r.bx},`;
      data += `${r.by},`;
      data += `${getLatitude(r.by, worldContext.mapCoordinates, worldContext.graphHeight, 2)},`;
      data += `${getLongitude(r.bx, worldContext.mapCoordinates, worldContext.graphWidth, 2)}\n`;
    }
  }

  const name = `${getFileName("Regiments")}.csv`;
  downloadFile(data, name);
}
