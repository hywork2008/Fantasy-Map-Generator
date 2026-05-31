"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_105_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.104.0 introduced some bugs with layers visibility
  if (dom?.viewbox) {
    dom.viewbox.select("#icons").style("display", null);
    dom.viewbox.select("#ice").style("display", null);
    dom.viewbox.select("#regions").style("display", null);
    dom.viewbox.select("#armies").style("display", null);
  }
}
