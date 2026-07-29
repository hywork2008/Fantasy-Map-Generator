import { interpolateString, sum } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";

import { MilitaryRenderer } from "../renderers/draw-military";
import { GenerationPipeline } from "../services/generationPipeline";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { useMilitaryOverviewState } from "../store/militaryOverviewState";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { rn } from "../utils";
import { fitContent } from "../utils/domUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { toggleBorders, toggleMilitary, toggleStates } from "./layers";

export function overviewMilitary(): void {
  if (view.customization) return;
  closeDialogs("#militaryOverview, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  openDialog("militaryOverview");

  if (modules.overviewMilitary) return;
  modules.overviewMilitary = true;

  openDialog("militaryOverview", {
    title: "GenerationPipeline.Military Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

export function militaryStateHighlightOn(stateId: number): void {
  if (view.customization || !stateId) return;
  view.armies.select(`#army${stateId}`).transition().duration(2000).style("fill", "#ff0000");

  if (!layerIsOn("toggleStates")) return;
  const statePath = view.regions.select<SVGPathElement>(`#state${stateId}`).node();
  if (!statePath) return;

  const d = statePath.getAttribute("d");
  if (!d) return;

  const path = view.debug
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
  view.debug.selectAll(".highlight").each(function () {
    (this as Element & { __transition?: { end?: () => void } }).__transition?.end?.();
  });
  view.debug.selectAll<SVGElement, unknown>(".highlight").transition().duration(1000).attr("opacity", 0).remove();

  if (stateId) {
    view.armies.select(`#army${stateId}`).transition().duration(1000).style("fill", null);
  }
}

export function updateStateWarAlert(stateId: number, alert: number): void {
  const s = worldContext.pack.states[stateId];
  if (!s) return;
  if (!Number.isFinite(alert) || alert < 0) return; // an empty input yields Number("") === 0, not NaN

  // `(s.alert || alert)` used to guard this ratio, which is true whenever only the *new*
  // alert is non-zero — so raising the alert back up after it had been set to 0 divided by
  // zero and wrote Infinity into every regiment's unit counts. Scaling is only meaningful
  // against a positive previous alert; otherwise leave the (already zeroed) units alone.
  const previousAlert = s.alert ?? 0;
  const dif = previousAlert > 0 ? alert / previousAlert : 1;
  s.alert = alert;

  s.military?.forEach(r => {
    Object.keys(r.u).forEach(u => {
      r.u[u] = rn(r.u[u] * dif);
    });
    r.a = sum(Object.values(r.u) as number[]);
    view.armies.select(`g>g#regiment${s.i}-${r.i}>text`).text(GenerationPipeline.Military.getTotal(r));
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
        GenerationPipeline.Military.generate(worldContext, viewContext, appServices, getWorldState());
        if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
        useMilitaryOverviewState.getState().refresh();
      }
    }
  );
}

export function initMilitaryOverview(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
