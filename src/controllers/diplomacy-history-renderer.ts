import type { Selection } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { generateWarRouteSvgPath, getWarRouteCoordinates } from "../services/warRouteFinder";
import type { ChronicleEvent } from "../types/models";

// biome-ignore lint/suspicious/noExplicitAny: D3 Selection typing workaround
let arrowsLayer: Selection<SVGGElement, unknown, any, any> | null = null;

export function drawHistoryArrows(events: ChronicleEvent[]) {
  clearHistoryArrows();
  arrowsLayer = viewContext.viewbox.append("g").attr("id", "diplomacyHistoryArrows").attr("pointer-events", "none");

  // Add marker defs for both offensive (red) and naval defensive relief (blue)
  const defs = arrowsLayer!.append("defs");

  // Attacker marker (Red)
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

  // Defender naval expedition marker (Blue)
  defs
    .append("marker")
    .attr("id", "history-arrow-marker-defender")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 0 L 10 5 L 0 10 z")
    .attr("fill", "#2563eb");

  // Draw lines along actual geographic routes
  events.forEach((event, index) => {
    // Only draw arrows for combat operations
    const isCombatAction = (action: string) =>
      action.startsWith("declared a war") ||
      action.startsWith("declared a holy war") ||
      action.startsWith("declared a trade war") ||
      action.startsWith("launched a") ||
      action === "joined the war on attackers side" ||
      action === "joined the war on defenders side";

    if (!isCombatAction(event.action)) return;

    const isDefensiveAction = event.action === "joined the war on defenders side";
    const strokeColor = isDefensiveAction ? "#2563eb" : "#ff0000";
    const markerId = isDefensiveAction ? "url(#history-arrow-marker-defender)" : "url(#history-arrow-marker)";

    // Calculate or resolve coordinate points along land/sea route
    const points = getWarRouteCoordinates(
      worldContext.pack,
      event.fromBurg,
      event.toBurg,
      event.transitType,
      event.routeCells
    );

    let pathD = "";
    let textX = 0;
    let textY = 0;

    if (points.length >= 2) {
      pathD = generateWarRouteSvgPath(points);
      const midIdx = Math.floor(points.length / 2);
      textX = points[midIdx][0];
      textY = points[midIdx][1];
    } else {
      // Disallow drawing straight/parabolic arrows across land for naval expeditions
      if (event.transitType === "naval_expedition") return;

      // Fallback coordinate lookup if no route was resolved
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

      const dx = toCoords[0] - fromCoords[0];
      const dy = toCoords[1] - fromCoords[1];
      const offsetMag = ((index % 5) - 2) * 0.1;
      const cx = (fromCoords[0] + toCoords[0]) / 2;
      const cy = (fromCoords[1] + toCoords[1]) / 2;
      const ctrlX = cx - dy * offsetMag;
      const ctrlY = cy + dx * offsetMag;

      pathD = `M${fromCoords[0]},${fromCoords[1]} Q${ctrlX},${ctrlY} ${toCoords[0]},${toCoords[1]}`;
      textX = ctrlX;
      textY = ctrlY;
    }

    const group = arrowsLayer!
      .append("g")
      .attr("id", `history-arrow-${event.id}`)
      .attr("opacity", 0.25)
      .attr("class", "history-arrow");

    group
      .append("path")
      .attr("d", pathD)
      .attr("fill", "none")
      .attr("stroke", strokeColor)
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", isDefensiveAction ? "6,4" : "5,5")
      .attr("stroke-linecap", "round")
      .attr("marker-end", markerId);

    // text label showing row number
    group
      .append("text")
      .attr("x", textX)
      .attr("y", textY)
      .attr("fill", "#000000")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 0.75)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(index + 1);
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

  arrowsLayer.selectAll(".history-arrow").attr("opacity", 0.25).select("path").attr("stroke-width", 2.5);
  viewContext.statesBody.selectAll(".history-blink-attacker").classed("history-blink-attacker", false);
  viewContext.statesBody.selectAll(".history-blink-defender").classed("history-blink-defender", false);

  if (!id) return;

  arrowsLayer.select(`#history-arrow-${id}`).attr("opacity", 1.0).select("path").attr("stroke-width", 4.5);

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
