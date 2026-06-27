import { viewContext } from "../context/viewContext";

export function burgHighlightOn(burgId: number): void {
  const label = viewContext.burgLabels.select(`[data-id='${burgId}']`);
  if (label.size()) label.classed("drag", true);
}

export function burgHighlightOff(): void {
  viewContext.burgLabels.selectAll("text.drag").classed("drag", false);
}
