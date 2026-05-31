"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_106_0({ api, dom }: AutoUpdateMigrationContext): void {
  // v1.104.0 introduced bugs with coastlines. Redraw features
  if (dom?.defs) {
    dom.defs.select("#featurePaths").remove();
    dom.defs.append("g").attr("id", "featurePaths");
    dom.defs.select("#land").selectAll("path, use").remove();
    dom.defs.select("#water").selectAll("path, use").remove();
  }
  if (dom?.viewbox) dom.viewbox.select("#coastline").selectAll("path, use").remove();

  // v1.104.0 introduced bugs with state borders
  const regions = dom?.regions ?? d3.select("#regions");
  regions
    .attr("opacity", null)
    .attr("stroke-width", null)
    .attr("letter-spacing", null)
    .attr("fill", null)
    .attr("stroke", null);

  // pole can be missing for some states/provinces
  api?.States?.getPoles?.();
  api?.Provinces?.getPoles?.();
}
