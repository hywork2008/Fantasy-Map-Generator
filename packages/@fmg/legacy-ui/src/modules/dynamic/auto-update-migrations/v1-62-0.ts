"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_62_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.62 changed grid data
  const gridOverlay = dom?.gridOverlay ?? d3.select("#gridOverlay");
  gridOverlay.attr("size", null);
}
