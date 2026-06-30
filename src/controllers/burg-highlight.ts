import { viewLayerService as view } from "../services/viewLayerService";

export function burgHighlightOn(burgId: number): void {
  const label = view.burgLabels.select(`[data-id='${burgId}']`);
  if (label.size()) label.classed("drag", true);
}

export function burgHighlightOff(): void {
  view.burgLabels.selectAll("text.drag").classed("drag", false);
}
