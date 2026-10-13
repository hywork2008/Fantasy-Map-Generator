import { editorText } from "../../i18n/editorMessages";
import { cityElementMarker } from "./landmarkSvg";
import type { SvgPickInfo } from "./pickInfo";
import type { RenderContext } from "./renderContext";
import { element } from "./svgPrimitives";
/** Gate markers for the non-town view. */
export function renderGateLayer(ctx: RenderContext, svg: SVGSVGElement) {
  const { document, tool, selection, town } = ctx;
  const gates = element("g", { class: "ce-gates", "pointer-events": tool === "select" ? "all" : "none" });
  for (const gate of document.gates ?? []) {
    const point = document.mesh.vertices[gate.vertexId]?.point;
    if (point && !town) {
      const isPickSelected = selection.inspectedId === gate.id;
      const pickInfo: SvgPickInfo = {
        layer: "gates",
        kind: "gate",
        id: gate.id,
        label: editorText("cityEditor.messages.gateIdentifier", { value0: gate.id }),
        vertexId: gate.vertexId,
        point
      };
      const marker = cityElementMarker(point, "gate", gate.id);
      marker.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (isPickSelected) marker.classList.add("ce-is-selected", "cg-is-selected");
      if (tool === "select") {
        marker.style.pointerEvents = "all";
        marker.style.cursor = "pointer";
      }
      gates.appendChild(marker);
    }
  }
  svg.appendChild(gates);
}
