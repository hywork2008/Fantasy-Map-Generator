"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_4_0(context: AutoUpdateMigrationContext): void {
  const { pack, grid, dom, helpers, options } = context as any;
  // v1.35 added dry lakes
  const lakes = dom?.lakes ?? d3.select("#lakes");
  if (!lakes.select("#dry").size()) {
    lakes.append("g").attr("id", "dry");
    lakes
      .select("#dry")
      .attr("opacity", 1)
      .attr("fill", "#c9bfa7")
      .attr("stroke", "#8e816f")
      .attr("stroke-width", 0.7)
      .attr("filter", null);
  }

  // v1.4 added ice layer
  const viewbox = dom?.viewbox ?? d3.select("#viewbox");
  let ice = dom?.ice ?? d3.select("#ice");
  if (!ice.size()) ice = viewbox.insert("g", "#coastline").attr("id", "ice").style("display", "none");
  ice
    .attr("opacity", null)
    .attr("fill", "#e8f0f6")
    .attr("stroke", "#e8f0f6")
    .attr("stroke-width", 1)
    .attr("filter", "url(#dropShadow05)");
  // trigger renderer via helpers (runtime-injected)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (helpers as any)?.iceRenderer?.();

  // v1.4 added icon and power attributes for units
  for (const unit of (options?.military ?? [])) {
    if (!unit.icon) unit.icon = getUnitIcon(unit.type);
    if (!unit.power) unit.power = unit.crew;
  }

  function getUnitIcon(type) {
    if (type === "naval") return "🌊";
    if (type === "ranged") return "🏹";
    if (type === "mounted") return "🐴";
    if (type === "machinery") return "💣";
    if (type === "armored") return "🐢";
    if (type === "aviation") return "🦅";
    if (type === "magical") return "🔮";
    else return "⚔️";
  }

  // v1.4 added state reference for regiments
  pack.states.filter(s => s.military).forEach(s => s.military.forEach(r => (r.state = s.i)));
}
