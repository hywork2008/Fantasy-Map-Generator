"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_64_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.64 change states style
  const regions = dom?.regions ?? d3.select("#regions");
  const statesBody = dom?.statesBody ?? d3.select("#statesBody");
  const statesHalo = dom?.statesHalo ?? d3.select("#statesHalo");

  const opacity = regions.attr("opacity");
  const filter = regions.attr("filter");
  statesBody.attr("opacity", opacity).attr("filter", filter);
  statesHalo.attr("opacity", opacity).attr("filter", "blur(5px)");
  regions.attr("opacity", null).attr("filter", null);
}
