"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_98_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.98 introduced layout cache for burg labels
  pack.burgs.forEach(b => {
    // avoid relying on an external helper and unknown typed property
    if (!(b as any).labelPosition) (b as any).labelPosition = { x: (b as any).x || 0, y: (b as any).y || 0 };
  });

  // v1.98.0 changed compass layer and rose element id
  try {
    const compass = dom?.compass ?? d3.select("#compass");
    if (compass && compass.select) {
      const rose = compass.select("use");
      rose.attr("xlink:href", "#defs-compass-rose");

      if (!compass.selectAll("*").size()) {
        compass.style("display", "none");
        compass.append("use").attr("xlink:href", "#defs-compass-rose");
        helpers?.shiftCompass?.();
      }
    }
  } catch (e) {
    // best-effort migration, ignore failures
  }
}
