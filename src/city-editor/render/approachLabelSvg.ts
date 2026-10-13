import { editorText } from "../../i18n/editorMessages";
import type { CityDocument } from "../core/types";
import { approachLabelFacts } from "./approachFacts";
import { selectionLabelFontSize } from "./overlays";
import { element } from "./svgPrimitives";
export function renderApproachLabels(document: CityDocument, zoom: number): SVGGElement {
  const labels = element("g", { class: "ce-approach-labels" }) as SVGGElement;
  const beyondFont = selectionLabelFontSize(document.frame.extentMeters, zoom);
  for (const { exit, label: beyondLabel, norm, anchor: at, branches } of approachLabelFacts(document)) {
    const road = exit.destinations[0];
    const label = element(
      "text",
      {
        class: "ce-approach-beyond",
        x: String(at[0]),
        y: String(-at[1]),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": String(beyondFont),
        fill: norm.realm.relation === "Enemy" ? "#7e2217" : norm.realm.relation === "Ally" ? "#1e5c22" : "#2c261f",
        stroke: "#f4f0e6",
        "stroke-width": String(beyondFont / 8),
        "paint-order": "stroke",
        "pointer-events": "none",
        "data-group": road.group.id,
        "data-groups": exit.roads.map(item => item.group.id).join(" "),
        "data-beyond": typeof road.group.beyond === "string" ? road.group.beyond : norm.realm.relation,
        "data-beyond-relation": norm.realm.relation,
        "data-beyond-scale": norm.settlement.scale,
        "data-beyond-role": norm.settlement.role ?? "generic"
      },
      exit.destinations.length === 1 ? beyondLabel : undefined
    );
    if (exit.destinations.length > 1) {
      const lines = [editorText("cityEditor.messages.branchesBeyondTheRoad"), ...branches.map(item => item.label)];
      const step = beyondFont * 1.3;
      const top = Math.max(
        -document.frame.extentMeters / 2 + step,
        Math.min(document.frame.extentMeters / 2 - lines.length * step, -at[1] - ((lines.length - 1) * step) / 2)
      );
      for (let i = 0; i < lines.length; i++) {
        const value = i ? branches[i - 1].norm : undefined;
        label.appendChild(
          element(
            "tspan",
            {
              x: String(at[0]),
              y: String(top + i * step),
              fill:
                value?.realm.relation === "Enemy" ? "#7e2217" : value?.realm.relation === "Ally" ? "#1e5c22" : "#2c261f"
            },
            lines[i]
          )
        );
      }
    }
    labels.appendChild(label);
  }
  return labels;
}
