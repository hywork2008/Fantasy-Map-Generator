"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_652_0({ dom }: AutoUpdateMigrationContext): void {
  // remove style to unhide layers
  const rivers = dom?.rivers ?? d3.select("#rivers");
  const borders = dom?.borders ?? d3.select("#borders");
  rivers.attr("style", null);
  borders.attr("style", null);
}
