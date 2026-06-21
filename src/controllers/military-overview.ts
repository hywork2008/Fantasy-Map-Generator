import { interpolateString, sum } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { toggleStates } from "../controllers/layers";
import { Military } from "../modules/military-generator";
import { modules } from "../store/editorState";
import { useMilitaryOverviewState } from "../store/militaryOverviewState";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { rn } from "../utils";
import { fitContent } from "../utils/uiHelpers";
import { layerIsOn, toggleBorders, toggleMilitary } from "./layers";

export function overviewMilitary(): void {
  if (viewContext.customization) return;
  closeDialogs("#militaryOverview, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  useMilitaryOverviewState.getState().refresh();
  openDialog("militaryOverview");

  if (modules.overviewMilitary) return;
  modules.overviewMilitary = true;

  openDialog("militaryOverview", {
    title: "Military Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

export function militaryStateHighlightOn(stateId: number): void {
  if (viewContext.customization || !stateId) return;
  viewContext.armies.select(`#army${stateId}`).transition().duration(2000).style("fill", "#ff0000");

  if (!layerIsOn("toggleStates")) return;
  const d = viewContext.regions.select(`#state${stateId}`).attr("d");

  const path = viewContext.debug
    .append("path")
    .attr("class", "highlight")
    .attr("d", d)
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("stroke-width", 1)
    .attr("opacity", 1)
    .attr("filter", "url(#blur1)");

  const l = (path.node() as SVGPathElement).getTotalLength();
  const dur = (l + 5000) / 2;
  const interp = interpolateString(`0,${l}`, `${l},${l}`);
  path
    .transition()
    .duration(dur)
    .attrTween("stroke-dasharray", () => (t: number) => interp(t));
}

export function militaryStateHighlightOff(stateId: number): void {
  viewContext.debug.selectAll(".highlight").each(function () {
    (this as Element & { __transition?: { end?: () => void } }).__transition?.end?.();
  });
  viewContext.debug
    .selectAll<SVGElement, unknown>(".highlight")
    .transition()
    .duration(1000)
    .attr("opacity", 0)
    .remove();

  if (stateId) {
    viewContext.armies.select(`#army${stateId}`).transition().duration(1000).style("fill", null);
  }
}

export function updateStateWarAlert(stateId: number, alert: number): void {
  const s = worldContext.pack.states[stateId];
  if (!s) return;
  const dif = s.alert || alert ? alert / s.alert! : 0;
  s.alert = alert;

  s.military!.forEach(r => {
    Object.keys(r.u).forEach(u => {
      r.u[u] = rn(r.u[u] * dif);
    });
    r.a = sum(Object.values(r.u) as number[]);
    viewContext.armies.select(`g>g#regiment${s.i}-${r.i}>text`).text(Military.getTotal(r));
  });
  useMilitaryOverviewState.getState().refresh();
}

export function militaryRecalculate(): void {
  openConfirm(
    "Are you sure you want to recalculate military forces for all states?<br>Regiments for all states will be regenerated",
    {
      title: "Recalculate military",
      confirm: "Recalculate",
      onConfirm: () => {
        Military.generate(worldContext, viewContext, appServices, getWorldState());
        useMilitaryOverviewState.getState().refresh();
      }
    }
  );
}

declare global {
  var overviewMilitaryCustomize: boolean | undefined;
}

export function initMilitaryOverview(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
