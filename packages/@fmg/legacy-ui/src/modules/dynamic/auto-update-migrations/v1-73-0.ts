"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_73_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.73 moved the hatching patterns out of the user's SVG
  const hatching = dom?.hatching ?? (d3.select("#hatching").node() as HTMLElement | null);
  hatching && hatching.remove();

  // v1.73 added zone type to UI, ensure type is populated
  const zonesRoot = dom?.zones ? (dom.zones.node() as Element) : (d3.select("#zones").node() as Element | null);
  const zonesEl = zonesRoot ? Array.from(zonesRoot.querySelectorAll("g")) : [];
  zonesEl.forEach(zone => {
    if (!zone.dataset.type) zone.dataset.type = "Unknown";
  });
}
