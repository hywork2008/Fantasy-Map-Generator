"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_100_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.100.00 added zones to pack data
  pack.zones = [];
  const zonesLayer = dom?.zones ?? d3.select("#zones");
  zonesLayer.selectAll("g").each(function () {
    const i = pack.zones.length;
    const name = (this as any).dataset.description;
    const type = (this as any).dataset.type;
    const color = (this as any).getAttribute("fill");
    const cells = (this as any).dataset.cells.split(",").map(Number);
    pack.zones.push({i, name, type, cells, color});
  });
  zonesLayer.style("display", null).selectAll("*").remove();
  if (helpers?.layerIsOn && helpers.layerIsOn("toggleZones")) helpers.drawZones?.();
}
