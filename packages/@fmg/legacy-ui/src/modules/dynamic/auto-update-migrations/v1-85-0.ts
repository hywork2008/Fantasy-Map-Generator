"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_85_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.84.0 moved intial screen out of main svg
  const svg = dom?.svg ?? d3.select("svg");
  svg.select("#initial").remove();
}
