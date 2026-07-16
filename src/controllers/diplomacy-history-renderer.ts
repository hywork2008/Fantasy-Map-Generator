import type { Selection } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { ChronicleEvent } from "../types/models";

// biome-ignore lint/suspicious/noExplicitAny: D3 Selection typing workaround
let arrowsLayer: Selection<SVGGElement, unknown, any, any> | null = null;

export function drawHistoryArrows(events: ChronicleEvent[]) {
  clearHistoryArrows();
  arrowsLayer = viewContext.viewbox.append("g").attr("id", "diplomacyHistoryArrows").attr("pointer-events", "none");

  // Add marker defs
  const defs = arrowsLayer!.append("defs");
  defs
    .append("marker")
    .attr("id", "history-arrow-marker")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 0 L 10 5 L 0 10 z")
    .attr("fill", "#ff0000");

  // Draw lines
  events.forEach((event, index) => {
    const getCoords = (stateId: number, burgId?: number) => {
      if (burgId !== undefined) {
        const burg = worldContext.pack.burgs.find(b => b.i === burgId && !b.removed);
        if (burg) return [burg.x, burg.y];
      }
      const state = worldContext.pack.states[stateId];
      if (state && !state.removed) {
        const cell = state.center;
        return worldContext.pack.cells.p[cell];
      }
      return null;
    };

    const fromCoords = getCoords(event.from, event.fromBurg);
    const toCoords = getCoords(event.to, event.toBurg);

    if (!fromCoords || !toCoords) return;

    // Only draw arrows for actual combat events
    const combatActions = [
      "declared a war on its rival",
      "joined the war on attackers side",
      "joined the war on defenders side"
    ];
    if (!combatActions.includes(event.action)) return;

    // Introduce curvature to prevent straight lines from perfectly overlapping
    const dx = toCoords[0] - fromCoords[0];
    const dy = toCoords[1] - fromCoords[1];

    // offset center based on index to differentiate overlapping arrows
    const offsetMag = ((index % 5) - 2) * 0.1;

    const cx = (fromCoords[0] + toCoords[0]) / 2;
    const cy = (fromCoords[1] + toCoords[1]) / 2;

    const ctrlX = cx - dy * offsetMag;
    const ctrlY = cy + dx * offsetMag;

    const group = arrowsLayer!
      .append("g")
      .attr("id", `history-arrow-${event.id}`)
      .attr("opacity", 0.2)
      .attr("class", "history-arrow");

    group
      .append("path")
      .attr("d", `M${fromCoords[0]},${fromCoords[1]} Q${ctrlX},${ctrlY} ${toCoords[0]},${toCoords[1]}`)
      .attr("fill", "none")
      .attr("stroke", "#ff0000")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("marker-end", "url(#history-arrow-marker)");

    // text label
    const textX = ctrlX;
    const textY = ctrlY;

    group
      .append("text")
      .attr("x", textX)
      .attr("y", textY)
      .attr("fill", "#000000")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 0.5)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("text-anchor", "middle")
      .text(index + 1); // Row number
  });
}

export function highlightHistoryArrow(id: string, from?: number, to?: number) {
  if (!arrowsLayer) return;

  if (!document.getElementById("history-blink-style")) {
    document.head.insertAdjacentHTML(
      "beforeend",
      `<style id="history-blink-style">
        @keyframes history-blink-attacker {
          0%, 100% { filter: brightness(1.5); stroke: red; stroke-width: 2px; }
          50% { filter: brightness(0.5); stroke: none; }
        }
        @keyframes history-blink-defender {
          0%, 100% { filter: brightness(0.5); stroke: none; }
          50% { filter: brightness(1.5); stroke: blue; stroke-width: 2px; }
        }
        .history-blink-attacker { animation: history-blink-attacker 1s infinite; }
        .history-blink-defender { animation: history-blink-defender 1s infinite; }
      </style>`
    );
  }

  arrowsLayer.selectAll(".history-arrow").attr("opacity", 0.2).select("path").attr("stroke-width", 2);
  viewContext.statesBody.selectAll(".history-blink-attacker").classed("history-blink-attacker", false);
  viewContext.statesBody.selectAll(".history-blink-defender").classed("history-blink-defender", false);

  if (!id) return;

  arrowsLayer.select(`#history-arrow-${id}`).attr("opacity", 1.0).select("path").attr("stroke-width", 4);

  if (from && to && viewContext.statesBody) {
    viewContext.statesBody.select(`#state${from}`).classed("history-blink-attacker", true);
    viewContext.statesBody.select(`#state${to}`).classed("history-blink-defender", true);
  }
}

export function clearHistoryArrows() {
  if (arrowsLayer) {
    arrowsLayer.remove();
    arrowsLayer = null;
  }
}
